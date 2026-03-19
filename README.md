# Trident

Adaptive USDC yield vault on Solana that dynamically shifts capital between three strategies — Drift lending, perp spread trading, and basis trading — through a [Ranger](https://ranger.finance) vault. An off-chain bot evaluates market signals every 30 seconds and rebalances accordingly.

> **Hackathon:** [Ranger Build-A-Bear](https://ranger.finance) — Main Track + Drift Side Track. Deadline Apr 6, 2026.

---

## How It Works (Plain English)

Imagine you have $10,000 USDC sitting in a vault. Instead of just lending it for a steady 6% APY, Trident does this:

1. **By default**, your USDC is lent on Drift (a Solana DEX) earning ~6% APY. This is the safe floor.
2. **Every 30 seconds**, a bot checks if there's a better opportunity:
   - Are SOL and ETH prices unusually far apart compared to their historical ratio? If yes → enter a **spread trade** (bet they'll converge back).
   - Is someone paying 20%+ annualized to hold a leveraged position? If yes → take the other side with a **basis trade** (collect the funding fee risk-free).
3. **If things go wrong** (drawdown > 5%, health rate drops), the bot pulls everything back to lending immediately.

The vault is deployed on-chain via Ranger's vault program. The bot is off-chain (TypeScript process) and only submits transactions — it never holds funds.

---

## Key Concepts

### What is Drift?

[Drift Protocol](https://drift.trade) is a decentralised exchange on Solana for perpetual futures (perps), spot trading, and lending. Think of it as a Solana-native Binance Futures.

Key Drift concepts used in Trident:

| Concept | What it means | Example |
|---|---|---|
| **Perp market** | A futures contract that never expires. Has a mark price, oracle price, and funding rate. | SOL-PERP (market index 0) |
| **Funding rate** | A periodic payment between longs and shorts to keep the perp price anchored to the oracle. If funding is positive, longs pay shorts. | Funding = +0.01% per hour = +87.6% APR. Shorts earn this. |
| **Oracle price** | The "true" price from an oracle (Pyth). The perp mark price can deviate from this. | SOL oracle: $89.63 |
| **Subaccount** | Each wallet can have multiple isolated accounts on Drift (0, 1, 2...). We use subaccount 0. | User ID: `0_<wallet>` |
| **Health rate** | Ratio of free collateral to maintenance margin. Below 1.0 = liquidation. We floor at 1.2. | Health 1.5 = healthy. Health 1.1 = danger. |
| **USDC lending** | Deposit USDC into Drift's lending pool. Earns variable interest from borrowers. | Deposit $5000 → earn ~6% APY |

### What is a Ranger Vault?

[Ranger](https://ranger.finance) provides an on-chain vault program (`vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8`) where:

1. A **vault manager** (us) creates a vault and configures which strategies it can use
2. **Depositors** put USDC in and receive LP shares (like an index fund)
3. The vault manager moves capital between **adaptors** — pluggable strategy modules that connect to DeFi protocols

We use two adaptors:
- **Drift Adaptor** (`EBN93eXs5fHGBABuajQqdsKRkCgaqtJa8vEFD6vKXiP`) — for perp trading and spot operations on Drift
- **Lending Adaptor** (`aVoLTRCRt3NnnchvLYH6rMYehJHwM5m45RmLBZq7PGz`) — for USDC lending on Drift

### Why Two Adaptors?

Drift lending and Drift trading are separate operations. The lending adaptor deposits USDC into Drift's lending pool (passive yield). The Drift adaptor opens perp positions (active trading). The vault program enforces that only registered adaptors can touch the vault's funds.

---

## Stack

### Packages

| Package | Role |
|---|---|
| `packages/common` | Shared library. Drizzle DB schema, TypeScript types (`SpreadSignal`, `FundingSignal`, `VaultState`), math utils (z-score, mean, stddev), error types. Sub-path exports: `@trident/common/database`, `/types`, `/constants`, `/errors`, `/utils`. Must be built before backend. |
| `packages/backend` | Three microservices (bot-engine, data-collector, API server) + shared service modules (Drift SDK wrapper, spread detector, funding monitor, risk manager, capital allocator). Express API on port 8000. Static singleton services. |
| `packages/frontend` | Next.js 16 monitoring dashboard. 4 pages (Dashboard, Positions, Performance, Signals). Polls backend API every 10-15 seconds. Dark theme. Not user-facing — this is for vault managers. |
| `packages/backtester` | Python backtesting module (planned). Historical strategy validation using Drift S3 data. |

### Databases

| Database | Role |
|---|---|
| **Supabase / PostgreSQL** | Source of truth. Funding rate history, spread snapshots, positions, vault state snapshots, bot audit log. Queried via Drizzle ORM. |

### External Data Sources

| Source | What is queried | Purpose |
|---|---|---|
| **Drift Protocol (on-chain)** | Perp market state, oracle prices, funding rates, account positions | Live market data for signal generation + trade execution |
| **Solana RPC (Helius)** | Transaction submission, account data loading | Bot submits transactions; BulkAccountLoader polls account state every 10 seconds |

---

## Entities

### Funding Rate Snapshot

**What it is:** A point-in-time capture of a Drift perp market's funding rate and prices.

**Source:** `DriftService.getAllFundingRates()` reads on-chain market state via the Drift SDK. The data-collector polls this every 30 seconds.

**Storage:** `funding_rate_snapshots` table — `id`, `market_index`, `funding_rate`, `oracle_price`, `mark_price`, `timestamp`.

**Example row:**
```json
{
  "market_index": 0,
  "funding_rate": -0.001623,
  "oracle_price": 89.636,
  "mark_price": 89.636,
  "timestamp": "2026-03-19T06:04:16.844Z"
}
```

**Used for:** Funding monitor computes rolling average APR from these snapshots to detect basis trade opportunities. The API serves them as historical charts.

---

### Spread Snapshot

**What it is:** A computed price ratio between two correlated perp markets, with an optional z-score.

**Source:** `DriftService.getSpreadPairPrices(symbolA, symbolB)` divides oracle prices. The data-collector stores the raw ratio; the spread-detector later computes and updates the z-score.

**Storage:** `spread_snapshots` table — `id`, `pair_name`, `ratio`, `z_score`, `market_a_price`, `market_b_price`, `timestamp`.

**Example row:**
```json
{
  "pair_name": "SOL/ETH",
  "ratio": 0.04102,
  "z_score": 1.85,
  "market_a_price": 89.655,
  "market_b_price": 2185.601,
  "timestamp": "2026-03-19T06:04:59.908Z"
}
```

**Why ratios?** SOL and ETH are correlated crypto assets. Their price *ratio* (SOL/ETH) tends to revert to a mean over time. When the ratio deviates significantly (high z-score), we bet it comes back. This is a [pairs trade](https://en.wikipedia.org/wiki/Pairs_trade).

**Used for:** Spread detector evaluates z-scores to generate entry/exit signals. The API serves them as live signal cards and historical z-score charts.

---

### Position

**What it is:** An active or closed trading position — either a spread trade (two opposing perp legs) or a basis trade (long spot + short perp).

**Source:** Created by bot-engine when the capital allocator proposes opening a trade. Updated when the position is closed.

**Storage:** `positions` table — `id`, `type` (spread/basis), `status` (open/closed), `market_a_index`, `market_b_index`, `side_a`, `side_b`, `size_usdc`, entry/exit prices, z-scores, `realized_pnl`, `close_reason`, `opened_at`, `closed_at`.

**Example — spread trade:**
```json
{
  "type": "spread",
  "status": "open",
  "market_a_index": 0,
  "market_b_index": 2,
  "side_a": "long",
  "side_b": "short",
  "size_usdc": "500.00",
  "entry_z_score": "2.15",
  "close_reason": null
}
```
This means: "SOL/ETH ratio was 2.15 standard deviations above the mean, so we went long SOL-PERP and short ETH-PERP expecting convergence."

---

### Vault Snapshot

**What it is:** A periodic snapshot of the vault's total value and how capital is distributed across strategies.

**Source:** Bot-engine records one snapshot per tick (every 30 seconds) using data from `RiskManagerService.getCurrentAllocations()`.

**Storage:** `vault_snapshots` table — `id`, `total_value_usdc`, allocation percentages (lending, spread, basis, idle), `lp_share_price`, `apy_24h`, `apy_7d`, `drawdown_from_hwm`, `timestamp`.

**Used for:** TVL charts, APY trend lines, allocation breakdown visualisations in the dashboard.

---

### Bot Event

**What it is:** An audit log entry for every decision the bot makes — ticks, position opens/closes, errors, emergency exits.

**Source:** Bot-engine and data-collector both log events after each tick.

**Storage:** `bot_events` table — `id`, `event_type` (tick/open_position/close_position/rebalance/emergency_exit/error), `details` (JSONB), `timestamp`.

**Example — tick event:**
```json
{
  "event_type": "tick",
  "details": {
    "tick": 42,
    "source": "bot-engine",
    "durationMs": 318,
    "spreadSignals": 2,
    "fundingSignals": 3,
    "proposals": 1,
    "executions": 0
  }
}
```

**Example — error event:**
```json
{
  "event_type": "error",
  "details": {
    "tick": 7,
    "error": "DriftClient has no user for user id 0_3a3UWF...",
    "source": "bot-engine"
  }
}
```

---

## Architecture

### Why Three Microservices?

The backend runs as three independent processes. Each can be started, stopped, and restarted independently.

| Process | Command | What it does | Can it run alone? |
|---|---|---|---|
| **data-collector** | `pnpm dev:collector` | Polls Drift every 30s, writes funding rates + spread ratios to DB | Yes — just data ingestion, no trading |
| **bot-engine** | `pnpm dev:bot` | Reads signals from DB + live Drift, decides and executes trades | Yes — but needs historical data from collector |
| **api** | `pnpm dev:api` | Serves REST endpoints for the dashboard | Yes — reads from DB + optionally live Drift |

**Why separate the collector from the bot?** They have different failure modes. If the bot crashes, data collection continues — no gaps in historical data. If the collector crashes, the bot still has its last-known signals and can operate (just with stale data). The API is completely independent of both.

### Data Flow

```
                  DRIFT PROTOCOL (on-chain)
                  oracle prices, funding rates, account state
                         │
            ┌────────────┼────────────┐
            │            │            │
            ▼            │            ▼
    ┌───────────────┐    │    ┌───────────────┐
    │ data-collector │    │    │  bot-engine   │
    │  (ingest only) │    │    │ (decide+exec) │
    └───────┬───────┘    │    └───┬───────┬───┘
            │            │        │       │
            │ write      │        │ read  │ write
            ▼            │        ▼       ▼
    ┌────────────────────────────────────────────┐
    │              PostgreSQL                     │
    │  funding_rate_snapshots  spread_snapshots   │
    │  positions  vault_snapshots  bot_events     │
    └──────────────────┬─────────────────────────┘
                       │ read
                       ▼
               ┌──────────────┐
               │   API server  │ ◄── optional live Drift connection
               │  :8000        │
               └──────┬───────┘
                      │ JSON
                      ▼
               ┌──────────────┐
               │   Frontend    │
               │  Next.js :3000│
               └──────────────┘
```

### Bot Decision Pipeline (Per Tick)

Every 30 seconds, the bot-engine runs this pipeline:

```
1. GATHER SIGNALS
   ├── SpreadDetector.evaluateAll()
   │   └── For each pair (SOL/ETH, BTC/ETH):
   │       └── Query last 2880 spread_snapshots
   │       └── Compute z-score of current ratio vs rolling mean
   │       └── z ≥ 2.0 → enter_short signal
   │       └── z ≤ -2.0 → enter_long signal
   │       └── |z| ≤ 0.5 → exit signal
   │
   └── FundingMonitor.evaluateAll()
       └── For each market (SOL, BTC, ETH):
           └── Query last 2880 funding_rate_snapshots
           └── Compute current APR: (rate / price) × 24 × 365 × 100
           └── APR ≥ 15% → enter_basis signal
           └── APR flipped sign AND < 15% → exit_basis signal

2. ASSESS RISK
   └── RiskManager.assess()
       ├── Read Drift account: collateral, free collateral, health rate
       ├── Check drawdown vs high-water mark (max 5%)
       ├── Check health rate (floor 1.20)
       ├── Scan open positions for stop-loss (3%) or max-age (24h)
       └── Output: { emergencyExit, canOpenSpread, canOpenBasis, positionsToClose }

3. ALLOCATE CAPITAL
   └── CapitalAllocator.allocate(signals, riskAssessment)
       ├── Emergency? → close everything, cancel orders
       ├── Risk-mandated closures? → close those positions
       ├── Spread signal + confidence ≥ 50% + within limits? → propose open
       ├── Funding signal + within limits? → propose open
       └── Nothing? → noop

4. EXECUTE
   └── For each proposal:
       └── open_spread → DriftService.placePerpMarketOrder() × 2 legs
       └── close_spread → DriftService.closePosition() × 2 legs
       └── open_basis → deposit spot + short perp
       └── close_basis → close perp + withdraw spot
       └── Log to bot_events table
```

---

## Services

All services are **static classes** with no instance state. They expose static methods and are initialized once per process.

| Service | File | Purpose |
|---|---|---|
| `DriftService` | `services/drift.service.ts` | Wraps `@drift-labs/sdk`. Manages Solana connection, wallet, market subscriptions. Exposes market data (prices, funding), account data (collateral, positions), and order execution. |
| `DatabaseService` | `services/database.service.ts` | Wraps Drizzle ORM. Single static PostgreSQL connection shared across all services. |
| `SpreadDetectorService` | `services/spread-detector.service.ts` | Computes z-scores from historical spread ratios. Emits entry/exit signals when z-score crosses thresholds. |
| `FundingMonitorService` | `services/funding-monitor.service.ts` | Converts raw funding rates to annualized APR. Detects elevated funding and rate flips. |
| `RiskManagerService` | `services/risk-manager.service.ts` | Enforces drawdown limits, health rate floor, position stop-losses, concentration limits. Has veto power over all trades. |
| `CapitalAllocatorService` | `services/capital-allocator.service.ts` | Converts signals + risk assessment into concrete proposals (open/close/noop). |
| `RangerVaultService` | `services/ranger-vault.service.ts` | Wraps `@voltr/vault-sdk` for on-chain vault operations. **Not yet implemented** — currently a stub. |
| `LoggerService` | `services/logger.service.ts` | Scoped structured logging. `LoggerService.scoped("drift::init")` → `INFO [...] (drift::init) -> connected`. |

---

## Configuration

All thresholds live in `BOT_CONFIG` (`packages/backend/utils/constants.ts`). Nothing is hardcoded in service logic.

| Parameter | Value | What it controls |
|---|---|---|
| `TICK_INTERVAL_MS` | 30,000 | How often the bot and collector run (30 seconds) |
| `SPREAD_ENTRY_Z_SCORE` | 2.0 | Enter spread trade when z-score exceeds this |
| `SPREAD_EXIT_Z_SCORE` | 0.5 | Exit spread trade when z-score drops below this |
| `FUNDING_ENTRY_THRESHOLD` | 0.15 | Enter basis trade when funding APR exceeds 15% |
| `MAX_DRAWDOWN_PCT` | 0.05 | Emergency exit if vault drops 5% from peak |
| `MAX_SPREAD_ALLOCATION` | 0.40 | Max 40% of vault in spread trades |
| `MAX_BASIS_ALLOCATION` | 0.30 | Max 30% of vault in basis trades |
| `MIN_LENDING_ALLOCATION` | 0.30 | Min 30% always in lending (safety floor) |
| `ZSCORE_LOOKBACK_COUNT` | 2880 | Data points for z-score calculation (24h at 30s ticks) |
| `POSITION_STOP_LOSS_PCT` | 0.03 | Close position if it loses 3% |
| `MAX_POSITION_AGE_MS` | 86,400,000 | Close position after 24 hours regardless |
| `HEALTH_RATE_FLOOR` | 1.20 | Emergency exit if Drift health drops below this |
| `EMERGENCY_COOLDOWN_MS` | 900,000 | Wait 15 minutes after emergency before re-entering |
| `MIN_POSITION_SIZE_USDC` | 10 | Don't open positions smaller than $10 |
| `CONFIDENCE_THRESHOLD` | 0.5 | Spread signal needs ≥ 50% confidence to act |

### Market Mappings

```
Perp markets:   SOL = 0, BTC = 1, ETH = 2
Spot markets:   USDC = 0, SOL = 1, ETH = 4
Spread pairs:   SOL/ETH, BTC/ETH
```

---

## One-Time Setup Scripts

These scripts run once to configure on-chain state. They are **not** part of the normal runtime.

| Script | Purpose | When to run |
|---|---|---|
| `setup-vault.ts` | Creates the Ranger vault on-chain. Registers the vault with the Ranger program, sets the manager wallet. | Once, before anything else. Produces a `VAULT_ADDRESS`. |
| `add-strategies.ts` | Registers the Drift and Lending adaptors with the vault. Initializes strategy slots so the bot can deposit/withdraw. | Once, after vault creation. |
| `seed-test-data.ts` | Populates the database with sample snapshots for testing the dashboard. | Optional, for development only. |

**Why do these exist?** On-chain programs on Solana require explicit account initialization. You can't just "start using" a vault — you must first create it (allocates on-chain storage, costs rent in SOL), then tell it which adaptors it's allowed to use. This is similar to deploying a smart contract on Ethereum, except Solana separates the program (deployed once) from accounts (created per user/vault).

> **Status:** These scripts are placeholders — not yet implemented. The vault needs a funded wallet (~0.02 SOL for rent) before they can run.

---

## API Endpoints

All under `/api/v1/`. Every response follows: `{ success: boolean, data: T }`.

| Endpoint | Description | Data source |
|---|---|---|
| `GET /healthcheck` | Server uptime and timestamp | Process |
| `GET /vault/state` | Current vault TVL, allocations, APY, health rate | Live Drift + DB fallback |
| `GET /vault/positions?status=&type=&limit=&offset=` | Position table with filters and pagination | DB only |
| `GET /vault/history?from=&to=&limit=` | Vault snapshots for TVL/APY charts | DB only |
| `GET /metrics/funding?live=&market_index=&from=&to=` | Funding rates — live from Drift + historical from DB | Live Drift + DB |
| `GET /metrics/spreads?live=&pair=&from=&to=` | Spread ratios and z-scores — live + historical | Live Drift + DB |
| `GET /bot/status` | Bot running state (inferred from last tick timestamp) | DB only |
| `GET /bot/events?event_type=&from=&to=&limit=` | Bot audit log with filters | DB only |

**Graceful degradation:** If Drift is unavailable (wallet not funded, RPC down), endpoints that use live data fall back to the latest DB snapshot and include `"live": false` in the response. The API never crashes due to Drift being down.

---

## Frontend Dashboard

4 pages for vault managers (not depositors). Polls the API every 10-15 seconds.

| Page | URL | What it shows |
|---|---|---|
| **Dashboard** | `/` | 8 KPI cards (TVL, APY, drawdown, health rate, position count, allocations), allocation donut chart, TVL area chart |
| **Positions** | `/positions` | Filterable table (Open/Closed/All) with PnL coloring, entry z-scores, close reasons |
| **Performance** | `/performance` | APY trend line, TVL history, allocation stacked bar chart, PnL/trades/win-rate KPIs |
| **Signals** | `/signals` | Live spread cards with z-scores, funding rates table, z-score history chart, funding history chart |

**Tech:** Next.js 16 + React 19 + Tailwind CSS v4 + Recharts + shadcn/ui. Dark theme by default.

---

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 10
- A PostgreSQL database (Supabase free tier works)
- A Solana RPC endpoint (Helius free Dev Plan)
- A Solana wallet with ~0.02 SOL (for Drift account rent)

### Environment Variables

Copy and fill in:

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env.local
```

**`packages/backend/.env`**

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SOLANA_RPC_URL` | Yes | Helius or other Solana RPC |
| `SOLANA_PRIVATE_KEY` | Yes | Wallet keypair (base58 or JSON array) |
| `SOLANA_NETWORK` | Yes | `devnet` or `mainnet-beta` |
| `DRIFT_ENV` | Yes | `devnet` or `mainnet-beta` |
| `DRIFT_SUBACCOUNT` | No | Drift subaccount ID (default: `0`) |
| `PORT` | No | API server port (default: `8000`) |
| `LOG_LEVEL` | No | Comma-separated: `debug,info,warn,error` |

**`packages/frontend/.env.local`**

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | Backend URL (default: `http://localhost:8000/api/v1`) |

### Install & Run

```bash
pnpm install

# Start individual services
pnpm dev:api           # API server only (port 8000)
pnpm dev:collector     # Data collector only (writes to DB)
pnpm dev:bot           # Bot engine only (reads signals, executes trades)
pnpm dev:frontend      # Next.js dashboard (port 3000)

# Start all backend services together
pnpm dev

# Quality checks
pnpm lint              # Type-check + lint all packages
```

### Database Setup

Schema is managed via raw SQL migrations in `packages/backend/db-migrations/`. Drizzle ORM pulls the schema from the live database.

```bash
pnpm db:migrate        # Apply pending migrations
pnpm db:reset          # Drop and re-apply all migrations
pnpm build:common      # Regenerate TypeScript types from DB schema
```

> **Important:** Never edit `packages/common/src/database/` manually. It's auto-generated from the live DB schema.

### First Run Checklist

1. **Database** — ensure `DATABASE_URL` points to a PostgreSQL instance with migrations applied
2. **Start API** — `pnpm dev:api` → hit `http://localhost:8000/healthcheck`
3. **Start collector** — `pnpm dev:collector` → watch funding/spread data populate in DB
4. **Start frontend** — `pnpm dev:frontend` → open `http://localhost:3000`
5. **Fund wallet** — send ~0.02 SOL to the wallet address for Drift account creation
6. **Start bot** — `pnpm dev:bot` → bot will initialize Drift user account and begin tick loop
