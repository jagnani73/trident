# Trident — Hybrid Yield Vault for Ranger Build-A-Bear Hackathon

## What This Is

Trident is a multi-layer USDC vault on Solana built for the Ranger Build-A-Bear Hackathon. It combines three yield strategies via Drift Protocol, deployed through a Ranger vault:

1. **Base Layer (Lending):** USDC lent on Drift for steady ~5-8% APY floor
2. **Alpha Layer (Spread Trading):** Mean-reversion trades on correlated Drift perp pairs (SOL/ETH, BTC/ETH)
3. **Fallback Layer (Basis Trading):** Delta-neutral funding rate capture (long spot + short perp)

An off-chain bot monitors conditions and rebalances capital between layers.

## Hackathon

- **Deadline:** Apr 6, 2026 (23:59 UTC)
- **Tracks:** Main Track + Drift Side Track (both, since we use Drift)
- **Prizes:** Up to $500K vault seeding (Main) + $100K (Drift Side)
- **Constraints:** USDC base, 10%+ APY, no DEX LP/junior tranches/ponzi stables

## Monorepo Structure

```
packages/
├── common/                 # Shared types, constants, pure utils
│   └── src/
│       ├── database/       # Auto-generated Drizzle schema (never edit manually)
│       ├── types/          # Shared types (database, signals, shared)
│       ├── utils/          # Pure math/formatting/time helpers
│       ├── constants/      # Drift market IDs, adaptors, risk params
│       └── errors/         # Error types
├── backend/
│   ├── microservices/
│   │   ├── bot-engine/     # Core rebalancing bot (the brain)
│   │   ├── data-collector/ # Drift data ingestion + caching
│   │   └── api/            # REST API (Express) for dashboard
│   │       ├── utils.ts    # apiHandler, parsePagination, parseTimeRange, isDriftAvailable
│   │       ├── vault/      # /api/v1/vault — state, positions, history
│   │       ├── metrics/    # /api/v1/metrics — funding rates, spread z-scores
│   │       └── bot/        # /api/v1/bot — status (inferred from DB), events
│   ├── services/           # Flat *.service.ts files (static classes)
│   │   ├── drift.service.ts           # Drift SDK wrapper
│   │   ├── spread-detector.service.ts # Z-score spread signals
│   │   ├── funding-monitor.service.ts # Funding rate signals
│   │   ├── risk-manager.service.ts    # Drawdown, limits, emergency exit
│   │   ├── capital-allocator.service.ts # Layer selection + sizing
│   │   ├── ranger-vault.service.ts    # Ranger vault SDK wrapper
│   │   ├── database.service.ts        # Drizzle DB connection
│   │   └── logger.service.ts          # Pino-based structured logging
│   ├── utils/
│   │   └── constants.ts    # BOT_CONFIG, market indexes, spread pairs
│   └── db-migrations/      # PostgreSQL migrations (dev mode)
├── frontend/               # Next.js 16 monitoring dashboard
│   └── src/
│       ├── app/(dashboard)/ # Route group: layout with top bar + nav
│       │   ├── page.tsx           # Dashboard — KPIs, allocation donut, TVL chart
│       │   ├── positions/         # Position table with filters
│       │   ├── performance/       # APY trends, TVL, allocation bar chart
│       │   └── signals/           # Live spread/funding signals + history charts
│       ├── components/charts/     # Recharts wrappers (TVL, APY, Z-Score, Funding, Allocation)
│       ├── hooks/                 # useApi (polling), useVaultState, useMetrics, useBotStatus
│       └── lib/                   # api.ts (fetch client), types.ts, format.ts
└── backtester/             # Python backtesting module
```

## Tech Stack

### Backend (TypeScript)

- `@drift-labs/sdk` — Drift protocol interaction
- `@voltr/vault-sdk` — Ranger vault management
- `@solana/web3.js` — Solana base
- `drizzle-orm` + `drizzle-kit` — PostgreSQL ORM
- `express` — API server
- `pino` — structured logging (via `LoggerService`)

### Frontend (TypeScript)

- Next.js 16 (App Router) + React 19 + Tailwind CSS v4
- `recharts` — performance charts
- `next-themes` — dark/light mode toggle
- shadcn/ui (new-york style) — Card, Badge, Table, Button, Tooltip

### Backtester (Python)

- `pandas`, `numpy`, `matplotlib`/`plotly`

### Infrastructure

- PostgreSQL 16 (Docker Compose, dev mode)
- Helius RPC (free Dev Plan — hackathon perk)
- Solana devnet (testing) → mainnet (live trading window)

## Database

ORM schema is auto-generated. **Never edit `packages/common/database/` manually.**

**Workflow for schema changes:**

1. Write migration SQL in `packages/backend/db-migrations/`
2. Apply migration to DB
3. Run `pnpm build:common` — drizzle-kit pull regenerates schema

### Tables

- `funding_rate_snapshots` — cached Drift funding rates
- `spread_snapshots` — computed pair spread ratios + z-scores
- `positions` — active/historical spread and basis positions
- `vault_snapshots` — periodic vault state for charting
- `bot_events` — audit log of bot decisions

## Key Program IDs

- **Ranger Vault Program:** `vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8`
- **Drift Adaptor:** `EBN93eXs5fHGBABuajQqdsKRkCgaqtJa8vEFD6vKXiP`
- **Lending Adaptor:** `aVoLTRCRt3NnnchvLYH6rMYehJHwM5m45RmLBZq7PGz`

## Commands

```bash
pnpm dev                    # Start all services in dev mode
pnpm dev:bot                # Start bot-engine only
pnpm dev:collector          # Start data-collector only
pnpm dev:api                # Start API server only
pnpm dev:frontend           # Start Next.js dashboard
pnpm lint                   # Type-check + lint all packages
pnpm build:common           # Regenerate DB schema from migrations
pnpm db:migrate             # Apply pending migrations
pnpm db:reset               # Reset DB + re-apply all migrations
```

## Conventions

- All thresholds and magic numbers live in `BOT_CONFIG` (`packages/backend/utils/constants.ts`) — never inline
- Market-level constants (adaptor IDs, risk params) live in `packages/common/constants/`
- Services are static classes with no instance state — microservices own the lifecycle
- Service logging uses `LoggerService.scoped("service-name")` for structured, scoped output
- Drift SDK connection is initialized once per microservice, shared across services
- All on-chain transactions log to `bot_events` table before and after execution
- Risk manager has veto power over all position changes — allocator proposals pass through it

## API Endpoints

All under `/api/v1/`, response format: `{ success: boolean, data: T }`.

| Endpoint | Description |
|---|---|
| `GET /healthcheck` | Server uptime |
| `GET /vault/state` | Live vault state (Drift + DB fallback) |
| `GET /vault/positions?status=&type=&limit=&offset=` | Positions with filters |
| `GET /vault/history?from=&to=&limit=` | Vault snapshots for charts |
| `GET /metrics/funding?live=&market_index=&from=&to=` | Funding rates (live + history) |
| `GET /metrics/spreads?live=&pair=&from=&to=` | Spread z-scores (live + history) |
| `GET /bot/status` | Bot running state (inferred from tick events) |
| `GET /bot/events?event_type=&from=&to=&limit=` | Bot audit log |

## Documentation

- `docs/objective.md` — hackathon details, strategy overview, architecture diagrams (Mermaid)
- `docs/implementation.md` — full implementation plan, folder structure, phases
- `docs/strategy.md` — deep strategy thesis + math (hackathon submission)
- `docs/risk-management.md` — risk framework (hackathon submission)
- `docs/trident-api.postman_collection.json` — Postman collection for all API endpoints
