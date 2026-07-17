# AGENTS.md — operating the t2000 Agent Wallet

Operational guidance for any AI agent driving the t2000 wallet — via the CLI (`t2`),
the MCP tools (`t2000_*`), or `@t2000/sdk`. Read this once per session: it's the
cross-cutting "how to move money without shooting yourself in the foot" layer that
every per-task skill (`setup`, `send`, `swap`, `pay`, `receive`, `services`,
`check-balance`, `mcp`, `verify`) assumes.

## The wallet in one line

A non-custodial Sui wallet at `~/.t2000/wallet.key`. It can `send`, `swap`, and
`pay` (x402 paid APIs). USDC + USDsui transfers are gasless (no SUI needed).
Every write is gated by spending limits that are **on by default**.

## Free-first ordering (don't pay to learn)

1. **Discover before paying.** `t2 services search "<query>"` and
   `t2 services inspect <url>` are FREE and need no wallet — use them to find the
   right endpoint and see its exact price + input schema BEFORE spending.
2. **Estimate, don't guess.** `t2 pay <url> --estimate` returns the price (and input
   schema) without paying.
3. Only then pay.

## Spending limits (on by default)

- Fresh wallets ship with `$25`/transaction and `$100`/day (cumulative, USD) caps.
  A write over a cap fails with `LIMIT_EXCEEDED`.
- Limits gate **every** write — CLI **and** MCP (enforced in `@t2000/sdk`).
- To exceed once from the CLI: add `--force`. **The MCP path has no override** — the
  LLM can only *read* caps (`t2000_limit`), never raise or clear them.
- If a write returns `LIMIT_EXCEEDED`, do **not** loop `--force`. Surface it to the
  user and ask.

## Payment-error recovery (do NOT blind-retry)

A blind retry can double-spend or burn calls. Diagnose first:

| Symptom | Cause | Action |
|---|---|---|
| `WALLET_NOT_FOUND` | no wallet yet | run `t2 init` (or `install.sh`); don't retry the pay |
| `INSUFFICIENT_BALANCE` | wallet underfunded | `t2 fund` → add USDC, then retry once |
| `LIMIT_EXCEEDED` | over a spend cap | surface to the user; `--force` only with consent; never loop |
| `4xx` from the upstream | bad request (e.g. wrong model name) | fix the request — auto-refunded on proxied services (below; direct sellers may keep the charge); do NOT retry unchanged |
| `5xx` / timeout | upstream flaked | auto-refunded on proxied services; retry at most once |

## No charge on failure (proxied services only)

The x402 rail is **settle-then-refund**: payment settles on-chain *before* the
upstream runs, and if the upstream then fails, the gateway issues an **automatic
gasless USDC refund** back to the wallet (net-zero). A failed paid call does **not**
cost money — don't "retry to get your money back," and don't treat a `4xx`/`5xx` as a
lost payment.

**Exception — direct sellers.** Catalog entries marked `direct` (the endpoint lives
on the seller's own origin, e.g. `agent.jmpr.world`) settle straight to the seller's
wallet: the gateway can't refund what it never held, so the seller's own guarantees
apply. Before paying a direct endpoint, get the request shape right (`t2 services
inspect <url>`, `--estimate`) — a malformed request may still be charged.

## Async / long-running calls

Some endpoints (image, video, transcription) are slow. `t2 pay` waits for the
response. Binary outputs come back as a hosted artifact URL — JSON
`{ url, contentType, sizeBytes }`, not raw bytes — so fetch the `url`. Don't re-pay
because "nothing came back instantly."

## Selling (get paid, does not spend)

If the agent has its own x402 API, `t2 agent sell <endpoint>` (or the
`t2000_agent_sell` MCP tool) lists it on the agent's public Agent ID profile —
the endpoint is live-probed (must answer 402 with a valid Sui challenge), then
one sponsored gasless signature sets it on-chain. Buyers pay the wallet per
call in USDC. `--remove` / `remove: true` clears the listing. Requires a
registered Agent ID (`t2 agent register`). Then `t2 agent list-catalog` (or
`catalog: true` on the MCP tool) also lists it in the MPP catalog at
mpp.t2000.ai — permissionless, machine-gated (live 402 re-probe + the challenge
must pay the registered wallet + $5/call cap), re-probed daily. How to build
the endpoint: https://developers.t2000.ai/sell-your-api

## Session priming (MCP clients)

In a fresh chat, lead with **"use t2 services"** so the client loads the `t2000_*`
tools and routes paid calls through the wallet instead of replying "I can't reach
that API."

## Deeper, per-task playbooks

Fetch `https://t2000.ai/skills/<slug>` — e.g. `https://t2000.ai/skills/t2000-setup`.
Slugs: `t2000-setup`, `t2000-send`, `t2000-swap`, `t2000-pay`, `t2000-receive`,
`t2000-services`, `t2000-check-balance`, `t2000-mcp`, `t2000-verify`,
`t2000-code-delegate` (manifest:
`https://t2000.ai/.well-known/agent-skills/index.json`; local install:
`t2 skills install`). This file is the cross-cutting ops layer they all
assume; the skills are the step-by-step recipes.

**Copied skills drift.** If skills were installed to disk (`.agents/skills/`,
`.cursor/rules/`, `.claude/skills/`), run `t2 skills check` at session start —
it compares every installed skill against what t2000.ai serves and answers
`{ upToDate, action }` (`--json`). Stale → `t2 skills install` refreshes.
(MCP clients skip this: `t2 mcp install` serves skills live, no files.)
