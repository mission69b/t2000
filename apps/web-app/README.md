# @t2000/web-app

Consumer web app — AI-powered banking for Sui agents with zkLogin.

**Live:** [app.t2000.ai](https://app.t2000.ai)

## What it does

- **Google Sign-In** via zkLogin — wallet derived from Google account, no seed phrase
- **Conversational banking** — natural language interface for send, save, borrow, pay
- **Dashboard** — balances, positions, transaction history, activity feed
- **USDC sponsorship** — auto-funds $1 USDC on first sign-in
- **DeFi** — NAVI savings and credit via MCP-first integration
- **MPP payments** — pay for API services directly from the web app

## Stack

- **Next.js 16** (App Router, Vercel deployment)
- **Sui dApp Kit** + **Enoki** for zkLogin and gas sponsorship
- **TanStack Query** for data fetching and caching
- **Tailwind** + **shadcn/ui** for UI
- **Prisma** (NeonDB) for user preferences

## Development

```bash
pnpm --filter @t2000/web-app dev
```

Runs on `http://localhost:3000`.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUI_NETWORK` | Yes | `mainnet` or `testnet` |
| `NEXT_PUBLIC_ENOKI_API_KEY` | Yes | Enoki (zkLogin + gas) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Yes | Google OAuth |
| `DATABASE_URL` | Yes | NeonDB connection |
| `SPONSOR_INTERNAL_KEY` | Yes | Shared secret for USDC sponsor proxy |
| `SERVER_URL` | No | ECS server URL (defaults to `https://api.t2000.ai`) |

## Tests

```bash
pnpm --filter @t2000/web-app test
```
