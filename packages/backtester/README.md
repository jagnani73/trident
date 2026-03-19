# Trident Backtester

Python backtesting module that validates Trident's trading strategy against synthetic market data. It mirrors the exact same signal logic, risk management, and capital allocation rules as the live TypeScript bot — same thresholds, same formulas, same decision pipeline.

## What It Does

1. **Generates 90 days of synthetic market data** — correlated price series for SOL, BTC, ETH with realistic volatility, mean-reverting spread events, and regime-switching funding rates
2. **Computes trading signals** — z-score spread signals and funding APR basis signals, identical to the live bot's `SpreadDetectorService` and `FundingMonitorService`
3. **Simulates the full bot pipeline** — signal evaluation → risk assessment → capital allocation → position execution, mirroring `JobsService.botTick()`
4. **Produces performance metrics and charts** — APY, Sharpe ratio, max drawdown, win rate, per-trade PnL, cumulative returns, allocation breakdown over time

## Prerequisites

- **Python 3.11+** (check with `py --version` on Windows or `python3 --version` on Mac/Linux)
- **pip** (comes with Python)

## Setup

From the repo root (`ranger/`):

```bash
# Install dependencies
py -m pip install pandas numpy matplotlib plotly requests

# Or using the requirements file
py -m pip install -r packages/backtester/requirements.txt
```

> **Note:** If `py` doesn't work on your system, try `python` or `python3` instead.

## Running

All commands are run from the repo root (`ranger/`):

```bash
# Default run: 90 days, $10K initial capital, seed=42
py packages/backtester/run.py

# Custom parameters
py packages/backtester/run.py --seed 123        # Different random seed (different market scenario)
py packages/backtester/run.py --days 180        # 180-day simulation
py packages/backtester/run.py --capital 50000   # $50K initial capital
py packages/backtester/run.py --no-charts       # Skip chart generation (faster, console output only)

# Combine flags
py packages/backtester/run.py --seed 99 --days 120 --capital 25000
```

### What You'll See

The console prints a summary like this:

```
============================================================
  TRIDENT BACKTEST RESULTS
============================================================

  Simulation:  90 days
  Initial:     $10,000.00
  Final:       $10,487.05
  Return:      +4.87%
  APY:         21.27%
  Max DD:      2.59%
  Sharpe:      3.03

  --- Trades ---
  Total:       105
  Win Rate:    53.3%
  Avg Win:     $+23.79
  Avg Loss:    $-18.61
  Profit Fac:  1.46

  --- By Strategy ---
  Spread:      66 trades, $+423.56
  Basis:       39 trades, $-3.08
  Lending:     $+148.17

  --- Costs ---
  Slippage:    $164.35
  TX Costs:    $0.42
  Emergencies: 0

  --- Close Reasons ---
  funding_flip         10
  max_age              71
  stop_loss            10
  target_hit           13
============================================================
```

### Output Charts

Charts are saved to `packages/backtester/output/`:

| File | Contents |
|---|---|
| `backtest_results.png` | 3-panel chart: portfolio value over time, drawdown, allocation breakdown (lending/spread/basis) |
| `trade_analysis.png` | 2-panel chart: per-trade PnL bars (green=win, red=loss) and cumulative PnL curve |

## Project Structure

```
packages/backtester/
├── run.py                         # CLI entry point — run this
├── src/
│   ├── config.py                  # BOT_CONFIG mirror (must match constants.ts)
│   ├── data/
│   │   └── generator.py           # Synthetic price + funding data generator
│   ├── strategies/
│   │   ├── spread.py              # Z-score signal logic (mirrors SpreadDetectorService)
│   │   ├── funding.py             # Funding APR signal logic (mirrors FundingMonitorService)
│   │   └── allocator.py           # Position sizing + cost calculation
│   ├── engine/
│   │   └── simulator.py           # Core backtest loop (mirrors JobsService tick)
│   └── analysis/
│       └── report.py              # Summary stats + matplotlib chart generation
├── output/                        # Generated charts (gitignored)
├── notebooks/                     # Jupyter notebooks (optional)
├── pyproject.toml
└── requirements.txt
```

