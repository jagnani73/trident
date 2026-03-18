# Implementation Plan

## Context

We're building a hybrid yield vault for the Ranger Build-A-Bear Hackathon (deadline: Apr 6, 2026). The vault combines Drift lending, perp spread trading, and basis trading into a single adaptive USDC vault on Solana. We need to submit to both Main Track and Drift Side Track.

This doc covers **what** we build and **how** the pieces fit together — not the code itself.

---

## Monorepo Structure

```
ranger/
├── docs/                           # Strategy docs, architecture, hackathon notes
│   ├── objective.md                # Hackathon details + strategy overview
│   ├── implementation.md           # This file
│   ├── strategy.md                 # Deep strategy thesis + math (submission doc)
│   └── risk-management.md          # Risk framework (submission doc)
│
├── packages/
│   ├── common/                     # Shared across all packages
│   │   ├── src/
│   │   │   ├── types/              # Shared TypeScript types
│   │   │   │   ├── vault.types.ts          # Vault state, LP, deposit/withdraw
│   │   │   │   ├── drift.types.ts          # Drift market, funding, position types
│   │   │   │   ├── strategy.types.ts       # Strategy layer enums, allocation state
│   │   │   │   ├── signals.types.ts        # Spread signals, funding signals
│   │   │   │   └── config.types.ts         # Bot config, thresholds, risk params
│   │   │   ├── constants/          # Magic numbers, market configs, adaptor IDs
│   │   │   │   ├── drift-markets.ts        # Perp market indexes, pair definitions
│   │   │   │   ├── adaptors.ts             # Ranger adaptor program IDs
│   │   │   │   └── risk-params.ts          # Default thresholds, limits
│   │   │   └── utils/              # Pure utility functions
│   │   │       ├── math.ts                 # Z-score, annualized rate, PnL calcs
│   │   │       ├── formatting.ts           # Logging, display helpers
│   │   │       └── time.ts                 # Interval helpers, cooldown logic
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── backend/
│   │   ├── microservices/          # Independent runnable services
│   │   │   ├── bot-engine/         # Core rebalancing bot (the brain)
│   │   │   ├── data-collector/     # Drift data ingestion + caching
│   │   │   └── api/                # REST API for dashboard + monitoring
│   │   │
│   │   ├── services/               # Shared service modules (used by microservices)
│   │   │   ├── drift/              # Drift SDK wrapper
│   │   │   ├── ranger-vault/       # Ranger vault SDK wrapper
│   │   │   ├── spread-detector/    # Spread opportunity detection
│   │   │   ├── funding-monitor/    # Funding rate tracking + signals
│   │   │   ├── risk-manager/       # Position limits, drawdown, emergency exit
│   │   │   └── capital-allocator/  # Layer selection + sizing logic
│   │   │
│   │   ├── db-migrations/          # PostgreSQL migrations (dev mode)
│   │   │   ├── 001_initial-schema.up.sql
│   │   │   ├── 001_initial-schema.down.sql
│   │   │   └── README.md
│   │   │
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── frontend/                   # Vault monitoring dashboard
│   │   ├── src/
│   │   │   ├── app/                # Next.js App Router
│   │   │   ├── components/         # UI components
│   │   │   ├── hooks/              # Data fetching hooks
│   │   │   ├── lib/                # Client-side utils
│   │   │   └── config/             # Frontend constants
│   │   ├── DESIGN_SYSTEM.md        # UI spec
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── backtester/                 # Python backtesting module
│       ├── src/
│       │   ├── data/               # Data loaders (Drift S3, Pyth)
│       │   ├── strategies/         # Strategy implementations for backtesting
│       │   ├── engine/             # Backtest runner, portfolio tracker
│       │   └── analysis/           # Performance metrics, visualization
│       ├── notebooks/              # Jupyter notebooks for exploration
│       ├── requirements.txt
│       └── pyproject.toml
│
├── scripts/                        # One-off setup scripts
│   ├── setup-vault.ts              # Initialize Ranger vault on-chain
│   ├── add-strategies.ts           # Register adaptors + strategies
│   └── seed-test-data.ts           # Populate DB with test data
│
├── .env.example
├── .gitignore
├── docker-compose.yml              # PostgreSQL + optional services
├── pnpm-workspace.yaml
├── package.json                    # Root: scripts, devDependencies
└── tsconfig.base.json              # Shared TS config
```

---

