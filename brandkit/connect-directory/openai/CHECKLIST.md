# ChatGPT app directory — submission checklist

> Status **2026-08-05: READY TO PREP — blocked on founder dashboard.**
> Submission runs through OpenAI's developer dashboard (Apps SDK /
> app-submission-guidelines at developers.openai.com); the dashboard
> **scans the MCP endpoint** and imports tool metadata into the draft.
> Do not block the Anthropic filing on this one (per-spec: Claude first).

## What works TODAY without any filing

ChatGPT **Developer mode** (Settings → Apps & Connectors → Advanced) accepts
the remote connector directly: URL `https://mcp.t2000.ai/mcp`, OAuth per the
MCP authorization spec. This is the documented path in
docs.t2000.ai/passport-connect — distribution via directory is additive.

## Requirements — where we stand

| Requirement | Status |
|---|---|
| MCP server the dashboard can scan | ✅ `https://mcp.t2000.ai/mcp` |
| OAuth 2.1 per MCP authorization spec | ⚠️ **VERIFY at filing** — OpenAI expects discovery doc + (CIMD `none`/`private_key_jwt` or DCR) + `resource` param echoed into tokens; check Connect's OAuth server against that list and patch if a gap shows |
| App name / logo / description | ✅ `../DESCRIPTION.md` + `brandkit/favicon-512-ember.png` / `logo-512-ember.png` |
| Company + privacy URLs | ✅ `https://t2000.ai` · `https://t2000.ai/privacy` (+ terms) |
| Test prompts + expected responses | ✅ prompts in `../DESCRIPTION.md`; founder adds expected outputs from live runs |
| Web + mobile testing | ⚠️ **FOUNDER** — run the test prompts on ChatGPT web AND mobile in developer mode; note any card-render gaps honestly (machine JSON is always complete) |
| Localization / country availability | Default English / broadly available — founder confirms in dashboard |
| Screenshots (optional, UI apps) | Same live-capture rule as Anthropic — reuse `../screenshots/` set if formats fit |

## Written blockers (the honest list)

1. **Developer dashboard account/verification** — founder identity.
2. **Commerce/financial policy** — an app that moves real USDC may sit
   outside current app-directory policy or need extra review; answer
   honestly (limits, ask-above, revoke, non-custodial framing) and accept
   that the outcome is OpenAI's call. If rejected on policy, developer-mode
   remains the documented ChatGPT path.
3. **OAuth 2.1 conformance check** (above) — possible small server patch.
4. Web + mobile test pass needs the founder's ChatGPT account.
