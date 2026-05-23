# AUDIT — "Earns Its Keep" tool/feature pass (S.274)

> **Status:** READ-ONLY audit · 1-page exec at top · 3 buckets only · 1 concrete recommendation
> **Author:** Agent under founder direction (S.274 backlog item)
> **Date:** 2026-05-23 ~16:30 AEST
> **Scope:** every user-facing capability in Audric — 31 engine tools, 14 MCP skills, 9 canvas templates, 14 guards, 4 production crons (not 5 — see §3.5), 18 server env vars + 4 client env vars
> **Predecessor evidence:** S.269 (template-divergence audit — different lens), founder smoke 2026-05-23 ~15:00 AEST: *"why we even included BRAVE_API_KEY web search is it even needed for our product, this is the kind of lens we should have for everything?"*
> **Lock:** awaits founder triage of §7 Q1–Q5

---

## 1. Executive summary (1 page)

**Why this audit exists.** S.269 audited the **plumbing** (env-threading, auth seams, SWR patterns, dead code). It did not audit **whether each tool / skill / guard / cron / env var earns its keep against Audric's actual product story** (Passport · Intelligence · Finance · Pay · Store). The founder asked the right question: if we're a financial agent, why do we have a general-purpose web search tool?

**Headline finding.** **6 of 31 tools** are weakly aligned with the 5-product story; **2 of 14 guards are structurally dead** post-S.245 (pay_api deletion); **1 env var pair stays for a future feature that may never activate**; **3 doc-drift fixes** caught in passing.

**Bucket totals.**

| Surface | Total | KEEP | CUT NOW | WATCH (with telemetry) |
|---|---|---|---|---|
| Engine tools | 31 | 25 | 3 (Volo trio) | 3 (web_search + protocol_deep_dive + explain_tx) |
| Engine guards | 14 | 12 | 2 (costWarning + artifactPreview — structurally dead) | 0 |
| Canvas templates | 9 | 9 | 0 | 0 (set usage telemetry, decide in 2 weeks) |
| MCP skills | 14 | 13 | 0 | 1 (t2000-contacts — couples to CLI-CONTACTS-CLEANUP) |
| Production crons | 4 | 4 | 0 | 0 |
| Server env vars | 18 | 16 | 0 (BRAVE pairs with web_search — CUT if tool cuts) | 2 (BRAVE_API_KEY, NEXT_PUBLIC_AUDRIC_WEB_URL) |

**Recommendation in one sentence.** Ship a **time-boxed ~4-5h "cut Volo + retire dead guards + telemetry-watch the 3 read tools" slice**. The Volo trio (3 tools + 1 card + 1 sponsored-tx case) is the only clear DELETE — Volo SUI staking doesn't slot into any of the 5 Audric products (Passport / Intelligence / Finance / Pay / Store) and isn't surfaced via any chip. The 3 watch-candidates (web_search · protocol_deep_dive · explain_tx) each have a defensible "could be useful" story; wire `SessionUsage.toolNames` aggregation, look at 2 weeks of production data, then decide. The 2 dead guards have zero risk because no current tool triggers them.

**What the founder's web_search question revealed.** The tool surface accreted around what was easy to build, not what fits the product story. Three of the 6 suspects (the Volo trio) are a clear miss: liquid staking is a different financial primitive from USDC-canonical savings, and shipping it adds tool-budget cost + system-prompt real estate cost + 1 more thing to break. The other 3 (web_search, protocol_deep_dive, explain_tx) have weaker product fit but are cheaper to keep — measure first.

**Sequencing call.** Slot the cut-slice AHEAD of S.272 + PIPELINE-AUDIT-PHASE-2 as planned. Fits a single-day session, doesn't touch the 02:30 cron storm domain (S.272) or the on-chain pipeline (PIPELINE-AUDIT). Telemetry wiring is a separate ~2h ship that can land same-day.

**Bug-class disposition.**
- Volo trio — clear CUT (no product fit, no chip, no Audric story). ~2h slice.
- 2 dead guards (`costWarning`, `artifactPreview`) — clear DELETE (no current tool triggers them). ~30 min.
- 3 suspect read tools — WATCH with telemetry. ~2h to wire `SessionUsage.toolNames` aggregation + dashboard SQL. Re-decide in 2 weeks.
- 3 doc-drift fixes — KEEP for inclusion (free; same session as the deletes).

---

## 2. Methodology

