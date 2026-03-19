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
│   │   │   └── api/                # Unified entry point: API + JobsService
│   │   │       ├── index.ts        # DB init → server.listen → Drift init → warmup → jobs
│   │   │       ├── utils.ts        # apiHandler, isDriftAvailable, parsePagination, parseTimeRange
│   │   │       ├── vault/          # vault.routes.ts, vault.service.ts
│   │   │       ├── metrics/        # metrics.routes.ts, metrics.service.ts
│   │   │       └── bot/            # bot.routes.ts, bot.service.ts
│   │   │
│   │   ├── services/               # Static class services (no instance state)
│   │   │   ├── drift.service.ts    # Drift SDK wrapper — connection, markets, orders
│   │   │   ├── jobs.service.ts     # Tick loops: collector + bot (30s interval)
│   │   │   ├── database.service.ts # Drizzle ORM PostgreSQL connection
│   │   │   ├── logger.service.ts   # Scoped structured logging (dependency-free)
│   │   │   ├── spread-detector.service.ts   # Z-score computation from spread_snapshots
│   │   │   ├── funding-monitor.service.ts   # APR tracking from funding_rate_snapshots
│   │   │   ├── risk-manager.service.ts      # Drawdown, health, stop-loss, veto
│   │   │   ├── capital-allocator.service.ts # Signal → proposal conversion + lending rebalance
│   │   │   └── ranger-vault.service.ts      # Voltr vault SDK wrapper (deposit/withdraw/query)
│   │   │
│   │   ├── scripts/
│   │   │   ├── setup-vault.ts        # One-time vault creation + adaptor registration
│   │   │   ├── add-strategies.ts     # Initialize Drift + Lending strategy slots
│   │   │   └── generate-reset-sql.ts # Generates cumulative DB reset SQL
│   │   │
│   │   ├── utils/
│   │   │   ├── constants.ts        # BOT_CONFIG (+ DRY_RUN, REBALANCE_DRIFT_PCT), PERP_MARKETS, SPOT_MARKETS, SPREAD_PAIRS, VAULT_CONFIG, CORS
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
- Data collection logic (now in `JobsService.collectorTick()`) — polls Drift every 30s, writes funding rates + spread ratios
- Warmup phase with oracle data readiness check (up to 60s timeout)
- Historical data accumulating in DB (funding_rate_snapshots, spread_snapshots)

### Phase 3: Strategy Logic
- `SpreadDetectorService` — z-score computation from rolling spread ratio window (2880 data points = 24h)
- `FundingMonitorService` — APR calculation, flip detection, entry/exit signals
- `RiskManagerService` — drawdown tracking, health rate floor, stop-loss, position age limits, emergency exit
- `CapitalAllocatorService` — converts signals + risk assessment into concrete proposals

### Phase 4: Bot Engine
- Bot tick logic (now in `JobsService.botTick()`) — full tick pipeline (signals → risk → allocate → execute)
- Two-phase warmup: oracle readiness → account readiness (in unified entry point)
- `initializeUserIfNeeded()` for Drift account creation
- Proposal execution with position tracking and bot_events audit logging
- Vault snapshot recording per tick
- Graceful shutdown on SIGINT/SIGHUP

### Phase 6: Single Process Consolidation
- Merged 3 microservices (bot-engine, data-collector, API) into a single process
- `JobsService` — static class managing tick loops (collector tick → bot tick, 30s interval)
- Unified entry point: DB init → server.listen → Drift init → warmup → jobs
- API available immediately (healthcheck, DB-only endpoints) while Drift warms up
- Graceful degradation: if Drift fails, API still works, no jobs run

### Phase 5: API + Frontend
- Express API server with 7 endpoints under `/api/v1/`
- `isDriftAvailable()` guard with DB fallback pattern
- `apiHandler` wrapper with standardised error responses
- Next.js 16 dashboard with 4 pages (Dashboard, Positions, Performance, Signals)
- 6 Recharts chart components (TVL, allocation donut, APY, z-score, funding, allocation bar)
- Polling hooks with configurable intervals (10-30s)
- Postman collection with 15 requests

