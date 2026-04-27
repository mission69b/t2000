# @t2000/server

Backend server for agent management, gas sponsorship, USDC onboarding, protocol fee indexing, and Audric daily-intelligence cron orchestration.

**Live:** [api.t2000.ai](https://api.t2000.ai) (AWS ECS Fargate)

## What it does

- **Gas sponsorship** — bootstraps new agents with 0.05 SUI via `POST /api/sponsor`
- **USDC onboarding** — funds new web sign-ups with $0.25 USDC via `POST /api/sponsor/usdc` (internal key required)
- **Protocol fee indexer** — watches on-chain events and indexes fees to NeonDB
- **Agent registry** — tracks agent addresses, names, and activity
- **Daily-intel cron** — `src/cron/index.ts` orchestrates the Audric daily snapshot pipeline (memory extraction, profile inference, chain memory, portfolio snapshot, financial-context snapshot at 02:00 UTC). Each job is a thin wrapper that POSTs to an internal Audric API route with `x-internal-key` auth.
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
| `/api/sponsor/usdc` | POST | x-internal-key (required) | USDC onboarding (web only) |
| `/api/stats` | GET | None | Aggregate stats |

## Development

```bash
pnpm --filter @t2000/server dev
```

### Environment

| Variable | Required for | Notes |
|---|---|---|
| `SPONSOR_PRIVATE_KEY` | Gas sponsorship + USDC onboarding | Suiprivkey-encoded |
| `GAS_STATION_PRIVATE_KEY` | `/api/sponsor` | Funds new agents with 0.05 SUI |
| `DATABASE_URL` | All routes + cron | NeonDB Postgres URL (Prisma) |
| `T2000_INTERNAL_KEY` | Daily-intel cron | Shared secret with `audric/apps/web` `AUDRIC_INTERNAL_KEY`; sent as `x-internal-key` |
| `AUDRIC_INTERNAL_URL` | Daily-intel cron | Base URL of the Audric web app (e.g. `https://audric.ai`) |
| `CRON_SECRET` | Daily-intel cron | Vercel cron auth bearer for any sub-routes that need it |
| `CRON_GROUP` | Daily-intel cron | Selector — `daily-intel` runs the full hourly fan-out |
| `CRON_OVERRIDE_HOUR` | Local cron testing | UTC hour override; bypasses real-time hour gating |

## Tests

```bash
pnpm --filter @t2000/server test
```

## Deployment

Deployed to AWS ECS Fargate. Secrets managed via AWS Secrets Manager. See `infra/server-task-definition.json`.
