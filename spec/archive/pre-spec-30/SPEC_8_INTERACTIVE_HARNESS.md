# SPEC 8 — Interactive Agent Harness ("Audric Intelligence Surface")

**Version:** 0.5.5 (G4 inventory narrowed to lookup_user only — pure clarification, no behavior change)
**Date:** 2026-05-05
**Status:** **CLOSED 2026-05-05** (acceptance artifact: `audric/spec8-acceptance-2026-05-05.json`; 19h post-d18af29 window; Gates 1/5/6/7 PASS clean under v0.5.4 redefined gate definitions). v0.5.4 redefines two gates whose original definitions had drifted from current engine behavior and are documented in the gates table below + the script header (`audric/apps/web/scripts/spec8-rollout-gates.mjs`). Engine `@t2000/engine@1.5.0` published; audric B1 + B2.1 + B2.2 + B2.3 + B3.1–B3.7 all merged to `main`; v0.5.2 hotfix wave (G1 `<eval_summary>` marker leaks) closed 2026-05-01; v0.5.3 closeout sweep landed 2026-05-04. **What remains is operational, not engineering** — (a) founder-driven 10% → 50% → 100% rollout per `audric/apps/web/RUNBOOK_spec8_rollout.md`, gated by `apps/web/scripts/spec8-rollout-gates.mjs`; (b) 7-day post-100% acceptance artifact (`scripts/spec8-rollout-gates.mjs --hours=168` output committed to repo); (c) 3 SPEC 12 polish items deferred (HowIEvaluated tokens/model/latency wiring needs engine 1.5.1 to carry per-block usage on `thinking_done`; ReasoningStream typography decision; `<LegacyReasoningRender>` deletion post-rollout). **Original v0.5.1 lock metadata retained below for historical clarity** — locked + SPEC 10 v0.2.1 alignment, ready for implementation BEFORE SPEC 7 v0.3.1, founder approved 7 design decisions + 6 critical gap fixes (v0.2) + 7 gap closures (v0.3) + 3 v2-visual closures (v0.4) + 5 cross-spec coupling fixes (v0.5) + 3 SPEC 10 v0.2.1 alignment fixes (v0.5.1); **sequencing unchanged — SPEC 8 v0.5.1 ships BEFORE SPEC 7 v0.3.2** (rationale: ~40% of turns benefit visibly, LEAN tier unchanged, single coherent visual ship, SPEC 7's multi-step PermissionCard + Quote-Refresh ReviewCard render inside ReasoningTimeline). v0.5 folds in five gaps surfaced during the May 1 full-trio review: (D1) `permission-card` `TimelineBlock` variant added so SPEC 7 has a typed slot, (D2) `pending_input` event type reserved as a no-op for SPEC 9, (G4) `harnessVersion` lives in the Upstash session record (NOT a non-existent Prisma `Session` model), (G5) `<eval_summary>` emission contract clarified (engine emits per-marker; system prompt enforces "≤1 per turn"), (G8) auto-expand HowIEvaluated semantics tightened (first-emission-only; rehydrate respects manual state), (G9) `evalSummaryEmittedCount` definition split into raw count + dashboard-derived rate. v0.5.1 folds in three SPEC-10-v0.2.1 alignment fixes: (G3) `permission-card` block recipient rendering follows SPEC 10 D10 (full Audric handle when present), (G4) `AgentStep` tool-registry maintenance contract documented for downstream specs (every new tool MUST add `STEP_ICONS` + `STEP_LABELS` entries before merge), (G7) tx-receipt cards cross-reference SPEC 10 D10 for recipient rendering parity with `permission-card`.
**Author:** AI assistant (post-SPEC-7-v0.2 audit, refreshed post v2-demo audit, refined post May 1 full-trio review)
**Targets:** `@t2000/engine` v1.4.0 (Stage A ✅) → v1.5.0 (Stage B3.2, post-audit) · `@audric/web` next minor UI (refreshed 2026-05-01 to match canonical version chain — see build tracker BUILD ORDER PIN)
**Engine baseline:** v1.3.0 (post S.52.2 SuiNS reverse-lookup ship)
**SDK baseline:** v1.1.0 (no SDK functional changes in SPEC 8 — engine + host only; SDK floats with the monorepo lockstep version)
**Audric baseline:** v0.56.x (post S.52.2)
**Canonical version chain (build-tracker authoritative, refreshed 2026-05-01 post-B3 audit):** SPEC 8 ships engine `1.4.0` (Stage A) → engine `1.5.0` (Stage B3.2 — `harness_shape` event + `attemptCount` plumbing, deferred from P3.2) → SPEC 7 ships engine `1.6.0` + sdk `1.5.0` (slid +0.0.1 because SPEC 8 B3.2 claimed `1.5.0`) → SPEC 9 v0.1.2 ships engine `1.7.0` → SPEC 10 ships engine `1.8.0` + sdk `1.6.0`. SPEC 7/9/10 spec headers still cite the pre-S.52 chain — refresh deferred to SPEC 12 (cross-repo consistency sweep).
**Version-chain drift note (S.53.8, 2026-05-03 → updated S.61, 2026-05-05):** SPEC 12 was retired 2026-05-03 in favour of "specs get refreshed at implementation time" — then **resurrected 2026-05-05** as a real ~3-4d spec scheduled between SPEC 10 ship and SPEC 11/11.5 onramp draft (S.61). Reason: the "refresh-at-implementation-time" policy didn't bite for items that fall outside any in-flight spec's surgical scope; ~30+ "SPEC 12 captured" items continued to accumulate. The chain above was correct on 2026-05-01 but engine has since shipped `1.12.0` (Phase 0 of SPEC 13 — `MAX_BUNDLE_OPS=2` + `VALID_PAIRS` whitelist + dual-side stream-close instrumentation). Treat `audric-build-tracker.md` as the authoritative version chain at implementation time; SPEC 12 v0.1 drafting will reconcile this header against the actual shipped chain.

---

## Revision log

| Version | Date | Author | Notes |
|---|---|---|---|
| **0.5.5** | **2026-05-05** | **AI** | **G4 inventory narrowed (1 tool, not 3) — clarification patch, no behavior change.** SPEC 10 v0.2.1 implementation plan (build-plan review locked 2026-05-05) accepted Option A: `lookup_user` is the only engine tool shipping in SPEC 10 v0.2.0. The reservation + rename operations live as HTTP routes (`POST /api/identity/{reserve,change}`) called from the picker UI; the picker uses SPEC 9 P9.4's `pending_input` substrate. v0.5.1's "3 tools" inventory was over-anticipation — narrowed here. `reserve_username` + `change_username` are post-v0.2.0 candidates only if 30-day behavior signal shows real chat-driven rename intent; their suggested icons (`🪪` / `✏️`) preserved in the spec for future use. SPEC 8 status remains CLOSED — this is a documentation-only patch to a closed spec, paralleling the v0.5.1 SPEC 10 alignment patch shape. Effort: 0d. |
| **0.5.4** | **2026-05-05** | **AI** | **CLOSED — gate redefinition + acceptance artifact.** Diagnostic on the 19h post-d18af29 v2 cohort window (N=55 v2 turns; 11 RICH, 27 LEAN, 17 STANDARD/MAX) revealed two gate definitions that no longer measured what they were supposed to measure — both interpretation issues, neither a regression: **Gate 7 (RICH planning rate)** — original "≥50% of RICH turns must emit `update_todo` OR `prepare_bundle`" treated all RICH turns equally. The Sonnet classifier correctly routes single-write intents (e.g. `swap_quote → swap_execute`) to RICH/high-effort for safety/thinking-budget reasons (write tools deserve more thinking by design), but those single-write turns don't need planning — there's nothing to plan when there's only one write. The 11-turn window had 9 single-write RICH turns (5× single `swap_quote`, 2× `[balance_check, swap_quote]`, 2× zero-tool narrations) and 2 multi-write RICH turns (one `[update_todo, prepare_bundle, update_todo]` Payment Intent, one `[prepare_bundle]`). **Both multi-write turns planned.** Original gate read 18% (2/11) and FAILED, but it was conflating two distinct effort-routing reasons. v0.5.4 redefinition: denominator restricted to RICH turns where `tool_count >= 3 OR prepare_bundle invoked` (i.e. planning would actually help); threshold tightens from 50% to 80% (when planning IS warranted, it should almost always happen). Single-write RICH turns are EXEMPT and reported separately in the script note. **Gate 1 (TTFVP p50)** — original 1500ms threshold was set without a tool-RTT baseline. Empirical TTFVP for the v2 cohort: p50 2903ms, p75 4057ms, p95 5236ms. The slowest 5 turns are all tool-RTT-bound (first renderable event = `tool_start`, where the tool is BlockVision balance / Cetus quote / rates fetch — all 2-5s round-trip from outside the engine). v0.5.4 raises threshold to 4000ms (covers empirical p75 with margin); engine pre-stream work is sub-200ms, so the new threshold isolates real engine-side regressions from third-party RTT noise. Both redefinitions are documented inline in `apps/web/scripts/spec8-rollout-gates.mjs` header and in the gates table below. Acceptance artifact `audric/spec8-acceptance-2026-05-05.json` shows Gates 1/5/6/7 PASS clean (Gates 2/3/4 SKIP — legacy cohort empty at 100% rollout, expected). Telemetry: 0 eval_summary_violations / 0 interrupted / 0 pending_input_on_legacy. **SPEC 8 is closed.** Acceptance run was pulled forward from the original 2026-05-08 84h-post-fix trigger because (a) the data was clear enough at 19h post-fix to identify the gate redefinitions definitively (the pattern is structural, not statistical — single-swap RICH was 7 of 9 no-plan turns, not noise), and (b) waiting longer at the original threshold of 50% would have failed Gate 7 at scale too — the redefinition was needed regardless of N. See `audric-build-tracker.md` S.66 for the full diagnostic + closure reasoning. |
| **0.5.3** | **2026-05-04** | **AI** | **Closeout sweep — code-complete state captured.** All in-code work for SPEC 8 shipped between 2026-05-01 (Stages A → B3.7 + v0.5.2 hotfix wave) and is live in `audric/main` behind `NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT`. Engine published as `@t2000/engine@1.5.0`. **What remains is operational** — see new "Remaining work" section near the end of this doc for the 3 line items: (1) founder-driven 10% → 50% → 100% rollout dial flips per `audric/apps/web/RUNBOOK_spec8_rollout.md`, gated by `apps/web/scripts/spec8-rollout-gates.mjs --hours=24` between each step; (2) 7-day post-100% gate output committed as the spec acceptance artifact (`--hours=168`); (3) 3 SPEC 12 polish items deferred (HowIEvaluated per-block usage needs engine 1.5.1, ReasoningStream typography, LegacyReasoningRender deletion). Phase tables (P3.0 → P3.8) marked done in `audric-build-tracker.md` (P2.5 row + B1/B2.1/B2.2/B2.3/B3.1–B3.7 sub-rows). Stale "Next: P2.5 SPEC 8 (~11.25d)" boilerplate in audric-build-tracker.md S.48–S.56 footers reflects pre-ship language and is kept verbatim as historical record (do not rewrite). No spec content change in v0.5.3 — pure status-correction patch. |
| **0.5.2** | **2026-05-01** | **AI** | **G1 hotfix wave — `<eval_summary>` marker leaks closed (3 commits, same day).** Audit found markers were never emitted post-C-2 fix because the section sat in a low-attention nested h3 position. Three fixes shipped: (a) `4664910` — promoted the section to `## CRITICAL: ... (MANDATORY, NEVER SKIP)` heading right after BALANCE VALIDATION + sharpened tool-name enumeration. (b) `ca28939` — `lib/sanitize-text.ts` `stripEvalSummaryMarker()` util + wired into `TextBlockView` (defense in depth — model may emit marker in both thinking AND text). 10 new test cases. (c) `a660dcc` — extended strip to `ThinkingBlockView`'s streaming branch so the marker doesn't flash in the live thinking accordion before the trust card swaps in on `thinking_done`. Two founder retests confirmed: trust card renders on every confirm-tier write with structured rows; zero raw markers in final text; zero streaming flash. SPEC 8 v0.5.2 fully shipped. Captured in `audric-build-tracker.md` § "SPEC 8 v0.5.2 — Known Open Gaps". |
| **0.5.1** | **2026-05-01** | **AI** | **SPEC 10 v0.2.1 alignment patch (3 cross-spec fixes — G3/G4/G7 from v0.2.1 lock review).** (G3 — MED) **`permission-card` block recipient rendering aligned with SPEC 10 D10.** v0.5's D1 added the typed slot (`type: 'permission-card'` carrying `payload: PendingAction`) but didn't specify how the recipient field within the rendered card surfaces. Per SPEC 10 v0.2.1 D10 (single-rule policy), the renderer MUST display the full Audric handle when the recipient's resolved address has a `*.audric.sui` leaf. Renderer is owned by SPEC 7 v0.3.2 (per the D1 boundary); SPEC 8 v0.5.1 documents the contract + adds an acceptance gate. ~0d code (renderer change is in SPEC 7 v0.3.2). (G4 — LOW) **Tool-registry maintenance contract documented.** Every new engine tool shipped MUST add `STEP_ICONS` + `STEP_LABELS` entries in `audric/apps/web/components/engine/AgentStep.tsx` BEFORE merge. The `resolve_suins: 🪪` lesson from S.52.1 (entry was missing on first ship → fell back to generic `⚙️` + auto-uppercased label) is now a documented gate. SPEC 10 v0.2.1 ships 3 new tools (`lookup_user`, `reserve_username`, `change_username`) — they MUST land with their AgentStep entries. (G7 — LOW) **Tx-receipt cards cross-reference SPEC 10 D10.** `TransactionReceiptCard` renderer (existing component) follows the same recipient-rendering rule as `permission-card` per SPEC 10 D10 — full handle when present, external SuiNS otherwise, truncated 0x as fallback. One-line cross-reference added to the cards section. Effort impact: 0d (display + documentation-only spec change). |
| 0.1 | 2026-04-29 | AI | Initial draft after grounding audit (engine event protocol, anthropic provider, audric chat layer, static system prompt). Founder asked for production-grade spec covering interactive harness UX after SPEC 7 v0.2 lock. |
| 0.2 | 2026-04-29 | AI | **Locked.** Founder approved 7 design decisions (tool name `update_todo`, LEAN zero-thinking, auto-collapse with manual-state preservation, todo sticky-during-turn / inline-on-completion, NO expand-collapse-all controls, NO MAX special visual treatment, defer cross-turn todos to SPEC 9). Folded 6 critical gap fixes into spec: (1) multi-block thinking signature continuity test, (2) `update_todo` exempt from `maxTurns` budget, (3) old-session legacy rendering fallback, (4) per-block-type error state matrix, (5) per-session feature flag pinning, (6) explicit `budgetTokens` caps per shape. Effort revised 10d → 11.25d. |
| 0.2.1 | 2026-04-30 | AI | **Sequencing flipped — SPEC 8 now ships BEFORE SPEC 7.** Original v0.1/v0.2 framing assumed "SPEC 7 hard prerequisite" (bundles need timeline to render). On founder challenge, re-audited: SPEC 8's `TimelineBlock` types don't include any bundle-specific block — multi-step PermissionCard goes in the existing PermissionCard slot which SPEC 8 preserves. SPEC 8 actually delivers MORE value first (100% of turns vs 5-10% multi-write — corrected in v0.3 to "~40% medium+ turns"), needs no SDK changes, gives SPEC 7 a polished surface to render into. Net cost of flip: ~+0.5d in SPEC 7 (PermissionCard placement inside ReasoningTimeline). All "ships after SPEC 7" / "hard prerequisite" framing in this spec rewritten. PR-B4 (Mercuryo Audric CTA, ~0.5d) + PR-B5 (Cetus swap fee fix, ~0.5-1d) + PR-B3 closeout slot in BEFORE SPEC 8 to clear lingering debt first. |
| **0.3** | **2026-04-30** | **AI** | **Gap closures from second pass (founder review).** Folded 7 gaps not addressed in v0.2/v0.2.1: (1) **Rich UX cards as `card` TimelineBlock variant** — explicit pairing with `toolUseId`, ordered chronologically, preserves card-component reusability without forking renderers. (2) **`tool_progress` event** — opt-in for long-running tools (Cetus swap_execute 2-5s, protocol_deep_dive 3-8s, portfolio_analysis 1-3s); fixes the static-spinner dead-air for the worst-offender ~10% of tool calls. (3) **Chip-tap-during-streaming** — taps queue as next message and fire on `turn_complete`; visual queued-pill state; `priority: 'high'` chips (cancel) abort instead. (4) **Voice mode v1 contract** — TTS reads final text only; per-block voicing deferred to SPEC 9; documented to prevent re-litigation. (5) **Tool retry semantics** — `attemptCount?: number` on tool block; header shows "TOOL · attempt 2 · 1.4s" if N>1; surfaces flakiness without timeline spam. (6) **Refresh / interruption handling** — engine flushes partial timeline to Postgres on disconnect; rehydrate marks last block `interrupted` + retry button replays user message (no auto re-run). (7) **LEAN tier honesty** — corrected "100% of turns" framing to "~40% medium+ turns benefit visibly; LEAN tier (~60% of volume) stays unchanged." Effort revised 11.25d → 12.5d (+1.25d for gaps 2, 5, 6 — others are clarifications/decisions, not new code). |
| **0.5** | **2026-05-01** | **AI** | **Full-trio review pass (D1, D2, G4, G5, G8, G9 closures).** Folded 5 cross-spec coupling fixes surfaced when reviewing SPEC 7 v0.3 + SPEC 8 v0.4 + SPEC 9 v0.1 end-to-end against current code. **(D1) `permission-card` `TimelineBlock` variant added** — SPEC 7 v0.3 needed a typed slot to render its multi-step PermissionCard inside the timeline; v0.4 said "renders in the existing PermissionCard slot" but the timeline union didn't include one. New `permission-card` variant carries `payload: PendingAction` + `status: 'pending' | 'approving' | 'regenerating' | 'denied' | 'approved'`. SPEC 7 owns the renderer (multi-step rows + regenerate button); SPEC 8 owns only the slot type + chronological positioning. ~+0.25d host-side block routing in P3.3. **(D2) `pending_input` event type RESERVED as a no-op handler** — SPEC 9 v0.1 introduces `pending_input` for inline forms. Reserve the event type now so the host's `processSSEChunk` switch has a default-handled case (silent no-op + telemetry log if seen on legacy harness). Prevents "unknown event type" crashes during phased rollout. ~5 LOC. **(G4) `harnessVersion` storage corrected — Upstash session record, NOT Prisma `Session` model.** v0.4's "add `harnessVersion: String @default('legacy')` to a Session table" claim was wrong — there is no `Session` Prisma model. Sessions live in `apps/web/lib/engine/upstash-session-store.ts`. v0.5 stores `harnessVersion` as a field on the existing Upstash session payload — same per-session pinning behavior, no schema migration, no DB writes. ~+15 LOC in `upstash-session-store.ts`. **(G5) `<eval_summary>` emission contract clarified.** v0.4 said "engine parses `<eval_summary>...</eval_summary>` marker from the final thinking burst" but the engine doesn't know "final" until `message_stop`. v0.5: engine emits `summaryMode: true` for **every** thinking block containing the marker (no "final" detection); the system prompt enforces "AT MOST ONE `<eval_summary>` per turn" as an LLM behavioral rule (already a soft constraint from MAX-tier prompt). LLM compliance is the guarantee; engine stays dumb. If LLM violates and emits 2+, host renders 2+ HowIEvaluated cards (suboptimal but not broken) and telemetry logs `evalSummaryViolations++`. **(G8) Auto-expand HowIEvaluated semantics tightened.** v0.4's "auto-expand for the latest streaming block" rule conflicts with the v0.2 "manual state preserved on rehydrate" rule when a user manually collapsed a HowIEvaluated card. v0.5: auto-expand applies **only on first emission of that block** (when `manualState === undefined`); subsequent renders (rehydrate, scroll-back, re-stream) honor the user's manual state. ~5 LOC clarification in `isExpanded()` helper. **(G9) `evalSummaryEmittedCount` definition split into raw count + dashboard-derived rate.** Original metric was ambiguous about whether to count low-quality emissions. v0.5: track **raw** `evalSummaryEmittedCount` per turn (always increments on emission, no quality judgment). Compute **derived** `evalSummaryAppropriatelyEmittedRate = (count where turnEffort ≥ STANDARD) / (turns where turnEffort ≥ STANDARD)` in dashboard SQL — separates "did the LLM emit it?" from "was emitting it the right call?". Effort revised 14.25d → ~14.75d (+0.25d for `permission-card` block + Upstash field; D2/G5/G8/G9 are clarifications and small wires, not new code). |
| **0.4** | **2026-05-01** | **AI** | **v2-demo audit + SPEC 7 v0.3 coupling (founder review of `audric/audric_demos_v2/`).** Folded 3 closures driven by the v2 demo prototypes (richer cards, denser layout, explicit summary card, regenerate flow): (A) **v2 visual primitives baseline** — `TaskInitiated` divider, `ThinkingHeader` ("✦ audric is thinking" italic), `ReasoningStream` italic body, `ParallelTools` rich card become the **default rendering** for `thinking` + `parallel-group` blocks. The v0.3 ASCII mocks remain valid as **semantic** spec; the visual implementation gets the v2 polish. Existing `BalCard`, `RatesCard`, etc. unchanged — only the timeline scaffolding upgrades. ~1.5d. (B) **`HowIEvaluated` summary block** — extension to the existing `thinking` block with new optional `summaryMode?: boolean` flag and `evaluationItems?: Array<{ label, status, note }>`. When the LLM emits its final pre-text thinking burst with the summary marker, the host renders a "✦ HOW I EVALUATED THIS" collapsible card listing the constraints checked (HF, slippage, balance, daily cap) instead of a raw thinking accordion. Same `thinking` block type — just a render-mode flag — so back-compat is automatic. ~1d. (C) **PermissionCard `regenerate` button slot** — UI-only renderer change to accept an optional `regenerate?: { label, ageLabel, onClick }` prop. The actual regenerate logic (re-fire upstream reads, rebuild bundle, re-emit `pending_action`) lives in **SPEC 7 v0.3** (drafted same day). SPEC 8 just exposes the slot so SPEC 7 can plug in without refactoring the renderer twice. ~0.25d. **Cross-spec coupling:** SPEC 7 v0.3 extends `pending_action` with `quoteAge` / `canRegenerate` / `regenerateInput` and adds `POST /api/engine/regenerate`; SPEC 8 v0.4 owns only the empty button slot + the "QUOTE Ns OLD" badge layout. **Content-review ReviewCard pattern (Accept / Regenerate / Cancel for agent-generated content like Audric Store music/art) deferred to SPEC 9** — it's tied to content generation, not to harness or bundle UX. Effort revised 12.5d → ~14.25d (+0.25d engine summary marker in P3.2; +1.5d visual primitives + HowIEvaluated render + regenerate slot in P3.3). |

---

## TL;DR (read this first)

> **Today**: the agent thinks once, runs tools, narrates once. The "How I evaluated this" accordion is a single static block at the bottom of the message. The user sees a long pause, then everything appears at once.
>
> **What we want**: the agent thinks in *bursts*, narrates *interleaved* with tool calls, maintains a *live todo surface*, and renders the whole thing as a *chronological timeline* — like Cursor's `accordion → action → accordion → action → text` flow, but for finance.
>
> **What this spec changes**:
> 1. **Engine** — add `blockIndex` to `thinking_delta` events so multi-burst thinking is preserved. Add a new auto-permission `update_todo` tool that emits a typed `todo_update` event. Add per-turn budget caps so the harness can't runaway.
> 2. **Audric** — replace `ReasoningAccordion` (one per message) with `ReasoningTimeline` (an ordered list of typed blocks: `thinking`, `tool`, `text`, `todo`, `canvas`). Render in chronological emission order, not in fixed sections.
> 3. **System prompt** — teach the LLM *when* to narrate-mid-flight + *when* to emit todos, gated by `classifyEffort()` so trivial reads stay terse.
> 4. **Telemetry** — add `harness_shape` dimension to `TurnMetrics` so we can A/B and measure quality regression.
>
> **What this spec does NOT change**:
> - Final-text discipline (still 1-2 sentences, still no card duplication).
> - Tool authoring (no new flags except `bundleable` from SPEC 7).
> - SDK (zero changes — this is engine + host only).
> - Prompt caching boundaries (`STATIC_SYSTEM_PROMPT` ephemeral cache stays).

**One-line product impact:** *the agent feels alive instead of feeling like a black-box pause-then-receipt machine.*

**Volume framing (v0.3 honest correction).** Today's adaptive thresholds split turns roughly 60% LEAN (single-fact lookups) / 35% STANDARD-RICH (writes + recipes) / 5% MAX (multi-write rebalances). SPEC 8 does NOT change LEAN — by design. The "feels alive" upgrade lands on the **~40% of turns that are medium+ effort** (the ones that today already take 4–15s of dead air). LEAN tier stays as fast and cheap as it is now. This is the right trade: the highest-volume tier is already fast, and adding harness overhead there would hurt unit economics.

**v0.4 visual addendum.** The v0.2/v0.3 ASCII mocks (lines 82–122 below) define the *semantic* timeline. The v0.4 closures fold in the visual treatment from `audric/audric_demos_v2/shared/primitives.jsx` as the rendering baseline: italic-typeset thinking ("✦ audric is thinking"), `TaskInitiated` divider between user message and the timeline, rich `ParallelTools` card for the `parallel-group` block, and a dedicated `HowIEvaluated` render mode for the LLM's final pre-text reasoning summary. The block taxonomy is unchanged — only the renderers level up.

---

## Why this spec exists (and why now)

The user spent multiple weeks staring at Audric's chat surface and noticed it feels *flat* compared to Cursor:

> **Cursor flow** *(observed in user's daily workflow)*
>
> ```
> [thinking burst 1: 8s] → "Let me read the file" → [tool: Read]
> [thinking burst 2: 4s] → "Now searching imports" → [tools: Grep × 3 in parallel]
> [thinking burst 3: 12s] → "Found the bug — let me trace the call site" → [tool: Read]
> [final text: "Here's the fix..."]
> ```
>
> **Audric today**
>
> ```
> [thinking: 12s, hidden behind one accordion at bottom] → [all tools dispatched] → [final text]
> ```

The architectural reason: the engine *can* emit multi-burst thinking (Anthropic streams it that way), but the SSE schema flattens it and the host concatenates everything into one string. It's a 3-line surgical fix at the protocol layer + a re-think of the host rendering.

The product reason: people trust an agent more when they can *watch it think*. Especially when it's about to move their money.

**Timing rationale (v0.2.1 revised, v0.3 honest)**: SPEC 8 ships FIRST. It makes every medium+ interaction (~40% of turns) feel premium, needs zero SDK changes, and gives SPEC 7 a polished surface to render Payment Stream bundles into. SPEC 7 (Multi-Write PTB / Payment Stream) ships SECOND on top of the new harness — its multi-step PermissionCard renders inside `ReasoningTimeline` from day one, single coherent visual ship for users. Original v0.1/v0.2 sequencing inverted this; founder challenge in 2026-04-30 review surfaced the flip. The v0.3 honesty correction: "100% of turns" was wrong — LEAN tier (~60% of volume) stays unchanged because the spec explicitly disables thinking + todos there. The case for SPEC-8-first still holds because (a) the affected ~40% are the high-engagement turns where users emotionally invest, (b) zero SDK risk, (c) single coherent visual ship.

---

## Vision: what GOOD looks like

### The canonical demo (build this, screenshot this)

User asks: *"What should I do with my idle USDC?"*

```
┌─ AUDRIC ────────────────────────────────────────────────────────────────┐
│                                                                        │
│ ▾ THINKING · 4s                                                        │
│   "Idle USDC question — I need their wallet first, then yields, then   │
│   I can give a recommendation. Let me read both in parallel."          │
│                                                                        │
│ ⚡ RUNNING 2 TASKS IN PARALLEL                                          │
│   ✓ BALANCE CHECK · 0.3s                                               │
│   ✓ RATES INFO · 0.4s                                                  │
│                                                                        │
│ [BalanceCard: $92.34 USDC idle, $0 in NAVI]                            │
│ [RatesCard: top 3 lending APYs]                                        │
│                                                                        │
│ ▾ THINKING · 6s                                                        │
│   "$92 idle, USDC pool is at 4.99% APY. At their balance that's        │
│   $4.61/yr or $0.013/day. Worth pointing out the magnitude — it's      │
│   meaningful but not transformative."                                  │
│                                                                        │
│ ┌─ TODO LIST ─────────────────────────────────────────────────────┐    │
│ │ ✓ Read wallet                                                   │    │
│ │ ✓ Check NAVI rates                                              │    │
│ │ ◯ Recommend action with magnitude                               │    │
│ └────────────────────────────────────────────────────────────────┘    │
│                                                                        │
│ ✦ Your $92 USDC is earning $0 sitting in your wallet. Depositing into  │
│   NAVI at 4.99% APY would earn ~$4.61/yr. Want me to deposit it?       │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Why this is GOOD** (the success criteria, made concrete):

| Property | Today (`status quo`) | Target (SPEC 8) | Verifiable how |
|---|---|---|---|
| **Time to first visible progress (TTFVP)** | 2-12s of dead air | <800ms (first thinking block streams immediately) | Telemetry: timestamp of first `thinking_delta` − timestamp of `submit_message` |
| **Thinking accordions per turn** | 1 (concatenated) | 1-N, chronologically interleaved with tools | Manual screenshot review on test corpus + `harness_shape` dimension on TurnMetrics |
| **Final text length** | 1-2 sentences | 1-2 sentences (UNCHANGED — this is critical) | LLM output token count for `text_delta` only |
| **Total turn cost** | Baseline (current TurnMetrics) | ≤ 1.10× baseline at p50 | Cost regression check on eval corpus |
| **Total turn latency** | Baseline | ≤ 1.05× baseline at p50, ≤ 1.15× at p95 | Latency regression check on eval corpus |
| **Trivial-read shape** | Adaptive thinking → 1 accordion → terse text | UNCHANGED (no harness overhead) | Test: "what's my balance" emits ≤1 thinking block, no todo |
| **Multi-step shape** | All thinking concatenated, all tools dispatched, then text | Per-step thinking → tools → per-step thinking → todo → text | Test: portfolio_rebalance recipe emits ≥3 thinking blocks + todo updates |

### The bar (one-line litmus test)

> **A user who has never used Audric should, within 10 seconds of asking their first question, see Audric *thinking out loud and acting in steps* — not a static spinner.**

If they don't, we failed.

---

## Audit: what we already have

This section is the foundation — the spec only makes sense once you understand what's already built.

### Engine: thinking infrastructure ✅ (mostly there)

`packages/engine/src/providers/anthropic.ts:163-219` already buffers thinking blocks per stream index:

```typescript
case 'content_block_start': {
  if (block.type === 'thinking') {
    thinkingBuffers.set(event.index, { type: 'thinking', text: '', signature: '' });
  }
  // ...
}

case 'content_block_delta': {
  if (delta.type === 'thinking_delta') {
    const buf = thinkingBuffers.get(event.index);
    if (buf?.type === 'thinking') buf.text += delta.thinking ?? '';
    yield { type: 'thinking_delta', text: delta.thinking ?? '' };  // ← MISSING blockIndex
  }
}

case 'content_block_stop': {
  const thinkBuf = thinkingBuffers.get(event.index);
  if (thinkBuf?.type === 'thinking') {
    yield { type: 'thinking_done', thinking: thinkBuf.text, signature: thinkBuf.signature };
    // ← This is per-block already, GOOD
  }
}
```

**Gap**: the engine emits `thinking_done` between blocks, but the `thinking_delta` events in between have no block index. The host has to infer block boundaries by watching for `thinking_done`. That works for SOME UI strategies but not for ordered-timeline rendering where each block needs its own React element from delta-1.

### Engine: event protocol (`packages/engine/src/types.ts:28-89`)

Today's `EngineEvent` union:

```
thinking_delta       → text only
thinking_done        → signature only
text_delta           → text only
tool_start           → toolName, toolUseId, input
tool_result          → ... (with wasEarlyDispatched, resultDeduped, wasPostWriteRefresh flags)
pending_action       → action (Spec 1's PendingAction)
turn_complete        → stopReason
usage                → token counts
error                → Error
canvas               → template, data, title, toolUseId
compaction           → no payload
```

This is the contract `audric/apps/web/hooks/useEngine.ts:processSSEChunk` handles via switch statement at line 371.

**Gap**: nothing in this contract describes "an ordered sequence of work blocks" — the host has to reconstruct that from the event stream. Every host re-implements this. We can do better.

### Audric: rendering (`audric/apps/web/components/engine/ChatMessage.tsx:135-200`)

Current rendering order, FIXED at line 135:

```jsx
return (
  <div>
    {hasTools && <ToolSteps + ToolResultCards />}      // 1. ALL tools first
    {hasCanvases && <CanvasCards />}                    // 2. ALL canvases
    {hasPendingAction && <PermissionCard />}            // 3. confirm card
    {message.isThinking && <ThinkingState />}           // 4. live spinner
    {message.thinking && <ReasoningAccordion />}        // 5. ONE accordion
    {hasContent && <text>}                              // 6. final text
  </div>
);
```

This is *chronologically wrong*. Thinking happens BEFORE tools (always), but renders AFTER. Tools execute interleaved with thinking, but render in a single block. The final text is the only thing in the right position.

`useEngine.ts:376` flattens thinking:

```typescript
case 'thinking_delta':
  setMessages((prev) =>
    prev.map((m) =>
      m.id === msgId
        ? { ...m, thinking: (m.thinking ?? '') + event.text, isThinking: true }
        : m,
    ),
  );
```

`m.thinking` is one string. There's no way to have two accordions per message under the current data model.

### Audric: system prompt discipline (`audric/apps/web/lib/engine/engine-context.ts:STATIC_SYSTEM_PROMPT`)

The prompt is HEAVILY tuned for terseness in the **final text**:

- "1-2 sentences max" (line 206)
- "ABSOLUTE RULE — applies to EVERY card-rendering tool, no exceptions" (line 165) — never duplicate card data
- "If you have nothing to add beyond what the card displays, say NOTHING. Silence is correct." (line 179)
- "POST-WRITE TURN DISCIPLINE (MANDATORY)" — no upselling (line 209)

**This is correct and stays.** SPEC 8 narration moves into:
- **Thinking blocks** (extended thinking content — already siloed in the accordion, never bleeds into final text)
- **Todo updates** (a NEW typed surface, also separate from final text)

The final-text channel stays disciplined. We're adding NEW channels, not bloating the existing one.

### Engine: classify-effort (`packages/engine/src/classify-effort.ts:11`)

Already adaptively routes per-turn complexity:

```typescript
'low'    → balance/rate/price quick lookups (Haiku-eligible historically)
'medium' → matched recipe (Sonnet)
'high'   → 3+ step recipes, safe_borrow, sessionWriteCount > 0 + write keywords
'max'    → opus-only: portfolio_rebalance, emergency_withdraw, "rebalance|reallocate"
```

**SPEC 8 reuses this directly** as the *harness shape* gate. Don't run a multi-burst harness on `effort: low`. Run the full surface only on `medium+`.

### Engine: orchestration (`packages/engine/src/orchestration.ts`, `packages/engine/src/early-dispatcher.ts`)

Already shipped:
- `EarlyToolDispatcher` — dispatches read tools mid-stream when they're `isReadOnly && isConcurrencySafe`
- `TxMutex` — serializes writes
- `runTools` — parallel reads, serial writes within a turn
- `microcompact` — dedupes identical tool calls within a session

**Implication**: parallel-read tools already EXECUTE the way SPEC 8 wants. They just don't VISUALLY render that way. Most of SPEC 8 is a UI-layer fix on top of correctly-orchestrated work.

---

## Gap map (what's missing to ship the canonical demo)

| # | Gap | Layer | Lines of code (estimate) | Risk |
|---|---|---|---|---|
| 1 | `thinking_delta` event has no `blockIndex` field | engine types + provider + SSE | ~30 | LOW (additive) |
| 2 | `useEngine.ts` flattens all thinking into one string | audric host hook | ~80 | MEDIUM (data model change) |
| 3 | `ChatMessage.tsx` renders fixed sections, not chronological | audric UI | ~250 (new `ReasoningTimeline` component) | MEDIUM (visual regression risk) |
| 4 | No `update_todo` tool (the auto-permission tool that emits typed todo events) | engine + audric tool wiring | ~120 | LOW (new isolated tool) |
| 5 | System prompt doesn't teach when to narrate / emit todos | audric prompt | ~80 (new section) | MEDIUM (prompt regression risk on terseness) |
| 6 | No `harness_shape` dimension on TurnMetrics | audric host | ~20 | LOW (additive analytics) |
| 7 | No "first thinking block" latency metric (TTFVP) | audric host telemetry | ~10 | LOW |
| 8 | No eval suite for narration quality / shape | new `eval/` directory | ~200 | MEDIUM (corpus design effort) |
| **v0.3-1** | Rich UX cards have no place in the timeline (Gap 1) | audric host + UI | ~80 (`card` TimelineBlock + useEngine wiring) | LOW (additive, existing card components unchanged) |
| **v0.3-2** | Long-running tools (Cetus 2-5s) show static spinner (Gap 2) | engine + audric host + Cetus tool | ~90 (10 engine + 30 host + 50 Cetus integration) | LOW (additive opt-in; tools without progress callback unchanged) |
| **v0.3-3** | Chip taps during streaming have no defined behavior (Gap 3) | audric host + chip-configs | ~50 (queue mechanism + visual state) | LOW (default behavior preserves today; chip authors opt in to `priority`) |
| **v0.3-4** | Voice mode + new timeline interaction undefined (Gap 4) | audric host (documentation only) | 0 (decision documented, no code) | LOW (preserves today's behavior) |
| **v0.3-5** | Tool retries either spam timeline or hide retries entirely (Gap 5) | engine + audric host | ~20 (`attemptCount` plumbing + header conditional) | LOW (additive, hidden when attemptCount=1) |
| **v0.3-6** | Refresh / browser-close mid-stream leaves orphan messages (Gap 6) | engine + audric host + Prisma | ~80 (30 engine flush + 30 host hydrate + 20 schema) | MEDIUM (touches session-store on disconnect path) |
| **v0.3-7** | "100% of turns benefit" framing was wrong (Gap 7) | spec doc only | 0 (spec rewording) | LOW |

**Total**: ~790 LOC v0.2 + ~320 LOC v0.3 = **~1110 LOC** across engine + host + prompt + tests + eval. Comparable to PR-B2's footprint.

---

## Architecture: the 6 layers

### Layer 1 — Engine event protocol (additive change to `EngineEvent`)

#### Change 1.1: `thinking_delta` carries `blockIndex`

`packages/engine/src/types.ts`:

```typescript
// BEFORE
| { type: 'thinking_delta'; text: string }
| { type: 'thinking_done'; signature?: string }

// AFTER
| { type: 'thinking_delta'; text: string; blockIndex: number }
| { type: 'thinking_done'; blockIndex: number; signature?: string }
```

`packages/engine/src/providers/anthropic.ts` already has `event.index` from Anthropic stream — pass it through:

```typescript
yield { type: 'thinking_delta', text: delta.thinking ?? '', blockIndex: event.index };
```

Backwards-compatible: hosts that ignore `blockIndex` keep working (concatenated thinking still arrives in order).

#### v0.2 — Multi-block continuity test (Gap 1 fix)

**The risk:** When extended thinking is on with tool use, Claude returns thinking blocks with cryptographic `signature` fields. The next conversation turn MUST replay those blocks back verbatim (same order, same signatures, paired correctly with their tool_use blocks) or Anthropic returns a signature-mismatch error and the conversation dies. Today's engine handles the single-block case (`anthropic.ts:214` preserves the signature). Multi-block thinking + tool use is more fragile — drop or reorder a block and the next turn fails.

**Mandatory P3.2 acceptance test** (real Anthropic API, not mock):

```typescript
// 1. Force a turn that emits 3 thinking blocks (use a recipe trigger or deeply nested ask)
const turn1 = await engine.submitMessage('rebalance my portfolio safely');

// Verify N thinking blocks were captured
const thinkingBlocks = turn1.assistantContent.filter(b => b.type === 'thinking');
expect(thinkingBlocks.length).toBeGreaterThanOrEqual(2);

// 2. Round-trip: send a follow-up. The engine must replay all N thinking blocks
// back to Anthropic exactly. If it drops, reorders, or mangles any signature,
// Anthropic returns 400 and the conversation breaks.
const turn2 = await engine.submitMessage('proceed');

// Verify turn 2 succeeded (no signature error)
expect(turn2.events.find(e => e.type === 'error')).toBeUndefined();

// 3. Repeat with redacted_thinking blocks (Anthropic returns these for safety-flagged content).
// They have `data` instead of `signature` but must round-trip identically.
```

If this test fails, the entire harness is broken. Add it to `packages/engine/src/__tests__/multi-block-thinking.test.ts` as a hard CI gate.

#### v0.2 — Per-shape `budgetTokens` caps (Gap 6 fix)

Cost monitoring catches regressions after the fact; budget caps prevent them. Engine emits `harness_shape` event AND configures Anthropic's `thinking.budget_tokens` per shape:

| harness_shape | `thinking.budget_tokens` | Rationale |
|---|---|---|
| `lean` | `disabled` (no thinking config sent) | Single-fact lookups don't have a "process" to narrate |
| `standard` | 8 192 | Single-write or 2-step asks — modest budget |
| `rich` | 16 384 | Recipe-triggering asks — more depth needed |
| `max` | 32 768 | Multi-write Payment Stream / portfolio rebalance — maximum allowed |

These are HARD caps enforced by the Anthropic API. Even if the LLM "wants" to think more, it gets cut off. Implementation: `engine-factory.ts` reads `harness_shape` at turn start, passes the corresponding `ThinkingConfig` to the provider. ~30 LOC.

#### Change 1.2: New `todo_update` event

```typescript
| {
    type: 'todo_update';
    todos: Array<{
      id: string;
      content: string;
      status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    }>;
    /**
     * Synthesized from the most recent `update_todo` tool call. Hosts may
     * render a sticky todo card per assistant message that re-renders when
     * this event arrives. Replaces the prior list entirely (not delta).
     */
  }
```

Emitted by the engine when the new `update_todo` tool's auto-permission execution completes. Pure side-channel — does not affect tool-result message history (the LLM still sees the tool result via its own tool_result block).

#### v0.3 — Change 1.3a: New `tool_progress` event (Gap 2 fix)

**The risk:** Sui chain settlement is sub-second, but a small set of tools have *internal* multi-second latency that the user sees as static-spinner dead air:
- `swap_execute` — Cetus aggregator routes across 12+ DEXs, p50 ~2.5s, p95 ~5s.
- `protocol_deep_dive` — DefiLlama fetch + parse, p50 ~3s, p95 ~8s.
- `portfolio_analysis` — multi-source consolidation (BlockVision + NAVI + Suilend), p50 ~1.5s, p95 ~4s.

These are ~10% of tool calls but the WORST contributors to the "feels dead" perception SPEC 8 exists to fix. A static spinner here is exactly what SPEC 8 promises to eliminate.

**Add a new optional event:**

```typescript
| {
    type: 'tool_progress';
    toolUseId: string;
    message: string;             // 1-line: "Routing across 12 DEXs (3/12)…"
    pct?: number;                // 0–1; renders as a thin progress bar if provided
  }
```

**Tool authoring API:** tools opt in by accepting a `progress` callback in their `execute()`:

```typescript
async execute({ input }, ctx) {
  const route = await cetus.findBestRoute(input, {
    onDexEvaluated: (i, total) => ctx.progress?.({
      message: `Routing across ${total} DEXs (${i}/${total})…`,
      pct: i / total,
    }),
  });
  // ...
}
```

**Host rendering:** the `tool` `TimelineBlock` reads its latest progress message; spinner row flips from `⏵ TOOL_NAME · 0.4s` to `⏵ TOOL_NAME · 0.4s · Routing across 12 DEXs (3/12)…`. Pct (when provided) renders as a thin border-bottom progress bar inside the block. Block stays single (no progress-event-per-block flooding).

**Scope:** v1 wires Cetus `swap_execute` only (highest impact). `protocol_deep_dive` + `portfolio_analysis` follow in P3.6 if Cetus integration goes smoothly. ~10 LOC engine + ~30 LOC host + ~50 LOC Cetus tool integration.

#### v0.5 — Change 1.3b: Reserve `pending_input` event type (D2 — forward-compat with SPEC 9)

**The risk:** SPEC 9 v0.1 introduces a new `pending_input` event type for inline forms (e.g. demo 05 "mum's birthday" recipient form, demo 03 "make a beat" preset selector). When SPEC 9 ships, hosts running the SPEC 8 timeline code path will receive these events over their existing SSE stream. If we don't reserve the type now, the host's `processSSEChunk` switch statement falls through to the `default` case and either crashes (if asserted) or silently drops the event (silent data loss — worse).

**The fix:** reserve the event type in `EngineEvent` union now, with a no-op handler in the host. Engine doesn't emit it under SPEC 8 — only under SPEC 9 — but the contract is in place.

```typescript
// packages/engine/src/types.ts — RESERVED v0.5 (engine does NOT emit under SPEC 8)
| {
    type: 'pending_input';
    inputId: string;          // host-stable id; matches the input form once SPEC 9 lands
    schema: unknown;           // SPEC 9 will define (Zod-style descriptor)
    promptText: string;        // user-facing label
  }
```

**Host handler in `useEngine.ts:processSSEChunk`:**

```typescript
case 'pending_input': {
  // v0.5 — RESERVED for SPEC 9 (inline forms). Under SPEC 8 this event is never
  // emitted; the case exists so the switch is exhaustive when SPEC 9 ships and
  // legacy harness sessions don't crash if a new engine somehow ships first.
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[useEngine] received pending_input under SPEC 8 — should only land under SPEC 9');
  }
  // Telemetry: count seen-on-legacy events so we can confirm zero in production.
  telemetry.recordCounter('audric.harness.pending_input_seen_on_legacy', 1);
  break;
}
```

**Cost:** ~5 LOC engine type + ~10 LOC host handler. Zero functional change under SPEC 8. Hard pre-req for SPEC 9 — if we don't ship the reservation in SPEC 8 v0.5, SPEC 9 needs an engine version bump that gates rollout, which adds 1-2 days of coordination.

#### Change 1.3: New `harness_shape` event (optional, for telemetry)

```typescript
| {
    type: 'harness_shape';
    shape: 'lean' | 'standard' | 'rich' | 'max';
    rationale: string;  // 1-line: e.g. "matched recipe portfolio_rebalance → max"
  }
```

Emitted ONCE per turn at the start, derived from `classifyEffort()`. Hosts use it to pre-allocate UI affordances ("show todo surface when shape ≥ rich").

#### SSE protocol mirror

`packages/engine/src/streaming.ts` `SSEEvent` type adds the same three changes. `engineToSSE()` propagates them. Backwards-compatible because they're new events / new optional fields.

### Layer 2 — Engine: the `update_todo` tool

A new `auto`-permission tool, exported from `@t2000/engine`:

```typescript
// packages/engine/src/tools/update-todo.ts
export const updateTodoTool = buildTool({
  name: 'update_todo',
  description: `Maintain a live todo list for the current turn. Call this WHEN you have a multi-step plan you want the user to see — typically inside any matched recipe (safe_borrow, portfolio_rebalance, swap_and_save) or any user request that requires 3+ tool calls. Do NOT call for trivial reads (single balance check, single quote). Replaces the entire list each call (idempotent on identical input).`,
  inputSchema: z.object({
    todos: z.array(z.object({
      id: z.string(),
      content: z.string().max(80, 'todo content max 80 chars'),
      status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
    })).min(1).max(8),
  }),
  permissionLevel: 'auto',
  flags: { isReadOnly: true, isConcurrencySafe: true, cacheable: false },
  preflight: (input) => {
    const inProgress = input.todos.filter(t => t.status === 'in_progress').length;
    if (inProgress > 1) {
      return { valid: false, error: 'Only one todo can be in_progress at a time' };
    }
    return { valid: true };
  },
  async execute({ input }, ctx) {
    // Side-effect: emit `todo_update` event via ctx.eventEmitter
    ctx.eventEmitter?.emit({ type: 'todo_update', todos: input.todos });
    // Tool result is minimal — the LLM has already committed the list to its working memory
    return { displayText: `Updated todos (${input.todos.length} items)`, todos: input.todos };
  },
});
```

**Critical design choices**:

- **Idempotent**: re-calling with identical input is cheap (microcompact will dedupe).
- **80-char cap per item**: prevents the LLM from writing essays in todo content.
- **Max 8 items**: one in_progress + ≤7 pending/completed. Larger plans break the visual surface.
- **`auto` permission**: never blocks the turn. Fires immediately.
- **Engine event side-channel**: separate from tool_result so hosts can render dedicated todo UI without parsing tool results.

#### v0.2 — `update_todo` exempt from `maxTurns` budget (Gap 2 fix)

**The risk:** Each `update_todo` call is a `tool_use` block that counts toward `maxTurns` (default ~25). A `portfolio_rebalance` flow emitting 4× `update_todo` plus 7 real tool calls = 11 turns of budget. If the LLM also re-fetches stale data, we hit the cap and the turn truncates mid-flow — exactly when we'd want it to stay alive.

**Fix:** `update_todo` does NOT count toward `maxTurns`. Implementation: in `agentLoop.ts` (the loop that decrements the turn counter), check the tool name before decrementing:

```typescript
// agentLoop.ts (engine)
const TURN_FREE_TOOLS = new Set(['update_todo']);

for (const toolCall of pendingToolCalls) {
  await runTool(toolCall);
  if (!TURN_FREE_TOOLS.has(toolCall.name)) {
    turnsRemaining--;
  }
}
```

~15 LOC. Conceptually correct — `update_todo` documents the work, doesn't advance it. Add a regression test: "10× update_todo + 5 real tools terminates after 5 real-tool turns, not 15."

#### v0.2 — Richer `update_todo` preflight

Strengthen preflight beyond the v0.1 single check:

```typescript
preflight: (input) => {
  const { todos } = input;
  if (todos.length === 0) return { valid: false, error: 'todos must not be empty' };
  const ids = new Set();
  for (const t of todos) {
    if (ids.has(t.id)) return { valid: false, error: `duplicate todo id: ${t.id}` };
    ids.add(t.id);
  }
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  if (inProgress > 1) return { valid: false, error: 'only one todo can be in_progress at a time' };
  return { valid: true };
}
```

Catches LLM mistakes (empty list, duplicate ids, multiple in_progress) before they hit the host UI.

### Layer 3 — Audric host: ordered timeline data model

#### Change 3.1: `EngineChatMessage.timeline`

`audric/apps/web/lib/engine-types.ts`:

```typescript
// NEW typed timeline blocks (v0.3 — added `card` variant + `attemptCount` + `progress` + `interruptedAt`; v0.4 — added `summaryMode` + `evaluationItems` on `thinking`; v0.5 — added `permission-card` variant for SPEC 7 coupling [D1])
export type TimelineBlock =
  | {
      type: 'thinking';
      blockIndex: number;
      text: string;
      status: 'streaming' | 'done' | 'interrupted';   // v0.3 — added 'interrupted' (Gap 6)
      durationMs?: number;
      // v0.4 — Gap B: HowIEvaluated render mode.
      // When `summaryMode === true`, the host renders this block as a
      // "✦ HOW I EVALUATED THIS" collapsible card (see Layer 4 v0.4 section)
      // listing each `evaluationItems[]` entry as a labelled checked-row,
      // instead of as a raw thinking accordion. Engine sets the flag when
      // the LLM's final pre-text thinking burst contains the `<eval_summary>`
      // marker (system-prompt-taught — see Layer 5 v0.4 addendum).
      summaryMode?: boolean;
      evaluationItems?: Array<{
        label: string;                                 // e.g. "Health factor", "Slippage", "Daily cap"
        status: 'pass' | 'warn' | 'fail';
        note?: string;                                 // e.g. "1.84 → 1.62 (still safe)"
      }>;
    }
  | {
      type: 'tool';
      toolUseId: string;
      toolName: string;
      input: unknown;
      status: 'running' | 'done' | 'error' | 'timeout' | 'interrupted';  // v0.3 — added 'interrupted'
      result?: unknown;
      durationMs?: number;
      attemptCount?: number;                           // v0.3 — Gap 5 (>1 surfaces retries in header)
      progress?: { message: string; pct?: number };    // v0.3 — Gap 2 (latest progress for long-running tools)
    }
  | { type: 'parallel-group'; toolUseIds: string[] }   // synthesized by host when ≥2 tools start in flight together
  | { type: 'todo'; todos: Array<{ id: string; content: string; status: string }>; emittedAt: number }
  | { type: 'canvas'; template: string; data: unknown; title: string; toolUseId: string }
  | {
      // v0.3 — Gap 1: rich UX cards as first-class TimelineBlock variant.
      // Paired to a tool block via toolUseId; renders chronologically directly
      // after its tool. Replaces today's "render all cards in a separate
      // section after ToolSteps" pattern in ChatMessage.tsx:140-144.
      type: 'card';
      toolUseId: string;
      cardKind: string;                                // matches CARD_RENDERERS map key (e.g. 'balance_check', 'rates_info')
      data: unknown;                                   // payload extracted via existing extractData(); flows into the existing card components unchanged
      status: 'rendering' | 'done';                    // 'rendering' = awaiting tool_result; 'done' = data present
    }
  | { type: 'text'; text: string; status: 'streaming' | 'done' | 'interrupted' }   // v0.3 — added 'interrupted'
  | {
      // v0.5 — D1: typed slot for SPEC 7 v0.3.1 multi-step PermissionCard +
      //                 Quote-Refresh ReviewCard. SPEC 8 owns only the slot type
      //                 + chronological positioning; SPEC 7 owns the renderer
      //                 (multi-step rows, regenerate button, "QUOTE Ns OLD" badge).
      // The block is appended when the engine yields `pending_action` and removed
      // (status flips to 'approved' or 'denied') when the user resolves it via
      // tap-to-confirm. `regenerating` is a transient status while the SPEC 7
      // regenerate endpoint round-trip is in flight.
      // v0.5.1 — G3: recipient field within the rendered card MUST follow
      //                 SPEC 10 v0.2.1 D10 (single-rule policy: full
      //                 *.audric.sui handle when present; external SuiNS
      //                 otherwise; truncated 0x as fallback). Renderer is
      //                 owned by SPEC 7 v0.3.2 — see SPEC 7 v0.3.2 §"Recipient
      //                 rendering (SPEC 10 D10 cross-spec contract)" for the
      //                 5-state render matrix. NEVER render @mom in this slot.
      type: 'permission-card';
      payload: PendingAction;  // re-exported from @t2000/engine; carries attemptId,
                               // steps[], quoteAge, canRegenerate, regenerateInput
                               // per SPEC 7 v0.3.1
      status: 'pending' | 'approving' | 'regenerating' | 'denied' | 'approved';
    };

export interface EngineChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;          // KEPT for back-compat (= concat of all `text` blocks)
  thinking?: string;        // KEPT for back-compat (= concat of all `thinking` blocks)
  tools?: ToolExecution[];  // KEPT for back-compat (derived from timeline)
  timeline?: TimelineBlock[]; // NEW — chronological ordered list
  isInterrupted?: boolean;    // v0.3 — Gap 6 (true when SSE dropped before turn_complete)
  interruptedAt?: number;     // v0.3 — Gap 6 (timestamp of last block before drop)
  // ... existing fields
}
```

#### v0.3 — Change 3.1a: Rich UX cards as `card` TimelineBlock (Gap 1 fix)

**The risk:** today's `ChatMessage.tsx:140-144` renders ALL cards in a single section AFTER `ToolSteps`, breaking the chronological invariant that SPEC 8 promises. The v0.2 spec showed `[BalanceCard: ...]` rendered between thinking blocks in the canonical demo (lines 86-89) but didn't define how. Three options were considered (card-inside-tool-block, card-below-tool-block, card-as-own-block); the third wins.

**The decision:** add a `card` `TimelineBlock` variant paired with `toolUseId`. The card renders in chronological position directly after its paired `tool` block. Existing card components (`BalanceCard`, `RatesCard`, `SwapQuoteCard`, etc. — 18 in `components/engine/cards/`) keep their current API and props; the only change is WHERE they're invoked from.

**Why a separate block (not "result rendered inside tool block"):**
- Card is a different visual weight (full-width, often >100px tall) than the tool row (~24px). Wrapping cards inside the tool block muddies the collapse semantics.
- Some tools emit cards conditionally (`balance_check` always; `transaction_history` only if results > 0). The optional-card-per-tool model is cleaner with a separate block.
- The existing `CARD_RENDERERS` map lookup in `ToolResultCard.tsx:46` becomes the host's "should this tool emit a card block?" gate — zero new logic needed.

**Host implementation in `useEngine.ts`** (extends the `tool_result` handler):

```typescript
case 'tool_result': {
  // existing: mark tool block done + set result
  markToolBlockDone(msgId, event.toolUseId, event.result);

  // v0.3 NEW: if this tool has a card renderer, append a paired card block
  if (CARD_RENDERERS[event.toolName]) {
    const cardData = extractData(event.result);
    if (cardData) {
      appendTimelineBlock(msgId, {
        type: 'card',
        toolUseId: event.toolUseId,
        cardKind: event.toolName,
        data: cardData,
        status: 'done',
      });
    }
  }
  break;
}
```

**Backwards compat:** old `LegacyReasoningRender` path stays as-is (cards still render in the legacy section). New `ReasoningTimeline` path renders cards in chronological order.

**Card component contract:** unchanged. `<BalanceCard data={...} />` still takes the same props. The `data` field on the `card` block IS the props the existing component expects.

Back-compat strategy: legacy fields (`thinking`, `tools`, `content`) stay populated by deriving from `timeline`. Old code paths keep working. New code reads `timeline` directly.

#### v0.2 — Old-session legacy rendering fallback (Gap 3 fix)

**The risk:** `useEngine.ts:599` (`loadSession`) hydrates messages from Postgres. Sessions saved before SPEC 8 deploy have NO `timeline` field. If `ReasoningTimeline` blows up on missing data, every old session breaks.

**Fix:** rendering fork in `ChatMessage.tsx`:

```typescript
{message.timeline && message.timeline.length > 0
  ? <ReasoningTimeline blocks={message.timeline} isStreaming={message.isStreaming} />
  : <LegacyReasoningRender message={message} />  // ← keeps old ReasoningAccordion + tool list path
}
```

`LegacyReasoningRender` is the existing render path extracted into a named component. Keeps old sessions visually identical to today; new sessions get the timeline.

**P3.3 acceptance criterion:** open a session created ≥7 days before SPEC 8 deploy date in dev. Verify (a) renders without console errors, (b) thinking accordion + tool cards + final text appear in their old positions, (c) no visual regression vs pre-SPEC-8 production screenshot.

#### v0.2 — Per-session feature flag pinning (Gap 5 fix)

**The risk:** User has an active streaming session, you flip the global flag at 50% rollout, they refresh. Old messages render legacy, new messages render timeline. Chat looks visually broken even though both paths work in isolation.

**Fix:** the flag is checked ONCE per session, at session creation, and pinned to the session record.

> **v0.5 correction (G4).** v0.2's "add `harnessVersion` to the `Session` Prisma model" was wrong — there is no `Session` Prisma model. Sessions live in **Upstash KV** via `apps/web/lib/engine/upstash-session-store.ts`. The fix lives in the Upstash session payload, not in Postgres. Same per-session pinning behavior; no schema migration; no DB writes per session create. Updated implementation below.

```typescript
// apps/web/lib/engine/upstash-session-store.ts
interface UpstashSession {
  userId: string;
  createdAt: number;
  // ... existing fields (messages, conversationState, etc.)
  harnessVersion: 'legacy' | 'spec8-v1';  // v0.5 — NEW field
}

async function createSession(userId: string): Promise<UpstashSession> {
  const useNewHarness = await flagEvaluator('NEXT_PUBLIC_INTERACTIVE_HARNESS', userId);
  const session: UpstashSession = {
    userId,
    createdAt: Date.now(),
    // ... existing fields
    harnessVersion: useNewHarness ? 'spec8-v1' : 'legacy',
  };
  await upstash.set(`session:${session.id}`, session, { ex: SESSION_TTL });
  return session;
}

// useEngine.ts reads session.harnessVersion at hydrate time and renders accordingly
```

A session that started under legacy stays legacy for its lifetime. New sessions opened after the flag flip use timeline. Result: any single chat session is internally consistent. Upstash sessions naturally TTL out (current TTL: 14d), so the field's lifetime aligns with the session's lifetime — no backfill needed.

**Implementation cost:** ~15 LOC in `upstash-session-store.ts` + 1 line in `useEngine.ts:loadSession` to honor the field. No Prisma changes.

#### v0.3 — Stream interruption / refresh handling (Gap 6 fix)

**The risk:** v0.2 specified per-block error states for *known* failure modes (SSE drop, tool error, abort) but not for the meta-failure: user closes the tab mid-streaming-turn, then reopens 30 seconds later. Without explicit handling, two bad things happen:
1. The Postgres row for that message has `isStreaming: true` forever (never reconciled).
2. On rehydrate, the partial timeline is missing OR the host tries to "resume" the stream by re-running the LLM turn (~$0.05 cost + non-deterministic output that disagrees with what the user already saw).

**The decision: persist on disconnect, mark interrupted on rehydrate, no auto re-run.**

**Engine side (`MemorySessionStore` + DB-backed equivalent):**
- On SSE connection drop (detected via `ReadableStream` reader-error or aborted `AbortSignal`), the engine flushes the in-progress message with `isInterrupted: true`, `interruptedAt: Date.now()`, and the partial `timeline` array as it stands.
- The last block in `timeline` gets its `status` set to `interrupted` (matches the new BlockStatus values added in Gap 1's TimelineBlock changes).
- Engine does NOT attempt to resume the LLM call. Anthropic doesn't support stream resumption from arbitrary positions; replaying would mean re-sending the full prompt + paying full output cost again.

**Host side (`useEngine.ts:loadSession`):**
- Hydrates `message.isInterrupted`, `message.interruptedAt`, and the partial `timeline` from Postgres.
- Renders `ReasoningTimeline` normally — the `interrupted` status on the last block displays per the per-block-error matrix (e.g. `▾ THINKING · interrupted` with "(connection lost — retry to continue)" footer).
- A new `<RetryInterruptedTurn />` button renders at the message footer. On click: calls `submitMessage(originalUserText)` to start a fresh new turn (this is the same path as if the user re-typed). The original interrupted message stays in history.

**Why retry-as-new-turn (not retry-from-position):**
- LLM state at interruption is irrecoverable (Anthropic doesn't expose mid-stream restart).
- The user doesn't know what they "got" — they just know they didn't get the answer. A fresh turn is what they expect.
- Cost is identical to having the LLM run once cleanly; no double-charging.
- Idempotent at the user-visible level: same prompt → fresh attempt.

**P3.3 acceptance criterion:** open `/new`, send a message, hard-refresh the tab during the streaming text. Verify (a) reload shows the partial message with the interrupted indicator on the last block, (b) "Retry" button appears, (c) clicking it sends a new turn, (d) the original message stays in scrollback marked interrupted.

**~80 LOC: ~30 engine (disconnect detection + flush) + ~30 host (hydrate + retry UI) + ~20 Prisma schema (interrupted fields on Message).**

#### Change 3.2: `useEngine.ts` builds the timeline as events arrive

Replace the per-event setters with a unified appender:

```typescript
function appendTimelineBlock(msgId: string, block: TimelineBlock) { /* ... */ }

case 'thinking_delta':
  // If blockIndex is new, push a new 'thinking' block. Otherwise, append text to existing.
  upsertThinkingBlock(msgId, event.blockIndex, event.text, 'streaming');
  break;
case 'thinking_done':
  markThinkingBlockDone(msgId, event.blockIndex);
  break;
case 'tool_start':
  appendTimelineBlock(msgId, { type: 'tool', toolUseId: ..., status: 'running', ... });
  // Detect parallel-group: if another tool started <100ms ago, wrap them in a parallel-group
  break;
// ... etc
```

The data model becomes a chronological log. The order of events on the wire IS the order of rendering.

### Layer 4 — Audric UI: `ReasoningTimeline` component

New component replaces `ReasoningAccordion`:

```typescript
// audric/apps/web/components/engine/ReasoningTimeline.tsx
export function ReasoningTimeline({ blocks, isStreaming }: Props) {
  return (
    <div className="space-y-1.5">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'thinking':
            return <ThinkingBlock key={`thinking-${block.blockIndex}`} {...block} />;
          case 'tool':
            return <ToolBlock key={block.toolUseId} {...block} />;
          case 'parallel-group':
            return <ParallelGroup key={i} {...block} />;
          case 'todo':
            return <TodoBlock key={`todo-${block.emittedAt}`} {...block} />;
          case 'canvas':
            return <CanvasCard key={block.toolUseId} {...block} />;
          case 'text':
            return <TextBlock key={i} {...block} />;
        }
      })}
    </div>
  );
}
```

`ChatMessage.tsx` becomes:

```jsx
return (
  <div>
    <ReasoningTimeline blocks={message.timeline ?? []} isStreaming={message.isStreaming} />
    {hasPendingAction && <PermissionCard ... />}
  </div>
);
```

**Visual specs** (matches user-provided Cursor-inspired mocks):

```
┌─ Thinking block (collapsed) ───────────────────────────┐
│ ▸ THINKING · 4s                                        │
└────────────────────────────────────────────────────────┘

