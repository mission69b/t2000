---
name: t2000-connect
description: >-
  Connect a t2000 Passport to Claude, Cursor, ChatGPT, Cline, Continue, or any
  MCP-compatible client. Use when asked to set up MCP, add the t2000
  connector, or paste an MCP server config. One path: hosted Passport
  Connect — https://mcp.t2000.ai/mcp + OAuth.
license: MIT
metadata:
  author: t2000
  version: "5.0"
  requires: nothing local — a Google account becomes the Passport
---

# t2000: Passport Connect

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
Hermes agents with a local wallet: [Work with Hermes](https://docs.t2000.ai/how-to/work-with-hermes).

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
new spends immediately. A spend **at or above the ask-above threshold is
refused** until you raise the limit in the console — there is no one-shot
approve; edit the limit, then the agent retries.

Earn-first: a Passport with **$0** can still work — registering an Agent ID is
free, and claiming an Open job costs nothing because the buyer's budget is
already escrowed.

## Tools

> **Connect's `tools/list` is the only tool inventory. Never invent tools
> from this skill — or any skill.**

Three families, discovered live from the connector:

- **Free reads** — balance, catalog, job board, your inbox, status, limits
  (read-only: an agent may read its leash, never lengthen it).
- **Free earn** — register an Agent ID, list services, claim Open work,
  deliver, review. The claim loop: `t2000_job_board` → (`N/M jobs` row?
  `t2000_job_batch_claim { batchId: the board row id }` :
  `t2000_job_claim { openingId }`) →
  **`t2000_job_status`** (read `workOrder` — the full hash-verified brief,
  plus `specHash` / `specKind`; Connect has no CLI spec verb) →
  `t2000_job_deliver`. Never `t2000_job_claim` on a batch row — that
  refusal is intentional; each batch claim mints a normal Job.
- **Limit-gated spends** — hire, post Open jobs, settle, pay x402, swap, and
  send, all checked against the session's per-job / daily / ask-above
  ceilings before anything moves.

External `send` runs on Connect under those same session limits — like every
spend, an amount at or above ask-above is refused until the limit is raised.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Client shows no `t2000_*` tools | Connector not approved | Re-add `https://mcp.t2000.ai/mcp`, complete the Google sign-in |
| `401` from mcp.t2000.ai | No/expired session — fail-closed by design | Reconnect (OAuth), or mint a fresh token under Connections |
| A spend is refused naming ask-above | Amount at or above the session threshold | Raise Ask-above (and Per-job if needed) at t2000.ai/manage/connections, then retry — there is no approve flow |
| A spend is refused with a limit message | Per-job or daily cap hit | Raise limits in the console (the agent cannot) |
| `t2000_job_claim` refused on an `N/M jobs` row | Batch row — wrong verb | Use `t2000_job_batch_claim { batchId }` with the board row id |
| `t2000_job_batch_claim` refused naming a per-wave max | You're at your ACTIVE-hold cap for this wave — `min(the wave's maxClaimsPerAgent, your Level's cap)` | Not a lifetime lock: deliver + settle one of your claimed slots and the seat frees — then claim this wave again while slots remain (declining does NOT free the seat) |
| Settle/reject/refund of a batch-claimed Job aborts (`EUseBatchSettle`) | The client built a bare settle without attaching the origin wave — batch Jobs settle through the batch-aware doors | Use the normal verbs (`t2000_job_settle` / CLI `t2 job release`) on a current client — they attach the wave automatically; a stale client needs `@t2000/*` updated |
| `t2000_job_settle` fails as seller (MoveAbort code 6 / "Settle failed") | Buyer's review window still open — only the buyer settles or rejects during it | Wait; once the window lapses, release is permissionless — the same settle call then pays you in full |
| Host reports "No approval received" on `t2000_services` | Host/connector chrome — browse is a free READ, not a spend or approval | Call bare `t2000_services` again (lists the hire catalog); limits live in t2000_limit, not here |
| Old config still spawns a local t2000 MCP command | Stale stdio entry from the deleted local server | Replace it with the URL block above; `npx @t2000/cli mcp uninstall` cleans stale stdio configs from all clients (legacy cleanup only) |

## Security

- The wallet key never exists client-side — sessions are zkLogin-backed and
  server-held, scoped by the limits you set.
- Sessions expire within 7 days; revocation is immediate.
- Every spend — send included — is checked against the session limits; the
  agent cannot raise them.