## Package Breakdown

### 1. `packages/common` — Shared Foundation

**Purpose:** Single source of truth for types, constants, and pure utilities shared across backend microservices and frontend.

**Key contents:**
- **Types:** Vault state, Drift market data, strategy allocation state, bot signals, config schemas
- **Constants:** Drift perp market indexes, Ranger adaptor program IDs, default risk parameters, spread pair definitions (SOL/ETH, BTC/ETH, SOL/BTC)
- **Utils:** Z-score calculation, annualized funding rate conversion, PnL computation, time-based helpers

**No runtime dependencies on Solana/Drift SDKs** — pure types and math only.

---

### 2. `packages/backend` — All Server-Side Logic

#### 2a. Microservices

Each microservice is independently runnable with its own entry point.

##### `bot-engine` — The Brain

**What it does:** Runs the main decision loop. Every tick (configurable interval, ~30-60s):
1. Fetches current vault state (positions, balances, allocations)
2. Fetches live market data (funding rates, perp prices, spread ratios)
3. Runs spread detector — any high-confidence spread opportunities?
4. Runs funding monitor — any elevated funding rates for basis?
5. Runs risk manager — are we within drawdown/position limits?
6. Runs capital allocator — decides what to do (lend, spread, basis, close, rebalance)
7. Executes on-chain transactions via Ranger vault SDK + Drift adaptor

**Key decisions per tick:**
- Which layer should each dollar be in? (lending / spread / basis / idle)
- Should we open a new position? (spread or basis)
- Should we close an existing position? (target hit, stop-loss, convergence)
- Should we emergency exit? (max drawdown breached)

**Config-driven:** All thresholds, intervals, and limits come from a config file — no magic numbers in logic.

##### `data-collector` — Data Ingestion

**What it does:** Continuously ingests and caches market data from Drift.
- Polls Drift Data API for funding rates (per market, every 1h)
- Streams perp mark prices via Drift SDK subscriptions
- Computes and caches spread ratios for configured pairs
- Stores historical snapshots in PostgreSQL for analysis
- Exposes cached data to other microservices via in-process import or DB

**Why separate:** Decouples data fetching frequency from bot decision frequency. Data collector can poll fast (every few seconds for prices) while bot ticks slower (every 30-60s for decisions).

##### `api` — REST API

**What it does:** Serves vault metrics and bot state to the frontend dashboard.
- `GET /vault/state` — current vault TVL, allocations per layer, LP share price
- `GET /vault/positions` — active spread/basis positions with entry price, PnL, age
- `GET /vault/history` — historical performance, APY over time, drawdown chart data
- `GET /bot/status` — bot health, last tick time, current strategy mode
- `GET /metrics/funding` — live funding rates for monitored markets
- `GET /metrics/spreads` — current spread ratios and z-scores for pairs

**Framework:** Express or Fastify (lightweight, no need for NestJS complexity here).

---

#### 2b. Services (Shared Modules)

These are not standalone — they're imported by microservices.

##### `drift/` — Drift SDK Wrapper

Wraps `@drift-labs/sdk` into a clean interface:
- `initializeDriftClient()` — connection setup, wallet, subscription
- `getFundingRate(marketIndex)` — current + historical funding
- `getMarkPrice(marketIndex)` — perp mark price
- `openPerpPosition(market, side, size)` — place perp order
- `closePerpPosition(market)` — close existing position
- `depositToLending(amount)` — deposit USDC to Drift lending
- `withdrawFromLending(amount)` — withdraw from lending
- `getPositions()` — all open positions with unrealized PnL
- `getAccountHealth()` — margin ratio, free collateral

Handles connection management, retries, and error normalization.

##### `ranger-vault/` — Ranger Vault SDK Wrapper

Wraps `@voltr/vault-sdk`:
- `initializeVault(config)` — one-time vault creation
- `addAdaptor(adaptorId)` — register Drift/Lending adaptor
- `initializeStrategy(adaptor, market)` — activate a strategy slot
- `depositToStrategy(strategy, amount)` — move vault USDC into a strategy
- `withdrawFromStrategy(strategy, amount)` — pull USDC back to vault
- `getVaultState()` — TVL, LP price, strategy allocations
- `harvestFees()` — claim accumulated performance fees

##### `spread-detector/` — Spread Opportunity Detection

