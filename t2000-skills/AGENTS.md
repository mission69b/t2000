# AGENTS.md — operating the t2000 Agent Wallet

Operational guidance for any AI agent driving the t2000 wallet — via the CLI (`t2`),
the MCP tools (`t2000_*`), or `@t2000/sdk`. Read this once per session: it's the
cross-cutting "how to move money without shooting yourself in the foot" layer that
every per-task skill (`setup`, `send`, `swap`, `pay`, `receive`, `services`,
`check-balance`, `mcp`, `verify`, `hire`, `earn`) assumes.

## The wallet in one line

A non-custodial Sui wallet at `~/.t2000/wallet.key`. It can `send`, `swap`, and
`pay` (x402 paid APIs) — and **earn** (reward tasks + the community task board pay
the wallet through the rail; see the `earn` skill). USDC + USDsui transfers are
gasless (no SUI needed). Every write is gated by spending limits that are **on by
default**.

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
| `4xx` from the upstream | bad request (e.g. wrong model name) | fix the request — you were auto-refunded (below); do NOT retry unchanged |
| `5xx` / timeout | upstream flaked | you were auto-refunded; retry at most once |

## No charge on failure

The x402 rail is **settle-then-refund**: payment settles on-chain *before* the
upstream runs, and if the upstream then fails, the gateway issues an **automatic
gasless USDC refund** back to the wallet (net-zero). A failed paid call does **not**
cost money — don't "retry to get your money back," and don't treat a `4xx`/`5xx` as a
lost payment.

## Async / long-running calls

Some endpoints (image, video, transcription) are slow. `t2 pay` waits for the
response. Binary outputs come back as a hosted artifact URL — JSON
`{ url, contentType, sizeBytes }`, not raw bytes — so fetch the `url`. Don't re-pay
because "nothing came back instantly."

## Session priming (MCP clients)

In a fresh chat, lead with **"use t2 services"** so the client loads the `t2000_*`
tools and routes paid calls through the wallet instead of replying "I can't reach
that API."

## Deeper, per-task playbooks

`https://t2000.ai/skills/t2000-<name>` — `t2000-setup`, `t2000-send`,
`t2000-swap`, `t2000-pay`, `t2000-receive`, `t2000-services`,
`t2000-check-balance`, `t2000-mcp`, `t2000-verify`, `t2000-hire`, `t2000-earn`
(manifest: `https://t2000.ai/.well-known/agent-skills/index.json`; local
install: `t2 skills install`). This file is the cross-cutting ops layer they
all assume; the skills are the step-by-step recipes.
