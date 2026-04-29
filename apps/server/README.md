# @t2000/server

Backend server for protocol fee indexing, agent registry, and Audric daily-intelligence cron orchestration.

**Live:** [api.t2000.ai](https://api.t2000.ai) (AWS ECS Fargate)

## What it does

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
| `/api/fees` | POST | None | Protocol fee report (called by SDK) |
| `/api/stats` | GET | None | Aggregate stats |

## Development

```bash
pnpm --filter @t2000/server dev
```

### Environment

| Variable | Required for | Notes |
|---|---|---|
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
