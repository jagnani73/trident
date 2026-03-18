# Ranger Build-A-Bear Hackathon - Objective

## Hackathon Links

- **Main Track:** https://superteam.fun/earn/listing/ranger-build-a-bear-hackathon-main-track
- **Drift Side Track:** https://superteam.fun/earn/listing/ranger-build-a-bear-hackathon-drift-side-track
- **Hackathon Landing Page:** https://ranger.finance/build-a-bear-hackathon
- **Ranger Earn Docs:** https://docs.ranger.finance/
- **Drift Docs:** https://docs.drift.trade/protocol
- **Telegram:** https://t.co/OnDFZVjH3N

---

## Key Details

| Detail                  | Value                                             |
| ----------------------- | ------------------------------------------------- |
| **Organizer**           | Ranger Finance (backed by Presto Labs)            |
| **What**                | Build production-ready vault strategies on Solana |
| **Build Window**        | Mar 9 - Apr 6, 2026                               |
| **Submission Deadline** | Apr 6, 23:59 UTC                                  |
| **Judging**             | Apr 7 - 11                                        |
| **Results**             | Apr 14                                            |

### Tracks & Prizes

| Track                | 1st                 | 2nd                 | 3rd                 |
| -------------------- | ------------------- | ------------------- | ------------------- |
| **Main Track**       | $500K vault seeding | $300K vault seeding | $200K vault seeding |
| **Drift Side Track** | $100K vault seeding | $60K vault seeding  | $40K vault seeding  |

> Using Drift qualifies for **both tracks simultaneously** with separate submissions.

### Additional Prizes (Main Track Top 3)

- $15,000 audit credits (Adevar Labs)
- 3 months free MPC wallet infra (Cobo)
- $10,000 AWS credits each (9 total across tracks)

### Eligibility Constraints

- **Base Asset:** USDC
- **Minimum APY:** 10%
- **Tenor:** 3-month rolling lock
- **Disqualified sources:** DEX LP vaults (JLP, HLP, LLP), junior tranches (RLP, jrUSDe), ponzi yield-bearing stables, high-leverage looping (health < 1.05)

### Judging Criteria

1. **Strategy Quality & Edge** - genuine alpha, defensible thesis
2. **Risk Management** - drawdown limits, liquidation protection, position sizing
3. **Technical Implementation** - code quality, adaptor integration, vault architecture
4. **Production Viability** - realistic deployment, scalability
5. **Novelty & Innovation** - new primitives, creative protocol combinations

### Submission Requirements

1. Demo/pitch video (max 3 min)
2. Strategy documentation (thesis, mechanics, risk management)
3. Code repository (public or private with @jakeyvee access)
4. On-chain verification (wallet/vault address with trade activity)
5. CEX trade history CSV + read-only API key (if applicable)

---

## Our Strategy: Hybrid Yield Vault (Lending + Spread Trading + Basis)

A multi-layer USDC vault on Ranger that combines safe base yield with opportunistic alpha from Drift perp spread trading and basis trades.

### Strategy Thesis

Most vault strategies do one thing - we do three, adaptively:

1. **Base Layer (Lending):** USDC lent on Drift for steady ~5-8% APY floor. Capital is always earning.
2. **Alpha Layer (Spread Trading):** When correlated Drift perp pairs (SOL/ETH, BTC/ETH) diverge beyond statistical thresholds, deploy capital into mean-reversion spread trades. This is the novel/differentiated edge.
3. **Fallback Layer (Basis Trading):** When no spread setups exist but funding rates are elevated, deploy into delta-neutral basis trades (long spot + short perp) for funding rate capture.

An off-chain bot continuously monitors conditions and rebalances across layers.

### Why This Wins

- **Strategy Edge:** Spread trading on Drift perps is genuinely novel on-chain
- **Risk Management:** Lending floor ensures capital is never idle; spread/basis positions are delta-neutral
- **Technical Quality:** Multi-adaptor composition via Ranger SDK, clean bot architecture
- **Production Viability:** Each layer uses battle-tested protocols (Drift lending, Drift perps)
- **Novelty:** On-chain perp spread trading + adaptive multi-layer allocation

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
        Backtest[Backtesting Module<br/>Python]
        Data[Data Pipeline<br/>Drift Historical S3 + Live API]

        Data -->|Historical funding/prices| Backtest
        Data -->|Live market data| Bot
        Backtest -->|Calibrated params| Bot
    end

    subgraph OnChain["On-Chain (Solana)"]
        RVault[Ranger Vault<br/>voltr vault program]
        DriftAdaptor[Drift Adaptor<br/>Ranger first-party]
        LendAdaptor[Lending Adaptor<br/>Ranger first-party]
        DriftProtocol[Drift Protocol<br/>Perps + Spot + Lending]
    end

    subgraph External["External Services"]
        Helius[Helius RPC<br/>Free Dev Plan]
        Pyth[Pyth Oracle<br/>Price Feeds]
    end

    Bot -->|Sign & send txns| RVault
    RVault -->|CPI deposit/withdraw| DriftAdaptor
    RVault -->|CPI deposit/withdraw| LendAdaptor
    DriftAdaptor -->|CPI| DriftProtocol
    LendAdaptor -->|CPI| DriftProtocol

    Bot -->|RPC calls| Helius
    DriftProtocol -->|Oracle prices| Pyth
```

## Data Flow

```mermaid
flowchart LR
    subgraph DataSources["Data Sources (Free)"]
        DS3[Drift S3 Historical<br/>Funding rates, trades, prices]
        DApi[Drift Data API<br/>Live funding + markets]
        PythAPI[Pyth Benchmarks<br/>Oracle price history]
    end

    subgraph Processing["Bot Processing"]
        Ingest[Data Ingestion]
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

    DS3 --> Ingest
    DApi --> Ingest
    PythAPI --> Ingest

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
