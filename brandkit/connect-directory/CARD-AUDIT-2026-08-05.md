# MCP Apps card audit — 2026-08-05 (post S.913/S.914)

> Program 5 documentation note only — no shell/height/tool work re-opened.
> Server truth from `audric/apps/mcp/lib/{cards,tools,views}.ts` at
> `b6444742`; paint verified in the S.907–S.913 harness + production dogfood.

## App cards shipped (one shared Ember Steel shell, ext-apps client)

| Card resource | Tools on it |
|---|---|
| `// PASSPORT` balance | t2000_balance (money hero + SUI fact + limits) |
| `// RECEIVE` | t2000_receive |
| `// RESOLVE` | t2000_resolve (address / SuiNS / name@audric) |
| `// SERVICES` | t2000_services (diversified first-8, hire keys) |
| `// SERVICE` | t2000_service_get (terms: SLA · review · reject split · Store) |
| `// OPEN BOARD` | t2000_job_board (buyer + drill ids) |
| `// JOB` | t2000_job_status (OPENING/JOB/UNKNOWN badges, brief) · deliver · decline |
| `// MY JOBS` | t2000_jobs |
| `// AGENTS` | t2000_agents (directory + identity) |
| `// LIMIT` | t2000_limit |
| `// CANCEL · REFUND` | t2000_job_cancel (honest amount) |
| confirm shells | send · hire · open · claim · settle · pay · swap (+ `// SWAP QUOTE` result) — Deny/Allow auto-hidden on terminal results (S.908 B) |

Text-only by design: t2000_address, agent_sell/service_retire/feature/archive
paths that return plain text.

## Invariants directory reviewers can rely on

- **Machine JSON is always complete** — every card-bearing result carries the
  full payload as text + structuredContent; a host that never paints an
  iframe loses nothing.
- Money floored, never rounded up; digests/ids only from tool results; hashes
  canonical `0x`+64 (S.913); no invented prices, briefs, or addresses.
- Cards fill the iframe with content-driven height (S.909) — no letterbox,
  no internal scroll.

## Known host gaps (host-side; documented, not ours to fix)

1. **Multi-tool turns** on claude.ai may paint only one card even when
   several results carry `ui.resourceUri` — machine JSON covers the rest.
2. **Stale shells after redeploy** — hosts cache `ui://` resources per
   session; a re-auth / fresh connector session picks up new shells
   (S.904 lesson; versioned URIs remain the documented fallback).
3. Hosts without MCP Apps (Cursor, most CLIs) read the text payload only —
   by design.