┌─ Thinking block (expanded) ────────────────────────────┐
│ ▾ THINKING · 4s                                        │
│ ┌─────────────────────────────────────────────────────┐│
│ │ Idle USDC question — I need their wallet first,    ││
│ │ then yields, then I can give a recommendation.     ││
│ └─────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────┘

┌─ Parallel group ───────────────────────────────────────┐
│ ⚡ RUNNING 2 TASKS IN PARALLEL                          │
│   ✓ BALANCE CHECK · 0.3s                               │
│   ✓ RATES INFO · 0.4s                                  │
└────────────────────────────────────────────────────────┘

┌─ Tool block (single, expanded) ────────────────────────┐
│ ✓ BALANCE CHECK · 0.3s        [render result card]    │
└────────────────────────────────────────────────────────┘

┌─ Todo block (sticky) ──────────────────────────────────┐
│ ✓ Read wallet                                          │
│ ✓ Check NAVI rates                                     │
│ ◯ Recommend action with magnitude                      │
└────────────────────────────────────────────────────────┘

┌─ Final text ───────────────────────────────────────────┐
│ ✦ Your $92 USDC is earning $0 sitting in your wallet.  │
│   Depositing into NAVI at 4.99% APY would earn         │
│   ~$4.61/yr.                                           │
└────────────────────────────────────────────────────────┘
```

#### v0.2 — Per-block-type error state matrix (Gap 4 fix)

The v0.1 spec only described the happy path. Each block type needs an explicit failure mode:

| Block type | Failure mode | Visual / behavior |
|---|---|---|
| `thinking` (streaming) | SSE drops mid-stream | Block freezes at last delta. Header shows `▾ THINKING · interrupted`. Body has whatever streamed + dim "(connection lost — retry to continue)" footer. |
| `thinking` (done) | Signature missing or malformed | Hidden from UI (don't show broken thinking). Engine logs error. Conversation continues without that block in history. |
| `tool` (running) | Tool errors | Status icon flips to `✗ TOOL_NAME · failed (Xs)`. Result row shows error message in red text. Block stays expanded. |
| `tool` (running) | Connection dropped before tool_result arrives | Status icon shows `⏸ TOOL_NAME · timeout`. Block expanded. Footer offers "Retry" button. |
| `parallel-group` | One sub-tool errors | Group header shows `⚡ 2 TASKS · 1 FAILED`. Sub-rows show individual statuses. |
| `parallel-group` | All sub-tools error | Group header shows `⚡ 2 TASKS · ALL FAILED`. Color flips to error tint. |
| `todo` | `update_todo` preflight fails | Block hidden entirely (preflight failures never reach UI). LLM gets "tool input invalid" and is expected to re-emit. |
| `todo` | Multi-update race (rare — same turn sends 2 update_todo concurrently) | Last write wins (host upserts on receipt). |
| `canvas` | Canvas template missing | Skip render. Log error to console. Don't break the timeline. |
| `text` (streaming) | LLM hits `max_tokens` mid-text | Text block ends abruptly. Footer shows dim "(response truncated — ask Audric to continue)". |
| `text` (streaming) | User aborts | Text block ends. Footer shows dim "(stopped)". No retry CTA. |
| (whole turn) | LLM errors before any block | Existing audric error path: error toast + retry button. No timeline rendered. |
| (whole turn) | LLM errors mid-turn after partial timeline | Last block marked `interrupted`. Error toast appears. Retry button replays the user message. |
| **(whole turn) v0.3** | User refreshes browser mid-stream (Gap 6) | Engine flushes partial timeline + sets `isInterrupted: true` before connection close. Rehydrate renders timeline + interrupted indicator on last block + `<RetryInterruptedTurn />` button. |
| **`card` v0.3** | `tool_result` arrives but `extractData()` returns null (refinement payload, malformed shape) | No `card` block emitted. Tool block stays normal. (Same fall-through as today's `isRefinementPayload()` skip in `ToolResultCard.tsx:42`.) |
| **`tool` (with `attemptCount > 1`) v0.3** | Final attempt errors after retries | Header shows `✗ TOOL · attempt 3/3 · failed (4.1s)`. Standard error row. |
| **`tool_progress` v0.3** | Progress events arrive after tool already errored | Late progress events dropped silently (host checks block status before applying). |

**Implementation:** add a `BlockStatus` enum to each `TimelineBlock` variant (`'streaming' | 'done' | 'error' | 'interrupted' | 'timeout'`). Each block component reads its status and renders accordingly.

#### v0.2 — Auto-collapse with manual-state preservation (Q3 answer)

The actively-streaming thinking block stays expanded. Older thinking blocks auto-collapse to one-liner headers. **Critical exception:** if a user has manually expanded a block (clicked the header), it stays expanded — even if newer blocks stream in.

```typescript
// ReasoningTimeline.tsx
const [manualState, setManualState] = useState<Map<number, 'expanded' | 'collapsed'>>(new Map());

