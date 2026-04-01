# Audric — @t2000/web-app

Conversational finance on Sui. The consumer product powered by `@t2000/engine`.

**Live:** [audric.ai](https://audric.ai)

## What it does

- **Google Sign-In** via zkLogin — wallet derived from Google account, no seed phrase
- **Conversational banking** — natural language interface powered by `@t2000/engine` (streaming, tool orchestration, MCP)
- **Dashboard** — balances, positions, transaction history, activity feed
- **USDC sponsorship** — auto-funds $1 USDC on first sign-in
- **DeFi** — NAVI savings and credit via MCP-first integration
- **Permission flow** — asynchronous user confirmation for sensitive actions with visual countdown

## Stack

- **Next.js 15** (App Router, Vercel deployment)
- **@t2000/engine** — QueryEngine, SSE streaming, financial tools, MCP client
- **Sui dApp Kit** + **Enoki** for zkLogin and gas sponsorship
- **TanStack Query** for data fetching and caching
- **Tailwind CSS v4** + semantic design tokens (Agentic UI)
- **Upstash Redis** for session persistence
- **Prisma** (NeonDB) for user preferences

## Development

```bash
cp .env.example .env.local   # Fill in required values
pnpm --filter @t2000/web-app dev
```

Runs on `http://localhost:3000`.

## Environment

See `.env.example` for the full list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUI_NETWORK` | Yes | `mainnet` or `testnet` |
| `NEXT_PUBLIC_ENOKI_API_KEY` | Yes | Enoki (zkLogin + gas) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Yes | Google OAuth |
| `DATABASE_URL` | Yes | NeonDB connection |
| `ANTHROPIC_API_KEY` | Yes | Powers the engine LLM |
| `KV_REST_API_URL` | Yes | Upstash Redis for sessions |
| `KV_REST_API_TOKEN` | Yes | Upstash Redis auth |

## Tests

```bash
pnpm --filter @t2000/web-app test
```
