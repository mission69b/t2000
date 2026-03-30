# @t2000/server

Backend server for agent management, gas sponsorship, USDC sponsorship, and protocol fee indexing.

**Live:** [api.t2000.ai](https://api.t2000.ai) (AWS ECS Fargate)

## What it does

- **Gas sponsorship** — bootstraps new agents with 0.05 SUI via `POST /api/sponsor`
- **USDC sponsorship** — funds new agents with $1 USDC via `POST /api/sponsor/usdc`
- **Protocol fee indexer** — watches on-chain events and indexes fees to NeonDB
- **Agent registry** — tracks agent addresses, names, and activity
- **Health endpoint** — `GET /api/health` for ECS health checks

## Stack

- **Hono** (lightweight HTTP framework)
- **Prisma** (NeonDB)
- **Sui SDK** (`@mysten/sui`) for on-chain operations
- **tsup** for builds, **tsx** for dev

## API Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/health` | GET | None | Health check |
| `/api/sponsor` | POST | Hashcash (rate-limited) | SUI gas bootstrap |
| `/api/sponsor/usdc` | POST | Hashcash (CLI) / x-internal-key (web) | USDC onboarding |
| `/api/stats` | GET | None | Aggregate stats |

## Development

```bash
pnpm --filter @t2000/server dev
```

Requires `SPONSOR_PRIVATE_KEY`, `GAS_STATION_PRIVATE_KEY`, and `DATABASE_URL` in `.env`.

## Tests

```bash
pnpm --filter @t2000/server test
```

## Deployment

Deployed to AWS ECS Fargate. Secrets managed via AWS Secrets Manager. See `infra/server-task-definition.json`.