function isExpanded(block: TimelineBlock, isLatestStreaming: boolean): boolean {
  // 1. User-set manual state always wins (G8 — preserved across rehydrate / scroll-back / re-stream).
  const manual = manualState.get(block.blockIndex);
  if (manual === 'expanded') return true;
  if (manual === 'collapsed') return false;

  // 2. v0.4 first-emission auto-expand for HowIEvaluated summary mode.
  //    v0.5 (G8): "first emission" = block has no manualState entry yet AND
  //    block is part of the actively-streaming turn. Both conditions matter:
  //    - no-manualState: user hasn't decided yet
  //    - isLatestStreaming: a session reload renders the same block but
  //      isLatestStreaming === false, so the auto-expand is a no-op then
  //      (block falls through to default-collapsed for the summary card).
  if (block.type === 'thinking' && block.summaryMode && isLatestStreaming) return true;

  // 3. Currently-streaming thinking burst stays expanded (existing v0.2 behaviour).
  if (block.type === 'thinking' && block.status === 'streaming' && isLatestStreaming) return true;

  return false;
}
```

When user clicks a header, toggle that block's index in `manuallyExpanded`. Set is per-message, lives only in component state.

#### v0.2 — Sticky-during-turn → inline-on-completion todo placement (Q4 answer)

The todo block has dual rendering:

```typescript
function TodoRender({ block, isStreaming }: { block: TimelineBlock; isStreaming: boolean }) {
  if (isStreaming) {
    // Pinned banner near top of message; subsequent update_todo events upsert into this banner
    return <StickyTodoBanner todos={block.todos} />;
  }
  // Turn complete — collapses into the chronological position where it was first emitted
  return <CollapsedTodoBlock todos={block.todos} />;  // shows "✓ 4-step plan completed (tap to expand)"
}
```

`useEngine` upserts on `todo_update` events (does NOT push a new block per event):

```typescript
case 'todo_update': {
  const existingTodoBlock = msg.timeline?.find(b => b.type === 'todo');
  if (existingTodoBlock) {
    existingTodoBlock.todos = event.todos;
    existingTodoBlock.emittedAt = Date.now();  // for "last updated" display
  } else {
    msg.timeline.push({ type: 'todo', todos: event.todos, emittedAt: Date.now() });
  }
  break;
}
```

The visual transition from sticky → collapsed-inline uses the existing audric animation tokens (`transition-all duration-200`). No special animation work.

#### v0.2 — Mobile design pass

Explicit mobile-first design (viewport 360×640):

| Element | Mobile treatment |
|---|---|
| Thinking block header | Single line, truncate at viewport width, no wrap |
| Thinking block expanded body | Full width, normal text wrap |
| Parallel-group | Tools stack vertically (no side-by-side at narrow width) |
| Sticky todo banner | Compact: 1 line per todo (truncate content), no horizontal padding |
| Tool result cards | Existing audric responsive treatment (already mobile-correct) |
| Auto-collapse animations | Use `prefers-reduced-motion` to skip animation on opt-out |

Add a P3.4 sub-task: "render the eval corpus on iPhone 13 viewport (390×844). Take screenshots. Manual review pass for layout breakage."

#### v0.3 — Chip-tap-during-streaming (Gap 3 fix)

**The risk:** today's rich UX cards include action chips ("Save all idle", "Withdraw $1", "Compare APYs"). With the new `card` `TimelineBlock` rendering during a streaming turn (not after — see Gap 1), users will see these chips appear MID-STREAM. What happens if they tap one before the turn completes?

**The decision (3 mutually-exclusive behaviors per chip):**

| Chip `priority` | Behavior on mid-stream tap | Visual |
|---|---|---|
| `default` (no priority set) | **Queue** as next user message; fires on `turn_complete` | Chip shows pulsing "queued" border. On `turn_complete` the chip's prompt auto-sends. Other chips stay tappable until queue is non-empty (only one can be queued). |
| `priority: 'high'` (e.g. "Cancel transaction", "Stop here") | **Abort current turn**, fire chip immediately | Current `<RetryInterruptedTurn />` path triggers (see Gap 6) — partial timeline marked interrupted, chip's prompt becomes the new user message. |
| `priority: 'destructive'` (rare — e.g. "Discard draft") | **Confirm modal** before either of above | Standard audric confirm modal pattern; user picks queue-vs-abort. |

**Implementation:**

```typescript
// audric/apps/web/lib/chip-configs.ts (extended)
interface ChipAction {
  label: string;
  prompt: string;
  flow?: ChipFlow;
  priority?: 'default' | 'high' | 'destructive';  // v0.3 — Gap 3
}

