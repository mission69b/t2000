# External narrative — "We cut 9 tools from our agent. Here's why."

> **Status:** Draft for founder review. Externalized version of S.277 / "Earns Its Keep" audit.
> **Audience:** Agent builders, AI/crypto founders, prospective Audric users / contributors who care about how the sausage is made.
> **Vehicles:** LinkedIn long-post · X thread · audric.ai/changelog · GitHub release note · Discord #announcements.
> **Date:** 2026-05-23.
> **Pick one and ship.** 4 length variants below — tweet, X thread, blog post, dev changelog.

---

## Variant A — Tweet (280 chars)

```
We shipped Audric with 37 tools.

This week we audited every one against our product story (Save · Send · Swap · Borrow · Receive).

26 earned their keep. 9 didn't.

Quality > quantity in the agent tool surface. Engine 2.18.0 is live.

🔗 [link]
```

---

## Variant B — X thread (8 posts)

**1/** We shipped Audric with 37 tools in the engine.

This week we audited every one against our product story — Save, Send, Swap, Borrow, Receive.

26 earned their keep. 9 didn't. Here's how the cull went.

🧵

**2/** The trigger was a single founder question: *"why do we ship a Brave-backed `web_search` tool if we're a financial agent?"*

That question is the whole audit. If the lens is "this tool helps the user move their money," does each tool pass?

**3/** The three honest cuts:

→ **Volo (3 tools)** — liquid SUI staking. Doesn't slot into Audric's savings story (USDC/USDsui-canonical). No chip surfaces it. Users who want SUI yield can swap → save USDC, same effective APY.

**4/** → **web_search** — general-purpose Brave search. Marginal product fit. Already preempted by Vercel AI Gateway's `perplexity_search` in production. We were paying for a tool the gateway already shadowed.

**5/** → **protocol_deep_dive** — DefiLlama TVL/audit-count lookup. Useful in theory ("is X safe?") but `rates_info` covers the in-product comparison. Cutting it removes our last DefiLlama dependency entirely.

**6/** Plus 2 guards that were structurally dead post-earlier cuts (a paid-API cost-warning guard + an image/PDF artifact-preview guard — both lost their tools 2 weeks ago).

Net engine: 31 → 26 tools, 14 → 12 guards.

**7/** The temptation when you ship an agent is to keep adding tools. The cost is invisible: prompt-budget bloat, attack surface, more things to break, more decisions the LLM has to make on every turn.

The discipline is doing this audit *quarterly* and being honest.

**8/** Engine 2.18.0 is live (`@t2000/engine` on npm). Audric Pay, Save, Send, Swap, Borrow all unchanged from the user perspective — just a leaner brain underneath.

audric.ai — every action still taps to confirm via Passport.

[link to full audit]

---

## Variant C — Blog post (~600 words, ~3 min read)

### We shipped Audric with 37 tools. This week we cut 9 of them. Here's why.

Audric is a non-custodial financial agent on Sui — sign in with Google, save your USDC into NAVI, borrow against it, send anywhere on Sui for free, swap across 20+ DEXs, generate yield/portfolio/health charts inline in chat. Every action taps to confirm via the Passport layer.

The way we ship: the engine (the LLM-driven brain) has a fixed roster of "tools" the LLM can call — `save_deposit`, `swap_execute`, `send_transfer`, etc. Each one needs a description that fits in the system prompt, a confirm-card UI, a sponsored-transaction path, and a place in the product story.

We shipped v1 with 37 tools. This week we audited every one. 26 earned their keep. 9 didn't.

#### The lens

The audit asked one question per tool: *does this slot into one of Audric's 5 named products?*

- **Passport** — identity, wallet, tap-to-confirm
- **Intelligence** — the brain (Agent Harness · Reasoning Engine · Memory · AdviceLog)
- **Finance** — save, swap, borrow, repay, charts
- **Pay** — send, receive, payment links
- **Store** — creator marketplace (coming soon)

If a tool doesn't slot into one of those, it's cosmetic. The system prompt has finite real estate. Every tool we keep costs the LLM a decision on every turn.

#### What we cut

**Volo (3 tools — `volo_stats`, `volo_stake`, `volo_unstake`)**

Volo is a liquid SUI staking protocol. Useful, real product, real APY. But it's a *different* financial primitive from Audric's USDC-canonical savings (we save in USDC or USDsui into NAVI, not vSUI into Volo). Users who want SUI yield can do `swap SUI → USDC → save USDC` and capture the same effective rate via NAVI's lending fees. No chip on the Audric home screen surfaces Volo. The LLM rarely picked it. It earned a one-line mention in the system prompt and three engine tool slots — and that's it.

**`web_search` + the Brave API key**

A general-purpose web search tool backed by Brave's API. The founder's question that triggered this whole audit was *"why do we have this if we're a financial agent?"* In practice, our Vercel AI Gateway routing already shadowed it with `perplexity_search` for production traffic — we were paying for a tool the gateway preempted. Cut, along with the `BRAVE_API_KEY` env var (operators can safely delete it from Vercel).

**`protocol_deep_dive` (DefiLlama)**

A read tool that returned TVL trends, audit counts, and 24h fees for any DeFi protocol. Defensible in theory — *"is NAVI safe?"* is a real question. But `rates_info` (our in-product NAVI rates lookup) covers the safety-by-proxy story for the protocols Audric actually integrates. Cutting this removes Audric's last DefiLlama API dependency entirely.

**2 dead guards**

Bonus finding: 2 safety guards (`costWarning` for paid-API operations, `artifactPreview` for image/PDF returns) had no live tools triggering them post our last round of cuts in May. Removed for hygiene.

#### What stayed

Every Finance write (save, withdraw, borrow, repay, swap, harvest, claim_rewards). Every read tool that powers a confirm card or a chart canvas. Payment links (which absorb the invoicing use case). The SuiNS identity tool. All 9 canvas templates. All 12 remaining guards. 4 production crons. The 4 Audric Intelligence subsystems.

**One tool we kept but rethought:** `explain_tx`. It overlaps with `transaction_history`, but it has a unique audience — explaining an *external* digest someone shared on Discord. We tightened its description to make that scope explicit ("arbitrary external digest only") and dropped its primary system-prompt steer. The LLM finds it via description matching, not routing rules.

#### The discipline

The temptation when you ship an agent is to keep adding tools. The cost is invisible — until you measure it.

Engine 2.18.0 is live on npm. Audric Save, Send, Swap, Borrow, Receive all unchanged from the user perspective. Just a leaner brain underneath.

audric.ai

---

## Variant D — Dev-facing changelog / GitHub release note

### `@t2000/engine@2.18.0` — "Earns Its Keep" audit cuts

This release cuts 5 tools + 2 dead guards + 1 dead flag from the engine's public surface. Net: 31 → 26 tools (18 read · 8 write), 14 → 12 guards.

**Removed tools**

| Tool | Why |
|---|---|
| `volo_stats` | Volo SUI liquid staking doesn't slot into Audric's USDC-canonical savings model. No chip surfaces it; `swap SUI → save USDC` covers the same yield use case. |
| `volo_stake` | Same. |
| `volo_unstake` | Same. |
| `web_search` (Brave-backed) | Vercel AI Gateway's `perplexity_search` already shadows it in production. |
| `protocol_deep_dive` (DefiLlama-backed) | `rates_info` covers the in-product proxy for protocol safety. This was the engine's last DefiLlama consumer. |

**Removed guards**

| Guard | Why |
|---|---|
| `guardCostWarning` (`costAware` flag) | Triggered only by `pay_api`, which was removed in `2.16.0`. No live consumers. |
| `guardArtifactPreview` | Fired on image/PDF result URLs. No current tool returns those. |

**Kept-but-tightened**

`explain_tx` description now explicitly scopes to "arbitrary external Sui digests" — the LLM should call it only when the user pastes a digest from outside Audric. For the user's own activity, `transaction_history` is preferred.

**SDK / CLI / MCP** retain the Volo SDK methods for non-Audric consumers (e.g. the CLI's `t2000 stake` command). Only the engine's tool surface was cut.

**Migration for downstream engine consumers**

If your host code reads `READ_TOOLS` or `WRITE_TOOLS` from `@t2000/engine` and switches on tool names: remove cases for the 5 deleted tools. If you wired a UI card for any of them, it's now unreachable. If you set `tool.flags.costAware` on a custom tool, remove the flag (TypeScript will complain after the bump).

**Audric web-v2** bumped to 2.18.0 in the same window. UI cards, system-prompt steers, and the `BRAVE_API_KEY` env var were removed in the same release.

Full audit (5-page internal doc): see `t2000/spec/archive/v07e/AUDIT_V07E_EARNS_ITS_KEEP_2026-05-23.md`.

---

## Distribution checklist (for founder)

- [ ] Pick variant A / B / C / D (or hybrid)
- [ ] Schedule LinkedIn long-form post (Variant C) — best fit for the agent-builder audience
- [ ] X thread (Variant B) — same day, ~2h after the LinkedIn post for cross-pollination
- [ ] Discord #announcements (Variant A or D) — same day
- [ ] audric.ai/changelog (Variant D) — same day or +1 day
- [ ] (Optional) GitHub Release on the v2.18.0 tag — paste Variant D body

**Notes:**
- All four variants tell the same story; they differ only in length + audience.
- Variant D is already 90% the engine changelog — repurposable for the npm release page.
- If publishing to LinkedIn, lead with Variant C's headline ("We shipped Audric with 37 tools. This week we cut 9 of them. Here's why.") — that's the hook the founder's network responds to.

---

## Cross-references

- Internal audit (the full read-only pass): `t2000/spec/archive/v07e/AUDIT_V07E_EARNS_ITS_KEEP_2026-05-23.md`
- Engine changelog: `t2000/packages/engine/CHANGELOG.md` (2.18.0 entry)
- Build tracker: `t2000/audric-build-tracker.md` (S.277 entry)
- npm: `@t2000/engine@2.18.0`, `@t2000/sdk@2.18.0`
- Audric Vercel deploy: post-2026-05-23 ~18:00 AEST (engine bump commit `2cce698`)
