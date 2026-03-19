# Trident — Hybrid Yield Vault for Ranger Build-A-Bear Hackathon

## What This Is

Trident is a multi-layer USDC vault on Solana for the Ranger Build-A-Bear Hackathon. It combines three yield strategies via Drift Protocol, deployed through a Ranger vault:

1. **Lending** — USDC lent on Drift (~6% APY floor)
2. **Spread Trading** — Mean-reversion pairs trades on correlated Drift perps (SOL/ETH, BTC/ETH)
3. **Basis Trading** — Delta-neutral funding rate capture (long spot + short perp)

An off-chain bot monitors conditions every 30 seconds and rebalances capital between layers.

## Hackathon

- **Deadline:** Apr 6, 2026 (23:59 UTC)
- **Tracks:** Main Track + Drift Side Track
- **Constraints:** USDC base, 10%+ APY, no DEX LP/junior tranches/ponzi stables

## Architecture

Single backend process + a frontend dashboard:

- **backend** (`pnpm dev`) — Express API on port 8000 + `JobsService` tick loops. Initializes DB → starts HTTP server → connects to Drift → runs warmup → starts jobs. If Drift fails, API still serves DB-only responses.
- **frontend** (`pnpm dev:frontend`) — Next.js 16 dashboard on port 3000. Polls API every 10-15s.

`JobsService` runs a 30s tick loop: collector tick (funding rates + spread prices → DB) then bot tick (signals → risk → allocate → execute → lending rebalance). Tick overlap is guarded — if a tick takes >30s, the next one is skipped. A `DRY_RUN` flag in `BOT_CONFIG` blocks all on-chain transactions — proposals are logged but not executed.

## Monorepo Structure

```
packages/
├── common/                 # Shared types, constants, pure utils
│   └── src/
│       ├── database/       # Auto-generated Drizzle schema (NEVER edit manually)
│       ├── types/          # Shared types (database, signals, shared)
│       ├── utils/          # Pure math (mean, stddev, zScore)
│       ├── constants/      # Drift market IDs, adaptors, risk params
│       └── errors/         # AppError class with scopes
├── backend/
│   ├── microservices/
│   │   └── api/            # Unified entry point: Express API + JobsService
│   │       ├── index.ts    # DB init → vault init → server.listen → Drift init → warmup → jobs
│   │       ├── utils.ts    # apiHandler, parsePagination, parseTimeRange, isDriftAvailable
│   │       ├── vault/      # /api/v1/vault — state, positions, history
│   │       ├── metrics/    # /api/v1/metrics — funding rates, spread z-scores
│   │       └── bot/        # /api/v1/bot — status, events
│   ├── services/           # Flat *.service.ts files (static classes, no instance state)
│   │   ├── drift.service.ts           # Drift SDK wrapper (connection, markets, orders)
│   │   ├── jobs.service.ts            # Tick loops: collector + bot (30s interval)
│   │   ├── spread-detector.service.ts # Z-score computation, entry/exit signals
│   │   ├── funding-monitor.service.ts # Funding APR tracking, flip detection
│   │   ├── risk-manager.service.ts    # Drawdown, health rate, stop-loss, veto power
│   │   ├── capital-allocator.service.ts # Signal → proposal conversion + lending rebalance
│   │   ├── ranger-vault.service.ts    # Voltr vault SDK wrapper (deposit/withdraw/query strategies)
│   │   ├── database.service.ts        # Drizzle DB connection
│   │   └── logger.service.ts          # Scoped structured logging
│   ├── utils/
│   │   └── constants.ts    # BOT_CONFIG (all thresholds + DRY_RUN), market indexes, spread pairs, VAULT_CONFIG
│   ├── scripts/            # One-time setup scripts
│   │   ├── setup-vault.ts           # Create vault + add adaptors on-chain
│   │   └── add-strategies.ts        # Initialize Drift + Lending strategy slots
│   └── db-migrations/      # Raw SQL migrations
├── frontend/               # Next.js 16 monitoring dashboard
│   └── src/
│       ├── app/(dashboard)/ # Route group: layout with top bar + nav tabs
│       │   ├── page.tsx           # Dashboard — KPIs, allocation donut, TVL chart
│       │   ├── positions/         # Position table with filters
│       │   ├── performance/       # APY trends, TVL, allocation bar chart
│       │   └── signals/           # Live spread/funding signals + history charts
│       ├── components/charts/     # Recharts wrappers
│       ├── hooks/                 # useApi (polling), useVaultState, useMetrics, useBotStatus
│       └── lib/                   # api.ts (fetch client), types.ts, format.ts
└── backtester/             # Python backtesting module
    ├── src/
    │   ├── config.py              # BOT_CONFIG mirror
    │   ├── data/generator.py      # Synthetic 90-day price + funding data
    │   ├── engine/simulator.py    # Core backtest loop (mirrors JobsService)
    │   ├── strategies/            # spread.py, funding.py, allocator.py
    │   └── analysis/report.py     # Performance metrics + chart generation
    ├── output/                    # Generated charts (backtest_results.png, trade_analysis.png)
    └── run.py                     # CLI entry point
```

## Tech Stack

- **Backend:** TypeScript, `@drift-labs/sdk`, `@voltr/vault-sdk`, `@solana/web3.js`, `drizzle-orm`, `express`, `pino`
- **Frontend:** Next.js 16, React 19, Tailwind CSS v4, Recharts, shadcn/ui, next-themes
- **DB:** PostgreSQL (Supabase), Drizzle ORM. Schema auto-generated — never edit `packages/common/database/` manually.
- **Backtester:** Python 3.11+, pandas, numpy, matplotlib, plotly
- **Infra:** Helius RPC, Solana mainnet-beta