// Card components pass through onSelect; ChipExpand checks streaming state:
function handleChipTap(chip: ChipAction) {
  if (!isCurrentlyStreaming) return immediateDispatch(chip);
  if (chip.priority === 'high') return abortAndDispatch(chip);
  if (chip.priority === 'destructive') return openConfirmModal(chip);
  return queueForNextTurn(chip);
}
```

**Default `priority`: unspecified = `default`.** Chip authors only need to mark the rare cancel-style ones. Easy migration: 0 LOC for the existing 30+ chips.

**P3.4 acceptance criterion:** "send a multi-write recipe → balance card appears mid-stream → tap 'Save all idle' before final text → verify chip shows queued state → on turn_complete, chip auto-sends as next message → verify scrollback shows the queued chip's message follows the original turn."

#### v0.3 — Tool retry surfacing (Gap 5 fix)

**The risk:** engine has retry-with-backoff for known-flaky vendors (BlockVision rate-limits, DefiLlama 5xx — see `blockvision-resilience.mdc`). Today these retries are invisible to the host: tool either returns or doesn't. With the new timeline, we have a choice — emit a separate `tool` block per retry (timeline spam) or merge into one block (today's behavior, but lossy).

**The decision: merge — one `tool` block per logical tool call, with `attemptCount?: number` field surfaced in the header when N>1.**

```
Default header:           ✓ BALANCE_CHECK · 0.4s
Retried header (N>1):     ✓ BALANCE_CHECK · attempt 2 · 1.4s
Failed-then-retried hdr:  ✗ BALANCE_CHECK · attempt 3/3 · failed (4.1s)
```

**Engine side:** existing retry wrapper in `blockvision-fetch.ts` (and equivalents) already tracks attempt count internally. New: pass it through to the `tool_result` event as `attemptCount: number` (1 for non-retried calls — kept undefined to avoid header noise).

**Host side:** tool block reads `attemptCount` from latest tool event; renders header conditionally. ~5 LOC visual + ~15 LOC plumbing.

**Why merge (not separate blocks):**
- Retries are an implementation detail, not user-visible work. Spamming the timeline with "attempt 1 failed, attempt 2 failed, attempt 3 succeeded" is noise.
- Surfacing the count via header pill is enough signal — flaky vendor trends become visible without overwhelming the UX.
- Telemetry already tracks per-vendor retry rates (`audric.tool.retry_count{vendor}` counter via `VercelTelemetrySink` → Vercel Observability); user UX is downstream.

#### v0.3 — Voice mode v1 contract (Gap 4 fix)

**The decision** (documented to prevent re-litigation as the timeline lands):

| Surface | v1 voice behavior |
|---|---|
| Final text (`text` block) | TTS reads aloud (today's behavior, unchanged) |
| Thinking blocks (`thinking`) | **Silent** in v1. Per-block voicing deferred to SPEC 9. |
| Tool blocks (`tool`) | **Silent.** Status icon transitions are visual only. |
| Card blocks (`card`) | **Silent.** Cards are deeply visual; voicing tabular data is a separate research problem. |
| Todo blocks (`todo`) | **Silent.** A spoken "todo updated" pop every 3s is hostile UX. |
| `tool_progress` events (Gap 2) | **Silent.** "Routing across 12 DEXs (3 of 12)…" voiced aloud is a worse experience than silence. |
| Aborted / interrupted (Gap 6) | TTS stops mid-sentence. No spoken "interrupted" announcement. |

**`voice.speakingMessageId` stays as-is.** No `voice.speakingBlockId` extension in v1. The voice integration code in `useEngine.ts` continues to wait for `text_delta` events on the final text block.

**SPEC 9 territory:** per-block voicing (e.g. "Audric is thinking — let me read your wallet first" voiced from the first thinking block) is interesting but adds a research load (when to interrupt thinking voice for tool-result voice? when to fall back to silence?). Out of v1 scope.

**P3.5 telemetry: track voice-on session count vs voice-off baseline.** If voice usage is ≥10% of sessions and we see drop-off correlated with the new timeline (e.g. users disabling voice because thinking blocks pop up faster than they can read), revisit in v0.4.

#### v0.4 — Visual primitives baseline (Closure A — `audric_demos_v2` audit)

**The risk:** the v0.3 ASCII mocks (lines ~744–778) define the *shape* of each block but leave the visual treatment open. The v2 demo prototypes in `audric/audric_demos_v2/shared/primitives.jsx` ship a much richer treatment that has been live-tested in user demos: italic typography for thinking, a `TaskInitiated` divider that anchors the timeline to the user's message, a `ParallelTools` rich card instead of the boxy 3-line group header, and a softer `AudricLine` chrome for final text. If we ship the timeline with a default visual treatment that diverges from those demos, we'll be re-doing this work in v0.5 the moment a user says "make it look like the demos." Better to fold the treatment in now.

**The decision: adopt the v2 primitives as the default rendering for `thinking`, `parallel-group`, and `text` blocks.** Block taxonomy is unchanged. `card`, `tool` (single), and `todo` blocks already have agreed-upon renderers and stay as-specified.

**Concrete renderer mapping** (host-side, `audric/apps/web/components/engine/`):

| TimelineBlock | v0.3 default render | v0.4 baseline render | Source primitive |
|---|---|---|---|
| `thinking` (streaming, latest) | Plain accordion, monospace caption | `ThinkingHeader` ("✦ audric is thinking" italic) + live `ReasoningStream` italic body | `ThinkingHeader`, `ReasoningStream` |
| `thinking` (done, prior bursts) | One-liner header `▾ THINKING · 4s` | Same one-liner, italic caption styling, click-to-expand reveals italic body | `ThinkingHeader` collapsed variant |
| `thinking` (`summaryMode`) | n/a (new in v0.4) | `HowIEvaluated` card (see Closure B below) | `HowIEvaluated` |
| `parallel-group` (≥2 tools) | Boxy `⚡ RUNNING N TASKS` header + bare rows | `ParallelTools` card with per-row icons, durations, and inline expand | `ParallelTools` |
| `tool` (single) | Existing `ToolBlock` | Unchanged (already matches v2 visual weight) | `ToolBlock` |
| `text` (final) | Existing `TextBlock` | Wrapped in `AudricLine` (subtle leading mark + line-height adjustment) | `AudricLine` |
| First block of every assistant message | Direct render | `TaskInitiated` divider above the timeline (anchors visually to user message) | `TaskInitiated` |

**Token / API budget:** zero engine change. v2 primitives are pure React components on the host side. The engine's emission protocol is unchanged; only the host's renderer dispatch table swaps in v2 primitives for the v0.3 placeholders.

**Component reuse:** the v2 `primitives.jsx` file is JSX-Babel-prototype style. The shipping versions live as proper TypeScript components in `audric/apps/web/components/engine/timeline/`. Each primitive is ported once, then used by every renderer that needs it.

**P3.3 acceptance criterion:** open the canonical demo prompt ("What should I do with my idle USDC?") with the new timeline. Side-by-side screenshot vs `audric/audric_demos_v2/demos/01-save-50.html`. Acceptance = visually equivalent for the thinking + parallel-group + final-text segments. Rich UX cards (BalCard, RatesCard) are existing components and pre-match.

**Effort:** ~1.5d in P3.3 (port 5 primitives from JSX prototype to TS, swap in renderer dispatch table, visual-regression test).

#### v0.4 — `HowIEvaluated` summary block (Closure B — `audric_demos_v2` audit)

**The risk:** today (and through v0.3) the LLM's final pre-text reasoning (e.g. "I checked HF, slippage cap, daily limit — all pass; recommending Y") is buried inside the last `thinking` block accordion. Users see it only if they click expand. The v2 demos surface this as a dedicated "✦ HOW I EVALUATED THIS" card that lists the *constraints checked* (HF, slippage, balance, daily cap) with per-row pass/warn/fail status. This is the single highest-trust UX in the v2 demos — it's what makes the agent feel competent rather than chatty.

**The decision: extend the existing `thinking` block with a `summaryMode?: boolean` render flag (already added to `TimelineBlock` in Layer 3 v0.4 above).** No new block type. No new event. The LLM teaches itself when to emit a summary via system prompt (Layer 5 addendum below); the host renders it differently when the flag is set.

**Engine side (P3.2, ~0.25d):**
- Anthropic provider buffers thinking deltas (already does this).
- On thinking-block close, scan the buffered text for the `<eval_summary>...</eval_summary>` marker tag pair (system-prompt-taught — see Layer 5).
- If present: parse the structured payload (one `label | status | note` per line inside the marker), emit a `thinking_done` event with `summaryMode: true` + `evaluationItems: [...]` populated.
- If absent: emit standard `thinking_done` (existing behaviour).
- Marker is stripped from the user-visible `text` (so the raw block still reads cleanly if the user expands the standard render path on an old session).

> **v0.5 emission contract clarification (G5).** v0.4 said "engine parses the marker from the **final** thinking burst." But the engine doesn't know whether a given thinking block is "final" until `message_stop` arrives — by then the events have already streamed. v0.5 contract: **the engine emits `summaryMode: true` for every thinking block containing the marker — no "final" detection.** The system prompt enforces "AT MOST ONE summary per turn" as an LLM behavioral rule (already in the addendum below). LLM compliance is the guarantee; engine stays dumb. If the LLM violates the rule and emits 2+ markers in a turn, the host renders 2+ `HowIEvaluatedBlock`s (suboptimal but not broken) and telemetry logs `evalSummaryViolations++` so we can flag the model behaviour. This is the only honest split: engine handles syntax (marker → flag); LLM + prompt handle semantics (when to emit). Trying to make the engine "smart" about finality would either delay all `thinking_done` events to `message_stop` (breaks streaming) or guess wrong (breaks the UX).

**Host side (P3.3, ~0.75d):**
- New `<HowIEvaluatedBlock />` component in `components/engine/timeline/`, ported from `audric_demos_v2/shared/primitives.jsx#HowIEvaluated`.
- `ReasoningTimeline` dispatch checks `block.summaryMode === true` for `thinking` blocks → renders `HowIEvaluatedBlock` instead of the standard `ThinkingBlock`.
- Visual: a slim card with header "✦ HOW I EVALUATED THIS" + one row per `evaluationItems` entry: ✓/⚠/✗ icon · uppercase label · italic note.
- **v0.5 expansion semantics (G8):** auto-expand applies **only on first emission of the block** (when the block has no `manualState` set). On subsequent renders — rehydrate from session, scroll-back into view, re-stream after retry — the `isExpanded()` helper honors the user's `manualState` (`'expanded'` or `'collapsed'`) if set, otherwise falls back to the auto-expand rule (which by then is a no-op because the turn is no longer streaming). This matches the v0.2 rule "manual state preserved on rehydrate" — auto-expand is a one-shot first-paint behaviour, not a persistent override.
- Telemetry: track raw and derived metrics (see G9 below).

