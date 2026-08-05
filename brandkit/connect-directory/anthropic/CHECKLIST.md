# Anthropic Connectors Directory — submission checklist

> Status **2026-08-05: READY TO FILE — blocked on founder session.**
> The portal lives inside claude.ai admin settings
> (`claude.ai/admin-settings/directory/submissions/new`) and requires a
> **Team or Enterprise organization** with Owner/Primary-owner (or a
> delegated Directory-management role). Build cannot file this; every
> answer below is pre-written for the founder to paste. Verified against
> claude.com/docs/connectors/building/submission (fetched 2026-08-05).

## Hard requirements — where we stand

| Requirement | Status |
|---|---|
| Remote MCP over HTTPS | ✅ `https://mcp.t2000.ai/mcp` (streamable HTTP; same URL for every user) |
| OAuth 2.0 for authenticated service | ✅ MCP authorization spec; Google → Passport zkLogin. Register callback `https://claude.ai/api/mcp/auth_callback` |
| Tool annotations — every tool has `title` + `readOnlyHint`/`destructiveHint` | ⚠️ **VERIFY before filing** — the portal syncs tools live and flags missing annotations; if flagged, a small mcp PR adds annotations (reads → readOnlyHint, spends/escrow writes → destructiveHint) |
| Public privacy policy | ✅ `https://t2000.ai/privacy` (live, S.915) |
| Public docs with setup + auth steps | ✅ `https://docs.t2000.ai/passport-connect` |
| ≥3 example prompts exercising different tools | ✅ `../DESCRIPTION.md` |
| MCP Apps carousel — 3–5 PNGs ≥1000px, response-only crop, prompts supplied separately | ⚠️ **FOUNDER CAPTURE** from live claude.ai — shot list in `../README.md`; drop into `../screenshots/` |
| Team/Enterprise org + directory access | ⚠️ **FOUNDER** — individual plans cannot reach the portal |
| Test account for reviewers (end-to-end, funded) | ⚠️ **FOUNDER** — a Google test account whose Passport holds a few USDC, with limits set (e.g. $1/$5/$0.50 ask-above) so the reviewer can exercise a small spend + ask-above pause; write exact steps in the portal's Test & launch step |

## Portal steps — pre-written answers

1. **Connection** — URL `https://mcp.t2000.ai/mcp` · streamable HTTP · every user connects to the same URL.
2. **Tools** — auto-synced. Fix any annotation flags server-side first (see above).
3. **Listing** — name `t2000` · tagline + description from `../DESCRIPTION.md` · categories: Finance/Payments, Productivity, Developer tools · docs/privacy/support/company from `../README.md` · icon `brandkit/favicon-512-ember.png` · slug `t2000` (permanent — founder confirms).
4. **Use cases** — from `../DESCRIPTION.md` §Use-case answers.
5. **Company** — T2000 AFI Inc. · `https://t2000.ai` · contact founder.
6. **Authentication** — OAuth; state whether Connect's OAuth server supports dynamic client registration or needs a static client ID held by Anthropic (verify against the live OAuth metadata at filing time; coordinate with mcp-review@anthropic.com if static).
7. **Data handling** — API is **our own** (api.t2000.ai + Sui chain). No health data. No sponsored content.
8. **Test & launch** — test-account credentials + steps (founder). Confirm every tool was run (production dogfood S.902–S.914 covers this; re-run any tool the portal lists as untested).
9. **Compliance** — seven acknowledgments. ⚠️ **The financial-transactions acknowledgment is the real review risk**: Connect executes USDC transfers/escrow under user-set limits with ask-above approval — answer honestly and lean on the leash design (limits, ask-above, revoke, 7-day expiry, no key in client). Expect reviewer questions here.
10. **Review** — submit; track at `claude.ai/admin-settings/directory/submissions`; escalate via mcp-review@anthropic.com.

## Written blockers (the honest list)

1. Portal access needs a **Team/Enterprise org** — founder decision/purchase if the current org is individual.
2. **Live screenshots** need the founder's connected claude.ai session.
3. **Reviewer test account** needs a real funded Passport the founder provisions.
4. Possible follow-up PR: **tool annotations** if the portal flags them (small, mcp only).
5. **Financial-transactions policy** review outcome is Anthropic's call — filing ≠ listed.