| Step | What I did | Why |
|---|---|---|
| 2.1 | Read `packages/engine/src/tools/index.ts` + every suspect tool file | Confirm the 31-tool surface + ground-truth descriptions / dependencies |
| 2.2 | Read `apps/web-v2/lib/audric/system-prompt.ts` § "Tool usage" + "Routing" | Verify which tools the prompt steers users toward |
| 2.3 | Read `apps/web-v2/lib/chip-configs.ts` | The 7 chips are the user-visible surface — anything NOT a chip relies on LLM judgment |
| 2.4 | Read `apps/web-v2/components/audric/tool-result-router.tsx` | Verify each tool has a UI card (otherwise the result is null-rendered) |
| 2.5 | `wc -l t2000-skills/skills/*/SKILL.md` + read each skill's frontmatter | Bucket the 14 baked-into-MCP skills |
| 2.6 | Read `packages/engine/src/tools/canvas.ts` `CANVAS_TEMPLATES` | The 9 templates are stable; check coverage vs chip set |
| 2.7 | Read `packages/engine/src/guards.ts` full file | 14 guards enumerated; cross-check each guard's trigger against current tool flags |
| 2.8 | `rg "costAware:" packages/engine/src/tools/` | Confirm zero tools set the flag → `costWarning` guard is dead code |
| 2.9 | Read `apps/web-v2/vercel.json` + every `app/api/cron/*/route.ts` head | Production cron inventory — vercel.json is the SSOT |
| 2.10 | Read `apps/web-v2/lib/env.ts` full file | Server-side env var inventory + required-vs-optional rationale |
| 2.11 | Cross-reference findings with `audric/HANDOFF_NEXT_AGENT.md` + `t2000/spec/SPEC_INVENTORY_SSOT.md` | Avoid duplicating S.269 plumbing fixes or staking out work that's already booked |

Total: ~90 minutes read-only investigation. Zero edits. All findings traced to file:line.

---

## 3. Findings by surface

### 3.1 Engine tools (31)

**KEEP (25) — clear product fit.** These earn keep because each one slots directly into a chip flow OR into the read tools the LLM needs to render a confirm card / chart / receipt.

| Bucket | Tools | Rationale |
|---|---|---|
| Read · Finance core | `balance_check`, `savings_info`, `health_check`, `rates_info`, `swap_quote`, `token_prices`, `portfolio_analysis`, `transaction_history`, `pending_rewards` | Every Finance write needs these to set context + render confirm cards |
| Read · Analytics | `spending_analytics`, `yield_summary`, `activity_summary` | Power 5 of 9 canvas templates (spending_breakdown, full_portfolio, activity_heatmap, portfolio_timeline). Chips: Charts |
| Read · Identity | `resolve_suins` | Powers `@audric` directory + send-to-name. Recently shipped (S.263). Load-bearing for Audric Passport identity story |
| Read · Pay | `create_payment_link`, `list_payment_links`, `cancel_payment_link` | Audric Pay surface. Absorbs invoicing per V07E_INVOICE_DEPRECATION (S.269 item 7) |
| Read · Canvas | `render_canvas` | Universal viz primitive (9 templates). Chips: Charts, Receive |
| Write · Finance | `save_deposit`, `withdraw`, `borrow`, `repay_debt`, `claim_rewards`, `harvest_rewards`, `swap_execute` | Every chip in {Save, Credit, Swap, Harvest} routes here |
| Write · Pay | `send_transfer` | Chips: Send |

**SUSPECT — apply individual lens (6):**

#### 3.1.1 `volo_stats` + `volo_stake` + `volo_unstake` — **CUT (3 tools)**

- **Files:** `packages/engine/src/tools/volo-{stats,stake,unstake}.ts` + `apps/web-v2/components/audric/cards/StakingCard.tsx` + 2 cases in `audric-chat-client.tsx` sponsored-tx switch (lines 1454, 1461, 1516).
- **Why CUT:** Volo SUI liquid staking is a separate financial primitive from Audric Finance's USDC-canonical savings (locked in `.cursor/rules/savings-usdc-only.mdc`). Audric's product story is:
  - **Save** → NAVI USDC/USDsui lending (covered by `save_deposit`)
  - **Credit** → NAVI USDC/USDsui borrowing (covered by `borrow`)
  - **Swap** → Cetus multi-DEX aggregator (covered by `swap_execute`)
  - **Send/Receive** → USDC transfers + payment links

  vSUI liquid staking doesn't slot into any of these. The system prompt's lone mention is *"Best yield on SUI: compare rates_info + volo_stats"* — a fallback comparison framing, not a primary user need. **No chip surfaces Volo** (see `lib/chip-configs.ts` — 7 chips, no Stake).

- **What the user actually wants when they say "stake my SUI":**
  1. If they want SUI yield → swap SUI → USDC → save (existing Finance flow, captures the same yield via fee-bearing pools)
  2. If they specifically want vSUI exposure → use any wallet w/ Cetus (vSUI is a normal SPL token; `swap_execute(SUI → vSUI)` already works)

- **What we save:** 3 tools (frees ~3 entries in system prompt's tool budget), 1 sponsored-tx card branch (StakingCard.tsx, ~50 LoC), 2 cases in audric-chat-client.tsx (volo-stake / volo-unstake intent mapping). Engine bumps minor.

- **What we lose:** zero chip flows, zero documented user requests in the smokes / build tracker. The lone production caller is the LLM's "best yield on SUI" comparison and it's marginal.

#### 3.1.2 `web_search` — **WATCH (telemetry, decide 2026-06-06)**

- **File:** `packages/engine/src/tools/web-search.ts` (BRAVE_API_KEY-backed).
- **Why WATCH not CUT:** the founder's question (and this audit's catalyst) suggests *strong intuition* that it doesn't fit. But:
  - System prompt steers users toward it: *"For web search / news / current info, use web_search (free)."* (system-prompt.ts:184). Removing the tool without removing the prompt steer → LLM still tries to call it → error narration.
  - UI card exists (`SearchResultsCard.tsx`).
  - One semi-defensible use case: *"what's happening with NAVI today?"* (news / governance / hack alerts) — `protocol_deep_dive` covers safety metrics but not breaking news.
  - Cost is small: $1/1K queries on Brave's free tier, key currently `optionalString` (degrades gracefully if unset).