### Phase 7: Ranger Vault Integration
- `RangerVaultService` — full Voltr SDK wrapper (VoltrClient init, vault state queries, strategy deposit/withdraw)
- `setup-vault.ts` — one-time vault creation + adaptor registration (both Drift + Lending adaptors)
- `add-strategies.ts` — strategy PDA derivation + initialization via Lending adaptor
- Vault deployed on-chain: `6w7SPiB9agGh5ctB1LWMAR9ZpnguDxYm5zGgQS71B7sw`
- Lending strategy initialized: `GGf8eUHvTX3CLC3HubPpMxm8iqHKheR6ZEK1QAyozv5j`
- RangerVaultService integrated into API init/shutdown lifecycle
- Vault state API uses DB as baseline, overlays live on-chain data when funded

### Phase 8: Lending Rebalance + DRY_RUN
- `deposit_lending` / `withdraw_lending` proposal types added to CapitalAllocatorService
- Threshold-based rebalancing: only rebalance idle↔lending when allocation drifts >5% from target
- Idle capital swept to lending; lending withdrawn when trades need capital (capped at MIN_LENDING_ALLOCATION)
- Execution cases added to JobsService with vault availability guard
- `DRY_RUN: true` flag in BOT_CONFIG blocks all on-chain transactions — proposals logged but not sent
- Execution guard split: Drift ops gated by `canExecuteDrift`, vault ops gated by `canExecuteVault`
- SOL-burning prevention: unfunded Drift account skips all trade execution

---

## What's Not Built Yet

### Backtester (Nice-to-have)
- Python backtesting module not started
- Would validate strategy parameters on historical Drift data

### Submission Docs (Required)
- `docs/strategy.md` — deep strategy thesis + math
- `docs/risk-management.md` — risk framework

---

## Current State (2026-03-19)

### Working
- Full bot pipeline running in DRY_RUN mode (signals → risk → proposals → logged, no execution)
- API server — all 7 endpoints return data (DB baseline + live Drift overlay)
- Live Drift connection — funding rates, oracle prices, spread ratios flowing from mainnet
- DB — seed data (48h) + live data accumulating side by side
- Frontend — 4 pages render with seed + live data
- Vault deployed on-chain: `6w7SPiB9agGh5ctB1LWMAR9ZpnguDxYm5zGgQS71B7sw`
- Lending strategy: `GGf8eUHvTX3CLC3HubPpMxm8iqHKheR6ZEK1QAyozv5j`
- Lending rebalance proposals generated (deposit_lending/withdraw_lending) but blocked by DRY_RUN
- Spread detector producing z-scores from 870+ data points
- Funding monitor detecting ETH basis opportunity (~25% APR)

### Verified Endpoints
| Endpoint | Status | Notes |
|---|---|---|
| `GET /healthcheck` | OK | Returns uptime |
| `GET /vault/state` | OK | DB baseline + live overlay when funded |
| `GET /vault/positions` | OK | 9 positions from seed data |
| `GET /vault/history` | OK | 577 snapshots from seed data |
| `GET /metrics/funding` | OK | Live SOL/BTC/ETH rates + DB history |
| `GET /metrics/spreads` | OK | Live SOL/ETH, BTC/ETH ratios + DB history |
| `GET /bot/status` | OK | running: true |
| `GET /bot/events` | OK | Tick events + dry-run proposals |

---

## Remaining Work (Priority Order)

1. **Submission docs** — `strategy.md` + `risk-management.md`
2. **Demo video** — 3-minute pitch/demo for hackathon submission
3. **Go live** — set `DRY_RUN: false` + deposit USDC into Drift (requires user confirmation)
4. **Backtester** — if time permits

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