Core alpha logic:
- Maintains rolling window of price ratios for configured pairs (e.g., SOL-PERP / ETH-PERP)
- Computes z-score of current ratio vs rolling mean
- Emits signal when |z-score| exceeds entry threshold (e.g., > 2.0)
- Tracks signal age and confidence decay
- Provides exit signal when z-score reverts toward 0

**Configurable per pair:** window size, entry z-threshold, exit z-threshold, max position age, confidence decay rate.

##### `funding-monitor/` — Funding Rate Tracking

- Tracks annualized funding rate for each Drift perp market
- Maintains rolling average to smooth noise
- Emits signal when funding exceeds basis-trade entry threshold (e.g., > 15% annualized)
- Emits exit signal when funding drops below threshold or flips negative
- Ranks markets by attractiveness for basis trade deployment

##### `risk-manager/` — Portfolio Risk

Enforces hard limits:
- **Max drawdown:** If vault NAV drops X% from high-water mark → emergency exit all alpha positions to lending
- **Position limits:** Max % of vault in spread trades, max % in basis trades, min % in lending
- **Per-position stop-loss:** Individual spread/basis position max loss before forced close
- **Concentration limits:** Max exposure to any single Drift market
- **Health rate floor:** Ensure Drift account health stays above 1.20 (well above the 1.05 disqualification threshold)
- **Cooldown:** After emergency exit, wait N minutes before re-entering alpha positions

##### `capital-allocator/` — Layer Selection

The orchestrator that takes signals from spread-detector, funding-monitor, and risk-manager, then decides:
1. How much capital in each layer (lending / spread / basis)
2. Which specific positions to open/close
3. Sizing for new positions (Kelly criterion or fixed fractional)
4. Priority when multiple signals compete for capital

Decision hierarchy:
```
Risk Manager (veto power)
  └─ If drawdown limit hit → everything to lending
  └─ If position limits hit → no new positions

Capital Allocator (within risk bounds)
  └─ Spread signal + high confidence → allocate to spread trade
  └─ Funding signal + no spread opportunity → allocate to basis
  └─ Neither → stay in lending (or rebalance existing)
```

---

### 3. `packages/frontend` — Monitoring Dashboard

**Purpose:** Visual dashboard for the demo video + production monitoring. Not user-facing for depositors (that's Ranger Earn's UI) — this is for us as vault managers.

**Framework:** Next.js 15 App Router + Tailwind CSS

**Pages:**
- **Dashboard (/)** — overview: vault TVL, current APY, active strategy mode, allocation pie chart
- **Positions (/positions)** — table of active spread/basis positions with live PnL, entry time, z-score/funding at entry
- **Performance (/performance)** — historical APY chart, cumulative PnL, drawdown chart, comparison vs pure lending
- **Signals (/signals)** — live spread z-scores and funding rates for all monitored pairs, with entry/exit thresholds visualized
- **Bot Status (/bot)** — last tick, current state, recent decisions log, error log

**Data source:** Polls the `api` microservice. No direct Solana/Drift connection from frontend.

**Design system:** Dark theme (trading terminal aesthetic), monospace numbers, green/red PnL coloring, minimal chrome. Details in `DESIGN_SYSTEM.md`.

---

### 4. `packages/backtester` — Python Strategy Validation

**Purpose:** Backtest the hybrid strategy on historical Drift data to calibrate parameters and generate performance proof for submission.

**Components:**

#### Data Loaders (`src/data/`)
- `drift_s3_loader.py` — downloads historical CSVs from Drift's S3 bucket (funding rates, trades, prices)
- `pyth_loader.py` — fetches oracle price history from Pyth Benchmarks API
- `cache.py` — local file cache to avoid re-downloading

#### Strategy Implementations (`src/strategies/`)
- `lending_only.py` — baseline: 100% Drift USDC lending
- `basis_only.py` — baseline: pure funding rate basis trading
- `spread_only.py` — baseline: pure spread mean-reversion
- `hybrid.py` — our actual strategy: lending + spread + basis with allocation logic
- Each strategy implements a common interface: `on_tick(market_state) → List[Action]`

#### Engine (`src/engine/`)
- `simulator.py` — feeds historical data tick-by-tick through strategy, tracks portfolio state
- `portfolio.py` — tracks positions, PnL, fees, NAV over time
- `metrics.py` — computes APY, Sharpe, max drawdown, win rate, profit factor