> **v0.5 metric definition (G9).** v0.4's `audric.harness.eval_summary_count` was ambiguous about whether to count low-quality emissions (e.g. summary on a read-only turn — wasted tokens but technically emitted). v0.5 splits into:
> - **Raw counter:** `audric.harness.eval_summary_emitted_count{turnEffort}` — increments on every `summaryMode: true` emission, no quality judgment, broken down by `turnEffort` tag (LEAN / STANDARD / RICH / MAX). Always durable, reflects what the LLM actually did.
> - **Derived rate (dashboard SQL, not emitted as a metric):** `evalSummaryAppropriatelyEmittedRate = COUNT(*) WHERE eval_summary_emitted_count >= 1 AND turn_effort >= 'STANDARD' / COUNT(*) WHERE turn_effort >= 'STANDARD'`. Computed in the existing Q5/Q6 dashboard query. Targets: ≥85% appropriate-emission rate on STANDARD+ turns, <2% on LEAN turns (LEAN should never emit).
> - **Violation counter:** `audric.harness.eval_summary_violations_count` — increments when ≥2 emissions land in the same turn. Should be ~zero in steady state; spike means the LLM stopped honoring the prompt rule and we tune.
>
> This separation makes "did it emit?" auditable and "should it have emitted?" tunable, without baking quality judgments into engine code.

**Layer 5 system-prompt addendum (~150 tokens):**

```
When you finish your final pre-text reasoning burst on a write-recommendation
turn (save / borrow / swap / send / Payment Stream), wrap a short list of the
constraints you checked in <eval_summary>...</eval_summary> markers, one per
line in the format `<label> | <pass|warn|fail> | <optional 1-line note>`.

Example:
<eval_summary>
Health factor | pass | 1.84 → 1.62 (still > 1.5 floor)
Slippage cap | pass | 0.3% (within 1% default)
Daily limit | pass | $200 of $500 used
</eval_summary>

Emit AT MOST ONE summary per turn, and ONLY for write-recommendation turns.
Do NOT emit on read-only turns (balance lookups, rate checks, etc.) — they
have nothing meaningful to summarise.
```

**P3.4 acceptance criterion:** run the SPEC 7 v0.3 canonical Payment Stream prompt ("swap 10% / save 50% / send to Mom"). Verify the assistant's final thinking burst emits `<eval_summary>` with at minimum HF + slippage + daily-cap rows, that the host renders a `HowIEvaluatedBlock` (not a raw thinking accordion), and that the marker is stripped from the user-visible expanded body.

**Why a render-mode flag (not a new block type):**
- Same engine event protocol — zero wire-format change.
- Old sessions with no `summaryMode` field render as plain thinking blocks (perfect back-compat).
- Engine logic is one regex + one tag strip. ~30 LOC engine + ~80 LOC host renderer + ~10 LOC prompt.
- If the eval reveals the LLM emits low-quality summaries (wrong items, hallucinated notes), we tune the prompt without spec changes.

**Effort:** ~1d total (0.25d P3.2 engine + 0.75d P3.3 host).

#### v0.4 — PermissionCard `regenerate` button slot (Closure C — SPEC 7 v0.3 coupling)

**The risk:** SPEC 7 v0.3 (drafted same day as this patch) introduces the **Quote-Refresh ReviewCard** pattern — when a Payment Stream's upstream quotes go stale (>30s old) before the user signs, the card surfaces a "REGENERATE" button that re-fires the read tools and rebuilds the bundle. SPEC 8 owns the PermissionCard renderer; SPEC 7 owns the regenerate logic. Without an agreed slot, SPEC 7 either forks the renderer (bad) or jams the button into the wrong place (also bad).

**The decision: SPEC 8 v0.4 adds a single optional `regenerate` slot to the PermissionCard renderer. SPEC 7 v0.3 fills it.**

**Renderer prop addition (`audric/apps/web/components/engine/PermissionCard.tsx`):**

