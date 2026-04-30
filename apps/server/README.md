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
| `/` | GET | None | Service identity (`{ service, version }`) |
| `/api/health` | GET | None | Health check (used by ECS) |

> The public `/api/stats` endpoint lives in `apps/web` (the t2000.ai marketing site), not here. It reads `ProtocolFeeLedger` directly from NeonDB via Prisma.
>
> Pre-B5 v2 also exposed `POST /api/fees` for off-chain fee submission — removed in `@t2000/sdk@1.1.0` (2026-04-30). Fees are now indexed directly from on-chain USDC transfers to `T2000_OVERLAY_FEE_WALLET` (the indexer is the only writer to `ProtocolFeeLedger`).

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
