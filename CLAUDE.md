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
├── backend/
│   ├── microservices/
│   │   ├── bot-engine/     # Core rebalancing bot (the brain)
│   │   ├── data-collector/ # Drift data ingestion + caching
│   │   └── api/            # REST API for dashboard
│   ├── services/
│   │   ├── drift/              # Drift SDK wrapper
│   │   ├── ranger-vault/       # Ranger vault SDK wrapper
│   │   ├── spread-detector/    # Spread opportunity detection (z-score)
│   │   ├── funding-monitor/    # Funding rate tracking + signals
│   │   ├── risk-manager/       # Drawdown, position limits, emergency exit
│   │   └── capital-allocator/  # Layer selection + sizing logic
│   └── db-migrations/     # PostgreSQL migrations (dev mode)
├── frontend/               # Next.js 15 monitoring dashboard
└── backtester/             # Python backtesting module
```

## Tech Stack

### Backend (TypeScript)
- `@drift-labs/sdk` — Drift protocol interaction
- `@voltr/vault-sdk` — Ranger vault management
- `@solana/web3.js` — Solana base
- `drizzle-orm` + `drizzle-kit` — PostgreSQL ORM
- `express` or `fastify` — API server
- `pino` — logging

### Frontend (TypeScript)
- Next.js 15 (App Router) + Tailwind CSS v4
- `recharts` or `lightweight-charts` — performance charts

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

- All thresholds and magic numbers live in `packages/common/constants/` — never inline
- Bot config comes from env vars, mapped through `config.types.ts`
- Services are pure modules with no global state — microservices own the lifecycle
- Drift SDK connection is initialized once per microservice, shared across services via dependency injection
- All on-chain transactions log to `bot_events` table before and after execution
- Risk manager has veto power over all position changes — allocator proposals pass through it

## Documentation

- `docs/objective.md` — hackathon details, strategy overview, architecture diagrams (Mermaid)
- `docs/implementation.md` — full implementation plan, folder structure, phases
- `docs/strategy.md` — deep strategy thesis + math (hackathon submission)
- `docs/risk-management.md` — risk framework (hackathon submission)
