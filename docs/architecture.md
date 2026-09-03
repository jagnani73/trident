# Architecture

Trident is a multi-layer USDC vault on Solana. Depositors hold LP tokens against a Ranger vault; an off-chain bot routes the vault's capital between three Drift Protocol strategies and pulls it back to lending when risk limits bind.

This document covers system topology and control flow. For the process-level view of the backend (startup order, tick loop, DB writes) see [`README.md`](../README.md#architecture); for why these three strategies are combined see [`docs/strategy.md`](strategy.md).

---

## Strategy Overview

Most vault strategies do one thing. Trident does three, adaptively:

1. **Base Layer (Lending)** — USDC lent on Drift for a steady ~5-8% APY floor. Capital is always earning.
2. **Alpha Layer (Spread Trading)** — When correlated Drift perp pairs (SOL/ETH, BTC/ETH) diverge beyond statistical thresholds, capital is deployed into mean-reversion spread trades.
3. **Fallback Layer (Basis Trading)** — When no spread setups exist but funding rates are elevated, capital is deployed into delta-neutral basis trades (long spot + short perp) for funding rate capture.

An off-chain bot continuously monitors conditions and rebalances across layers.

---

## User Flow

```mermaid
flowchart LR
    User([Depositor]) -->|Deposits USDC| Vault[Ranger Vault]
    Vault -->|Issues| LP[LP Tokens]
    LP -->|Returned to| User

    User2([Depositor]) -->|Redeems LP Tokens| Vault
    Vault -->|Returns USDC + Yield| User2
```

## Vault Capital Flow

```mermaid
flowchart TB
    Vault[Ranger Vault<br/>USDC Pool]

    subgraph Strategies["Strategy Layers"]
        direction TB
        L[Base Layer<br/>Drift USDC Lending<br/>~5-8% APY]
        S[Alpha Layer<br/>Drift Perp Spread Trades<br/>Variable APY]
        B[Fallback Layer<br/>Drift Basis Trades<br/>~10-30% APY]
    end

    Vault -->|Idle USDC| L
    Vault -->|Spread opportunity detected| S
    Vault -->|High funding rate detected| B

    L -->|Withdraw when needed| Vault
    S -->|Close spread + PnL| Vault
    B -->|Close basis + PnL| Vault
```

## Bot Decision Flow

```mermaid
flowchart TD
    Start([Bot Tick<br/>Every N seconds]) --> CheckSpread{Spread opportunity?<br/>Pair divergence > threshold}

    CheckSpread -->|Yes| CalcConf{Confidence > min?}
    CalcConf -->|Yes| DeploySpread[Deploy to Spread Trade<br/>Long undervalued perp<br/>Short overvalued perp]
    CalcConf -->|No| CheckFunding

    CheckSpread -->|No| CheckFunding{Funding rate elevated?<br/>Annualized > X%}

    CheckFunding -->|Yes| DeployBasis[Deploy to Basis Trade<br/>Long spot + Short perp]
    CheckFunding -->|No| LendIdle[Keep/Move to Drift Lending]

    DeploySpread --> Monitor[Monitor Positions]
    DeployBasis --> Monitor
    LendIdle --> Monitor

    Monitor --> CheckExit{Exit conditions met?}
    CheckExit -->|Spread converged| CloseSpread[Close Spread Position]
    CheckExit -->|Funding dropped| CloseBasis[Close Basis Position]
    CheckExit -->|Drawdown limit hit| EmergencyExit[Emergency Exit to Lending]
    CheckExit -->|No| Start

    CloseSpread --> ReturnToVault[Return PnL to Vault]
    CloseBasis --> ReturnToVault
    EmergencyExit --> ReturnToVault
    ReturnToVault --> Start
```

## System Architecture

```mermaid
flowchart TB
    subgraph OffChain["Off-Chain (Our Bot)"]
        Bot[Rebalancing Bot<br/>TypeScript]
        Api[Express API<br/>:8000]
        Data[Data Pipeline<br/>Drift SDK live market data]

        Data -->|Live market data| Bot
    end

    subgraph Offline["Offline Analysis"]
        Synth[Synthetic Data Generator<br/>Python]
        Backtest[Backtesting Module<br/>Python]

        Synth -->|90-day price + funding series| Backtest
    end

    subgraph OnChain["On-Chain (Solana)"]
        RVault[Ranger Vault<br/>voltr vault program]
        DriftAdaptor[Drift Adaptor<br/>Ranger first-party]
        LendAdaptor[Lending Adaptor<br/>Ranger first-party]
        DriftProtocol[Drift Protocol<br/>Perps + Spot + Lending]
    end

    subgraph External["External Services"]
        Helius[Helius RPC]
        Pyth[Pyth Oracle<br/>Price Feeds]
        DB[(PostgreSQL<br/>Supabase)]
    end

    Bot -->|Sign & send txns| RVault
    Bot -->|Snapshots, positions, events| DB
    Api -->|Reads| DB
    RVault -->|CPI deposit/withdraw| DriftAdaptor
    RVault -->|CPI deposit/withdraw| LendAdaptor
    DriftAdaptor -->|CPI| DriftProtocol
    LendAdaptor -->|CPI| DriftProtocol

    Bot -->|RPC calls| Helius
    DriftProtocol -->|Oracle prices| Pyth
```

> The backtester runs offline against generated data. It does not read from Drift and does not feed parameters back into the bot — `BOT_CONFIG` is maintained by hand and mirrored in `packages/backtester/src/config.py`.

## Data Flow

```mermaid
flowchart LR
    subgraph DataSources["Data Sources"]
        DriftSDK[Drift SDK<br/>Funding rates, oracle prices, market state]
    end

    subgraph Processing["Bot Processing"]
        Ingest[Data Ingestion<br/>Collector tick]
        Spread[Spread Calculator<br/>Z-score of pair ratios]
        Funding[Funding Monitor<br/>Annualized rate tracker]
        Risk[Risk Manager<br/>Drawdown + position limits]
        Allocator[Capital Allocator<br/>Layer selection logic]
    end

    subgraph Actions["On-Chain Actions"]
        DepLend[Deposit to Lending]
        OpenSpread[Open Spread Position]
        OpenBasis[Open Basis Position]
        ClosePos[Close Positions]
        Rebalance[Rebalance Between Layers]
    end

    DriftSDK --> Ingest

    Ingest --> Spread
    Ingest --> Funding
    Spread --> Allocator
    Funding --> Allocator
    Risk --> Allocator

    Allocator --> DepLend
    Allocator --> OpenSpread
    Allocator --> OpenBasis
    Allocator --> ClosePos
    Allocator --> Rebalance
```