#### Analysis (`src/analysis/`)
- `report.py` — generates performance summary with charts (matplotlib/plotly)
- `parameter_sweep.py` — grid search over z-score thresholds, funding thresholds, allocation limits
- `comparison.py` — side-by-side comparison of hybrid vs baselines

**Output:** Performance report + optimized parameter config that gets fed into the live bot.

---

## Database Schema (PostgreSQL, Dev Mode)

We need persistent storage for historical data caching and bot state tracking. Using PostgreSQL with raw SQL migrations (same pattern as ghar-ke-ca).

### Tables

#### `funding_rate_snapshots`
Cached funding rates from Drift for backtesting and monitoring.
- `id`, `market_index`, `funding_rate`, `oracle_price`, `mark_price`, `timestamp`, `created_at`

#### `spread_snapshots`
Computed spread ratios between configured pairs.
- `id`, `pair_name` (e.g., "SOL_ETH"), `ratio`, `z_score`, `market_a_price`, `market_b_price`, `timestamp`, `created_at`

#### `positions`
Active and historical vault positions (spread trades, basis trades).
- `id`, `type` (spread/basis), `status` (open/closed), `market_a_index`, `market_b_index` (null for basis), `side_a`, `side_b`, `size_usdc`, `entry_price_a`, `entry_price_b`, `exit_price_a`, `exit_price_b`, `entry_z_score`, `exit_z_score`, `realized_pnl`, `opened_at`, `closed_at`, `close_reason`

#### `vault_snapshots`
Periodic vault state snapshots for charting.
- `id`, `total_value_usdc`, `lending_allocation`, `spread_allocation`, `basis_allocation`, `idle_allocation`, `lp_share_price`, `apy_24h`, `apy_7d`, `drawdown_from_hwm`, `timestamp`

#### `bot_events`
Audit log of bot decisions for debugging.
- `id`, `event_type` (tick/open_position/close_position/rebalance/emergency_exit/error), `details` (JSONB), `timestamp`

### ORM

Drizzle ORM with `drizzle-kit` for migrations. Schema auto-generated into `packages/common` (same workflow as ghar-ke-ca: write migration SQL → apply → `pnpm build:common` pulls schema).

---

## Infrastructure

### Local Development
- **Docker Compose:** PostgreSQL 16
- **Solana:** Devnet for vault/strategy testing (free)
- **RPC:** Helius free Dev Plan (hackathon perk) or Alchemy free tier
- **Bot:** Runs locally via `pnpm dev` (ts-node / tsx)

### Production (Hackathon Window)
- **Bot + API:** Local machine or AWS free tier EC2
- **Database:** Docker PostgreSQL (local) or Supabase free tier
- **Frontend:** Vercel free tier
- **Vault:** Solana mainnet (real trades required for submission)

### Environment Variables
```
# Solana
SOLANA_RPC_URL=           # Helius/Alchemy endpoint
SOLANA_PRIVATE_KEY=       # Vault manager wallet (base58)
SOLANA_NETWORK=           # devnet | mainnet-beta

# Drift
DRIFT_ENV=                # devnet | mainnet-beta
DRIFT_SUBACCOUNT=         # 0

# Ranger Vault
VAULT_ADDRESS=            # After vault initialization
DRIFT_ADAPTOR_ID=         # EBN93eXs5fHGBABuajQqdsKRkCgaqtJa8vEFD6vKXiP
LENDING_ADAPTOR_ID=       # aVoLTRCRt3NnnchvLYH6rMYehJHwM5m45RmLBZq7PGz

# Database
DATABASE_URL=             # postgresql://...

# Bot Config
BOT_TICK_INTERVAL_MS=     # 30000
SPREAD_ENTRY_Z_SCORE=     # 2.0
SPREAD_EXIT_Z_SCORE=      # 0.5
FUNDING_ENTRY_THRESHOLD=  # 0.15 (15% annualized)
MAX_DRAWDOWN_PCT=         # 0.05 (5%)
MAX_SPREAD_ALLOCATION=    # 0.40 (40% of vault)
MAX_BASIS_ALLOCATION=     # 0.30 (30% of vault)
MIN_LENDING_ALLOCATION=   # 0.30 (30% floor)
```

---

## Implementation Phases

### Phase 1: Foundation (Days 1-3)
**Goal:** Monorepo scaffolding, SDK wrappers, database, basic bot loop.