- **Cut blocker:** **no production telemetry.** We don't know how often it's called. Estimate from the smoke log: ~0 invocations in the last week of founder smokes.
- **Action:** wire `SessionUsage.toolNames` aggregation (~30 min — schema already has the column, need a Postgres query + a 1-page dashboard SQL). Look at 2 weeks of prod data. If <1% of turns invoke `web_search`, cut it + BRAVE_API_KEY in a same-day slice.

#### 3.1.3 `protocol_deep_dive` — **WATCH (telemetry, decide 2026-06-06)**

- **File:** `packages/engine/src/tools/protocol-deep-dive.ts` (DefiLlama-backed).
- **Why WATCH not CUT:** Lone production consumer of `api.llama.fi` per `.cursor/rules/agent-harness-spec.mdc` (intentionally kept after v1.4 BlockVision migration). Returns TVL trend + audit count + 24h fees + safety score. Has unique value for *"is X safe?"* answers that BlockVision (which doesn't ship audit metadata) cannot replicate.
- **Cut argument:** Audric's product story is the 5 named products + on-chain reality the user has. Protocol metadata is adjacent ("research" not "action"). System prompt has a dedicated steer (line 189): *"For protocol safety/audit info, use protocol_deep_dive."*
- **Action:** same telemetry as web_search. If <1% usage, cut + remove DefiLlama dependency entirely (last consumer). If 1-10% usage, keep — the data is genuinely unique.

#### 3.1.4 `explain_tx` — **WATCH (telemetry, decide 2026-06-06)**

- **File:** `packages/engine/src/tools/explain-tx.ts` (Sui RPC-backed, free).
- **Why WATCH not CUT:** Overlaps with `transaction_history` (which already decodes the user's own tx). Unique use case: explain an *arbitrary* tx digest someone shares (link-share, support, debugging). Cheap to keep (Sui RPC is free + already configured).
- **Cut argument:** rare-use case; the prompt-budget cost is real (one extra tool line + one extra system prompt steer on line 190).
- **Action:** same telemetry; if usage is non-zero but rare (1-5%), defensible to keep. If 0%, cut.

#### Tool-surface SUMMARY

| Bucket | Action | Tool count delta |
|---|---|---|
| KEEP (25) | No-op | 0 |
| **CUT (3 Volo)** | Delete `volo-stake.ts`, `volo-unstake.ts`, `volo-stats.ts` + 1 card + 2 audric-side cases | **31 → 28** |
| **WATCH (3 read)** | Add telemetry; decide 2026-06-06 | 0 (today) |

### 3.2 Engine guards (14)

**KEEP (12 of 14).**

| Guard | Tier | Why KEEP |
|---|---|---|
| `inputValidation` (preflight) | Universal | Every write tool needs it (`packages/engine/src/tools/preflight-coverage.test.ts`) |
| `retryProtection` | Safety | Bounds double-pay risk for any tool that records `paymentConfirmed` |
| `addressSource` | Safety | Root-cause fix for "LLM types address from memory" — load-bearing for `send_transfer` |
| `assetIntent` | Safety | Root-cause fix for "send 5 SUI" silently sending USDC |
| `addressScope` | Safety | Root-cause fix for "show 0x40cd's balance" returning the signed-in user's data |
| `swapPreview` | Safety | Forces a real `swap_quote` before `swap_execute` (LLM hallucination bound) |
| `irreversibility` | Safety | Universal; just a "show preview" nudge for `irreversible: true` tools |
| `balanceValidation` | Financial | Universal write-tool freshness check |
| `healthFactor` | Financial | NAVI borrow safety net (warn < 2.0, block < 1.5) |
| `largeTransfer` | Financial | `send_transfer` $50/$500 thresholds |
| `slippage` | Financial | `swap_execute` UX (LLM must state expected output) |
| `staleData` (post-execution) | UX | Universal post-write balance-staleness hint |

**CUT (2 of 14) — structurally dead post-S.245.**

#### 3.2.1 `costWarning` — **CUT (dead)**

- **File:** `packages/engine/src/guards.ts:482-502`. Triggers when `tool.flags.costAware === true`.
- **Why dead:** `rg "costAware:" packages/engine/src/tools/` returns **0 matches**. The `costAware` flag is referenced only in `guards.ts`, `tool-flags.ts` (type definition), and `types.ts`. **No current engine tool sets it.**
- **Historical context:** the flag existed for `pay_api` (MPP-paid third-party API tool), which was deleted in S.245 (2026-05-22 / V07E_D_QUESTION_AUDITS D-2 reframe). With `pay_api` gone, the guard is unreachable.
- **Action:** delete the guard function + the `costAware` flag from `Tool.flags` + the `costWarning` field from `GuardConfig`. ~15 min. Zero behavior change.
- **Future:** if Audric Store SPEC (V07F Stream A) re-introduces a paid-API tool, re-add the guard at that point.

#### 3.2.2 `artifactPreview` — **CUT (dead)**

- **File:** `packages/engine/src/guards.ts:901-920`. Post-execution hint that fires when a tool result contains `url` matching `/\.(png|jpg|jpeg|webp|gif|svg)/i` OR `/\.pdf/i`.
- **Why dead:** the only engine tools that returned image/PDF URLs were `pay_api`'s gateway responses (image gen, PDF compose, transcription artifact URLs). All gone in S.245. Current tools' returns:
  - Engine read tools return JSON shapes (balances, rates, history rows, prices, profiles).
  - Engine write tools return tx digests + receipts (no URLs to image/PDF).
  - Canvas templates return inline data structures (no external image URLs).
- **Action:** delete the function + the call site in `postExecutionGuards`. ~15 min.
- **Future:** if Audric Store SPEC re-introduces image/PDF artifact returns, re-add.

**Guard-surface SUMMARY:** 14 → 12. Zero risk (no current tool triggers either deleted guard). Engine bumps minor.

### 3.3 Canvas templates (9)

All 9 alive. Each maps to either an explicit chip or a free-text routing rule.

| Template | Powered by | Chip? | KEEP? |
|---|---|---|---|
| `activity_heatmap` | `activity_summary` | Charts (via routing) | KEEP |
| `portfolio_timeline` | `PortfolioSnapshot` cron + analytics | Charts | KEEP |
| `yield_projector` | pure client-side simulator | Charts (free-text) | KEEP (zero data cost) |
| `health_simulator` | `health_check` + simulator | Charts (free-text) | KEEP (zero data cost) |
| `dca_planner` | pure client-side simulator | Charts (free-text) | KEEP (zero data cost) |
| `spending_breakdown` | `spending_analytics` | Charts | KEEP |
| `watch_address` | `portfolio_analysis(address)` | Free-text "show alice.sui's portfolio" | KEEP |
| `full_portfolio` | 4-panel composite | Charts → primary | KEEP |
| `receive_address` | wallet + QR primitive | **Receive** (S.266) | KEEP |

**Action:** zero cuts. **Add usage telemetry** in the same ~2h slice as tools (track which templates the LLM renders most). If `dca_planner` / `health_simulator` / `yield_projector` show <1% usage over 4 weeks, revisit — pure simulators are cheap to keep but they cost system-prompt real estate.

### 3.4 MCP skills (14)

Skills are baked into `@t2000/mcp` at build time and exposed to external clients (Cursor / Claude Desktop / Codex CLI) as MCP prompts. **Not used by Audric web-v2** (the `skillRecipeBlock` is a v0.7d gate that was never wired — confirmed in `apps/web-v2/lib/audric/system-prompt.ts:23` + `app/api/chat/route.ts:978`: `skillRecipeBlock: undefined`).

| Skill | LoC | Role | KEEP? |
|---|---|---|---|
| `t2000-engine` | 247 | Developer guide for building on `@t2000/engine` | KEEP (meta) |
| `t2000-mcp` | 203 | Developer guide for MCP integration | KEEP (meta) |
| `t2000-pay` | 408 | MPP pay flow via `t2000_pay` + `t2000_services` (alive in MCP per S.256) | KEEP |
| `t2000-rebalance` | 123 | Multi-step rebalance orchestration | KEEP |
| `t2000-account-report` | 71 | Multi-tool account snapshot | KEEP |
| `t2000-safeguards` | 96 | Safety primer for LLM agents | KEEP |
| `t2000-save` / `t2000-withdraw` / `t2000-borrow` / `t2000-repay` | 51-107 each | Direct op-skills (CLI + MCP) | KEEP |
| `t2000-send` / `t2000-receive` / `t2000-check-balance` | 51-92 each | Direct op-skills | KEEP |
| `t2000-contacts` | 83 | CLI-only — reads `~/.t2000/contacts.json` | **WATCH** (couples to CLI-CONTACTS-CLEANUP backlog item #7) |

**Skill-surface SUMMARY:**
- **All 14 KEEP today.** No clear CUT candidate.
- **WATCH `t2000-contacts`:** the engine `saveContactTool` was deleted in S.269 item 6, but the CLI `contacts.json` system is still alive (the skill is correct for the CLI context, just not the Audric web context — which doesn't use skills anyway). When `CLI-CONTACTS-CLEANUP` ships (backlog item #7 — SuiNS replaces the local file), update or delete this skill.

**Skill staleness findings (doc drift, NOT "earn keep" — fix opportunistically):**

| Skill | Claim | Reality |
|---|---|---|
| `t2000-engine` line 19 | *"37 financial tools (25 read + 12 write)"* | **31 tools (21 read + 10 write)** — stale since S.245 + S.269 + V07E_INVOICE_DEPRECATION |
| `t2000-mcp` line 20 | *"29 tools and 14 prompts"* | ✅ Accurate (15 read + 12 write + 2 safety = 29 MCP tools; 14 hand-rolled prompts) |
| `t2000-pay` line 54 | *"40 services, 88 endpoints"* | Unverified — gateway endpoint count drifts over time; counts should derive from a live endpoint not be hardcoded |

### 3.5 Production crons (4 — NOT 5)

**Doc drift caught.** `audric/HANDOFF_NEXT_AGENT.md` line 23 says: *"5 production crons in web-v2/vercel.json (`financial-context-snapshot`, `portfolio-snapshot`, `turn-metrics-pending-sweep`, `turn-metrics-cleanup`, `conversation-log-retention`)"*. `apps/web-v2/vercel.json` actually has **4 crons** — `conversation-log-retention` is gone because the `ConversationLog` Prisma model was deleted in S.254. **`audric/HANDOFF_NEXT_AGENT.md` should be amended to "4" when this audit ships.**

| Cron | Schedule | Purpose | KEEP? |
|---|---|---|---|
| `financial-context-snapshot` | 02:30 UTC | Daily `<financial_context>` block for system prompt — Memory backbone | KEEP (load-bearing; subject of S.272 fix) |
| `portfolio-snapshot` | 07:00 UTC | Daily `PortfolioSnapshot` row → powers `portfolio_timeline` canvas | KEEP |
| `turn-metrics-cleanup` | 03:00 UTC | 90d retention for `TurnMetrics` + `AdviceLog` | KEEP (compliance + cost) |
| `turn-metrics-pending-sweep` | every 5 min | Stamps stale `pending` outcomes as `timeout` | KEEP (dashboard hygiene) |

**Action:** zero cuts. Fix the doc drift (5 → 4) in handoff + SSOT.

### 3.6 Environment variables (18 server + 4 client)

**Required (8 server, 3 client) — KEEP all.**

`DATABASE_URL`, `BLOCKVISION_API_KEY`, `ENOKI_SECRET_KEY`, `T2000_INTERNAL_KEY`, `AUDRIC_INTERNAL_API_URL` (server) + `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_ENOKI_API_KEY`, `NEXT_PUBLIC_SUI_NETWORK` (client) — every one is load-bearing for at least one of the 5 Audric products. Schema documents each at length in `apps/web-v2/lib/env.ts:58-323`.

**Optional + clearly load-bearing (KEEP):** `ANTHROPIC_API_KEY` (LLM), `AI_GATEWAY_API_KEY` (gateway path), `SUI_RPC_URL` (override), `REDIS_URL` (rate limiter), `MEMWAL_*` trio (Memory), `CRON_SECRET` (cron auth), `AUDRIC_PARENT_NFT_PRIVATE_KEY` (identity mint), `AUDRIC_MINT_CONCURRENCY_LIMIT` (rate-limit tunable).

**Suspect (2):**

#### 3.6.1 `BRAVE_API_KEY` — **CUT if web_search cuts**

- Paired 1:1 with `web_search`. If §3.1.2 telemetry shows <1% usage → cut both together.
- **No separate action today.** Folded into the web_search decision.

#### 3.6.2 `NEXT_PUBLIC_AUDRIC_WEB_URL` + `audricWebUrl()` helper — **WATCH**

- Env var (`apps/web-v2/lib/env.ts:322`) + helper (`apps/web-v2/lib/audric-web-url.ts`).
- Original purpose: cross-app fetches from web-v2 → apps/web during the v0.7c migration window. **Post-S.253 (apps/web archived 2026-05-22), the cross-app use case is dead.**
- Today's consumers (10 files):
  - `app/api/internal/payments/route.ts` — **NO LONGER USES IT post-S.273** (uses `request.nextUrl.origin` now)
  - `lib/swr/user-preferences.ts`, `lib/identity/check-fetcher.ts`, `lib/profile-portfolio.ts`, 5 components — same-origin fallback (relative paths). Helper's default behavior IS correct same-origin; env var only needed if cross-origin needed.
- **Lean:** the env var is dormant — it's `optionalString` and defaults to unset. The helper has surviving consumers but they don't need the env var anymore. **WATCH** — audit the 10 consumers in a follow-up; if all are confirmed same-origin-safe, delete the env var + simplify the helper. ~30 min when scoped. Don't bundle here.

#### 3.6.3 `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — **WATCH (safety net)**

- Env schema comment is honest: *"today web-v2 has zero auto-tier writes in production (all confirm-tier; user always taps), so the accumulator never fires."* (env.ts:175)
- Today these env vars feed a session-spend ledger that is **dead-code-ready in production** because no current write tool resolves to the auto tier (the conservative preset's `globalAutoBelow: 5` exists, but in practice users have `balanced` or `aggressive` rarely activated).
- **Keep wired:** they're the SAFETY NET for any future activation of auto-tier writes (the `autonomousDailyLimit` downgrade rule). Cost of keeping: $0 (the Upstash instance is shared with `audric-web` Vercel project per the doc).
- **No action.** If the auto-tier writes are still inactive 90 days from now, revisit whether to delete the wiring or keep as defense-in-depth.

**Env-surface SUMMARY:** zero cuts today. 1 cut-candidate (BRAVE) paired with §3.1.2 decision. 1 watch (`NEXT_PUBLIC_AUDRIC_WEB_URL` — dormant post-S.273).

---

## 4. Bucket A — KEEP

> Surfaces that clearly earn their keep. No action.

- **25 of 31 engine tools** — every Audric chip + every system-prompt routing rule slots into one of these.
- **12 of 14 guards** — all load-bearing for safety, financial, or UX correctness.
- **All 9 canvas templates** — each maps to either a chip or a free-text routing rule. (Add usage telemetry for the 3 pure simulators in case they're never opened.)
- **13 of 14 MCP skills** — meta-skills + op-skills are all alive in CLI + MCP contexts.
- **All 4 production crons** — load-bearing for Memory, charts, retention, dashboard hygiene.
- **16 of 18 server env vars + 3 of 4 client env vars** — required or actively-degraded-but-safe.

---

## 5. Bucket B — CUT NOW

> Concrete deletes. Each is independently revertable.

### 5.1 Volo trio (3 tools + 1 card + 2 audric-side cases)

- **Engine deletes:**
  - `packages/engine/src/tools/volo-stake.ts`
  - `packages/engine/src/tools/volo-unstake.ts`
  - `packages/engine/src/tools/volo-stats.ts`
  - 3 entries in `packages/engine/src/tools/index.ts` (READ_TOOLS array + WRITE_TOOLS array + exports)
  - `narrateHarvestResult`-style narrators — check if any reference Volo
- **Audric deletes:**
  - `apps/web-v2/components/audric/cards/StakingCard.tsx`
  - `apps/web-v2/components/audric/tool-result-router.tsx` — `case "volo_stats":` branch
  - `apps/web-v2/app/chat/audric-chat-client.tsx` — 2 cases (lines 1454, 1461 in switch; lines 1516-1518 in sponsored-tx) handling `volo_stake` / `volo_unstake` / `volo-stake` / `volo-unstake`
  - System prompt steer: `apps/web-v2/lib/audric/system-prompt.ts:272` (*"Best yield on SUI: compare rates_info (NAVI lending) + volo_stats (vSUI liquid staking)."*) → rewrite to remove Volo reference, OR delete the bullet entirely if "best yield on SUI" reduces to "swap SUI → USDC → save"
  - System prompt write-tool list: `apps/web-v2/lib/audric/system-prompt.ts:172` — drop `volo_stake, volo_unstake` from the list
- **Tool count delta:** 31 → 28. Engine bumps **minor** (semver: removing a tool is a contract change for any consumer reading `READ_TOOLS` / `WRITE_TOOLS`).
- **Effort:** ~2h (engine + audric + system prompt edits + smoke verifying no regressions in Save / Send / Swap / Borrow flows).
- **Verify:**
  - Engine tests pass (`pnpm --filter @t2000/engine test`).
  - Audric typecheck passes (`pnpm --filter @audric/web-v2 typecheck`).
  - Smoke: "swap 1 SUI for vSUI" → LLM routes to `swap_execute(SUI → vSUI)` not `volo_stake` (verifies the Cetus fallback path works).

### 5.2 `costWarning` + `artifactPreview` guards

- **Engine deletes:**
  - `packages/engine/src/guards.ts` — `guardCostWarning` function + call site + `costWarning` config field + `guardArtifactPreview` function + call site + `artifactPreview` config field
  - `packages/engine/src/tool-flags.ts` — `costAware` flag from `ToolFlags` type
  - `packages/engine/src/types.ts` — `costAware?` from `ToolFlags` interface
  - `packages/engine/src/__tests__/guards-coverage.test.ts` — test cases for the deleted guards
- **Guard count delta:** 14 → 12. Engine bumps **minor**.
- **Effort:** ~30 min.
- **Verify:** existing guard tests still pass; `rg "costAware|artifactPreview" packages/engine/src/` returns 0 matches (or only inside this audit doc).

### 5.3 Doc drift (3 same-session fixes)

- `audric/HANDOFF_NEXT_AGENT.md` line 23 — "5 production crons" → "4 production crons" + drop `conversation-log-retention`.
- `t2000/t2000-skills/skills/t2000-engine/SKILL.md` line 19 — "37 financial tools (25 read + 12 write)" → "31 financial tools (21 read + 10 write)".
- `t2000/spec/SPEC_INVENTORY_SSOT.md` — add this audit to the active list (then immediately archive once it ships per the refresh discipline).

---

## 6. Bucket C — WATCH (telemetry-decide)

> Surfaces where the lean is "probably cut" but the data to decide doesn't exist yet. Cost of building telemetry is < cost of cutting wrong.

### 6.1 `web_search` + `protocol_deep_dive` + `explain_tx` — 2 weeks of usage telemetry

- **Build:** `SessionUsage.toolNames` column already exists (`apps/web-v2/prisma/schema.prisma:77`). Wire a single SQL aggregation:
  ```sql
  SELECT unnest("toolNames") AS tool, COUNT(*) AS uses
  FROM "SessionUsage"
  WHERE "createdAt" > NOW() - INTERVAL '14 days'
  GROUP BY 1 ORDER BY 2 DESC;
  ```
- Add an internal `/api/admin/tool-usage` route (founder-only via internal-key) that returns the JSON. ~1h.
- Decision date: **2026-06-06** (2 weeks).
- Decision rule:
  - <1% of total tool invocations → CUT (delete tool + UI card + system prompt steer + BRAVE_API_KEY if applicable + DefiLlama dependency if applicable).
  - 1-5% → KEEP but consider hiding from the system prompt's primary routing list (let LLM find it via descriptions only).
  - 5%+ → KEEP.

### 6.2 Canvas template usage telemetry (same SQL job)

- Extend the aggregation to `render_canvas` arguments — extract `params.template` from `SessionUsage.toolNames` rows. Tells us which of the 9 templates the LLM actually renders.
- If `dca_planner` / `health_simulator` / `yield_projector` show <1% over 4 weeks, revisit (they're pure simulators — cheap to keep but each costs a system-prompt entry).

### 6.3 `t2000-contacts` skill

- Couple to backlog item #7 `CLI-CONTACTS-CLEANUP`. When SuiNS replaces the CLI `contacts.json` artifact, update or delete the skill in the same ship.
- **No standalone action.**

### 6.4 `NEXT_PUBLIC_AUDRIC_WEB_URL` env var + helper

- Post-S.273 the env var is dormant (no surviving cross-origin consumers). Audit the 10 helper callers — if all are confirmed same-origin-safe, delete the env var + simplify the helper to a relative-path-only fn. ~30 min standalone slice when time permits.
- **No standalone action today.**

---

## 7. Recommendation — S.274 the-ship (~4-5h)

**Concrete numbered slice. Each item is independently revertable. Ship in the order listed.**

| # | Item | Bucket | Files | Effort | Risk | Verifies |
|---|---|---|---|---|---|---|
| 1 | Delete Volo trio from engine | CUT | `volo-{stats,stake,unstake}.ts` + `tools/index.ts` exports | ~30 min | Low | `pnpm --filter @t2000/engine test` |
| 2 | Delete Volo references from audric web-v2 | CUT | `StakingCard.tsx`, `tool-result-router.tsx`, `audric-chat-client.tsx`, `system-prompt.ts` (steer + write-list) | ~45 min | Low | Typecheck + smoke ("swap SUI to vSUI" routes via `swap_execute`) |
| 3 | Delete `costWarning` + `artifactPreview` guards | CUT | `guards.ts`, `tool-flags.ts`, `types.ts`, test files | ~30 min | None | Guard tests still pass |
| 4 | Wire `SessionUsage.toolNames` telemetry endpoint | WATCH (build) | New: `app/api/admin/tool-usage/route.ts` (internal-key guarded) | ~1h | None | Curl returns aggregated counts |
| 5 | Doc drift fixes | KEEP-side | `HANDOFF_NEXT_AGENT.md` (5→4 crons), `t2000-engine/SKILL.md` (37→31 tools), `SPEC_INVENTORY_SSOT.md` (add this audit) | ~15 min | None | Search the corrected docs returns no stale references |
| 6 | Engine release (one bump covers items 1 + 3) | release | `release.yml --field bump=minor` | ~10 min | Low | npm publish completes; audric bump to new engine |
| 7 | Update `audric-build-tracker.md` + `HANDOFF_NEXT_AGENT.md` | docs | both | ~15 min | None | Backlog reflects post-S.274 state |

**Total: ~3-4 hours.** Plus 2 weeks of telemetry observation for the 3 WATCH tools.

**Ship order rationale.**
- Items 1+2 (Volo cut) are the largest individual change; ship first so the rest of the audit's recommendations can stand on a smaller surface.
- Item 3 (dead guards) chains into the same engine release as item 1 (one minor bump).
- Item 4 (telemetry) is the longest individual step (~1h) but blocks the 2-week WATCH decisions; ship same-day.
- Item 5 (doc drift) is free; bundles with the engine release commit.

**What we DELIBERATELY DO NOT touch in S.274:**
- `web_search` / `protocol_deep_dive` / `explain_tx` (need telemetry first — re-decide 2026-06-06)
- All 9 canvas templates (add usage telemetry, decide in 4 weeks)
- `t2000-contacts` skill (couples to backlog item #7 CLI-CONTACTS-CLEANUP)
- `NEXT_PUBLIC_AUDRIC_WEB_URL` (separate ~30-min slice when time permits)
- `UPSTASH_REDIS_REST_*` (keep as future safety net)
- S.272 (BlockVision/DeFi cron — separate domain, separate SPEC)
- PIPELINE-AUDIT-PHASE-2 (S1+S2+S3+S5 from `AUDIT_ON_CHAIN_PIPELINE_2026-05-23.md` — separate ship)

**Sequencing call.** Slot S.274 ship between today (post-S.276 spec cleanup) and 2026-05-29 (MemWal stability gate). Comfortably fits one session. Doesn't touch the v0.7c soak observation (2026-05-28 gate is now mostly cosmetic per S.276).

---

## 8. Open questions for founder triage

### Q1 — Cut all 3 Volo tools, or keep `volo_stats` (read-only) and only cut the 2 writes?

- **Cut all 3 (recommended):** the stats tool exists to support the writes. Without `volo_stake`/`volo_unstake`, the stats tool has no audience — the system prompt steer ("Best yield on SUI: compare rates_info + volo_stats") is the only thing keeping it called, and that steer goes away in item 2.
- **Keep `volo_stats`:** if you want the LLM to be able to compare APYs for "what's the best yield on SUI" answers without offering execution. Cost: 1 tool slot in the prompt budget, no UX cost (the card already exists). Marginally defensible if you want the comparison without the action.

### Q2 — Wire the telemetry NOW or defer until founder asks for the 2-week decision?

- **NOW (recommended):** ~1h cost, no decision-impact. Without it, the §3.1.2-§3.1.4 WATCH bucket can't close — we'd be re-arguing the same intuition in 2 weeks instead of arguing the data.
- **DEFER:** if you trust your intuition on web_search / protocol_deep_dive / explain_tx and want to cut them now without measurement. Saves 1h, but the next "earn its keep" question (the next 1-month surfaces — chips? Memory recall depth? Permission-tier presets?) lands without infrastructure.

### Q3 — Cut the 2 dead guards in the same engine release, or as a separate cleanup?

- **Same release (recommended):** one engine bump (minor) covers items 1 + 3. Cleaner npm changelog.
- **Separate:** if you want to test the Volo cut in isolation. Marginal value — both deletes are zero-risk.

### Q4 — Engine minor or patch bump?

- **MINOR (recommended):** removing a tool from `READ_TOOLS` / `WRITE_TOOLS` is a contract change for any external consumer reading those arrays. Audric is the only consumer today, but the rule from SemVer is clear.
- **PATCH:** treat as internal cleanup since external consumers are zero. Loses the "behavior change downstream consumers opt into" signal.

### Q5 — Surface this audit doc to anyone else (LinkedIn, GitHub, Discord)?

- **NO (recommended):** internal audit. Cut decisions communicated via engine changelog when they ship.
- **YES (the meta-narrative):** there's a story in *"we shipped 37 tools, audited honestly, cut to 28 to deepen product fit."* Could resonate with the agent-builder audience if you want to talk about quality > quantity in the tool surface. Costs: re-writing this internal doc for an external audience (~1h).

---

## 9. What this audit deliberately did NOT do

- Did NOT propose new tools. The lens was strictly "earns keep vs. cut" — no green-field additions.
- Did NOT touch S.272 (BlockVision/DeFi cron rate-limits — different domain).
- Did NOT touch PIPELINE-AUDIT-PHASE-2 (on-chain plumbing — different lens).
- Did NOT inventory the audric `lib/audric/*.ts` modules (S.269 already did, all earn keep).
- Did NOT inventory permission presets / chip configs (chips are locked at 7 per CHIP_REVIEW_3 / `lib/chip-configs.ts`).
- Did NOT propose UI changes. Cuts here are surface-area, not visual.
- Did NOT cut anything. Read-only first pass. Awaits founder triage of §7 Q1-Q5.

---

## 10. Cross-references

- **S.269** (2026-05-23 ~14:30 AEST) — template-divergence audit (different lens; plumbing not product fit). Output: 1-page audit + 8 items shipped.
- **S.245** (2026-05-22) — `pay_api` + `mpp_services` engine tools deleted per V07E_D_QUESTION_AUDITS D-2 reframe. Sets up the `costWarning` + `artifactPreview` dead-guard discovery.
- **S.253** (2026-05-22 ~22:00 AEST) — `apps/web` deleted. Sets up the `NEXT_PUBLIC_AUDRIC_WEB_URL` watch.
- **S.254** (2026-05-22) — `ConversationLog` model deleted. Sets up the "4 not 5 crons" finding.
- **S.273** (2026-05-23 ~15:00 AEST) — payment-link URL prefix fix (`audricWebUrl()` → `request.nextUrl.origin`). Sets up the `NEXT_PUBLIC_AUDRIC_WEB_URL` watch.
- **`.cursor/rules/savings-usdc-only.mdc`** — USDC/USDsui canonical for save/borrow. Anchors the Volo-isn't-savings argument.
- **`.cursor/rules/agent-harness-spec.mdc`** — `protocol_deep_dive` is the lone production consumer of DefiLlama post-v1.4 migration. Anchors the WATCH framing.
- **`.cursor/rules/safeguards-defense-in-depth.mdc`** — 14-guard contract. The cut to 12 is a contract change for any host using the engine's guard config; minor bump justified.
- **`apps/web-v2/lib/chip-configs.ts`** — 7-chip locked set (CHIP_REVIEW_3 / 2026-05-19). Volo doesn't appear; underpins the Volo-cut argument.
- **`audric/HANDOFF_NEXT_AGENT.md`** rank 0.5 — the S.274 backlog entry.
- **`t2000/spec/SPEC_INVENTORY_SSOT.md`** §1.1 — active SPEC list this audit will be added to (then archived at ship).

---

**END AUDIT — awaits founder triage of §8 Q1-Q5.**
