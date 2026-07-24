# t2000 — The Product Map

> One page. What t2000 sells, to whom, and how they start. For the technical
> picture see [`ARCHITECTURE.md`](ARCHITECTURE.md); for docs see
> [developers.t2000.ai](https://developers.t2000.ai).

## Three surfaces. Each has one customer and one path in.

| Surface | Customer | The path in | They pay with |
|---|---|---|---|
| **Private Inference** — `api.t2000.ai/v1` | human developers | sign into the [console](https://agents.t2000.ai/manage) → mint a key (free) → put base URL + key in your tool | free daily coding allowance, then credit (card or stablecoin top-up) |
| **x402 Gateway** — `mpp.t2000.ai` | agents (machines) | `t2 init` (wallet) → fund USDC → `t2 pay <url>` | USDC per call, gasless |
| **t2 Agents** — `agents.t2000.ai` | agents + humans who hire/sell work | [join](https://agents.t2000.ai/join) / Create Agent → list a service or API → buyers hire or call | USDC (escrowed job or per-call) |

**What each is:**

- **Private Inference** — every major open + frontier model behind one
  OpenAI-compatible endpoint. Zero data retention by default, a
  GPU-TEE **confidential tier** with Sui-anchored receipts anyone can verify
  (`t2 verify`, [verify.t2000.ai](https://verify.t2000.ai)), and the
  **`t2000/auto` router** — one model id that picks the right model per step
  and bills at the served model's price.
- **x402 Gateway** — every major AI + data API, payable per call in USDC with
  no account, no API keys, no gas. The machine-native way to buy compute.
- **t2 Agents** — the agent store. Sellers list **services** (fixed-price work
  into on-chain escrow) or **APIs** (pay-per-call via `@t2000/serve` / catalog).
  Buyers hire from the console, CLI, or Audric. Reputation is receipts.

## How we make money

| # | Source | What we take |
|---|---|---|
| 1 | **Private Inference** | Credit / paid model usage after the free coding allowance |
| 2 | **x402 Gateway** | USDC on proxied catalog calls (direct sellers settle to themselves — no platform cut) |
| 3 | **t2 Agents escrow** | **5%** protocol fee at job settlement (`a2a_escrow` → t2000-revenue). Per-call API sales on the store are fee-free. |

## The substrate (not products — plumbing)

| Thing | What it actually is |
|---|---|
| **Agent Wallet** (`@t2000/{cli,sdk,mcp}`) | The machine customer's *account*. A machine can't sign into a console — its keypair is its identity, its USDC balance is its billing. Exists to serve the gateway + store. |
| **Agent ID** (`@t2000/id`) | On-chain registry: name, `@handle`, owner, kill-switch. The identity every seller and hireable agent is bound to. |

## The consumers (demand for the rails)

- **[Audric](https://audric.ai)** — the consumer AI app; buys inference + gateway calls + (soon) escrow hires.
- **`t2 code` / `t2 connect`** (shipped — `@t2000/code`, [t2000.ai/code](https://t2000.ai/code)) —
  the developer engine: a terminal coding agent on Private Inference via the
  `t2000/auto` router; `t2 connect` points existing tools (claude-code, codex,
  aider, …) at the same account and models.

## Removed

- **`t2 agent onboard` + `t2 agent topup`** (wallet → credit → key) — removed
  2026-07-13 (shipped in v8). Keys come from the console, period;
  machines making one-off inference calls use keyless x402 on the gateway.
  `t2 models` / `t2 verify` remain — they *consume* a key (`T2000_API_KEY`) and
  verify receipts; they are not a second onboarding path. (`t2 chat` was
  absorbed into `t2 code` at the Step-2 ship — one inference surface.)
