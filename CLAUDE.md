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

Three independent backend processes + a frontend dashboard:

- **data-collector** (`pnpm dev:collector`) — polls Drift every 30s, writes funding rates + spread ratios to DB. No decision-making.
- **bot-engine** (`pnpm dev:bot`) — reads signals from DB + live Drift, evaluates risk, executes trades. The only process that touches on-chain funds.
- **api** (`pnpm dev:api`) — REST API on port 8000 for the dashboard. Reads from DB + optionally live Drift.
- **frontend** (`pnpm dev:frontend`) — Next.js 16 dashboard on port 3000. Polls API every 10-15s.

They can start/stop independently. If collector crashes, bot has stale data but still runs. If bot crashes, collector keeps recording. API is fully independent.

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
│   │   ├── bot-engine/     # Tick loop: signals → risk → allocate → execute
│   │   ├── data-collector/ # Tick loop: poll Drift → write to DB
│   │   └── api/            # REST API (Express) for dashboard
│   │       ├── utils.ts    # apiHandler, parsePagination, parseTimeRange, isDriftAvailable
│   │       ├── vault/      # /api/v1/vault — state, positions, history
│   │       ├── metrics/    # /api/v1/metrics — funding rates, spread z-scores
│   │       └── bot/        # /api/v1/bot — status, events
│   ├── services/           # Flat *.service.ts files (static classes, no instance state)
│   │   ├── drift.service.ts           # Drift SDK wrapper (connection, markets, orders)
│   │   ├── spread-detector.service.ts # Z-score computation, entry/exit signals
│   │   ├── funding-monitor.service.ts # Funding APR tracking, flip detection
│   │   ├── risk-manager.service.ts    # Drawdown, health rate, stop-loss, veto power
│   │   ├── capital-allocator.service.ts # Signal → proposal conversion
│   │   ├── ranger-vault.service.ts    # Ranger vault SDK wrapper (STUB — not yet implemented)
│   │   ├── database.service.ts        # Drizzle DB connection
│   │   └── logger.service.ts          # Scoped structured logging
│   ├── utils/
│   │   └── constants.ts    # BOT_CONFIG (all thresholds), market indexes, spread pairs
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
└── backtester/             # Python backtesting module (planned)
```

## Tech Stack

- **Backend:** TypeScript, `@drift-labs/sdk`, `@voltr/vault-sdk`, `@solana/web3.js`, `drizzle-orm`, `express`, `pino`
- **Frontend:** Next.js 16, React 19, Tailwind CSS v4, Recharts, shadcn/ui, next-themes
- **DB:** PostgreSQL (Supabase), Drizzle ORM. Schema auto-generated — never edit `packages/common/database/` manually.
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
| `funding_rate_snapshots` | data-collector | Funding rates per market per tick |
| `spread_snapshots` | data-collector + spread-detector | Pair ratios + z-scores |
| `positions` | bot-engine | Open/closed spread and basis positions |
| `vault_snapshots` | bot-engine | Periodic vault state for charts |
| `bot_events` | bot-engine + data-collector | Audit log of all decisions |

## Key Program IDs

- **Ranger Vault Program:** `vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8`
- **Drift Adaptor:** `EBN93eXs5fHGBABuajQqdsKRkCgaqtJa8vEFD6vKXiP`
- **Lending Adaptor:** `aVoLTRCRt3NnnchvLYH6rMYehJHwM5m45RmLBZq7PGz`

## Commands

```bash
pnpm dev                    # Start all backend services
pnpm dev:bot                # Start bot-engine only
pnpm dev:collector          # Start data-collector only
pnpm dev:api                # Start API server only (port 8000)
pnpm dev:frontend           # Start Next.js dashboard (port 3000)
pnpm lint                   # Type-check + lint all packages
pnpm build:common           # Regenerate DB schema from migrations
pnpm db:migrate             # Apply pending migrations
pnpm db:reset               # Reset DB + re-apply all migrations
```

## API Endpoints

All under `/api/v1/`, response format: `{ success: boolean, data: T }`.

| Endpoint | Data Source | Description |
|---|---|---|
| `GET /healthcheck` | Process | Server uptime |
| `GET /vault/state` | Drift + DB fallback | TVL, allocations, APY, health rate |
| `GET /vault/positions?status=&type=&limit=&offset=` | DB | Positions with filters |
| `GET /vault/history?from=&to=&limit=` | DB | Vault snapshots for charts |
| `GET /metrics/funding?live=&market_index=&from=&to=` | Drift + DB | Funding rates (live + history) |
| `GET /metrics/spreads?live=&pair=&from=&to=` | Drift + DB | Spread z-scores (live + history) |
| `GET /bot/status` | DB | Bot running state (inferred from tick events) |
| `GET /bot/events?event_type=&from=&to=&limit=` | DB | Bot audit log |

**Graceful degradation:** If Drift is unavailable, endpoints return DB fallback with `live: false`.

## Conventions

- All thresholds and magic numbers live in `BOT_CONFIG` (`packages/backend/utils/constants.ts`) — never inline
- Market-level constants (adaptor IDs, risk params) live in `packages/common/constants/`
- Services are static classes — microservices own the lifecycle
- Logging: `LoggerService.scoped("service-name")` for structured, scoped output
- Drift SDK connection initialized once per microservice, shared across services
- All on-chain transactions log to `bot_events` before and after execution
- Risk manager has veto power over all position changes

## Current State (as of 2026-03-19)

- **Working:** API server (all 7 endpoints), live Drift market data (funding + spreads), DB with historical data, frontend dashboard (4 pages)
- **Not yet implemented:** RangerVaultService (stub), setup scripts (setup-vault.ts, add-strategies.ts, seed-test-data.ts)
- **Blocker:** Wallet needs ~0.02 SOL to create Drift subaccount (bot-engine errors with "no user for user id")

## Documentation

- `README.md` — full technical overview with entity definitions and architecture
- `docs/objective.md` — hackathon details, strategy overview, architecture diagrams
- `docs/implementation.md` — implementation plan, phases, folder structure
- `docs/strategy.md` — deep strategy thesis + math (hackathon submission, not yet written)
- `docs/risk-management.md` — risk framework (hackathon submission, not yet written)
- `docs/trident-api.postman_collection.json` — Postman collection for all API endpoints