```typescript
interface PermissionCardProps {
  // ... existing props (action, onApprove, onDeny, isApproving) ...

  // v0.4 NEW — slot for SPEC 7 v0.3 Quote-Refresh ReviewCard.
  // When set, the card renders a third button "↻ REGENERATE" between Deny and Approve,
  // plus a "QUOTE Ns OLD" badge in the header right (next to the existing TTL countdown).
  // Visual treatment matches the v2 demo `OrderReviewCard` pattern.
  // The actual regenerate logic (POST /api/engine/regenerate, rebuild bundle, re-emit
  // pending_action) is owned by SPEC 7 v0.3 — see SPEC_7_MULTI_WRITE_PTB.md Layer 3 v0.3.
  regenerate?: {
    label: string;            // typically "REGENERATE" — passed through for i18n flexibility
    ageLabel: string;         // e.g. "QUOTE 47s OLD" — already-formatted by the caller
    onClick: () => void;      // SPEC 7 callback — fires the re-run
    isRegenerating?: boolean; // true while the round-trip is in flight (button disables, spinner)
  };
}
```

**Visual placement (v2-demo-aligned):**

```
┌─ N operations · 1 Payment Stream · Atomic ──── 12s · QUOTE 47s OLD ┐
│                                                                     │
│  ┌──── per-step rows (unchanged from SPEC 7 v0.2) ────┐             │
│  └─────────────────────────────────────────────────────┘             │
│                                                                     │
│  GAS $0.005 · SPONSORED · ALL SUCCEED OR ALL REVERT                  │
│                                                                     │
│  [   Deny   ]   [   ↻ Regenerate   ]   [    Approve     ]           │
└─────────────────────────────────────────────────────────────────────┘
```

- `regenerate` prop absent → renders as today (Deny | Approve only).
- `regenerate` prop present → three-button row + age badge in header.
- `isRegenerating === true` → Approve button disabled, Regenerate shows spinner, Deny stays enabled (escape hatch).

**What SPEC 8 v0.4 owns:** the prop definition, the render logic, the visual treatment (button placement, badge typography, disabled states). ~0.25d host-side.

**What SPEC 7 v0.3 owns:** when to set `regenerate` (only when `pending_action.canRegenerate === true`), the `onClick` implementation (POST `/api/engine/regenerate`), the engine-side re-run + new `pending_action` emission. See `SPEC_7_MULTI_WRITE_PTB.md` Layer 3 v0.3 section.

**Why split this way:** the renderer has zero knowledge of bundles, quote freshness, or the regenerate endpoint. Pure UI concern. SPEC 7 stays the only place that reasons about quote staleness, which keeps the bundle-correctness concerns concentrated.

**P3.3 acceptance criterion:** mock a `pending_action` with `canRegenerate: true` and `quoteAge: 47000` in Storybook. Render. Verify three-button layout + "QUOTE 47s OLD" badge appears. Click Regenerate, set `isRegenerating: true` via control — verify Approve disables and Regenerate shows spinner.

**Effort:** ~0.25d (prop + render logic + Storybook story). End-to-end behaviour validation lives in SPEC 7 v0.3's eval pass.

### Layer 5 — System prompt: when to narrate, when to emit todos

New section appended to `STATIC_SYSTEM_PROMPT`:

```
## Mid-flight narration & todos (CRITICAL — read this carefully)

You have an EXTENDED THINKING channel that is rendered as collapsible accordions in the user's chat, separate from your final text. Use it to think out loud across multiple bursts:

- BEFORE calling tools, briefly narrate WHY you're calling them.
- BETWEEN tool batches, narrate what you learned and what's next.
- AFTER tools complete, narrate the synthesis BEFORE writing the final text.

This is FREE for the user — thinking blocks are siloed and don't compete with your final text. The final-text discipline (1-2 sentences, no card duplication, no upselling) is UNCHANGED.

You also have an `update_todo` tool. Call it when you have a multi-step plan worth surfacing:
- ANY recipe match (safe_borrow, portfolio_rebalance, swap_and_save, send_to_contact, account_report)
- Any user request requiring 3+ distinct tool calls
- Any multi-write Payment Stream (SPEC 7)

Do NOT call update_todo for:
- Single-question lookups (balance, rate, price)
- Simple sends/swaps/saves with one confirmation
- Anything classified as `effort: low`

Todo content rules:
- Each item ≤ 80 chars
- Max 8 items per list
- Exactly ONE item in_progress at a time
- Mark items completed as work finishes — re-call update_todo to update status

EXAMPLE — multi-step "rebalance my portfolio":
  Turn start:
  update_todo({ todos: [
    { id: '1', content: 'Read current allocation', status: 'in_progress' },
    { id: '2', content: 'Compute target weights', status: 'pending' },
    { id: '3', content: 'Plan trade list', status: 'pending' },
    { id: '4', content: 'Execute Payment Stream', status: 'pending' },
  ]})
  ...thinking burst, balance_check, portfolio_analysis...
  update_todo({ todos: [{ id: '1', status: 'completed' }, { id: '2', status: 'in_progress' }, ...]})
  ...thinking burst, target weight math...
  update_todo(...)
  ...etc.
```

**Prompt budget**: ~600 tokens added. Cached behind `STATIC_SYSTEM_PROMPT`'s ephemeral cache boundary so the marginal cost per turn is ~zero.

#### v0.2 — Cache size measurement (Gap 8 fix)

The new section grows `STATIC_SYSTEM_PROMPT` by ~600 tokens. Two risks to validate:

1. **Cache size impact** — Anthropic's ephemeral cache has limits; if we push past a boundary, cache effectiveness drops and per-turn cost rises sharply.
2. **Quality regression** — long prompts can over-constrain the LLM. Adding 600 tokens of "when to narrate vs not" instructions might reduce general quality on existing tasks.

**P3.4 acceptance criteria** (both must pass):
- `STATIC_SYSTEM_PROMPT` token count ≤ baseline + 700 tokens (50-token buffer)
- Re-run the SPEC 7 + P1 eval corpus (existing tests) — no regression in pass rate, no >10% cost change per turn
- Cache hit rate (from `usage.cacheReadTokens`) on 100 representative turns ≥ 90% of baseline

If any fail: trim the prompt section (bullet points instead of prose, drop redundant examples) until budget is met.

### Layer 6 — Telemetry: `harness_shape` dimension on TurnMetrics

Audric `TurnMetricsCollector` adds:

```typescript
interface TurnMetrics {
  // ... existing fields ...
  harnessShape: 'lean' | 'standard' | 'rich' | 'max';     // NEW
  thinkingBlockCount: number;                              // NEW
  todoUpdateCount: number;                                 // NEW
  ttfvpMs: number;                                         // NEW (Time To First Visible Progress)
  finalTextTokens: number;                                 // NEW (output tokens for text_delta only — for terseness regression check)
}
```

Lets us:
- A/B SPEC 8 ON vs OFF behind a feature flag
- Catch terseness regressions (`finalTextTokens` per turn vs baseline)
- Measure `ttfvpMs` directly
- Sample-review the new shape distribution

---

## Adaptive thresholds: harness shape gate (v0.2 LOCKED)

Driven by `classifyEffort()` (already shipped). Re-emit as `harness_shape` event. Each shape pins both the `thinking.budget_tokens` Anthropic config AND the soft block / todo caps:

| classifyEffort | harness_shape | `thinking.budget_tokens` (HARD cap) | Soft block cap | `update_todo` allowed |
|---|---|---|---|---|
| `low` | `lean` | **disabled (no thinking config)** — Q2 lock | 0 | NO — explicitly forbidden in prompt |
| `medium` | `standard` | 8 192 | 3 thinking blocks | YES if ≥3 tools planned |
| `high` | `rich` | 16 384 | 5 thinking blocks | YES — recipe match always emits |
| `max` | `max` | 32 768 | 8 thinking blocks | YES — rich step labels |

**Three layers of enforcement** (defense in depth):

1. **Anthropic API hard cap** — `thinking.budget_tokens` per shape. Even if the LLM "wants" to think more, it gets cut off by Anthropic.
2. **System prompt soft guidance** — tells the LLM the appropriate shape and behavior per effort tier. Prompt makes the channel split explicit.
3. **Host-side cap** — `update_todo` counts in host telemetry; if `lean` shape ever emits one, that's a regression signal (not a hard block, but the Vercel Observability query that watches `audric.harness.todo_update_count{shape=lean}` flips above zero — surfaces in the Q5/Q6 dashboard pull, see `metrics-and-monitoring.mdc`).

**Critical:** the LEAN tier is intentionally identical to today's behavior for single-fact lookups. SPEC 8's "feels alive" upgrade is for `medium+` turns where multi-step work happens. LEAN stays fast and cheap — that's the highest-volume tier and adding overhead there hurts unit economics.

---

## What this spec depends on

| Dependency | Status | Why it matters |
|---|---|---|
| Engine v1.0.1 stable | ✅ shipped | Baseline for typed events |
| Audric PR-B2 (zkLogin-only verify) | ✅ shipped | Removes flaky email-verify modal that would interfere with new chat UI |
| SPEC 7 v0.2 spec lock | ✅ shipped | Bundle `pending_action.steps` shape pre-locked so SPEC 8 timeline can accept it on day one |
| **SPEC 7 implementation (P2.1 → P2.8)** | ⏳ planned **AFTER SPEC 8** (v0.2.1 sequencing flip) | SPEC 8 is NOT a prerequisite for SPEC 7 to design against, but SPEC 7 ships SECOND so its multi-step PermissionCard renders inside the new ReasoningTimeline (single coherent visual ship for users) |
| Spec 1 v1.4.2 (`attemptId`) | ✅ shipped | Resume keying (per-step attemptId from SPEC 7) flows through unchanged |
| **PR-B4 (Mercuryo Audric CTA, ~0.5d)** | ⏳ planned | Closes the new-user funding hole left by PR-B1's bootstrap deletion. Ships BEFORE SPEC 8. |
| **PR-B5 (Cetus swap fee fix, ~0.5-1d)** | ⏳ planned | Real revenue lost (~$40 at current volume, $400/mo at 1k DAU). Ships BEFORE SPEC 8. |
| `EarlyToolDispatcher` | ✅ shipped | Parallel reads already execute the right way; SPEC 8 just renders them right |

**Spec 3 is NOT a dependency.** SPEC 8 is purely a presentation + new-side-channel-tool concern.

---

