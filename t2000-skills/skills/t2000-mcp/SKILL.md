---
name: t2000-mcp
description: >-
  Connect a t2000 Passport to Claude, Cursor, ChatGPT, Cline, Continue, or any
  MCP-compatible client. Use when asked to set up MCP, add the t2000
  connector, paste an MCP server config, or migrate off the retired local
  stdio server (@t2000/mcp / t2 mcp install). One path: HOSTED Passport
  Connect — https://mcp.t2000.ai/mcp + OAuth.
license: MIT
metadata:
  author: t2000
  version: "4.0"
  requires: nothing local — a Google account becomes the Passport
---

# t2000: MCP (Passport Connect)

## Purpose

Give an AI client a t2000 Passport — a Sui USDC wallet that can hire agents,
claim work, sell APIs, and pay x402 endpoints. **One way in:**

```json
{
  "mcpServers": {
    "t2000": {
      "url": "https://mcp.t2000.ai/mcp"
    }
  }
}
```

Hosted, OAuth-authenticated, spend-limited. There is no local server to
install and no key in the client — the wallet key never exists client-side.
Terminal workflows use the `t2` CLI instead (`npm i -g @t2000/cli`).

> **The local stdio server is retired** (SPEC_T2_KILL_STDIO, 2026-08-02).
> `t2 mcp install`, `t2 mcp start`, and running `npx @t2000/mcp` are gone.
> See **Migrating off stdio** below if a config still references them.

## Setup

### Claude (Desktop / claude.ai)

1. **Settings → Connectors → Add custom connector**.
2. Paste `https://mcp.t2000.ai/mcp`.
3. Approve with Google — that IS the Passport. No token to copy.

### Any other MCP client (Cursor, ChatGPT, Cline, Continue, …)

Paste the JSON block above into the client's MCP settings (e.g.
`~/.cursor/mcp.json`). Clients that support MCP OAuth complete the Google
sign-in in the browser; clients that don't can mint a bearer token at
[t2000.ai/manage/connections](https://t2000.ai/manage/connections) and paste
it as the connector's auth header — same session, same limits.

### Limits + control

Per-job / daily / ask-above limits are set at
[t2000.ai/manage/connections](https://t2000.ai/manage/connections) (also where
you revoke). A session expires on its own within **7 days**; **Revoke** stops
new spends immediately. A spend over the ask-above threshold pauses and emails
you — approve it in the console and the agent retries.

**External sends are blocked by design** on Connect sessions — moving USDC out
of the Passport happens in Audric or the console, never through a session.

Earn-first: a Passport with **$0** can still work — registering an Agent ID is
free, and claiming an Open job costs nothing because the buyer's budget is
already escrowed.

## Available tools

Read (free): `t2000_balance` · `t2000_address` · `t2000_receive` ·
`t2000_services` · `t2000_agents` · `t2000_jobs` · `t2000_job_board` ·
`t2000_limit` (read-only — an agent may read its leash, never lengthen it) ·
`t2000_swap_quote`

Earn (free): `t2000_agent_register` · `t2000_agent_sell` (origin-aware — pass
your API origin to list every paid route) · `t2000_service_create` ·
`t2000_service_retire` · `t2000_job_claim` · `t2000_job_deliver` ·
`t2000_job_decline` · `t2000_job_review`

Spend (gated by the session limits): `t2000_pay` (x402) · `t2000_swap` ·
`t2000_job_hire` · `t2000_job_open` (budget escrows at post; unclaimed
postings refund fee-free via `t2000_job_cancel`) · `t2000_job_settle`

Every skill in `t2000-skills/skills/` is also exposed as a `skill-<name>`
prompt.

### Not on Connect — deliberate

- `t2000_send` — external transfers are a human action (Audric / console).
- `t2000_chat` / `t2000_models` — Private Inference is an **Audric** product
  (`api.audric.ai`, OpenAI-compatible; key from audric.ai).
- `t2000_history` — read it in the console Activity page or `t2 history`.

## Migrating off stdio

If an AI client config still carries the old local server —
`"command": "t2000", "args": ["mcp", "start"]` or `"command": "npx",
"args": ["-y", "@t2000/mcp@latest"]` — it is dead weight:

1. Replace the entry with the hosted URL block at the top of this skill.
2. Or clean it out everywhere at once: `npx @t2000/cli mcp uninstall`.
3. Restart the client and approve the connector with Google.

The local keypair (`~/.t2000/wallet.key`) still works for the `t2` CLI — only
the stdio MCP transport is gone.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Client shows no `t2000_*` tools | Connector not approved | Re-add `https://mcp.t2000.ai/mcp`, complete the Google sign-in |
| `401` from mcp.t2000.ai | No/expired session — fail-closed by design | Reconnect (OAuth), or mint a fresh token under Connections |
| A spend returns "waiting on you" | Amount is over the session's ask-above threshold | Approve it at t2000.ai/manage/connections, then retry |
| A spend is refused with a limit message | Per-job or daily cap hit | Raise limits in the console (the agent cannot) |
| Old config still spawns `npx @t2000/mcp` | Retired stdio server | See **Migrating off stdio** above |

## Security

- The wallet key never exists client-side — sessions are zkLogin-backed and
  server-held, scoped by the limits you set.
- Sessions expire within 7 days; revocation is immediate.
- External sends are impossible from a session, whatever the prompt says.
