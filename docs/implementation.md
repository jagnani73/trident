# Implementation Plan

## Context

We're building a hybrid yield vault for the Ranger Build-A-Bear Hackathon (deadline: Apr 6, 2026). The vault combines Drift lending, perp spread trading, and basis trading into a single adaptive USDC vault on Solana. Submitting to both Main Track and Drift Side Track.

This doc covers **what** we built, **how** the pieces fit together, and **what's left**.

---

## Monorepo Structure (Actual)

```
ranger/
├── docs/
│   ├── objective.md                # Hackathon details + strategy overview
│   ├── implementation.md           # This file
│   ├── strategy.md                 # Deep strategy thesis + math (TODO)
│   ├── risk-management.md          # Risk framework (TODO)
│   └── trident-api.postman_collection.json  # Postman collection (15 requests)
│
├── packages/
│   ├── common/                     # Shared across all packages
│   │   └── src/
│   │       ├── database/           # Auto-generated Drizzle schema (never edit)
│   │       ├── types/              # shared.types.ts, database.types.ts
│   │       ├── constants/          # drift-markets.ts, adaptors.ts, risk-params.ts
│   │       ├── utils/              # math.ts (mean, stdDev, zScore)
│   │       └── errors/             # AppError with scopes (HTTP, DATABASE, etc.)
│   │
│   ├── backend/
│   │   ├── microservices/
│   │   │   ├── bot-engine/         # Core rebalancing bot
│   │   │   │   └── index.ts        # Tick loop: warmup → signals → risk → allocate → execute
│   │   │   ├── data-collector/     # Drift data ingestion
│   │   │   │   └── index.ts        # Tick loop: warmup → poll funding/spreads → write to DB
│   │   │   └── api/                # REST API for dashboard
│   │   │       ├── index.ts        # Express server, DB + Drift init, routes
│   │   │       ├── utils.ts        # apiHandler, isDriftAvailable, parsePagination, parseTimeRange
│   │   │       ├── vault/          # vault.routes.ts, vault.service.ts
│   │   │       ├── metrics/        # metrics.routes.ts, metrics.service.ts
│   │   │       └── bot/            # bot.routes.ts, bot.service.ts
│   │   │
│   │   ├── services/               # Static class services (no instance state)
│   │   │   ├── drift.service.ts    # Drift SDK wrapper — connection, markets, orders
│   │   │   ├── database.service.ts # Drizzle ORM PostgreSQL connection
│   │   │   ├── logger.service.ts   # Scoped structured logging (dependency-free)
│   │   │   ├── spread-detector.service.ts   # Z-score computation from spread_snapshots
│   │   │   ├── funding-monitor.service.ts   # APR tracking from funding_rate_snapshots
│   │   │   ├── risk-manager.service.ts      # Drawdown, health, stop-loss, veto
│   │   │   ├── capital-allocator.service.ts # Signal → proposal conversion
│   │   │   └── ranger-vault.service.ts      # Ranger vault SDK wrapper (STUB)
│   │   │
│   │   ├── scripts/
│   │   │   └── generate-reset-sql.ts  # Generates cumulative DB reset SQL
│   │   │
│   │   ├── utils/
│   │   │   ├── constants.ts        # BOT_CONFIG, PERP_MARKETS, SPOT_MARKETS, SPREAD_PAIRS, CORS
│   │   │   └── patch-native-bindings.cjs  # Patches native bindings for Windows
│   │   │
│   │   └── db-migrations/
│   │       ├── 001_initial-schema.up.sql
│   │       └── 001_initial-schema.down.sql
│   │
│   ├── frontend/                   # Next.js 16 monitoring dashboard
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx            # Root layout (Geist fonts, ThemeProvider)
│   │       │   └── (dashboard)/
│   │       │       ├── layout.tsx        # Top bar: brand, nav tabs, theme toggle, bot status dot
│   │       │       ├── page.tsx          # Dashboard — 8 KPIs + donut + TVL chart
│   │       │       ├── dashboard-content.tsx
│   │       │       ├── positions/page.tsx    # Position table with Open/Closed/All filters
│   │       │       ├── performance/page.tsx  # APY trend, TVL history, allocation bar
│   │       │       └── signals/page.tsx      # Spread cards, funding table, history charts
│   │       ├── components/
│   │       │   ├── charts/               # TVL, APY, Z-Score, Funding, Allocation (Recharts)
│   │       │   ├── ui/                   # shadcn/ui components
│   │       │   ├── kpi-card.tsx
│   │       │   ├── pnl-text.tsx
│   │       │   ├── empty-state.tsx
│   │       │   └── loading-skeleton.tsx
│   │       ├── hooks/
│   │       │   ├── use-api.ts            # Generic polling hook (configurable interval)
│   │       │   ├── use-vault.ts          # useVaultState (10s), usePositions (15s), useVaultHistory (30s)
│   │       │   ├── use-metrics.ts        # useFundingRates (15s), useSpreadMetrics (15s)
│   │       │   └── use-bot.ts            # useBotStatus (10s), useBotEvents (15s)
│   │       └── lib/
│   │           ├── api.ts                # fetchApi() — base URL + error handling
│   │           ├── types.ts              # Full API response types (no Drizzle dependency)
│   │           ├── format.ts             # USD, PCT, APY, z-score, duration formatters
│   │           └── utils.ts              # cn() helper
│   │
│   └── backtester/                 # Python backtesting module (planned, not started)
│
├── README.md                       # Full technical overview
├── CLAUDE.md                       # AI assistant context
├── package.json                    # Root workspace scripts
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## What's Built (Phases 1-5 Complete)

### Phase 1: Foundation
- Monorepo with pnpm workspaces
- `@trident/common` with sub-path exports (types, constants, utils, errors, database)
- PostgreSQL schema with 5 tables via raw SQL migrations
- Drizzle ORM integration with auto-generated schema pull
- `DriftService` — full Drift SDK wrapper (connection, markets, positions, orders)
- `DatabaseService` — Drizzle connection management
- `LoggerService` — scoped structured logging

### Phase 2: Data Pipeline
- `data-collector` microservice — polls Drift every 30s, writes funding rates + spread ratios
- Warmup phase with oracle data readiness check (up to 60s timeout)
- Historical data accumulating in DB (funding_rate_snapshots, spread_snapshots)

### Phase 3: Strategy Logic
- `SpreadDetectorService` — z-score computation from rolling spread ratio window (2880 data points = 24h)
- `FundingMonitorService` — APR calculation, flip detection, entry/exit signals
- `RiskManagerService` — drawdown tracking, health rate floor, stop-loss, position age limits, emergency exit
- `CapitalAllocatorService` — converts signals + risk assessment into concrete proposals

### Phase 4: Bot Engine
- `bot-engine` microservice — full tick pipeline (signals → risk → allocate → execute)
- Two-phase warmup: oracle readiness → account readiness
- `initializeUserIfNeeded()` for Drift account creation
- Proposal execution with position tracking and bot_events audit logging
- Vault snapshot recording per tick
- Graceful shutdown on SIGINT/SIGHUP

### Phase 5: API + Frontend
- Express API server with 7 endpoints under `/api/v1/`
- `isDriftAvailable()` guard with DB fallback pattern
- `apiHandler` wrapper with standardised error responses
- Next.js 16 dashboard with 4 pages (Dashboard, Positions, Performance, Signals)
- 6 Recharts chart components (TVL, allocation donut, APY, z-score, funding, allocation bar)
- Polling hooks with configurable intervals (10-30s)
- Postman collection with 15 requests

---

## What's Not Built Yet

### RangerVaultService (Critical)
- `ranger-vault.service.ts` is a stub
- Needs to wrap `@voltr/vault-sdk` for:
  - `initializeVault(config)` — one-time vault creation
  - `addAdaptor(adaptorId)` — register Drift/Lending adaptors
  - `initializeStrategy(adaptor, market)` — activate strategy slots
  - `depositToStrategy(strategy, amount)` — move vault USDC into a strategy
  - `withdrawFromStrategy(strategy, amount)` — pull USDC back
  - `getVaultState()` — TVL, LP price, allocations
- **Blocked on:** funded wallet (~0.02 SOL) + vault deployment

### Setup Scripts (Critical)
- `setup-vault.ts` — creates Ranger vault on-chain (placeholder)
- `add-strategies.ts` — registers adaptors with vault (placeholder)
- `seed-test-data.ts` — populates DB for testing (placeholder)

### Backtester (Nice-to-have)
- Python backtesting module not started
- Would validate strategy parameters on historical Drift data

### Submission Docs (Required)
- `docs/strategy.md` — deep strategy thesis + math
- `docs/risk-management.md` — risk framework

---

## Current State (2026-03-19)

### Working
- API server — all 7 endpoints return data
- Live Drift connection — funding rates, oracle prices, spread ratios flowing from mainnet
- DB — historical funding and spread data accumulating
- Frontend — 4 pages render with loading/empty states
- Bot engine — tick loop runs but errors on position-level operations (no Drift user account)

### Verified Endpoints
| Endpoint | Status | Notes |
|---|---|---|
| `GET /healthcheck` | OK | Returns uptime |
| `GET /vault/state` | OK (live: true) | Returns zeros — no Drift user account |
| `GET /vault/positions` | OK | Empty — no positions yet |
| `GET /vault/history` | OK | Empty — no snapshots yet |
| `GET /metrics/funding` | OK | Live SOL/BTC/ETH rates + DB history |
| `GET /metrics/spreads` | OK | Live SOL/ETH, BTC/ETH ratios + DB history |
| `GET /bot/status` | OK | running: false, last error: "no user" |
| `GET /bot/events` | OK | 33 events from previous runs |

### Known Issues
- Bot-engine errors: `DriftClient has no user for user id 0_<wallet>` — wallet needs ~0.02 SOL
- Z-scores all return 0 — spread detector needs MIN_ZSCORE_DATA_POINTS (30) with sufficient time span
- Public Solana RPC (`api.mainnet-beta.solana.com`) works but is rate-limited — should switch to Helius

---

## Remaining Work (Priority Order)

1. **Fund wallet** — send ~0.02 SOL to `3a3UWFaUDJuehbEdvkmzNUXZehCmhMWuPrK1YzAdgAyC`
2. **RangerVaultService** — implement `@voltr/vault-sdk` wrapper
3. **Setup scripts** — vault creation + adaptor registration
4. **End-to-end test** — run all 3 backend services + frontend together
5. **Z-score computation** — verify spread detector works with accumulated data
6. **Submission docs** — `strategy.md` + `risk-management.md`
7. **Demo video** — 3-minute pitch/demo for hackathon submission
8. **Backtester** — if time permits

---

## Key Dependencies

### TypeScript (Backend + Common)
- `@drift-labs/sdk` — Drift protocol interaction
- `@voltr/vault-sdk` — Ranger vault management
- `@solana/web3.js` — Solana base
- `drizzle-orm` + `drizzle-kit` — PostgreSQL ORM
- `express` — API server
- `dotenv` — env config
- `tsx` — dev runner with watch mode
- `cross-env` — cross-platform env vars

### TypeScript (Frontend)
- `next` 16 — App Router framework
- `react` 19 — with React Compiler
- `tailwindcss` v4 — styling
- `recharts` — performance charts
- `next-themes` — dark/light mode
- `radix-ui` + shadcn/ui — component library

### Python (Backtester — planned)
- `pandas`, `numpy`, `matplotlib`/`plotly`
