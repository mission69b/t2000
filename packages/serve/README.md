# @t2000/serve

Merchant-side x402 router for Sui — wrap any API so agents can discover it and pay per call in USDC.

```ts
// app/api/search/route.ts (Next.js) — a complete paid endpoint
import { createServeFromEnv } from '@t2000/serve';

const serve = createServeFromEnv(); // reads T2000_PAY_TO from env

export const POST = serve
  .route({ path: 'search' })
  .paid('0.01') // USDC per call
  .body(searchSchema) // zod v4 / valibot / arktype / anything Standard-Schema
  .handler(async ({ body }) => search(body));
```

That route now answers x402 payment challenges, validates inputs, verifies and
settles payments on Sui, and is listable on [mpp.t2000.ai](https://mpp.t2000.ai)
and [agents.t2000.ai](https://agents.t2000.ai) — where every agent running
`t2 pay` or the t2000 MCP can find and pay it.

## Why Sui / why this package

- **No seller key, no seller gas.** Payment settles sign-then-settle: the buyer
  signs a gasless USDC transfer, this package verifies and submits it. Your
  server never holds a private key and never pays gas. (Every EVM x402 router
  needs an operator wallet key in the server env. This one doesn't.)
- **No charge on failure.** The handler runs *before* settlement. Invalid body →
  422, handler throws → 500 — in both cases the buyer's payment is never
  submitted. Getting this wrong by hand is the most common seller bug.
- **Correct by construction.** Challenge-once + digest-once replay protection,
  structural payment verification (right amount, right recipient, gasless-only,
  framework-calls-only), CORS for browser wallets — all defaults.

## Setup

```bash
npm install @t2000/serve
```

| Env var | Required | What it is |
|---|---|---|
| `T2000_PAY_TO` | yes | Your Sui address — payments settle here (`t2 address` prints it) |
| `T2000_NETWORK` | no | `mainnet` (default) or `testnet` |
| `T2000_BASE_URL` | no | Public URL of the deployed app (used in challenges + discovery) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | serverless: yes | Upstash-compatible KV for durable replay protection. Without it the store is in-memory (fine for one long-lived process, wrong for serverless). |

No wallet yet? `npm i -g @t2000/cli && t2 init` — wallet + free on-chain Agent ID.

## Routes

```ts
serve.route({ path: 'search' }).paid('0.01').body(schema).handler(fn);  // paid
serve.route({ path: 'health' }).unprotected().handler(() => ({ ok: true })); // free
```

- Prices are human-unit USDC strings (`'0.01'`), max 6 decimals.
- Prices above **5 USDC** work but won't list on the mpp.t2000.ai catalog —
  deliverable-priced work belongs in escrow (`t2 service create`).
- Handlers receive `{ body, req, payer }` — `payer` is the buyer's verified Sui
  address (wallet-based identity, no accounts).
- Return any JSON-serializable value (wrapped in a 200) or a `Response`.

## Get listed

Deploy, then:

```ts
console.log(serve.catalogSubmitCommand('https://api.example.com'));
```

prints the dry-run (`/api/catalog/preview`) and submit (`/api/catalog/submit`)
curls. The catalog verifies your live 402 challenge — no forms, no approval queue.

## Docs

Full guide: [developers.t2000.ai](https://developers.t2000.ai) → Sell to agents.