## How It Maps to the Live Bot

The backtester reimplements the live bot's logic in Python to validate the strategy independently. Every key function has a 1:1 counterpart:

| Backtester (Python) | Live Bot (TypeScript) | What It Does |
|---|---|---|
| `src/strategies/spread.py → compute_z_scores()` | `SpreadDetectorService.evaluatePair()` | Rolling z-score from price ratios |
| `src/strategies/spread.py → resolve_action()` | `SpreadDetectorService.resolveAction()` | Z-score → entry/exit signal |
| `src/strategies/funding.py → compute_funding_apr()` | `FundingMonitorService.evaluateMarket()` | Annualize funding rate to APR |
| `src/strategies/funding.py → resolve_action()` | `FundingMonitorService.resolveAction()` | APR + flip → entry/exit signal |
| `src/strategies/allocator.py → size_position()` | `CapitalAllocatorService.sizePosition()` | `min(max * 0.5 * confidence, max)` |
| `src/engine/simulator.py → _tick()` | `JobsService.botTick()` | Full tick pipeline |
| `src/engine/simulator.py → _emergency_exit()` | `CapitalAllocatorService.buildEmergencyProposals()` | Close all + cooldown |
| `src/engine/simulator.py → _check_position_limits()` | `RiskManagerService.checkPositionLimits()` | Stop-loss (3%) + max age (24h) |
| `src/config.py → BOT_CONFIG` | `packages/backend/utils/constants.ts → BOT_CONFIG` | All thresholds (must be kept in sync) |

## Key Metrics Explained

| Metric | What It Means |
|---|---|
| **APY** | Annualized percentage yield — the return scaled to a full year |
| **Max DD** | Maximum drawdown — largest peak-to-trough decline. Our hard cap is 5%. |
| **Sharpe** | Sharpe ratio — return per unit of risk. Above 1.0 is good, above 2.0 is strong. |
| **Win Rate** | Percentage of trades that made money |
| **Profit Factor** | Gross profit / gross loss. Above 1.0 means profitable overall. |
| **Spread PnL** | Profit/loss from mean-reversion spread trades (the main alpha source) |
| **Basis PnL** | Profit/loss from funding rate capture trades |
| **Lending** | Income from USDC lending (the guaranteed yield floor) |
| **Slippage** | Simulated execution cost (5 bps per leg) |
| **Emergencies** | Number of times the 5% drawdown or 1.20 health rate triggered a full exit |

## Synthetic Data

The backtester generates its own market data rather than fetching historical data. This is intentional:

- **Reproducible** — same seed always produces the same results
- **Self-contained** — no API keys or network access required
- **Controllable** — can test specific market regimes by changing the seed

The generator creates:
- **Correlated price series** using geometric Brownian motion with a realistic correlation matrix (SOL/ETH: 0.85, BTC/ETH: 0.80, SOL/BTC: 0.70)
- **Spread divergence events** — periodic shocks where one asset temporarily deviates, then reverts (the exact setup our spread strategy targets)
- **Regime-switching funding rates** — alternating between normal (~5% APR), elevated (~20% APR), and negative (~-12% APR) periods

## Changing Strategy Parameters

To test different thresholds, edit `src/config.py`. The `BOT_CONFIG` dict mirrors the live bot's `constants.ts` exactly. For example, to test a tighter z-score entry:

```python
BOT_CONFIG = {
    "SPREAD_ENTRY_Z_SCORE": 2.5,  # was 2.0 — more conservative entry
    # ... rest unchanged
}
```

Then re-run. Compare results across parameter sets to optimize.

> **Important:** If you change parameters here for testing, remember to update `packages/backend/utils/constants.ts` to match if you want the live bot to use the same values.
