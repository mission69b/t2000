# Passport Connect — directory submission pack

> Program 5 (S.916, 2026-08-05). Everything a connector-directory form asks
> for. Assets are **referenced from `brandkit/`** (one source of truth — no
> binary copies here). Per-host checklists live in `anthropic/` and `openai/`.

## The one endpoint

```
https://mcp.t2000.ai/mcp
```

Remote MCP, streamable HTTP, same URL for every user. OAuth per the MCP
authorization spec (Google → Passport zkLogin). No stdio, no local install,
no second domain — ever.

## Names & copy (canonical)

| Field | Value | Limit context |
|---|---|---|
| Server name | `t2000` | Anthropic ≤100 chars |
| Tagline | `t2000 — the agent marketplace. Hire agents with USDC in escrow, post Open jobs, put yours to work, claim jobs to earn. Settlement on Sui.` | max often 200 · ~133 · `VOICE.md` |
| Long name | `t2000` (form: add Passport Connect only if host requires dual) | |
| Categories | Finance / Payments · Productivity · Developer tools | pick 1–5 per host |
| Support | `hello@t2000.ai` | |
| Docs URL | `https://docs.t2000.ai/passport-connect` | |
| Privacy URL | `https://t2000.ai/privacy` | live (S.915) |
| Terms URL | `https://t2000.ai/terms` | live (S.915) |
| Company | T2000 AFI Inc. · `https://t2000.ai` | |
| OAuth callback (Claude) | `https://claude.ai/api/mcp/auth_callback` | register on the Connect OAuth server |

**Description (≤2000 chars, canonical — see `DESCRIPTION.md` for the full
text + example prompts):** one paragraph, machines-and-humans, USDC under
user-set limits, marketplace + x402, never claims "send disabled".

## Assets (referenced, not copied)

| Directory slot | File (in `brandkit/`) | Notes |
|---|---|---|
| Listing icon (square) | `favicon-512-void.png` | primary — void t2 on ember (live Connect tile) |
| Icon alt (dark tile) | `favicon-512-void.png` | if the host composites on light |
| Icon alt (light tile) | `favicon-512-white.png` | if the host composites on dark |
| Logo / wordmark | `logo-512-ember.png` · `wordmark-full-ember.png` | wordmark for wide slots |
| OG / hero | `og-passport.png` (1200×630) | |
| Small favicons | `favicon-16.png` · `favicon-32.png` · `favicon-64.png` · `favicon-180.png` | rarely asked; here if needed |

## Screenshots (MCP Apps carousel — FOUNDER CAPTURE)

Anthropic requires 3–5 PNGs, ≥1000px wide, **cropped to the app response
only (no prompt in frame)**, each with its prompt text supplied separately.
Must come from **live claude.ai** — never mockups. Suggested set (all live
after S.913/S.914; fresh connector session first):

1. `t2000_balance` — money hero + SUI fact. Prompt: "What's my Passport balance?"
2. `t2000_services` (no query) — multi-seller first-8. Prompt: "Browse services on the t2000 store."
3. `t2000_service_get` — terms card (SLA · review · reject split · Store). Prompt: "Show me the smoke-brief service from agent #90 in detail."
4. `t2000_job_board` — buyer + drill ids. Prompt: "Show the open job board."
5. `t2000_limit` — leash card. Prompt: "What are my Connect spending limits?"

Drop captures into `screenshots/` as `01-balance.png` … with a `prompts.txt`.

## Status (2026-08-05)

| Host | Status |
|---|---|
| Anthropic Connectors Directory | **Blocked on founder** — see `anthropic/CHECKLIST.md` (portal requires a Team/Enterprise org admin session + live screenshots; all form answers pre-written) |
| ChatGPT app directory | **Blocked on founder** — see `openai/CHECKLIST.md` (developer-dashboard submission + review; developer-mode connector works today) |
| Generic MCP clients (Cursor, Hermes, …) | No directory — docs cover the JSON config; nothing to file |
