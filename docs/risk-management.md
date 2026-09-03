# Risk Management Framework

## Overview

Trident's risk framework is designed around one principle: **capital preservation takes absolute priority over yield generation.** Every component of the system — from signal generation to position execution — passes through multiple independent risk gates before capital is deployed.

This document covers the full risk taxonomy, control mechanisms, stress scenarios, and recovery procedures. For strategy-level details (entry/exit logic, allocation math), see [strategy.md](./strategy.md).

---

## Table of Contents

1. [Risk Taxonomy](#1-risk-taxonomy)
2. [Portfolio-Level Controls](#2-portfolio-level-controls)
3. [Position-Level Controls](#3-position-level-controls)
4. [Market-Level Controls](#4-market-level-controls)
5. [Liquidity Risk](#5-liquidity-risk)
6. [Protocol & Smart Contract Risk](#6-protocol--smart-contract-risk)
7. [Oracle Risk](#7-oracle-risk)
8. [Operational Risk](#8-operational-risk)
9. [Stress Scenarios](#9-stress-scenarios)
10. [Recovery Procedures](#10-recovery-procedures)
11. [Risk Monitoring](#11-risk-monitoring)
12. [Parameter Summary](#12-parameter-summary)

---

## 1. Risk Taxonomy

Trident faces six categories of risk. Each has dedicated mitigations.

| Category | Description | Severity | Mitigation Layer |
|---|---|---|---|
| **Market risk** | Adverse price moves causing position losses | High | Stop-loss, drawdown cap, delta-neutral construction |
| **Liquidity risk** | Inability to exit positions at expected prices | Medium | Position sizing, market depth awareness, min size floors |
| **Protocol risk** | Bugs or exploits in Drift, Ranger/Voltr, or Solana | High | Battle-tested protocols, limited on-chain surface area |
| **Oracle risk** | Stale or manipulated price feeds | Medium | Pyth oracle with multi-source aggregation, health rate buffer |
| **Operational risk** | Bot downtime, network failures, execution errors | Medium | Graceful degradation, audit logging, overlap guards |
| **Correlation risk** | Paired assets decorrelating beyond historical norms | Medium | 24h lookback adapts to regime changes, 3% stop-loss per position |

---

## 2. Portfolio-Level Controls

Portfolio-level controls are the outermost defense. They monitor the vault's aggregate health and trigger emergency actions when thresholds are breached.

### Maximum Drawdown (5%)

The vault tracks a **high-water mark (HWM)** — the maximum total value ever recorded across all `vault_snapshots`.

$$\text{drawdown} = \frac{\text{HWM} - \text{current\_value}}{\text{HWM}}$$

**Trigger:** drawdown exceeds 5% → **emergency exit all positions**

**Why 5%?**
- DeFi depositors have lower drawdown tolerance than TradFi investors. A 5% cap signals institutional-grade risk discipline.
- Recovery math: a 5% loss requires a 5.26% gain to recover — achievable within weeks at normal lending rates. A 10% loss requires 11.1% — months of lending yield.
- At maximum deployment (70% in trades), three simultaneous 3% stop-losses cost 2.1% of TVL. The 5% cap provides a ~2.9% buffer for slippage and execution costs during the emergency exit itself.

### Health Rate Floor (1.20)

$$\text{health\_rate} = \frac{\text{free\_collateral}}{\text{total\_collateral}}$$

Drift liquidates positions as the health rate approaches ~1.0 (exact threshold varies by market). Our floor of 1.20 provides a 20% buffer.

**Trigger:** health rate drops below 1.20 → **emergency exit all positions**

**Why 1.20?**
- Accounts for the **30-second detection window** — in the worst case, a full tick passes before the breach is detected
- Accounts for **oracle lag** — Pyth updates every ~400ms, but extreme moves can temporarily outpace it
- Accounts for **slippage during emergency close** — closing all positions simultaneously creates market impact
- At 1.20, even a sudden 15% adverse price move across all positions keeps the vault above liquidation territory

### Emergency Exit Procedure

When either threshold is breached:

1. All open spread positions receive `close_spread` proposals
2. All open basis positions receive `close_basis` proposals
3. An `emergency_exit_all` proposal is appended (belt-and-suspenders)
4. All proposals execute in the same tick
5. Capital returns to idle → swept to lending on the next tick
6. **15-minute cooldown** begins — no new spread or basis positions

The cooldown prevents **whipsaw re-entry**: the scenario where the bot exits everything, then immediately re-enters because the entry signals haven't decayed yet (z-scores and funding APRs are computed from 24-hour lookbacks, so they change slowly). 15 minutes allows:
- Market conditions to stabilize
- Lookback windows to incorporate the new data
- The operator to review logs if needed

During cooldown, lending rebalance continues — idle capital still flows to lending, ensuring the vault earns yield even in recovery mode.

---

## 3. Position-Level Controls

Position-level controls limit damage from individual trades. They operate independently of portfolio-level controls.

### Stop-Loss (3% Per Position)

Every open position is evaluated on each 30-second tick:

$$\text{loss\_pct} = \frac{-\text{unrealized\_PnL}}{\text{size\_USDC}}$$

**Trigger:** loss exceeds 3% → force-close the position

**Why 3%?**
- A spread trade at 20% of TVL hitting a 3% stop-loss costs the portfolio 0.6% of TVL
- Two spread trades (40% max allocation) hitting stop-loss simultaneously: 1.2% of TVL
- Add a basis position (30% max): total worst case from stop-losses alone = 2.1% of TVL
- This leaves a 2.9% buffer before the 5% drawdown emergency triggers — room for execution slippage

**What 3% means for each strategy:**
- **Spread trades:** the ratio moved ~3% against us despite being 2σ extended. This is a strong signal that the mean-reversion thesis has failed for this trade.
- **Basis trades:** mark-to-market loss of 3% despite delta-neutral construction. This typically indicates a basis convergence event (perp price snapping to spot faster than expected) or significant slippage.

### Maximum Position Age (24 Hours)

**Trigger:** any position open > 24 hours → force-close regardless of PnL

**Rationale:**
- The z-score lookback window is 24 hours. A spread trade opened on a 24-hour signal should resolve within the next 24 hours if the mean-reversion thesis holds. If it hasn't, the statistical relationship may have structurally changed.
- Stale positions tie up capital that could earn lending yield (guaranteed positive) or be deployed to fresher, stronger signals.
- Forces the system to continuously re-evaluate rather than passively hold losing or stagnant positions.

### Confidence Gating (50% Minimum)

Before any spread trade is opened, the signal's confidence score must exceed 0.50:

$$\text{confidence} = \min\left(1.0, \frac{\text{data\_points}}{2880}\right)$$

At the 30-second tick interval, 0.50 confidence requires at least 1,440 data points = 12 hours of accumulated data. This prevents:
- Trading on insufficient statistical evidence after bot restarts
- Trading on z-scores computed from small samples (high variance)
- False signals during data gaps

Position sizing scales linearly with confidence, so even above the 0.50 threshold, lower-confidence signals receive smaller positions.

### One Position Per Signal Source

The system enforces:
- **One spread position per pair** — if SOL/ETH spread is already open, a new SOL/ETH signal is ignored
- **One basis position per market** — if SOL basis is already open, a new SOL funding signal is ignored

This prevents pyramiding into losing positions and keeps exposure diversified across pairs and markets.

---

## 4. Market-Level Controls

### Single Market Exposure Limit (50% of TVL)

No single perpetual market (SOL, BTC, or ETH) can represent more than 50% of the vault's total collateral exposure.

**Practical impact:** at maximum allocation (40% spread + 30% basis), the worst-case single-market exposure is:
- SOL in SOL/ETH spread (half the spread = 20% of TVL) + SOL basis (15% of TVL) = 35% of TVL
- Well within the 50% limit

The limit exists as a **backstop** for edge cases and future parameter changes.

### Allocation Caps

Hard allocation limits prevent any single strategy from dominating the portfolio:

| Strategy | Maximum Allocation | Effect |
|---|---|---|
| Spread trading | 40% of TVL | Caps directional pair exposure |
| Basis trading | 30% of TVL | Caps funding rate exposure |
| Lending | 100% of TVL (min 30%) | Ensures base yield floor |

The remaining capacity calculation happens dynamically:

$$\text{max\_new\_spread} = \max(0,\ \text{TVL} \times 0.40 - \text{existing\_spread\_exposure})$$
$$\text{max\_new\_basis} = \max(0,\ \text{TVL} \times 0.30 - \text{existing\_basis\_exposure})$$

If the remaining capacity is below $10 USDC (minimum position size), no new position is opened in that category.

---

## 5. Liquidity Risk

### Position Sizing vs Market Depth

Position sizing assumes a **$200K-$500K TVL band** — a modelling assumption rather than a measured figure, since the vault has never held deposits. The band is chosen to be small enough that Drift's order book depth is a non-issue and large enough that per-leg transaction and slippage costs stay immaterial; see [`strategy.md` §9](strategy.md#scalability) for the full reasoning.

At that size, individual position sizes are small relative to Drift's perpetual market depth:

| Market | Typical Daily Volume | Max Position Size (at $500K TVL) | Position / Volume |
|---|---|---|---|
| SOL-PERP | $50M+ | $100K (20% of TVL) | 0.2% |
| BTC-PERP | $30M+ | $100K (20% of TVL) | 0.33% |
| ETH-PERP | $20M+ | $100K (20% of TVL) | 0.5% |

At these ratios, market impact is negligible. Slippage on entry and exit is estimated at 0.05-0.10% per leg.

### Scaling Concerns

At higher TVLs ($2M+), position sizes begin to represent meaningful portions of Drift's order book depth. Mitigations for scaling:
- Spread entry/exit thresholds could be widened to reduce trade frequency
- Position sizing can be capped in absolute dollar terms (not just percentage)
- The lending layer scales linearly with no liquidity constraints

### Emergency Exit Liquidity

The worst liquidity scenario is an emergency exit during a market crash (when everyone is exiting simultaneously). Mitigations:
- Positions are delta-neutral (spread) or near-neutral (basis), so they partially self-hedge even without closing
- The 1.20 health rate buffer provides time — we exit before the rush to liquidation
- Solana's throughput (~4,000 TPS) means our transactions aren't competing for blockspace in the same way as Ethereum during a crash

---

## 6. Protocol & Smart Contract Risk

### Drift Protocol Risk

Drift is the primary on-chain dependency. Risks and mitigations:

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Smart contract exploit | Low | Critical | Drift is audited (Kudelski, OtterSec), $1B+ TVL, battle-tested since 2022 |
| Oracle manipulation | Low | High | Pyth uses multi-source aggregation; Drift has circuit breakers |
| Liquidation engine failure | Very low | High | Our 1.20 health rate floor provides early exit before Drift's liquidation engine engages |
| Protocol downtime | Low | Medium | Graceful degradation — bot stops trading, capital stays in last known state |

### Ranger/Voltr Vault Risk

The vault program (Voltr) manages deposits, withdrawals, and LP token minting.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vault program bug | Low | Critical | Voltr is audited; vault operations are simple (deposit/withdraw/mint) |
| Adaptor CPI failure | Low | Medium | If adaptor calls fail, the transaction reverts — capital stays in vault |
| LP token depegging | Very low | Medium | LP token value is backed 1:1 by vault assets; no rebasing or algorithmic mechanisms |

### Our Bot (Off-Chain Risk)

The bot itself runs off-chain and only signs transactions. It cannot drain the vault beyond the adaptor-permitted operations.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Private key compromise | Low | Critical | Key stored in environment variable, not in code. Vault manager role can be rotated. |
| Bug in proposal logic | Medium | Medium | DRY_RUN mode for testing; all proposals logged before execution; stop-loss and drawdown caps limit damage |
| Incorrect position sizing | Low | Medium | Position size is bounded by `maxNewSpreadUsdc` / `maxNewBasisUsdc` from risk assessment; min $10 floor prevents dust |

### Attack Surface Minimization

The vault's on-chain attack surface is deliberately minimal:
- **No custom Solana programs** — we use Ranger's audited vault program and adaptors
- **No token minting/burning logic** — handled entirely by Voltr
- **No governance or upgradability** — parameters are hardcoded in BOT_CONFIG, not on-chain
- **CPI-only interaction** — the bot signs transactions that call Voltr, which calls Drift via adaptors. Each CPI boundary enforces its own access control.

---

## 7. Oracle Risk

### Pyth Network Dependency

All price data flows through Pyth oracles integrated into Drift. Risks:

| Scenario | Impact | Mitigation |
|---|---|---|
| **Stale oracle** (no update for >1s) | Incorrect z-score or position valuation | Drift rejects orders with stale oracles; bot's 30s tick absorbs short outages |
| **Oracle manipulation** (flash loan attack) | False signals trigger bad trades | Pyth aggregates multiple independent sources; manipulation requires corrupting the majority. Z-score lookback (24h) dampens short-term spikes. |
| **Oracle divergence** (Pyth vs actual market) | Stop-loss triggers incorrectly or fails to trigger | Health rate floor (1.20) provides buffer; position age limit (24h) forces eventual closure |

### Z-Score Resilience to Oracle Noise

The z-score is inherently resistant to short-term oracle noise because:
- It is computed over 2,880 data points (24 hours)
- A single bad price reading affects the z-score by at most 1/2880 of the standard deviation
- The 2.0σ entry threshold is far beyond normal noise levels
- Even if a false signal fires, the 3% stop-loss and 24h age limit bound the damage

---

## 8. Operational Risk

### Bot Downtime

If the bot process crashes or the host machine goes down:
- **Open positions remain open** on Drift — they don't auto-close
- **Risk exposure:** positions may drift past stop-loss or age limits without the bot to enforce them
- **Drift's native liquidation engine** remains active as a backstop if health rate drops to ~1.0
- **Recovery:** restart the bot; it reads current state from DB + Drift and resumes normal tick processing

**Maximum exposure during downtime:**
- Spread positions: market-neutral, so extended exposure is bounded by correlation breakdown
- Basis positions: delta-neutral, exposure bounded by basis convergence
- Neither position type has unbounded loss potential even without active management

### Network Failures

| Failure | Impact | Recovery |
|---|---|---|
| RPC endpoint down (Helius) | Bot cannot read market data or submit transactions | Bot skips ticks until RPC recovers; API serves DB-only responses |
| Solana network congestion | Transactions may fail or be delayed | Overlap guard prevents duplicate submissions; failed txns are logged and retried on next tick |
| Database unavailable | Bot cannot read historical data or write events | Bot stops tick processing; API returns errors. No on-chain impact. |

### Execution Safeguards

| Safeguard | Mechanism |
|---|---|
| **Tick overlap guard** | If a tick takes >30s, the next one is skipped — prevents concurrent execution |
| **DRY_RUN mode** | All proposals generated and logged but no transactions submitted. Ships enabled by default. |
| **Proposal logging** | Every proposal (including no-ops) written to `bot_events` before execution |
| **Execution gating** | `canExecuteDrift` and `canExecuteVault` are separate boolean gates — Drift trading and vault lending rebalance can be independently enabled/disabled |
| **Idempotent state** | Bot reads current state each tick — no accumulated state that can become stale or corrupted |
| **Graceful shutdown** | SIGINT/SIGHUP handlers close Drift connection and DB pool cleanly |

---

## 9. Stress Scenarios

### Scenario 1: Flash Crash (-30% Across All Assets in 5 Minutes)

**What happens:**
1. Z-scores spike (ratio may diverge as assets crash at different rates)
2. Unrealized PnL on spread positions may briefly exceed 3% → **stop-loss triggers**
3. Health rate may drop toward 1.20 → **emergency exit triggers**
4. All positions closed within 1-2 ticks (30-60 seconds)
5. Estimated total loss: 2-4% of TVL (stop-losses + slippage during crash liquidity)
6. 15-minute cooldown prevents re-entry during continued volatility

**Why this is survivable:**
- Spread positions are market-neutral — if SOL and ETH both drop 30%, the spread PnL depends only on the *difference* in their drops, not the absolute magnitude
- Basis positions are delta-neutral — the perp leg and spot leg offset
- The 5% drawdown cap is the hard floor
- After emergency exit, 100% of capital is in USDC lending — no further market exposure

### Scenario 2: Correlation Breakdown (SOL Drops 20%, ETH Flat)

**What happens:**
1. SOL/ETH ratio drops sharply — if we were long SOL / short ETH (z was negative at entry), this is adversarial
2. The spread position's unrealized PnL deteriorates
3. If loss hits 3% → stop-loss closes the position
4. Cost: 0.6% of TVL (20% position × 3% loss)
5. Z-score recomputes — the new extreme z-score may trigger a *new* entry in the opposite direction (which would be correct, as the move is now even more extreme)

**Why this is survivable:**
- Single-position stop-loss limits damage to 0.6% of TVL
- The z-score lookback (24 hours) will adapt to the new regime within hours
- If the correlation breakdown is permanent (structural change), the z-score window will incorporate it and stop generating signals for that pair

### Scenario 3: Funding Rate Whipsaw (Flips Positive to Negative Repeatedly)

**What happens:**
1. Bot enters basis position at +18% APR (short perp, long spot)
2. Funding flips to -5% APR → exit signal fires → position closed
3. Loss: round-trip execution costs (~0.2%) + adverse funding paid between tick detection
4. If funding then goes to -18% and the bot enters the opposite direction, then flips again → repeated small losses

**Why this is survivable:**
- The exit condition requires BOTH a sign flip AND APR below 15%. Brief flips above 15% in the new direction don't trigger exit.
- Round-trip cost is ~0.2% per entry/exit cycle — at $100K position, that's ~$200 per whipsaw
- The 15% entry threshold filters out marginal funding rates where whipsaw is most likely
- At worst, repeated whipsaws cost a few hundred dollars over days — not a threat to the 5% drawdown cap

### Scenario 4: Bot Offline for 6 Hours

**What happens:**
1. Open positions continue on Drift with no active management
2. Stop-losses and age limits are NOT enforced during downtime
3. Spread positions remain market-neutral — bounded loss even without management
4. Basis positions remain delta-neutral — same bounded exposure
5. Drift's native liquidation engine remains active if health rate approaches 1.0

**Maximum damage estimate:**
- Spread position: worst-case ratio move over 6h is ~3-5% based on historical SOL/ETH volatility. At 20% of TVL, this is 0.6-1.0% of TVL per position.
- Two spread + one basis position: ~2-3% of TVL
- Still within the 5% drawdown tolerance (which the bot would enforce on restart)

**On restart:**
- Bot reads current state from DB + Drift
- Immediately runs a risk assessment tick
- Closes any positions that have breached stop-loss or age limits during the outage
- Resumes normal operation

### Scenario 5: Drift Protocol Exploit

**What happens:**
1. If Drift's smart contracts are compromised, funds deposited into Drift are at risk
2. The vault's exposure to Drift is: all lending deposits + all open perp positions

**Mitigations:**
- Drift has been audited by Kudelski Security and OtterSec
- Drift has >$1B in TVL and has been live since 2022 without a major exploit
- The vault's minimum lending allocation (30%) means at least 30% of TVL is exposed to Drift lending risk at all times — this is an accepted risk, shared with all Drift lenders
- The vault does not use cross-protocol composability (no flash loans, no recursive strategies) which reduces the novel attack surface

**Residual risk:** this is the highest-impact, lowest-probability risk. If Drift itself is compromised, our risk controls cannot help. This risk is shared with all Drift users and is mitigated by Drift's own security practices.

---

## 10. Recovery Procedures

### After Emergency Exit

1. All positions are closed, capital is in USDC (idle or lending)
2. 15-minute cooldown begins — no new trades
3. After cooldown, bot resumes normal signal evaluation
4. New trades only open if signals are strong enough (z ≥ 2.0 or APR ≥ 15%)
5. Position sizing starts from current TVL (post-loss), not historical HWM

### After Bot Restart

1. Bot connects to DB and Drift
2. Reads current portfolio state (open positions, vault value)
3. Runs immediate risk assessment
4. Closes any positions that breached limits during downtime
5. Resumes 30-second tick loop

### After Drawdown Recovery

The HWM does not reset after a drawdown. If the vault drops from $100K to $95K (5% drawdown), the HWM remains $100K. The vault must recover to $100K before the drawdown counter resets to 0%.

This means the vault is **more conservative after a loss** — any further decline is measured against the original HWM, not the post-loss value. This is intentional: it prevents the system from "forgetting" a loss and taking on the same risks that caused it.

---

## 11. Risk Monitoring

### Real-Time Dashboard

The Next.js dashboard provides live visibility into:
- **TVL and allocation breakdown** — donut chart showing lending/spread/basis/idle split
- **Open positions** — entry price, current PnL, age, market
- **Signal state** — current z-scores and funding APRs for all pairs/markets
- **Bot status** — running state, last tick time, tick count

### API Endpoints

| Endpoint | Risk Data Provided |
|---|---|
| `GET /vault/state` | TVL, health rate, allocation percentages, current drawdown |
| `GET /vault/positions` | All open positions with unrealized PnL, age, size |
| `GET /bot/status` | Bot running state (detects if tick loop has stopped) |
| `GET /bot/events` | Full audit trail — every proposal, execution, and no-op with timestamps |
| `GET /metrics/funding` | Live funding rates — early warning for basis position risks |
| `GET /metrics/spreads` | Live z-scores — early warning for spread position risks |

### Audit Trail

Every bot tick writes to the `bot_events` table:
- **Event type:** `tick_start`, `tick_complete`, `proposal_generated`, `proposal_executed`, `emergency_exit`, `dry_run_blocked`
- **Payload:** full risk assessment context, signal values, proposal details
- **Timestamp:** millisecond precision

This creates a complete, queryable history of every decision the bot has ever made — including the decisions to do nothing.

---

## 12. Parameter Summary

All risk parameters in one table for reference:

| Parameter | Value | Category | Effect on Safety |
|---|---|---|---|
| `MAX_DRAWDOWN_PCT` | 5% | Portfolio | Hard cap on vault losses before emergency exit |
| `HEALTH_RATE_FLOOR` | 1.20 | Portfolio | 20% buffer above liquidation zone |
| `EMERGENCY_COOLDOWN_MS` | 15 min | Portfolio | Prevents whipsaw re-entry after emergency |
| `POSITION_STOP_LOSS_PCT` | 3% | Position | Caps individual trade losses |
| `MAX_POSITION_AGE_MS` | 24h | Position | Forces closure of stale positions |
| `CONFIDENCE_THRESHOLD` | 0.50 | Position | Requires 12h+ data before trading |
| `MIN_POSITION_SIZE_USDC` | $10 | Position | Prevents dust transactions |
| `MAX_SINGLE_MARKET_EXPOSURE_PCT` | 50% | Market | Prevents concentration in one asset |
| `MAX_SPREAD_ALLOCATION` | 40% | Market | Caps total spread exposure |
| `MAX_BASIS_ALLOCATION` | 30% | Market | Caps total basis exposure |
| `MIN_LENDING_ALLOCATION` | 30% | Market | Guarantees base yield floor |
| `REBALANCE_DRIFT_PCT` | 5% | Operational | Reduces unnecessary rebalance txns |
| `TICK_INTERVAL_MS` | 30s | Operational | Detection window for all risk checks |
| `DRY_RUN` | true (default) | Operational | Blocks all on-chain execution until explicitly enabled |

### Defense-in-Depth Summary

```
Layer 1: Strategy Design
  └── Delta-neutral / market-neutral construction
  └── No leverage, no borrowing
  └── Lending floor (30% minimum)

Layer 2: Position Controls
  └── 3% stop-loss per position
  └── 24h max age
  └── Confidence gating (50%)
  └── One position per signal source

Layer 3: Portfolio Controls
  └── 5% max drawdown → emergency exit
  └── 1.20 health rate floor → emergency exit
  └── 15-minute cooldown after emergency

Layer 4: Market Controls
  └── 50% max single-market exposure
  └── 40% max spread, 30% max basis allocation

Layer 5: Operational Controls
  └── DRY_RUN mode (default on)
  └── Tick overlap guard
  └── Full audit logging
  └── Graceful degradation
```

No single control is sufficient on its own. The framework relies on **redundancy** — multiple independent checks at different levels, each capable of limiting damage even if others fail.