1. Initialize pnpm monorepo with workspace config
2. Scaffold all packages with package.json, tsconfig
3. Set up `common` — types, constants, utils stubs
4. Set up Docker Compose (PostgreSQL)
5. Write initial DB migrations
6. Build `drift/` service — initialize client, read funding rates, read prices
7. Build `ranger-vault/` service — initialize vault, add adaptors, basic deposit/withdraw
8. Build minimal bot-engine — tick loop that reads data and logs decisions (no trading yet)

### Phase 2: Data Pipeline + Backtester (Days 4-7)
**Goal:** Historical data ingestion, backtesting framework, parameter calibration.

1. Build `data-collector` microservice — poll Drift API, store snapshots in DB
2. Build Python backtester — data loaders for Drift S3 historical CSVs
3. Implement baseline strategies (lending-only, basis-only, spread-only)
4. Implement hybrid strategy in backtester
5. Run parameter sweep — find optimal z-score thresholds, funding thresholds, allocation splits
6. Generate backtest report with charts (APY, drawdown, Sharpe)
7. Export calibrated params to bot config

### Phase 3: Strategy Logic (Days 8-12)
**Goal:** Live spread detection, funding monitoring, capital allocation, risk management.

1. Build `spread-detector` service — rolling window, z-score, entry/exit signals
2. Build `funding-monitor` service — annualized rate tracking, signal emission
3. Build `risk-manager` service — drawdown tracking, position limits, emergency exit
4. Build `capital-allocator` service — layer selection, position sizing
5. Wire everything into bot-engine — signals → allocator → execution
6. Test on devnet with small positions

### Phase 4: Execution + On-Chain (Days 13-16)
**Goal:** Real on-chain execution via Ranger vault + Drift.

1. Initialize Ranger vault on mainnet via setup script
2. Register Drift adaptor + Lending adaptor
3. Initialize strategies (Drift perps, Drift lending)
4. Deploy bot connected to mainnet vault
5. Execute first trades — lending deposit, test spread entry/exit, test basis entry/exit
6. Monitor and tune parameters based on live behavior

### Phase 5: Dashboard (Days 14-17)
**Goal:** Frontend monitoring dashboard for demo video.

1. Create design system doc
2. Build dashboard page — TVL, APY, allocation chart
3. Build positions page — active positions table
4. Build performance page — historical charts
5. Build signals page — live z-scores and funding rates
6. Connect to API microservice
7. Polish for demo video

### Phase 6: Submission Prep (Days 17-19)
**Goal:** Documentation, video, final submission.

1. Write strategy documentation (strategy.md → formatted for submission)
2. Write risk management documentation
3. Record 3-min demo/pitch video
4. Compile on-chain wallet address + trade activity proof
5. Final code cleanup + README
6. Submit on both Main Track and Drift Side Track pages

---

## Key Dependencies

### TypeScript (Backend + Common)
- `@drift-labs/sdk` — Drift protocol interaction
- `@voltr/vault-sdk` — Ranger vault management
- `@solana/web3.js` — Solana base
- `@coral-xyz/anchor` — Anchor framework (Drift dependency)
- `drizzle-orm` + `drizzle-kit` — Database ORM
- `pg` — PostgreSQL driver
- `express` or `fastify` — API server
- `dotenv` — env config
- `pino` — logging
- `tsx` — dev runner

### TypeScript (Frontend)
- `next` 15 — framework
- `tailwindcss` v4 — styling
- `recharts` or `lightweight-charts` — performance charts
- `swr` or `@tanstack/react-query` — data fetching

### Python (Backtester)
- `pandas` — data manipulation
- `numpy` — math
- `matplotlib` / `plotly` — visualization
- `requests` — API calls
- `jupyter` — notebooks for exploration

---

## Risk Mitigations (Technical)

| Risk | Mitigation |
|------|------------|
| Drift SDK connection drops | Auto-reconnect with exponential backoff in drift service |
| Bot crashes mid-position | Positions persist in DB; bot resumes from last known state on restart |
| Spread diverges further instead of reverting | Per-position stop-loss + max position age in risk manager |
| Funding rate flips negative during basis trade | Funding monitor triggers exit signal; risk manager enforces |
| Vault health drops near 1.05 | Health floor set at 1.20; emergency exit well before disqualification |
| RPC rate limits | Use Helius Dev Plan; fallback to Alchemy; request batching |
| Transaction failures | Retry with priority fee escalation; log failures for manual review |
