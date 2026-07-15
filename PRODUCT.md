# t2000 — The Product Map

> One page. What t2000 sells, to whom, and how they start. For the technical
> picture see [`ARCHITECTURE.md`](ARCHITECTURE.md); for docs see
> [developers.t2000.ai](https://developers.t2000.ai).

## Two products. Each has one customer and one path in.

| Product | Customer | The path in | They pay with |
|---|---|---|---|
| **Private Inference** — `api.t2000.ai/v1` | human developers | sign into the [console](https://agents.t2000.ai/manage) → mint a key (free) → put base URL + key in your tool | free daily coding allowance, then credit (card or stablecoin top-up) |
| **x402 Gateway** — `mpp.t2000.ai` | agents (machines) | `t2 init` (wallet) → fund USDC → `t2 pay <url>` | USDC per call, gasless |

One path per product. Humans get keys from the console; machines pay per call
from a wallet. They don't mix.

**What each product is:**

- **Private Inference** — every major open + frontier model behind one
  OpenAI-compatible endpoint. Zero data retention by default, a
  GPU-TEE **confidential tier** with Sui-anchored receipts anyone can verify
  (`t2 verify`, [verify.t2000.ai](https://verify.t2000.ai)), and the
  **`t2000/auto` router** — one model id that picks the right model per step
  and bills at the served model's price.
- **x402 Gateway** — every major AI + data API, payable per call in USDC with
  no account, no API keys, no gas. The machine-native way to buy compute.

## The substrate (not products — plumbing)

| Thing | What it actually is |
|---|---|
| **Agent Wallet** (`@t2000/{cli,sdk,mcp}`) | The machine customer's *account*. A machine can't sign into a console — its keypair is its identity, its USDC balance is its billing. Exists to serve the gateway. |
| **Agent ID** (`@t2000/id` + the [directory](https://agents.t2000.ai)) | A registry giving a machine's keypair a name (`@handle`), an owner, and a kill-switch — plus the **seller listing**: an agent lists its x402 endpoint on its record (console "Sell your API" / `t2 agent sell` / MCP `t2000_agent_sell`; live-probed, gasless) and buyers pay it per call. The EARN side of the gateway's SPEND. |

## The consumers (demand for the rails)

- **[Audric](https://audric.ai)** — the consumer AI app; buys inference + gateway calls.
- **`t2 code` / `t2 connect`** *(in development — `spec/active/SPEC_INFERENCE_DEMAND.md`)* —
  the developer engine: route coding-agent traffic through Private Inference via
  the `t2000/auto` router.

## Removed

- **`t2 agent onboard` + `t2 agent topup`** (wallet → credit → key) — removed
  2026-07-13 (shipped in v8). Keys come from the console, period;
  machines making one-off inference calls use keyless x402 on the gateway.
  `t2 models` / `t2 verify` remain — they *consume* a key (`T2000_API_KEY`) and
  verify receipts; they are not a second onboarding path. (`t2 chat` was
  absorbed into `t2 code` at the Step-2 ship — one inference surface.)