## Database

Schema is auto-generated from live DB. **Never edit `packages/common/database/` manually.**

**Workflow for schema changes:**
1. Write migration SQL in `packages/backend/db-migrations/`
2. Apply: `pnpm db:migrate`
3. Regenerate types: `pnpm build:common`

### Tables

| Table | Written by | Purpose |
|---|---|---|
| `funding_rate_snapshots` | JobsService (collector tick) | Funding rates per market per tick |
| `spread_snapshots` | JobsService (collector tick) + spread-detector | Pair ratios + z-scores |
| `positions` | JobsService (bot tick) | Open/closed spread and basis positions |
| `vault_snapshots` | JobsService (bot tick) | Periodic vault state for charts |
| `bot_events` | JobsService (both ticks) | Audit log of all decisions |

## Key Program IDs

- **Ranger Vault Program:** `vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8`
- **Drift Adaptor:** `EBN93eXs5fHGBABuajQqdsKRkCgaqtJa8vEFD6vKXiP`
- **Lending Adaptor:** `aVoLTRCRt3NnnchvLYH6rMYehJHwM5m45RmLBZq7PGz`

## Commands

```bash
pnpm dev                    # Start backend (API + jobs) on port 8000
pnpm dev:frontend           # Start Next.js dashboard (port 3000)
pnpm lint                   # Type-check + lint all packages
pnpm build:common           # Regenerate DB schema from migrations
pnpm db:migrate             # Apply pending migrations
pnpm db:reset               # Reset DB + re-apply all migrations

# Vault setup (one-time, requires funded wallet)
npx tsx packages/backend/scripts/setup-vault.ts       # Create vault + add adaptors
npx tsx packages/backend/scripts/add-strategies.ts    # Init Drift + Lending strategies

# Backtester
py packages/backtester/run.py                         # Run 90-day backtest (default seed=42)
py packages/backtester/run.py --seed 123 --days 180   # Custom seed + duration
py packages/backtester/run.py --no-charts             # Skip chart generation
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SOLANA_RPC_URL` | Yes | Helius RPC endpoint |
| `SOLANA_PRIVATE_KEY` | Yes | Wallet private key (bs58 or JSON array) |
| `DRIFT_ENV` | No | `mainnet-beta` or `devnet` (default: `devnet`) |
| `DRIFT_SUBACCOUNT` | No | Drift subaccount ID (default: `0`) |
| `RANGER_VAULT_ADDRESS` | No | Vault pubkey (set after running setup-vault.ts) |
| `DRIFT_STRATEGY_ADDRESS` | No | Drift strategy pubkey (set after add-strategies.ts) |
| `LENDING_STRATEGY_ADDRESS` | No | Lending strategy pubkey (set after add-strategies.ts) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |

## API Endpoints

All under `/api/v1/`, response format: `{ success: boolean, data: T }`.

| Endpoint | Data Source | Description |
|---|---|---|
| `GET /healthcheck` | Process | Server uptime |
| `GET /vault/state` | Vault → Drift → DB fallback | TVL, allocations, APY, health rate |
| `GET /vault/positions?status=&type=&limit=&offset=` | DB | Positions with filters |
| `GET /vault/history?from=&to=&limit=` | DB | Vault snapshots for charts |
| `GET /metrics/funding?live=&market_index=&from=&to=` | Drift + DB | Funding rates (live + history) |
| `GET /metrics/spreads?live=&pair=&from=&to=` | Drift + DB | Spread z-scores (live + history) |
| `GET /bot/status` | DB | Bot running state (inferred from tick events) |
| `GET /bot/events?event_type=&from=&to=&limit=` | DB | Bot audit log |

**Graceful degradation:** If Drift is unavailable, endpoints return DB fallback with `live: false`.

## Conventions

- All thresholds and magic numbers live in `BOT_CONFIG` (`packages/backend/utils/constants.ts`) — never inline
- `DRY_RUN: true` in BOT_CONFIG blocks all on-chain execution — flip to `false` to go live
- Market-level constants (adaptor IDs, risk params) live in `packages/common/constants/`
- Services are static classes — single process owns the lifecycle
- Logging: `LoggerService.scoped("service-name")` for structured, scoped output
- Drift SDK connection initialized once, shared across all services
- All on-chain transactions log to `bot_events` before and after execution
- Risk manager has veto power over all position changes
- Lending rebalance is threshold-based (>5% drift) to minimize tx fees

## Current State (as of 2026-03-19)

- **Working:** API server (all 7 endpoints), live Drift market data (funding + spreads), DB with seed + live data, frontend dashboard (4 pages), RangerVaultService (deposit/withdraw/query via Voltr SDK), setup scripts, vault deployed on-chain, lending strategy initialized, full bot pipeline running in DRY_RUN mode (signals → risk → proposals → logged, no execution)
- **Deployed on-chain:** Vault `6w7SPiB9agGh5ctB1LWMAR9ZpnguDxYm5zGgQS71B7sw`, Lending strategy `GGf8eUHvTX3CLC3HubPpMxm8iqHKheR6ZEK1QAyozv5j`
- **To go live:** Set `DRY_RUN: false` in BOT_CONFIG + deposit USDC into Drift subaccount

## Documentation

- `README.md` — full technical overview with entity definitions and architecture
- `docs/objective.md` — hackathon details, strategy overview, architecture diagrams
- `docs/implementation.md` — implementation plan, phases, folder structure
- `docs/strategy.md` — deep strategy thesis + math (hackathon submission, not yet written)
- `docs/risk-management.md` — risk framework (hackathon submission, not yet written)
- `docs/trident-api.postman_collection.json` — Postman collection for all API endpoints