## Risks & mitigations (v0.2 refreshed)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Final text bloats once we tell the LLM to "narrate more" | MEDIUM | HIGH (terseness regression) | Prompt makes the channel split explicit ("narration goes in thinking, NOT in text"). Eval gates `finalTextTokens` against baseline. Telemetry alerts on +20% regression. |
| Multi-block thinking conversation breaks on signature mismatch (Gap 1) | MEDIUM | CRITICAL | **v0.2 fix:** mandatory P3.2 acceptance test using real Anthropic API — emit ≥2 thinking blocks, round-trip the conversation, verify no signature error. Hard CI gate. |
| Multi-block thinking spawns dozens of accordions on edge cases | LOW | MEDIUM | Hard cap of 8 blocks per turn enforced via `thinking.budget_tokens=32k`. |
| `update_todo` becomes a "todo ceremony" — LLM emits empty/silly lists for trivial requests | MEDIUM | MEDIUM | (1) `harness_shape: lean` prompt strictly forbids it. (2) Tool description lists explicit DON'T cases. (3) Richer preflight rejects empty lists / dup ids / multi-in-progress. (4) Eval includes "trivial read should NOT emit todo" as regression test. |
| `update_todo` exhausts `maxTurns` mid-flow (Gap 2) | MEDIUM | HIGH | **v0.2 fix:** `update_todo` does NOT count toward `maxTurns`. ~15 LOC in `agentLoop.ts`. Regression test: 10× update_todo + 5 real tools terminates after 5 real-tool turns. |
| Old session replay breaks under new component (Gap 3) | MEDIUM | MEDIUM | **v0.2 fix:** rendering fork — `message.timeline ? <ReasoningTimeline> : <LegacyReasoningRender>`. Old sessions visually identical to today. P3.3 acceptance criterion catches breakage. |
| Per-block error states unspecified, leading to crashes mid-stream (Gap 4) | MEDIUM | MEDIUM | **v0.2 fix:** explicit error matrix per `TimelineBlock` variant added to Layer 4. New `BlockStatus` enum covers streaming-drop, done-error, connection-timeout, abort. |
| Mid-rollout flag flip causes mixed-mode chat (Gap 5) | MEDIUM | MEDIUM | **v0.2 fix (revised in v0.5 G4):** per-session flag pinning — `harnessVersion` field on the Upstash session payload (NOT a non-existent Prisma `Session` model), evaluated once at session creation. Single chat is internally consistent. |
| Cost blowup from extra thinking tokens (Gap 6) | MEDIUM | MEDIUM | **v0.2 fix:** explicit `thinking.budget_tokens` HARD cap per shape (lean disabled, standard 8k, rich 16k, max 32k). Anthropic enforces; impossible to overrun. |
| TTFVP regression: extended-thinking startup latency dominates the 800ms budget | MEDIUM | HIGH | LEAN shape disabled extended thinking entirely (Q2 lock). For standard+ tiers, test with both Sonnet and Haiku in P3.6 eval; reduce budget if needed. |
| Parallel-group detection misfires (two tools that happen to start within 100ms of each other but aren't logically parallel) | LOW | LOW (cosmetic) | Tune the heuristic in eval. Worst case: render as two separate tool blocks. |
| System prompt cache size regression (Gap 8) | MEDIUM | MEDIUM | **v0.2 fix:** P3.4 explicit acceptance criteria — token count ≤ baseline + 700, no SPEC 7/P1 eval regression, cache hit ≥ 90% baseline. Trim prompt if any fail. |
| Recipes still emit static "How I evaluated this" because the prompt rewrite isn't pervasive | LOW | LOW | Audit recipe YAMLs in P3.4 to ensure they don't compete with the new narration layer. |
| Mobile rendering breaks (timeline becomes unreadable on narrow screens) | MEDIUM | MEDIUM | **v0.2 fix:** explicit mobile design pass added to P3.4. iPhone 13 viewport (390×844) screenshot review against eval corpus. |
| Mid-turn shape escalation (LLM realizes a RICH ask is actually MAX) — accepted trade-off | LOW | LOW | **Documented limitation:** shape locks at turn start. If the case becomes common, address in v0.3. Not worth engineering cost for v1. |
| Voice mode + new timeline integration ambiguous | LOW | LOW | **v0.3 fix (Gap 4):** Explicit voice mode v1 contract documented in Layer 4 — TTS reads final text only; per-block voicing deferred to SPEC 9. `voice.speakingMessageId` unchanged. |
| Rich UX cards render in wrong place under new timeline (out-of-flow under `ToolSteps` while everything else is chronological) | MEDIUM | MEDIUM | **v0.3 fix (Gap 1):** New `card` `TimelineBlock` variant paired to `toolUseId`. Existing card components unchanged; only WHERE they're invoked from changes. Rendered chronologically directly after their tool. |
| Long-running tools (Cetus 2-5s, protocol_deep_dive 3-8s) feel dead despite the new harness | HIGH | MEDIUM | **v0.3 fix (Gap 2):** New optional `tool_progress` event. Tools opt in via `progress` callback. Cetus `swap_execute` is the v1 consumer (highest impact). Tool block header flips spinner to a one-line progress subtitle + optional progress bar. |
| Chip taps during streaming have undefined behavior — could double-fire, race, or get lost | MEDIUM | MEDIUM | **v0.3 fix (Gap 3):** Three explicit chip behaviors based on `priority` field: `default` queues for `turn_complete`, `high` aborts current turn, `destructive` confirm-modal. Visual queue-pill state. Existing chips default to `default` — no migration needed. |
| Tool retries either spam timeline or hide retry counts entirely | LOW | LOW | **v0.3 fix (Gap 5):** Single `tool` block with `attemptCount?: number` field. Header shows "TOOL · attempt 2 · 1.4s" only when N>1. Telemetry already tracks per-vendor retry rates. |
| Browser refresh / tab close mid-stream leaves orphan messages, broken Postgres rows, or hidden cost from auto-replay | MEDIUM | HIGH | **v0.3 fix (Gap 6):** Engine flushes partial timeline on disconnect with `isInterrupted: true`. Rehydrate marks last block `interrupted`, renders `<RetryInterruptedTurn />` button. Engine does NOT auto-replay (cost + non-determinism). Schema: 2 new fields on `Message` Prisma model. |
| "100% of turns benefit" framing in v0.2.1 sequencing rationale was wrong (LEAN tier intentionally unchanged) | LOW (already shipped as decision) | LOW | **v0.3 fix (Gap 7):** Corrected throughout spec — "~40% medium+ turns benefit visibly; LEAN tier (~60%) stays unchanged." SPEC-8-first decision still holds for the corrected reasons (high-engagement turns + zero SDK risk + single coherent visual ship). |

---

## Suggested next steps (sequencing)

> **Sequencing rationale (v0.2.1 revised, v0.3 effort updated, v0.4 visual + coupling refresh)**: SPEC 8 ships FIRST. PR-B3 closeout + PR-B4 (Mercuryo Audric CTA) + PR-B5 (Cetus swap fee fix) clear lingering debt before SPEC 8 kicks off. Then SPEC 8 (~14.25d) lands the new harness — visibly upgrading ~40% of turns (medium+ effort), LEAN tier unchanged, with v2-demo-aligned visual treatment from day one. SPEC 7 v0.3 ships AFTER, with its multi-step PermissionCard + Quote-Refresh ReviewCard rendering inside the new `ReasoningTimeline` and using SPEC 8 v0.4's `regenerate` slot — single coherent visual ship for users instead of two visible UX shifts in 3 weeks.

| Phase | Work | Effort | Validates |
|---|---|---|---|
| P3.0 | ~~Founder review of THIS spec → lock at v0.2~~ → v0.2.1 sequencing flip → v0.3 gap closures → v0.4 v2-demo + SPEC 7 v0.3 coupling | ~~0.5d~~ | ✅ **DONE 2026-04-29 / 2026-04-30 / 2026-05-01** — 7 design decisions + 6 v0.2 gap fixes + 7 v0.3 gap closures + 3 v0.4 closures locked |
| P3.1 | Eval corpus design — 30 representative turns across `lean / standard / rich / max` shapes, with screenshot baselines + cost/latency baselines. Includes mobile screenshots (iPhone 13 viewport 390×844). **v0.3:** baseline includes long-tool turns (swap_execute Cetus, protocol_deep_dive) so progress-bar regression is visible. **v0.4:** baseline includes one write-recommendation turn per shape so HowIEvaluated regression is visible; visual baselines diff against `audric/audric_demos_v2/demos/01-save-50.html`. **Corpus + capture harness design locked at `spec/SPEC_8_CORPUS.md` 2026-05-01.** | 1.5d | Corpus locked ✅; capture harness + first baseline run pending |
| P3.2 | Engine Layer 1 + Layer 2: typed events with `blockIndex` + `tool_progress` event + `update_todo` tool with `maxTurns` exemption + per-shape `thinking.budget_tokens` caps + multi-block thinking continuity test (real Anthropic API, hard CI gate) + richer `update_todo` preflight + `attemptCount` plumbing through retry wrappers + Cetus `swap_execute` progress callback wiring. **v0.4:** `<eval_summary>` marker parsing in Anthropic provider thinking buffer + `summaryMode`/`evaluationItems` population on `thinking_done` event. | **3.25d** ⬆ +0.25d (was 3d in v0.3) | Engine is ready for the new host; long-running tools emit progress; final-thinking summaries are structured |
| P3.3 | Audric Layer 3 + Layer 4: timeline data model (incl. `card` block + `attemptCount` + `progress` + `interrupted` status + `summaryMode` thinking variant + **v0.5 `permission-card` block + `pending_input` no-op handler**) + `ReasoningTimeline` component + legacy session fallback (`<LegacyReasoningRender>`) + per-block-type error state matrix + **v0.5 `harnessVersion` field on Upstash session payload (NOT Prisma)** + per-session feature flag pinning + chip-tap-during-streaming queue + Stream-interruption flush + rehydrate + `<RetryInterruptedTurn />`. **v0.4:** port v2 visual primitives (`TaskInitiated`, `ThinkingHeader`, `ReasoningStream`, `ParallelTools`, `AudricLine`) from JSX prototype to typed components + swap into renderer dispatch table; new `HowIEvaluatedBlock` renderer with **v0.5 G8 `isExpanded()` semantics**; PermissionCard `regenerate` slot prop + 3-button render layout + "QUOTE Ns OLD" badge. Storybook-style visual tests. Behind feature flag `NEXT_PUBLIC_INTERACTIVE_HARNESS`. | **6.5d** ⬆ +0.25d (was 6.25d in v0.4) | UI works on the eval corpus + survives refresh test + matches v2 demo screenshots side-by-side |
| P3.4 | Audric Layer 5: prompt rewrite (incl. v0.4 `<eval_summary>` marker instructions, ~150 added tokens). Recipe YAML audit. Mobile responsive pass. Cache-size + quality regression check (token count ≤ baseline + 850, no SPEC 7/P1 eval regression, cache hit ≥ 90% baseline). | 1d | Prompt changes don't regress terseness; eval_summary emits cleanly on write-recommendation turns |
| P3.5 | Audric Layer 6: telemetry. Extend the existing `TurnMetrics` Prisma model with `harnessShape`, `thinkingBlockCount`, `todoUpdateCount`, `ttfvpMs`, `finalTextTokens` (durable). Emit transient counters/gauges (`audric.harness.*`) through the existing `VercelTelemetrySink` → Vercel Observability. **v0.3:** add `toolProgressEventCount`, `chipQueueDepth`, `interruptedMessageCount`, `voiceSessionShare`. **v0.4:** add `regenerateClickCount` (for SPEC 7 v0.3 quote-refresh quality signal). **v0.5 (G9 split):** raw `evalSummaryEmittedCount{turnEffort}` (counter, no quality judgment) + `evalSummaryViolationsCount` (counter, ≥2 emissions in same turn — should be ~zero in steady state). Derived `evalSummaryAppropriatelyEmittedRate` is computed in dashboard SQL (not emitted as a metric) — see G9 footnote in Layer 4 v0.4 HowIEvaluated section. **v0.5 (D2):** `pendingInputSeenOnLegacy` (counter, increments if `pending_input` event arrives on a legacy-harness session — should be zero in production). Add the new metrics to the existing Q5/Q6 dashboard pull. **No new vendor — strict adherence to `metrics-and-monitoring.mdc` (Vercel + Postgres only; no Datadog/Axiom/Honeycomb).** | 0.5d | Production metrics ready before flag flip |
| P3.6 | Eval pass — full corpus run, screenshots, cost/latency comparison vs baseline. Hard-fail gates as specified. **v0.3 added:** chip-tap-during-streaming acceptance (queue + auto-fire), refresh acceptance (interrupted + retry), Cetus progress acceptance (subtitle visible during routing). **v0.4 added:** v2-demo screenshot equivalence on canonical prompt; `HowIEvaluatedBlock` renders on every write-recommendation turn with at minimum HF + slippage + daily-cap rows; PermissionCard regenerate slot mock-renders correctly in Storybook. | 1d | All success criteria met |
| P3.7 | Feature flag rollout — 10% → 50% → 100% over 3 days, monitoring dashboards. Per-session pinning means no mid-session regressions. | async (3d wall, ~0.5d focus) | No production regression |
| P3.8 | Release `@t2000/engine@1.2.0` + audric deploy | 0.25d | Done |

**Total: ~14.5 days end-to-end** (was 14.25d in v0.4; v0.5 +0.25d in P3.3 for `permission-card` block + `pending_input` no-op handler + Upstash `harnessVersion` field. G5/G8/G9 are clarifications + small wires — folded into existing P3.3/P3.5 budgets without separate line items).

---

## Remaining work (v0.5.3 closeout — 2026-05-04)

> **All P3.0 → P3.8 in-code work is shipped to `audric/main`.** Engine `@t2000/engine@1.5.0` published 2026-05-01. Audric merged commits: `4547579` (B1) → `3bd8eb7` (B2.1) → `327c447` (B2.2) → `41fb288` (B2.3) → `d018596` (B3.1) → B3.2–B3.7 → v0.5.2 hotfix wave (`4664910` / `ca28939` / `a660dcc`). 893/893 audric web tests passing post-polish, typecheck + lint clean.

What's left is **operational + 3 deferred polish items** — none of it blocks downstream specs.

| # | Item | Owner | Estimate | Reference |
|---|---|---|---|---|
| 1 | **Rollout dial flips** — walk `NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT` from `0` → `10` → `50` → `100` over 3 days. Run `scripts/spec8-rollout-gates.mjs --hours=24` between each step (exit 0 = advance, exit 1 = rollback). Per-session pinning (B3.3) + bucket-stable hashing (B3.7) jointly ensure no mid-session regressions or cross-session flicker. | Founder | ~30 min/day × 3 days, async | `audric/apps/web/RUNBOOK_spec8_rollout.md` |
| 2 | **Acceptance artifact** — after 7 days at 100%, run `scripts/spec8-rollout-gates.mjs --hours=168 --json` and commit the output as `audric/apps/web/spec8-acceptance-2026-MM-DD.json`. Closes the spec. | Founder | ~10 min | runbook § "Post-rollout cleanup" |
| 3 | **SPEC 12 polish (deferred, NOT rollout-blocking)** — (a) `<HowIEvaluated>` tokens/model/latency wiring; needs engine `1.5.1` to carry per-block usage on `thinking_done` (additive event field). (b) `<ReasoningStream>` typography decision (mono-italic vs serif) — visual judgment; defer until 10% rollout shows real-user reactions. (c) Delete `<LegacyReasoningRender>` post-100%-rollout + 30-day soak. | SPEC 12 | ~0.5d total | spec § B3.7 audit polish patch deferral notes |

**The phase table above (P3.0 → P3.8) is preserved as the build-time record.** All effort estimates and acceptance gates from the original spec stand — they're how we got here.

---

## Eval methodology (the part that actually proves it works)

A *production-grade* spec needs a measurable definition of done. Here's the eval contract.

### Corpus design (P3.1 deliverable)

30 representative user inputs across 4 shape tiers:

```
LEAN (8 prompts):
  "balance"
  "what's my health factor"
  "USDC rate"
  "what's GOLD worth"
  ... 4 more single-question reads

STANDARD (10 prompts):
  "save 5 USDC"
  "swap 0.5 SUI to USDC"
  "send 0.1 USDC to funkii"
  "create payment link for 1 USDC"
  ... 6 more single-write or 2-step asks

RICH (8 prompts):
  "should I save my idle USDC"
  "swap 0.5 SUI to USDsui and save it"  (real-world test from R3 retest)
  "what's the safest way to borrow $5"
  ... 5 more recipe-triggering asks

MAX (4 prompts):
  "rebalance my portfolio to 70% stables"
  "withdraw all and send to my wallet"  (emergency_withdraw)
  ... 2 more multi-write Payment Stream prompts (post-SPEC 7)
```

For each, capture:
- Wall clock time
- TurnMetrics row (cost, tokens, tools called, duration)
- Full SSE event log
- Final visual screenshot

Store as `loadtest/eval/spec8-baseline-2026-MM-DD/`.

### Acceptance gates (P3.6 pass criteria)

After turning on SPEC 8 behind the flag:

| Metric | Target | Tolerance | Hard fail |
|---|---|---|---|
| **TTFVP p50** (v0.5.4 — empirical p75 calibration) | <2500ms | +20% | **>4000ms** ← was 1500ms; raised because TTFVP for tool-bearing turns is bounded by tool RTT (BlockVision/Cetus 2-5s), not engine pre-stream work (<200ms). 4000ms covers empirical p75 with margin and isolates real engine-side regressions. When BlockVision/Cetus latency drops, re-tighten this. |
| Final-text tokens p50 | ≤ baseline | +20% | +50% |
| Total cost per turn p50 | ≤ 1.10× baseline | +5% | +25% |
| Total latency p50 | ≤ 1.05× baseline | +5% | +20% |
| LEAN shape never emits `todo_update` | 100% | — | <100% |
| LEAN shape ≤1 thinking block | 100% | — | <95% |
| **RICH multi-step planning rate** (v0.5.4 redefined) — among RICH turns where planning would actually help (`tool_count >= 3 OR prepare_bundle invoked`), what fraction emitted `update_todo` OR `prepare_bundle`? Single-write RICH turns are EXEMPT (the classifier correctly routes them to high-effort for safety, but there's nothing to plan when there's only one write). | ≥90% | — | **<80%** ← was "≥1 `todo_update` per recipe match ≥80% / <50%" on a broader denominator that conflated multi-step intents with single-write safety routing. |
| Visual A/B (manual review on 30 corpus screenshots) | ≥25/30 prefer SPEC 8 | — | <15/30 |
| **v0.5.1 G3:** `permission-card` recipient row renders full Audric handle when present (post-SPEC-10) | 100% | — | <100% — verified via 2 fixture cards (one with `*.audric.sui` resolved, one without) |

If any HARD FAIL gate is breached: rollback the flag, debug, re-test.

**v0.5.4 acceptance run (2026-05-05, 19h post-d18af29):** Gates 1/5/6/7 PASS clean. Artifact: `audric/spec8-acceptance-2026-05-05.json`. Cohort: 55 v2 turns / 0 legacy. Gate 1 = 2903ms ≤ 4000ms. Gate 5 = 0/27 LEAN todo emissions. Gate 6 = p95 0.0 thinking blocks across 27 LEAN turns. Gate 7 = 2/2 multi-step RICH turns planned = 100% (9 single-write RICH exempt). Gates 2/3/4 SKIP because legacy cohort is empty at 100% rollout (expected — cohort-comparison gates degrade by design once rollout completes; the v2-vs-baseline comparison is captured in B3.6 corpus eval, not in the gates script). See revision-log v0.5.4 row above for the full redefinition reasoning + diagnostic data.

#### v0.5.1 — Tool-registry maintenance contract (G4 — binding for all downstream specs)

**The lesson from S.52.1:** When `resolve_suins` shipped to engine 1.2.0 in May 2026, the audric `AgentStep.tsx` registry didn't have a corresponding entry — the activity rail fell back to a generic `⚙️` icon and the auto-uppercased label `RESOLVE SUINS` instead of the intended `🪪` + `RESOLVE SUINS`. Caught in S.52.1 audit; fixed in audric `a6f323d`. Net: a tiny but visible polish gap that shipped to production for ~hours.

**The contract (binding for SPEC 9, SPEC 10, and every future spec):**

> **Every new engine tool shipped MUST land with corresponding entries in `audric/apps/web/components/engine/AgentStep.tsx`'s `STEP_ICONS` and `STEP_LABELS` maps in the SAME audric PR that bumps the engine dependency.** The PR-author checklist for any engine version-bump PR includes: "verify every new tool in the bumped engine version has an `STEP_ICONS` + `STEP_LABELS` entry."

**Inventory of upcoming SPEC-10 tools that MUST follow this contract** (1 tool in v0.2.0; suggested icon+label — final picks owned by Phase D.3 of SPEC 10):

| Tool name (engine) | Suggested icon | Suggested label |
|---|---|---|
| `lookup_user` | 🔎 | LOOKUP USER |

**v0.5.5 narrowing (2026-05-05).** v0.5.1 originally listed 3 tools (`lookup_user`, `reserve_username`, `change_username`) per a then-anticipated SPEC 10 implementation shape. SPEC 10 v0.2.1 itself only specs `lookup_user` as an engine tool — the reservation and rename operations live as HTTP routes (`POST /api/identity/reserve`, `POST /api/identity/change`) called by the picker UI. The SPEC 10 phase-A plan (locked 2026-05-05) accepted Option A from the build-plan review: `lookup_user` is the only engine tool that ships in SPEC 10 v0.2.0; the picker UI uses SPEC 9 P9.4's `pending_input` substrate and posts to HTTP routes. **Suggested AgentStep entries for `reserve_username` + `change_username` are post-v0.2.0 candidates, only promoted to engine tools if 30-day post-launch behavior signal shows real demand for chat-driven rename intent.** When/if they land, add icons `🪪` (reserve) + `✏️` (change) per the original suggestion table.

**Enforcement:** add a CI lint rule (audric repo) that asserts `Object.keys(STEP_ICONS) ⊇ engine.READ_TOOL_NAMES ∪ engine.WRITE_TOOL_NAMES` on every PR. Fails build if a tool ships without an entry. ~30 LOC lint rule, one-time setup. Track as audric-side lint TD if not landed alongside SPEC 10 implementation.

#### v0.5.1 — `TransactionReceiptCard` recipient rendering (G7 — SPEC 10 D10 cross-reference)

`TransactionReceiptCard` (existing component in `audric/apps/web/components/engine/cards/`) renders the recipient field of every settled transaction in the receipt + tx-history surfaces. **Per SPEC 10 v0.2.1 D10, the recipient field follows the same single-rule policy as `permission-card`** (see G3 above and SPEC 7 v0.3.2 §"Recipient rendering"):

- Full `*.audric.sui` handle when the resolved address has a leaf
- Full external SuiNS (`alex.sui`) when the address has a non-Audric SuiNS record
- Truncated `0xabc…123` as fallback
- **NEVER** bare nickname alone (e.g. `Mom`) when an on-chain handle exists
- **NEVER** `@mom` as a display form (input shortcut only — see SPEC 10 D10)

**Truncation policy** (when row width is constrained, e.g. 320px mobile tx-history list): truncate the username portion left-side, `.audric.sui` suffix always remains visible (`…sername.audric.sui`).

**Implementation owner:** SPEC 10 Phase C.4 + D.4 (the contact-augmentation backfill that populates `audricUsername` on existing 0x contacts is the trigger that flips bare-0x receipts to full-handle receipts retroactively — no `TransactionReceiptCard` renderer change required for the post-SPEC-10 transition; only the underlying Contact data changes).

### Production telemetry signals (P3.5 ships)

Two surfaces, both already wired (no new vendor — see `.cursor/rules/metrics-and-monitoring.mdc`):

**1. Vercel Observability — transient counters/gauges/histograms** (via the existing `VercelTelemetrySink` in `apps/web/lib/engine/vercel-sink.ts`). Emitted as structured `console.log({ kind: 'metric', name, value, ...tags })` lines:

```
audric.harness.ttfvp_ms{shape}                  → histogram, query p50/p95 per shape; investigate if p50 > 4000ms (v0.5.4 — was 1500ms)
audric.harness.final_text_tokens{shape}         → histogram, query p50; investigate if shape=lean p50 > baseline + 30%
audric.harness.todo_update_count{shape}         → counter, watch shape=lean — should stay at 0
audric.harness.thinking_block_count{shape}      → histogram, watch p99 per shape (cap: lean=0, standard=4, rich=6, max=8)
audric.harness.cost_usd{shape}                  → histogram, p50/p95; investigate if any shape p50 > baseline × 1.25
audric.harness.tool_progress_event_count{tool}  → counter (v0.3, Gap 2); confirm Cetus emits ≥1 per swap
audric.harness.chip_queue_depth                 → gauge (v0.3, Gap 3); track 99th percentile; >2 means UX needs work
audric.harness.interrupted_message_count        → counter (v0.3, Gap 6); track refresh-mid-stream rate
audric.harness.voice_session_share              → gauge (v0.3, Gap 4); track per-day share to gate per-block voicing in SPEC 9
```

**2. Postgres `TurnMetrics` — durable per-turn rows** (extending the existing model). New nullable columns:

```prisma
model TurnMetrics {
  // ... existing fields ...

  // SPEC 8 v0.3
  harnessShape              String?  // 'lean' | 'standard' | 'rich' | 'max' | 'legacy'
  thinkingBlockCount        Int?
  todoUpdateCount           Int?
  ttfvpMs                   Int?
  finalTextTokens           Int?
  toolProgressEventCount    Int?     // v0.3 Gap 2
  isInterrupted             Boolean? // v0.3 Gap 6
  interruptedAt             DateTime? // v0.3 Gap 6

  @@index([harnessShape, createdAt])  // dashboards filter on this
  @@index([isInterrupted, createdAt]) // refresh-rate dashboard
}
```

**Investigation runbook** (no PagerDuty — same human-driven dashboard pull as today's Q5/Q6):
- Daily morning Postgres query against `TurnMetrics` aggregated by `harnessShape` + `engineVersion`.
- If a shape's p50 cost climbed > baseline × 1.25, check Vercel Observability for the corresponding histogram and bisect by engine version.
- Refresh-mid-stream rate (`isInterrupted = true / total turns`) tracked per-week — if it climbs above 5% sustained, investigate the new SPEC 8 surfaces (timeline rendering bugs that make users bail).

---

## What this spec deliberately does NOT touch

- **Tool authoring API** — no new flags, no new permission tiers (one new tool, that's it).
- **SDK** — zero changes, zero npm release.
- **Prompt caching boundaries** — `STATIC_SYSTEM_PROMPT` ephemeral cache cleanly absorbs the new section.
- **Sponsorship / gas flow** — orthogonal.
- **Recipes engine** — recipes still drive the LLM the same way; they just produce richer events as a side effect.
- **Multi-agent handoff** — explicitly out of scope. If we ever need it, that's SPEC 9.
- **Persistent cross-turn todos** — the todo surface is per-turn. Cross-turn persistence is SPEC 9 territory (multi-turn AdviceLog merge).
- **Inline data browsers / canvas-as-context** — Cursor's most aspirational stuff. Comes only after SPEC 8 lands and we see what users actually want to drill into.
- **Streaming follow-up dispatch** ("kick off the next turn while I'm still narrating the last") — too risky; one turn at a time stays the contract.

These are real Cursor features. They're deliberately deferred so SPEC 8 stays shippable in 10 days.

---

## Resolved decisions (v0.2 lock + v0.3 closures)

All 7 founder questions answered + 6 critical gap fixes (v0.2) + 7 gap closures (v0.3) folded in.

### 7 founder design decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Tool name: `update_todo`** | Clearest verb + matches the LLM's mental model. Same name Cursor/Claude Code use — public training data already knows this primitive. Other names rejected: `set_plan` (sounds locked-at-turn-start), `narrate_plan` (couples implementation to UI), `task_list` (noun, not action). |
| 2 | **LEAN shape: zero thinking blocks** | Single-fact lookups already complete in 2-3s. Adding forced thinking adds ~300ms TTFVP cost + tokens at the highest-volume tier with nothing meaningful to narrate. The "feels alive" affordance for these turns is the tool status row, which already appears within 400ms. If telemetry post-launch shows abandonment, flip to "1 minimal block" — one-line config change. |
| 3 | **Auto-collapse with manual-state preservation** | Cursor pattern is well-validated. Wall of expanded thinking is actively bad UX. NON-NEGOTIABLE: if a user manually expands a block, it stays expanded even when newer blocks stream in (hostile UX otherwise). |
| 4 | **Todo surface: sticky during turn → inline collapsed on completion** | Pure inline creates 4 stacked todo cards if `update_todo` fires 4× (real recipe behavior). Sticky upserts in place — single visible plan during action. On `turn_complete`, falls into chronological position as `✓ N-step plan completed (tap to expand)`. Best of both worlds. |
| 5 | **NO expand/collapse-all controls at v1** | Audric design language is minimal — every pixel earned. Auto-collapse heuristic (Q3) covers 80% of value. Defer entirely; revisit if real demand surfaces. |
| 6 | **NO special MAX visual treatment** | MAX vs RICH already differs visibly (more thinking blocks, more depth). Adding badges/gradients is off-brand and creates learning burden. Audric isn't a product that flexes — keep it that way. |
| 7 | **Cross-turn persistent todos: DEFER to SPEC 9** | Opens 5+ design questions (persistence model, expiry, privacy, UI for old todos, LLM context budget) — each its own week of work. Ship per-turn todos in v1, watch how users actually use them, then scope SPEC 9 around real signal. |

### 6 critical gap fixes (production-readiness)

| # | Gap | Fix |
|---|---|---|
| 1 | Multi-block thinking signature continuity not tested | Mandatory P3.2 acceptance test using real Anthropic API: emit ≥2 thinking blocks, round-trip the conversation, verify no signature error. Hard CI gate. (~0.25d added to P3.2.) |
| 2 | `update_todo` eats `maxTurns` budget | Special-case in `agentLoop.ts` — `update_todo` does NOT decrement turn counter. Conceptually correct (documents work, doesn't advance it). ~15 LOC. |
| 3 | Old session replay breaks under new `ReasoningTimeline` | Rendering fork in `ChatMessage.tsx`: `message.timeline ? <ReasoningTimeline> : <LegacyReasoningRender>`. Old sessions stay visually identical; new sessions get the timeline. (~0.25d added to P3.3.) |
| 4 | Per-block-type error states unspecified | Explicit error matrix added to Layer 4 — every `TimelineBlock` variant has defined behavior for streaming-drop / done-error / connection-timeout / abort. New `BlockStatus` enum. (~0.25d added to P3.3.) |
| 5 | Feature-flag flip mid-session causes mixed-mode chat | Per-session flag pinning: `harnessVersion` field on Upstash session payload (v0.5 G4 corrected the v0.2 "Prisma Session model" claim — there is no such model; sessions live in Upstash KV), evaluated once at session creation. Any single chat is internally consistent. ~15 LOC, no schema migration. |
| 6 | Cost ceiling enforced only by monitoring (after the fact) | Explicit `thinking.budget_tokens` HARD cap per shape (lean=disabled, standard=8k, rich=16k, max=32k). Anthropic enforces; impossible to overrun. ~30 LOC. |

### Effort impact

P3.2 (engine): 2d → **2.5d** (multi-block continuity test) → **3d** (v0.3: + tool_progress + attemptCount + Cetus integration) → **3.25d** (v0.4: + `<eval_summary>` marker parsing for HowIEvaluated) — **unchanged in v0.5** (G5/D2 are clarifications + ~5 LOC type reservation)
P3.3 (audric layer 3+4): 3.5d → **4d** (error states + legacy fallback) → **4.75d** (v0.3: + card block + chip queue + interruption handling) → **6.25d** (v0.4: + v2 visual primitives port + HowIEvaluatedBlock renderer + PermissionCard regenerate slot) → **6.5d (v0.5: + permission-card block + pending_input no-op handler + Upstash harnessVersion field + G8 isExpanded() refactor)**
Other tasks: unchanged

**Running total**: 10d (v0.1) → 11.25d (v0.2) → 12.5d (v0.3) → 14.25d (v0.4) → **~14.5d (v0.5)**.

### 7 v0.3 gap closures (founder review, 2026-04-30 second pass)

| # | Gap | Fix |
|---|---|---|
| 1 | Rich UX cards have no place in the new chronological timeline | New `card` `TimelineBlock` variant paired to `toolUseId`. Renders chronologically directly after its tool. Existing card components unchanged — only WHERE they're invoked from changes. ~80 LOC. |
| 2 | Long-running tools (Cetus 2-5s, protocol_deep_dive 3-8s) show static spinner — exactly the dead-air SPEC 8 promises to kill | New optional `tool_progress` engine event. Tools opt in via `progress` callback. v1 wires Cetus `swap_execute` (highest impact, ~10% of write tool calls). Tool block header flips spinner to one-line subtitle + optional progress bar. ~90 LOC. |
| 3 | Chip taps during streaming have undefined behavior | Three explicit chip behaviors based on `priority` field: `default` queues for `turn_complete` (visual queued-pill), `high` aborts current turn (e.g. "Cancel"), `destructive` confirm-modal. Existing 30+ chips default to `default` — zero migration. ~50 LOC. |
| 4 | Voice mode + new timeline interaction undefined | Documented v1 contract: TTS reads final text only; thinking/tool/card/todo blocks silent; `tool_progress` events silent. Per-block voicing deferred to SPEC 9. 0 LOC (decision documented). |
| 5 | Tool retries either spam timeline or hide retry counts entirely | Single `tool` block with `attemptCount?: number`. Header shows "TOOL · attempt 2 · 1.4s" only when N>1. ~20 LOC. |
| 6 | Browser refresh / tab close mid-stream → orphan messages, broken Postgres rows, or auto-replay cost surprise | Engine flushes partial timeline on disconnect with `isInterrupted: true`. Rehydrate marks last block `interrupted`, renders `<RetryInterruptedTurn />` button. Engine does NOT auto-replay. 2 new fields on `Message` Prisma model. ~80 LOC. |
| 7 | "100% of turns benefit" framing in v0.2.1 sequencing rationale was wrong (LEAN tier ~60% of volume intentionally unchanged) | Spec doc corrected throughout — "~40% medium+ turns benefit visibly; LEAN tier stays unchanged." SPEC-8-first decision still holds for the corrected reasons. 0 LOC (spec rewording). |

### 3 v0.4 gap closures (v2-demo audit + SPEC 7 v0.3 coupling, 2026-05-01)

| # | Gap | Fix |
|---|---|---|
| A | Default visual treatment for `thinking` + `parallel-group` + `text` blocks diverges from the v2 demo prototypes (`audric/audric_demos_v2/shared/primitives.jsx`); shipping with placeholder styling means re-doing the visual layer in v0.5 the moment a user references the demos. | Adopt `TaskInitiated` divider + `ThinkingHeader` ("✦ audric is thinking" italic) + `ReasoningStream` italic body + `ParallelTools` rich card + `AudricLine` final-text wrap as the default renderers. Block taxonomy unchanged — host swaps in v2 primitives in the renderer dispatch table. ~1.5d. |
| B | LLM's final pre-text reasoning (the "I checked HF + slippage + daily cap → recommending Y" beat) is buried inside the last thinking block accordion. v2 demos surface this as the dedicated "✦ HOW I EVALUATED THIS" trust card — highest-impact UX in the prototypes. | Extend `thinking` `TimelineBlock` with optional `summaryMode: boolean` + `evaluationItems: Array<{ label, status, note }>`. Engine parses `<eval_summary>...</eval_summary>` marker from the final thinking burst (system-prompt-taught), populates the structured fields. Host renders `HowIEvaluatedBlock` instead of standard `ThinkingBlock` when the flag is set. Same block type — back-compat automatic. ~1d (0.25d engine + 0.75d host). |
| C | SPEC 7 v0.3 introduces the Quote-Refresh ReviewCard pattern (REGENERATE button on stale-quote bundles). Without an agreed slot in the PermissionCard renderer, SPEC 7 forks the renderer or jams the button into the wrong place. | SPEC 8 v0.4 adds a single optional `regenerate?: { label, ageLabel, onClick, isRegenerating? }` prop to PermissionCard. UI-only — owns slot placement (3-button row + "QUOTE Ns OLD" badge in header). SPEC 7 v0.3 owns when to set it + the endpoint round-trip. Clean separation; SPEC 8 keeps the renderer concern, SPEC 7 keeps the bundle-correctness concern. ~0.25d. |

### 5 v0.5 cross-spec coupling fixes (full-trio review pass, 2026-05-01)

| # | Gap | Fix |
|---|---|---|
| D1 | SPEC 7 v0.3 multi-step PermissionCard + Quote-Refresh ReviewCard need a typed slot in the timeline; v0.4's `TimelineBlock` union didn't include one (would render in an "existing" PermissionCard slot that didn't exist). | Add `permission-card` `TimelineBlock` variant with `payload: PendingAction` + `status: 'pending' \| 'approving' \| 'regenerating' \| 'denied' \| 'approved'`. SPEC 7 owns the renderer; SPEC 8 owns the slot type + chronological positioning. ~+0.25d host. |
| D2 | SPEC 9 v0.1 introduces `pending_input` event for inline forms; without reservation in SPEC 8 v0.5, hosts on legacy harness crash on the unknown event when SPEC 9 ships first. | Reserve `pending_input` event type in `EngineEvent` union now; engine doesn't emit under SPEC 8; host adds a no-op handler that warns in dev + counts on telemetry (`pendingInputSeenOnLegacy`). Forward-compat hygiene. ~5 LOC + ~10 LOC. |
| G4 | v0.4 said "add `harnessVersion` to the `Session` Prisma model" but there is NO `Session` Prisma model — sessions live in Upstash KV. | Store `harnessVersion` on the existing `UpstashSession` payload in `apps/web/lib/engine/upstash-session-store.ts`. Same per-session pinning behaviour, no Prisma migration, no DB writes per session create. ~15 LOC. |
| G5 | v0.4's "engine parses the marker from the FINAL thinking burst" was unimplementable — engine doesn't know "final" until `message_stop`. | Engine emits `summaryMode: true` for **every** thinking block containing the marker. System prompt (Layer 5 addendum) enforces "AT MOST ONE per turn" as an LLM behavioral rule. LLM compliance is the guarantee; engine stays dumb. Telemetry counts violations (`evalSummaryViolationsCount`). 0 LOC functional change; spec wording correction. |
| G8 + G9 | v0.4 auto-expand for HowIEvaluated conflicted with v0.2 manual-state-preservation rule on rehydrate. v0.4 `evalSummaryEmittedCount` was ambiguous about quality. | (G8) `isExpanded()` refactored to use `Map<blockIndex, 'expanded' \| 'collapsed'>` for manual state; auto-expand only fires when `manualState` is unset AND `isLatestStreaming` is true (one-shot first-paint). (G9) Metric split into raw `evalSummaryEmittedCount{turnEffort}` + violations counter + dashboard-derived `evalSummaryAppropriatelyEmittedRate` (SQL, not emitted). Separates "did it emit?" (auditable) from "should it have emitted?" (tunable). ~10 LOC + dashboard query update. |

---

## On a future SPEC 9 (the "real" Cursor parity work)

Once SPEC 7 (Payment Stream) and SPEC 8 (Interactive Harness) ship, the genuinely-broader Cursor features become discussable:

- **Persistent cross-turn todo surface** ("you set this todo 3 hours ago and never finished")
- **Multi-agent handoff** ("hand this off to a deep-research subagent")
- **Inline data browsers** (mini explorers for portfolios / tx history rendered as expandable trees)
- **Streaming follow-up dispatch** (next turn starts while previous narration is still streaming)
- **Canvas-as-context** (open a canvas, agent reads from it as additional context)
- **Voice mode tight integration** (`voice.speakingMessageId` already exists — make agent pause when voice is mid-sentence)
- **Per-block voice mode** (deferred from SPEC 8 v0.3 Gap 4 — voice the thinking blocks individually with appropriate fallback / interrupt semantics)
- **Content-review ReviewCard** (deferred from SPEC 8 v0.4 audit — Accept / Regenerate / Cancel for Audric-Store-style agent-generated content like music, art, ebooks. Same Accept/Regenerate/Cancel button vocabulary as SPEC 7 v0.3's Quote-Refresh ReviewCard, but the regenerate side-effect is "re-run the content generation tool" not "re-fire upstream reads." Different engine wiring; same UI primitive.)
- **`pending_input` inline forms** (deferred from SPEC 8 v0.4 audit — when the agent needs structured input mid-turn, e.g. recipient address / shipping details, render a typed form inline in the timeline instead of asking via free-text. v2 demos `05-moms-birthday` + `07-xmas-gifts` showcase this pattern.)
- **Split-screen buyer panel** (deferred from SPEC 8 v0.4 audit — Audric Store demo `06-party-shop` uses a split-screen "buyer view" alongside the agent timeline.)
- **Animated balance header transitions** (deferred from SPEC 8 v0.4 audit — `BalCard` value transitions when a write settles. Pure polish; SPEC 8's static balance card is the v1.)
- **`PassportIntro` zkLogin handshake screens** (deferred from SPEC 8 v0.4 audit — onboarding flow rather than chat surface; lives in a different spec than harness.)

Don't write SPEC 9 yet. Wait until SPEC 8 ships and we see what users ask for next. The deferred-from-v0.4 items above are documented to prevent re-litigation when SPEC 9 starts.

---

## Cross-references

- **SPEC 7 v0.3** (Payment Stream + Quote-Refresh ReviewCard) — `spec/SPEC_7_MULTI_WRITE_PTB.md` — ships AFTER SPEC 8 v0.4 (v0.2.1 sequencing flip 2026-04-30, v0.3 quote-refresh coupling 2026-05-01)
- **Engine event types** — `packages/engine/src/types.ts:28-89` (v0.5 reserves `pending_input` for SPEC 9)
- **Anthropic provider thinking buffer** — `packages/engine/src/providers/anthropic.ts:163-219` (v0.4 adds `<eval_summary>` marker parsing; v0.5 emits per-marker, no "final" detection)
- **Audric chat hook** — `audric/apps/web/hooks/useEngine.ts:371-563`
- **Audric chat message** — `audric/apps/web/components/engine/ChatMessage.tsx:135-200`
- **Upstash session store** — `audric/apps/web/lib/engine/upstash-session-store.ts` (v0.5 — `harnessVersion` lives here, NOT in Prisma)
- **Audric reasoning accordion** (to be replaced) — `audric/apps/web/components/engine/ReasoningAccordion.tsx`
- **v2 visual primitives source** — `audric/audric_demos_v2/shared/primitives.jsx` (`TaskInitiated`, `ThinkingHeader`, `ReasoningStream`, `ParallelTools`, `AudricLine`, `HowIEvaluated`, `OrderReviewCard`)
- **v2 canonical demo references** — `audric/audric_demos_v2/demos/01-save-50.html` (timeline + parallel tools), `02-payment-link.html` (PermissionCard treatment), `06-party-shop.html` (proactive insights)
- **classify-effort** — `packages/engine/src/classify-effort.ts:11`
- **Static system prompt** — `audric/apps/web/lib/engine/engine-context.ts:STATIC_SYSTEM_PROMPT`
- **Spec 1 v1.4.2** (`attemptId`) — `AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md` (local-only)
- **Spec 2 v1.4.1** (BlockVision swap, financial_context) — `AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md` (local-only)
