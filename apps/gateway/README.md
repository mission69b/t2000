# @t2000/gateway

MPP gateway — 40 services, 88 endpoints, payable with Sui USDC.

**Live:** [mpp.t2000.ai](https://mpp.t2000.ai)

## What it does

Proxies requests to upstream APIs (OpenAI, Anthropic, Brave, Firecrawl, etc.) behind MPP payment challenges. Agents pay per-request with USDC on Sui — no API keys, no accounts.

## Stack

- **Next.js 16** (App Router, Vercel deployment)
- **mppx** + `@suimpp/mpp` for payment verification
- **Prisma** for payment logging (NeonDB)
- **Tailwind** for the service catalog and explorer UI

## Pages

| Route | What |
|-------|------|
| `/` | Gateway homepage with live feed |
| `/services` | Service catalog (40 services) |
| `/explorer` | Payment explorer |
| `/docs` | Developer guide |
| `/spec` | Protocol spec |
| `/llms.txt` | Agent-readable catalog |
| `/openapi.json` | OpenAPI 3.1 discovery document |
| `/api/services` | Service catalog JSON |
| `/api/mpp/payments` | Payment feed API |
| `/api/mpp/stats` | Aggregate stats |

## Development

```bash
pnpm --filter @t2000/gateway dev
```

Runs on `http://localhost:4402`.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `TREASURY_ADDRESS` | Yes | Sui address receiving payments |
| `NEXT_PUBLIC_SUI_NETWORK` | Yes | `mainnet` or `testnet` |
| `NEXT_PUBLIC_GATEWAY_URL` | No | Override base URL (defaults to `https://mpp.t2000.ai`) |
| `OPENAI_API_KEY` | Yes | OpenAI upstream key |
| Various `*_API_KEY` | Yes | Per-service upstream keys |

## Tests

```bash
pnpm --filter @t2000/gateway test
```
