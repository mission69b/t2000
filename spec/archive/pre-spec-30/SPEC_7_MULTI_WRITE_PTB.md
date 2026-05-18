# Spec 7: Multi-Write PTB Bundles — atomic chained writes in a single confirmation

*Version 0.5 — Closeout · May 4 2026 · Internal*
*Status: **CLOSED 2026-05-04** — all layers shipped + P2.7 48h soak passed (`revert_rate = 0%` over T+0 RESET → T+50h Vercel pull, 4 unique multi-step bundles all `outcome=executed`, 0 reverted/compose_error/sponsorship_failed). P2.8 closed piecewise (continuous releases 1.6.0 → 1.17.1 across the SPEC 7 wave; no separate 1.1.0 cut needed). SPEC 11 (PayButton) + SPEC 9 v0.2 (Audric Store) unblocked. See `audric-build-tracker.md` S.60 for the close audit. **CODE-COMPLETE — Layers 0/1/2/3/3b/4/5 all shipped to production through May 2 2026 (P2.2b/c/d → P2.5b).** Adjacent SPEC 13 (Phase 0 → 3a chained-coin handoff + `MAX_BUNDLE_OPS=4` + `VALID_PAIRS` whitelist), SPEC 14 (`prepare_bundle` tool + chat-route fast-path), and SPEC 15 (plan-context promotion + confirm chips + single-source bundle composer) all built on this substrate and are also live. **Engine baseline is now `@t2000/engine@1.17.0`, sdk `1.17.0`** — version targets in line below were set pre-S.43 and are kept as historical record. **What remains:** (a) **P2.6 — structured eval pass** on the 4 canonical use cases (Save 50% / Swap-and-save / Withdraw-then-send / Rebalance) measuring bundle-emission rate against the ≥80% target on Haiku + Sonnet at low/medium effort; capture in `loadtest/eval/spec7-baseline-2026-MM-DD/`. ~1d. Smoke tests done as part of SPEC 13/14/15 ship cycles validate the path end-to-end; this is the structured corpus run that closes P2.6 formally. (b) `NEXT_PUBLIC_PAYMENT_STREAM_ENABLED` flag — fast-path is currently live in production for everyone (no flag gate), so the spec's P2.7 "first ~100 users behind a flag" plan is moot; tracker cleanup, not real work. (c) **`pay_api` bundling** — out of scope by design (gateway 402 challenge means recipient/amount unknown at compose time). Revisit post-P4 async queue ship. (d) **PayButton + Audric-payer-on-someone-else's-link routing** → SPEC 11 (placeholder, P2.9 in Master Priorities). **Original v0.4.1 metadata retained below for historical clarity.** v0.2.1 reorders SPEC 7 to ship AFTER SPEC 8 (Interactive Agent Harness) per founder direction 2026-04-30. **v0.3 adds the Quote-Refresh ReviewCard** — `pending_action` carries `quoteAge` / `canRegenerate` / `regenerateInput`; PermissionCard exposes a "REGENERATE" button that re-fires upstream reads via `POST /api/engine/regenerate`. SPEC 8 v0.4 adds the empty `regenerate` button slot on the PermissionCard renderer; SPEC 7 v0.3 owns the engine + endpoint + bundle-rebuild logic that fills it. **v0.3.1 (May 1 review pass)** corrected three gaps (G2: composeBundleFromToolResults from-scratch + permission-gate refactor; G3: regenerate switched to synchronous-with-timeline-events; D3: dropped `regenerateInput.preserveSeed`). **v0.4 (May 1 canonical-write fold)** adds **Layer 0 — Canonical Write Architecture**: every Audric Enoki-sponsored write (chat agent + MPP `services/prepare` + diagnostics) goes through one `composeTx(steps)` primitive in `@t2000/sdk`, eliminating the 4 parallel write stacks that exist today. The fragment-appender pattern (Layer 1) becomes the implementation; `composeTx` is the canonical entry-point. Same architectural pattern that fixed the read-side portfolio drift in April 2026, applied to writes. PayButton (dapp-kit, any-wallet payer) stays out of `composeTx` by design — its product surface is genuinely separate; the Audric-payer-on-someone-else's-link gap is **deferred to SPEC 11**. New rule file ships alongside: `audric/.cursor/rules/audric-canonical-write.mdc` (already shipped during SPEC 8 audit polish, 2026-05-01 — saves ~0.25d off Layer 0 total). Net new SPEC 7 effort: +3.25d (~12.75d → ~16d). **v0.4.1 (May 2 canonical-version-chain refresh)** updates the engine + SDK version targets + baselines to reflect what SPEC 8 actually shipped on 2026-05-01 (engine 1.5.0). No scope change.*
*Author: Originally drafted during the 0.46.x correctness pass. v0.2 by the Apr 29 audit pass. v0.2.1 by the Apr 30 sequencing flip. v0.3 by the May 1 v2-demo audit (paired with SPEC 8 v0.4). v0.3.1 by the May 1 full-trio review pass (G1–G11 gap audit; SPEC 9 v0.1 dependencies). **v0.4 by the May 1 write-side canonicalization audit** (parallel to the April 2026 read-side `getPortfolio()` collapse). **v0.4.1 by the May 2 SPEC 8 post-ship version-chain refresh.***

**Product impact (locked):** When a user says *"Swap 10% into SUI, save 50% of my remaining USDC, then send $100 to Mom"*, today they sign three separate transactions and approve three separate confirmation cards over ~12 seconds. Spec 7 collapses that to **one Payment Stream** — one signature, one card, one atomic on-chain transaction that settles in <1s. Sui's PTB model is the protocol's biggest UX advantage over EVM; "Sign once, do five things" is the marketing line that makes the whole product feel like magic.

**Engine version target:** `@t2000/engine 1.6.0` (next minor from current `1.5.0` — SPEC 8 B3.2 shipped 2026-05-01 in t2000 commit `a82f3c2e`).
**SDK version target:** `@t2000/sdk 1.5.0` (matched bump; release workflow ships all 4 packages together — SDK floats with the monorepo lockstep version, last actually-functional SDK change was v1.1.0 PR-B5 v2 fee-free refactor).
**Engine baseline:** `1.5.0` (post-SPEC-8-B3.2 ship 2026-05-01).
**SDK baseline:** `1.1.0` (no SDK functional changes in SPEC 8 — engine + host only).
**Audric baseline:** `0.5x.x` (post-SPEC-8 v0.5.2 hotfix wave 2026-05-01 — final commit `a660dcc`).
**Canonical version chain (build-tracker authoritative):** SPEC 8 shipped engine `1.4.0` (Stage A) → engine `1.5.0` (Stage B3.2) → **SPEC 7 ships engine `1.6.0` + sdk `1.5.0`** (this spec) → SPEC 9 v0.1.2 ships engine `1.7.0` → SPEC 10 ships engine `1.8.0` + sdk `1.6.0`. Aligned with `audric-build-tracker.md` BUILD ORDER PIN as of 2026-05-02.
**Phase 0 supersedence (S.53.8, 2026-05-03):** Engine `1.12.0` shipped with `MAX_BUNDLE_OPS=2` + 7-pair `VALID_PAIRS` whitelist as the production bundle cap. SPEC 13 (PTB Chaining Foundation) owns the phased path back up: Phase 1 builds `inputCoinFromStep` chained-coin handoff, Phase 2 widens the whitelist with the new primitive, Phase 3+ removes the cap. **Refresh version targets above against `audric-build-tracker.md` at implementation time** — the `1.6.0` target was set pre-S.53.8 and the actual SPEC 7 ship will land on whatever version SPEC 13 leaves the engine at.
**See also:** `spec/SPEC_13_PTB_CHAINING_FOUNDATION.md` for the chained-coin handoff primitive (`WriteStep.inputCoinFromStep`) that lifts SPEC 7's atomic-bundle ceiling beyond the Phase 0 whitelist.
**Backward compat (locked):** Single-write `pending_action` shape stays unchanged. Hosts that don't opt in to bundles see no behavioural change.

---

## Revision log

| Version | Date | Changes |
|---|---|---|
| **0.5** | **2026-05-04** | **Closeout — code-complete state captured.** Status-correction patch reflecting that Layers 0/1/2/3/3b/4/5 all shipped between 2026-04-30 (S.43 `composeTx` + B5 v2 fee architecture) and 2026-05-02 (P2.4 multi-step PermissionCard + P2.4b regenerate + P2.5 system prompt + P2.5b CONTACT/PLAN STREAM TimelineBlocks). Adjacent specs that built on this substrate also shipped: **SPEC 13** (Phase 0 → 3a — `MAX_BUNDLE_OPS` raised 2 → 4, `VALID_PAIRS` whitelist, `inputCoinFromStep` chained-coin handoff in `composeTx`, 3-op atomic bundles + `bundle_chain_mode_set` telemetry); **SPEC 14** (`prepare_bundle` engine tool + chat-route fast-path bypass with atomic Redis `GET+DEL` + affirmative-reply gate); **SPEC 15** (plan-context promotion v0.4 + Phase 1.5 fast-path override + Phase 2 confirm chips + v0.7 follow-up #1 single-write regenerate + v0.7 follow-up #2 single-source bundle composer with `composeBundleFromToolResults` exported from engine `1.17.0`). **What remains:** P2.6 structured eval pass (bundle-emission ≥80% target, ~1d), tracker cleanup for the moot `NEXT_PUBLIC_PAYMENT_STREAM_ENABLED` flag (already live for everyone), `pay_api` bundling deferred to post-P4 (gateway 402 challenge structural blocker), and PayButton/Audric-payer routing → SPEC 11. **No spec content change in v0.5** — pure status correction. The phase tables (P2.0 → P2.8) are preserved as the build-time record. Stale "Next: P2.5 SPEC 8 (~11.25d), then P2 SPEC 7" boilerplate in audric-build-tracker.md S.48–S.56 footers reflects pre-ship language and is kept verbatim as historical record. |
| **0.4** | **2026-05-01** | **Canonical Write Architecture fold (write-side equivalent of April 2026 read-side `getPortfolio()` collapse).** Triggered by founder review of SPEC 7 readiness — concern that the same multi-path drift problem we fixed on the read side (5 parallel paths computing wallet USD with 5 different bugs) might exist on the write side and would compound bug surface as SPEC 7 + SPEC 9 + SPEC 10 ship. **Audit findings (verified end-to-end across t2000/sdk + audric/web):** (a) Engine write tools are already thin and uniform at the harness boundary — all 11 emit the same `PendingAction` envelope, all defer to host. (b) Chat-agent write surface is funneled through ONE client gateway (`useAgent.sponsoredTransaction` → `/api/transactions/prepare` → `/api/transactions/execute`) — no multi-path drift at the entry-point. (c) **BUT: 4 parallel sponsorship/build stacks** exist across product surfaces (transactions/prepare fat route, services/prepare hand-rolled, debug-swap diagnostic, PayButton dapp-kit). (d) `transactions/prepare` is a fat ~600-line route with inline send/fee/Cetus/Volo PTB-building (delegated only to NAVI adapter). (e) `services/prepare` hand-rolls its own merge/split/transfer pattern and has 3 latent bugs (`Math.round` violation, duplicate `client.getCoins`, hand-maintained `allowedAddresses` — same bug class as PR-H1/PR-H4). (f) PayButton uses dapp-kit `useSignAndExecuteTransaction` (any-wallet payer, no Enoki, no zkLogin) — **genuinely a different product surface, not drift**; correctly stays out of `composeTx`. **Concrete deltas (Layer 0 NEW):** (1) **`composeTx(steps)` primitive** in `@t2000/sdk` (~1d) — single canonical entry-point dispatching to fragment-appender registry, auto-derives `allowedAddresses` from PTB top-level `transferObjects` (eliminates the PR-H1/H4 bug class permanently). (2) **`/api/transactions/prepare` thin-dispatcher refactor** (~1d) — fat 600-line route → ~80-line dispatcher; single-write OR multi-write goes through same code path. (3) **`/api/services/prepare` migration** (~1d) — keeps service-specific business logic (gateway 402 challenge, deliver-first upstream, spending limits, audit trail), routes the on-chain leg through `composeTx`; fixes the 3 latent bugs for free; route shrinks from 389 → ~150 lines. (4) **`/api/debug-swap` deletion** (~0.25d) — diagnostic obsoleted (debug via direct `composeTx` call). (5) **ESLint rule `audric/canonical-write`** (~0.25d) — fails CI on direct `new Transaction()` outside canonical files; `// CANONICAL-BYPASS:` escape hatch documented. (6) **New rule file** `audric/.cursor/rules/audric-canonical-write.mdc` (~0.25d) — mirrors `audric-canonical-portfolio.mdc` pattern. (7) **`pay_api` exclusion rationale sharpened** — true reason is structural ("recipient/amount unknown at LLM intent time, gateway 402 response determines them; PTB can't be composed at compose time"), not the secondary "synchronous HTTPS call after payment" reason. **Effort:** +3.25d net new (Layer 0 builds on Layer 1's appenders — appenders themselves remain Layer 1's responsibility, marginal cost ~0). New running total: **~16d** (was 12.75d in v0.3.2). **Out of scope (deferred to SPEC 11):** PayButton + Audric-payer-on-someone-else's-link routing — when an Audric user signed in via zkLogin visits another Audric user's `/pay/[slug]`, today PayButton uses dapp-kit which won't work cleanly for them; SPEC 11 designs the routing fix (detect Audric session → route through chat-agent send flow over Enoki/composeTx; non-Audric payer → unchanged dapp-kit path). **Out of scope (SPEC 10 ownership):** SuiNS leaf-mint / leaf-revoke / admin endpoints (~5 routes total under `app/api/identity/*` + `app/api/admin/identity/*`) are **service-account-signed** (parent NFT owner = Audric custody key, NOT user zkLogin) and structurally outside the `composeTx` contract — see "What this Layer does NOT touch" + SPEC 10 v0.2.1 Phase A signer-model callout (G1 patch from May 1 cross-spec review). |
| **0.3.2** | **2026-05-01** | **SPEC 10 v0.2.1 alignment patch (G2 from v0.2.1 lock review).** Headline Use Case 1 PermissionCard mock + receipt mock updated to reflect SPEC 10 D10 recipient rendering. v0.3.1's mock showed `Send $100 USDC → Mom · 0xa3f9…b27c`; per SPEC 10 D10 (single-rule policy: ALWAYS render full Audric handle when present), post-SPEC-10 the row renders `Send $100 USDC → mom.audric.sui (0xa3f9…b27c) · resolved from contacts`. Pre-SPEC-10 fallback (when contact has no `*.audric.sui` leaf) keeps the v0.3.1 form. New "Recipient rendering" sub-section added under Use Case 1 documenting both states + the cross-spec contract. Effort impact: 0d (mock + display-only spec change; no engine/SDK work). |
| 0.1 | 2026-04-25 | Initial scoping draft. 3 founder-decision questions flagged. Targeted engine 0.49.0 / sdk 0.42.0. |
| **0.2** | **2026-04-29** | **Major refresh.** (a) **Payment Stream branding** — user-facing name for what we engineering-call PTB bundles. (b) **Headline use case rewritten** to the 3-op "swap 10% / save 50% / send $100 to Mom" flow (matches the v0.2 design mocks). (c) **SDK Layer 1 mapping rewritten** to reflect what's already in `packages/sdk/src/protocols/navi.ts` (`buildSaveTx`, `buildWithdrawTx`, `buildBorrowTx`, `buildRepayTx`, `addSaveToTx`, `addWithdrawToTx`, `addRepayToTx`, `addClaimRewardsToTx` exist; `buildSwapTx` lives in audric host route, not SDK; Volo + claim builders missing). Real Layer-1 work shrinks from 3d → ~2d. (d) **`executeWithGas` reference removed** — function was deleted in PR-B1 (S.34); SDK now uses private `executeTx` and audric uses Enoki sponsor → execute round-trip via `/api/transactions/prepare` + `/api/transactions/execute`. (e) **Pyth `skipPythUpdate` plumbing added (S.38)** — every NAVI step in a sponsored bundle must inherit the same `skipPythUpdate: true` (borrow/withdraw) or `skipOracle: true` (repay) flags the prepare route already applies, otherwise the bundle hits "Cannot use GasCoin as a transaction argument." (f) **USDsui dependency marked satisfied** — P1 shipped v0.51.0/v0.51.1 on 2026-04-27/28. (g) **Use case 3 (refinance) rewritten** — replaced fictional USDe with USDsui (the only other allow-listed asset per `OPERATION_ASSETS`). (h) **`pay_api` excluded from v1 bundling** — the on-chain payment is bundleable but the synchronous HTTPS call to `mpp.t2000.ai` after payment isn't; revisit after P4 async queue ships. (i) **Tool naming corrected** — `repay_debt` (not `repay`), `pay_api` (not `pay_request` / `mpp_pay`). (j) **Spec 3 hard dependency dropped** — master priority order is P2 (this spec) → P3 (Spec 3); Spec 3 enhances verification to handle bundle decomposition in *its* PR, after P2 ships. (k) **NEW Layer 5: Pre-bundle planning surface** — adds the "RUNNING N TASKS IN PARALLEL" group, the synthetic CONTACT-resolved row, and the dry-run/quote/pool preview cards visible in the v0.2 mocks. Most foundation already exists in audric (`AgentStep`, `ReasoningAccordion`, `EarlyToolDispatcher`, `TxMutex`); Layer 5 is incremental. (l) **Recipe bundling syntax decision** — added `bundle: true` step grouping to the YAML recipe loader so the existing 3 multi-write recipes (`swap_and_save`, `portfolio_rebalance`, `emergency_withdraw`) emit parallel `tool_use` blocks and bundle. Without this, recipes drive sequential calls and the headline use case never bundles. |
| **0.2.1** | **2026-04-30** | **Sequencing flip — SPEC 7 now ships AFTER SPEC 8.** Founder reframed v0.2 sequencing on 2026-04-30. Original assumption: ship SPEC 7 first because it's the headline showcase. Revised: SPEC 8 (Interactive Agent Harness) ships first because (a) it touches 100% of turns vs SPEC 7's ~5–10% multi-write, (b) it requires zero SDK changes (faster to land), (c) it gives SPEC 7's Payment Stream PermissionCard a polished `ReasoningTimeline` to render INSIDE — single coherent visual ship for users instead of two visible UX shifts in 3 weeks. **Concrete impact on this spec:** (1) **Layer 3 PermissionCard placement** — instead of being its own slot inside `ChatMessage`, the multi-step PermissionCard renders as a `TimelineBlock` inside SPEC 8's `ReasoningTimeline`. Cleaner integration. (2) **Layer 5 simplification** — synthetic `CONTACT` and `PLAN STREAM` AgentSteps become natural `TimelineBlock` instances (no host-side AgentStep injection hacks). The "RUNNING N TASKS IN PARALLEL" header is already SPEC 8's `parallel-group` block type. Effort drops from ~1d → ~0.5d. (3) **Net SPEC 7 effort** ~+0.5d (PermissionCard placement work) − ~0.5d (Layer 5 simplification) = roughly net-neutral, ~10.5d unchanged. (4) **PR-B4 (Mercuryo Audric CTA) + PR-B5 (Cetus swap fee fix) + PR-B3 closeout** slot in BEFORE SPEC 8 to clear lingering debt before the new harness lands. |
| **0.3.1** | **2026-05-01** | **Full-trio review pass (G1–G11 gap audit + SPEC 9 v0.1 coupling).** Three gap closures applied: (G2) Layer 2 effort revised 3d → **4d** because engine has NO existing same-turn bundling code — `engine.ts:851-934` permission-gate loop breaks after the first pendingWrite (`break;` at line 933), silently dropping subsequent parallel writes. The "factor `composeBundleFromToolResults` out of existing bundling code" claim in v0.3 was wrong; the helper has to be written from scratch + the loop refactored to collect ALL writes. Total spec effort: ~11.5d → **~12.5d**. (G3) Regenerate endpoint switched from SSE-reuse to **synchronous-with-timeline-events**: response body returns `{ success, newPendingAction, timelineEvents[] }` so host can render the re-fired upstream reads as a "↻ Regenerated · Ns" group in the timeline (preserves SPEC 8 v0.4's "feels alive" UX). Original SSE-reuse claim was broken — `useEngine.ts:497` sets `isStreaming: false` on `pending_action`, so the stream is closed when the user taps regenerate. ~+0.25d host-side timeline-event rendering. (D3) Dropped `regenerateInput.preserveSeed: boolean` field entirely — quote-refresh doesn't use it; SPEC 9 will design the right shape (`seed?: string` + `regenerationMode?: enum`) with full content-review context. ~−5 LOC engine surface. New running total: **~12.75d** (was 11.5d in v0.3). Three minor footnotes added: (G10) bundle execution latency — Sui dry-run is the actual safety gate when quote drifts during the ~600ms execution window; (G11) recipe-loader test gate — P2.5 acceptance gate now requires loader unit-test parses both old + new recipe syntax; (G1 cross-spec) confirms SPEC 8 v0.4 v0.5 patch will add the `permission-card` `TimelineBlock` variant SPEC 7 needs. |
| **0.3** | **2026-05-01** | **Quote-Refresh ReviewCard (paired with SPEC 8 v0.4 v2-demo audit).** Founder reviewed `audric/audric_demos_v2/demos/01-save-50.html` + `02-payment-link.html` + identified the Accept / **Regenerate** / Cancel button vocabulary as load-bearing for multi-write Payment Streams (not just Store content generation). The risk: a 3-op bundle composed at T=0 with a fresh Cetus quote + NAVI APY snapshot, but the user takes 47s to read the card before tapping Approve. By then the swap quote has drifted ≥0.3% (Cetus quote TTL is typically 30–60s), the NAVI APY may have shifted, and on-chain dry-run may reject. Today's options: (a) auto-retry with stale data and surprise the user, (b) silent fail and force a re-prompt. v0.3 adds option (c): **explicit "REGENERATE" button** that re-fires the upstream read tools (swap_quote, rates_info, balance_check) without re-running the LLM, rebuilds the bundle in place, and emits a new `pending_action` with a fresh `attemptId` (Spec 1 / Spec 2 carry-forward — each regeneration is its own row in `TurnMetrics`). **Concrete deltas:** (1) **`PendingAction` extended** with `quoteAge?: number` + `canRegenerate?: boolean` + `regenerateInput?: { toolUseIds: string[]; preserveSeed: boolean }` — engine-internal payload describing which upstream reads to re-run. Single-write `pending_action`s set `canRegenerate: false`. (2) **New host endpoint `POST /api/engine/regenerate`** — accepts `{ sessionId, attemptId }`, looks up the bundled `pending_action` by `attemptId`, re-executes the listed `regenerateInput.toolUseIds` against fresh data, rebuilds the bundle, emits a fresh `pending_action` with new per-step `attemptId`s, marks the original attemptId's `TurnMetrics.pendingActionOutcome = 'regenerated'`. (3) **PermissionCard `regenerate` slot filled** — when `action.canRegenerate === true`, the host passes `regenerate: { label: 'REGENERATE', ageLabel: 'QUOTE 47s OLD', onClick, isRegenerating }` to the SPEC 8 v0.4 PermissionCard renderer. Empty slot is owned by SPEC 8; fill is owned by SPEC 7. (4) **`OPERATION_TTL` table per tool** — Cetus swap_quote: 30s; rates_info: 90s; balance_check: 120s. Bundle inherits the **shortest** member TTL (matches existing `swap_quote` PermissionCard behaviour). When `quoteAge > shortest_ttl`, regenerate button auto-pulses (visual highlight) — user can still approve with stale quote (Sui dry-run will catch the rare case it actually fails). **Effort:** +1d total (~0.5d engine endpoint + bundle rebuild orchestration + ~0.5d host wire-up + Storybook coverage; SPEC 8 v0.4 already shipped the renderer slot). New running total: ~11.5d. **Out of scope:** content-review ReviewCard for Audric Store (music / art / ebook generation Accept/Regenerate/Cancel) — same UI vocabulary, different engine wiring (re-run content-generation tool, not re-run reads + rebuild bundle). Deferred to SPEC 9. |

---

## TL;DR

Today every write tool (`swap_execute`, `save_deposit`, `withdraw`, `borrow`, `repay_debt`, `send_transfer`, `claim_rewards`, `volo_stake`, `volo_unstake`) calls a high-level `agent.X()` SDK method that builds **and immediately executes** its own transaction. Each one yields its own `pending_action` event. A two-step intent like *"swap then save"* becomes:

```
LLM turn 1 → swap_execute → pending_action → user signs tx1 → engine resumes
LLM turn 2 → save_deposit → pending_action → user signs tx2 → engine resumes
```

Two confirmations. Two on-chain transactions. ~7s of extra latency. If tx1 succeeds and tx2 fails, the user is now holding USDsui they didn't want.

The right shape is **one Payment Stream** (PTB):

```
LLM turn 1 → [swap_execute, save_deposit] (parallel tool_use) → engine bundles
          → ONE pending_action with 2 steps → user signs ONE tx → engine resumes
```

One confirmation. One atomic transaction. Settles in ~0.6s on Sui. Either both writes happen or neither does.

**This is mechanically possible today** — the underlying protocol SDKs (`@naviprotocol/lending`, `@cetusprotocol/aggregator-sdk`) already expose PTB-builder primitives. The blocker is that some SDK builders are split (NAVI: `buildSaveTx`/`addSaveToTx` exist), some aren't (Cetus swap builder lives in audric host route, not SDK), and the engine emits one `pending_action` per write tool. Spec 7 finishes the SDK builder/appender split, opens the engine to bundling, and ships a multi-step PermissionCard.

**v0.4 update: Canonical Write Architecture lands as Layer 0.** While we're already touching every write surface to add fragment-appenders, we add one canonical compose primitive — `composeTx(steps)` in `@t2000/sdk` — that becomes the single entry-point for every Audric Enoki-sponsored write (chat agent + MPP `services/prepare` + diagnostics). Single-write and multi-write go through the same code path. The 4 parallel write stacks that exist today collapse into 1 canonical primitive + 1 intentional bypass (PayButton, dapp-kit). This is the write-side equivalent of April 2026's read-side `getPortfolio()` collapse — same architectural pattern, same drift-impossible-by-construction guarantee. Net new effort: +3.25d (Layer 0 builds on Layer 1's appenders; appenders themselves remain Layer 1's responsibility, marginal cost ~0). PayButton + Audric-payer routing → SPEC 11.

---

## Payment Stream — the product brand

**User-facing name:** "Payment Stream." Not "PTB," not "bundle," not "batch."

| Surface | Term to use |
|---|---|
| User-facing chat narration | "Payment Stream" / "stream" / "atomic stream" |
| PermissionCard header | "N operations · 1 Payment Stream · Atomic" |
| Receipt card label | "PAYMENT_STREAM" / "Stream settled · N ops · TX <digest>" |
| Activity feed row | "Stream · N actions" |
| Settings / docs / marketing | "Payment Stream" |
| Engineering / engine code / SDK / specs | "PTB bundle" or "bundle" (matches Sui terminology) |
| Engine event types / TypeScript | `bundleable`, `steps`, `stepResults` (PTB is the underlying primitive) |

**Rationale.** "Bundle" is engineering jargon. "Payment Stream" reads like a product feature; users don't need to know about Programmable Transaction Blocks. The `⚡ PAYMENT_STREAM` lockup in the v0.2 mocks reads instantly: it's a payment, but it's a *stream* of operations. "Atomic" is the supporting technical word; "all succeed or all revert" is the supporting plain-English line.

---

## What this spec does NOT touch

- **Cross-user payments** — bundling someone else's transactions into yours. Out of scope; that's an account-abstraction problem.
- **Cross-chain PTBs** — Sui-native only. EVM bridges are not in our PTB story.
- **MEV / private mempools** — not on Sui yet, defer.
- **Sponsor / gas-station composition** — orthogonal. Bundles work the same with Enoki sponsorship as without; the only constraint is the existing S.38 `tx.gas`-cannot-be-an-argument restriction (see Layer 1 below).
- **Auto-batching across LLM turns** — engine only bundles writes emitted in **the same assistant turn**. If the LLM emits write A, gets a `tool_result`, then decides on write B in turn 2, those stay as two separate `pending_action`s. Cross-turn bundling adds state-machine complexity that isn't worth it for v1.
- **`pay_api` bundling** — `pay_api` cannot be in a multi-write Payment Stream. **Structural reason (v0.4 sharpened):** the recipient + amount + currency aren't known at LLM intent time — they come from the gateway's 402 challenge response (standard MPP) or the deliver-first upstream call. Since the PTB needs concrete `{recipient, amount, currency}` at compose time, and `pay_api` resolves these at *route* time (after a network round-trip the engine has no knowledge of), `composeTx` cannot include a `pay_api` step in a multi-step bundle. The on-chain leg of `pay_api` IS canonical (handled via `composeTx` from `services/prepare`, see Layer 0) — it's the *bundling* that's structurally impossible, not the canonicalization. Secondary reason: even if the gateway's 402 response could be pre-fetched, the synchronous HTTPS call to `mpp.t2000.ai` AFTER payment (in `services/complete`) isn't bundleable — payment commits, API call could 500. Revisit after P4 (async job queue) ships.
- **`save_contact`** — Postgres write, no on-chain transaction. Not a PTB candidate.
- **PayButton** (`audric/apps/web/components/pay/PayButton.tsx`). Different signer (`@mysten/payment-kit` + dapp-kit `useSignAndExecuteTransaction`), different identity (any Sui wallet — not necessarily Audric), different trust model (no LLM, no guards, no `attemptId`/resume protocol), different gas model (payer pays own gas, no Enoki sponsorship). Stays out of `composeTx` by design. **The Audric-payer-on-someone-else's-link gap** — when an Audric user signed in via zkLogin visits another Audric user's `/pay/[slug]`, today PayButton uses dapp-kit which won't work cleanly for them — is **deferred to SPEC 11** (Pay UX feature, not a write-architecture cleanup).

---

## Vision: the four canonical use cases

Every architectural decision serves at least one. If a proposal doesn't unlock one of these, defer.

### Use case 1: The headline — "swap 10% / save 50% / send $100 to Mom" (3-op stream)

> *"Swap 10% into SUI, save 50% of my remaining USDC, then send $100 to Mom."*
>
> **Today:** three confirmation cards, three signatures, three tx digests, ~12s wall time. Three places the user can abandon. If swap-1 succeeds and the deposit fails, the user is holding USDsui they didn't ask for.
>
> **With Spec 7:** one PermissionCard header *"3 operations · 1 Payment Stream · Atomic"*. Step rows: `(1) Swap $200 USDC → SUI · Cetus best-route`, `(2) Swap $900 USDC → USDsui + deposit · NAVI 8.4% APY`, `(3) Send $100 USDC → Mom · 0xa3f9…b27c`. Footer: *"GAS $0.005 · SPONSORED · ALL SUCCEED OR ALL REVERT"*. One signature → settles in ~0.6s → one tx digest in the receipt → narration: *"Done. Swapped $200 → 212.77 SUI. Saved $900 as USDsui on NAVI — earning $75.60/year at 8.4%. Sent $100 to Mom. Balance: $700 USDC + 212.77 SUI."*
>
> **What this requires beyond the bundle protocol:**
> - LLM resolves percentages → dollar amounts (works today; LLM does the math from `balance_check`)
> - LLM resolves contact name → address (works today via `contacts: ReadonlyArray` on `EngineConfig`)
> - LLM emits the writes as **parallel `tool_use` blocks** in one assistant turn (current behaviour for Sonnet+thinking; Haiku TBD — see Eval pass risk)
> - The middle step (swap-to-USDsui + deposit) is **two underlying tool calls** (`swap_execute` + `save_deposit`) rendered as **one visual row** in the PermissionCard via UX clustering (see Layer 3)
>
> **Total bundle: 4 underlying `tool_use` blocks → 3 user-facing PermissionCard rows → 1 atomic Sui PTB.**

### Use case 2: Withdraw-then-send ("pay a contractor from savings")

> *"Withdraw $200 USDC from savings and send it to Alice."*
>
> Today: withdraw confirms → tx1 → save balance reflects → send confirms → tx2.
>
> With Spec 7: one PTB. The PTB-builder for `send_transfer` consumes the coin reference returned by `withdraw`'s PTB fragment without ever materializing the coin in the user's wallet between the two steps. **This is the cleanest demonstration of why PTBs matter** — there's no "intermediate" balance for the user to worry about.
>
> **First test target.** P2.1 prototype validates the typed coin-ref handoff against this exact flow before committing to the SDK API surface.

### Use case 3: Repay-then-borrow ("refinance debt")

> *"Pay off my $300 USDsui debt and re-borrow $300 in USDC instead."*
>
> Today: repay confirms → tx1 → health factor jumps → borrow confirms → tx2 → health factor drops back. The user briefly has zero debt, which can mess up health-factor-driven UI.
>
> With Spec 7: atomic. Health factor never visibly fluctuates; the indexer sees the post-state directly.
>
> **Constraint (P1.7 repay symmetry rule):** the repay leg must use the same asset as the borrowed debt — USDsui debt is repaid with USDsui. The user must already hold $300 USDsui in wallet before this stream becomes valid. The LLM checks `balance_check` → if the wallet doesn't hold enough, it tells the user to swap to USDsui manually first (no auto-chain swap → repay; user-decision territory). Both the legacy single-write flow and the bundled flow respect this rule.

### Use case 4: Multi-leg swap ("rebalance allocation")

> *"Sell half my SUI for USDC and half for vSUI."*
>
> Today: two `swap_execute` calls → two confirmations → two txs → two slippage windows.
>
> With Spec 7: one PTB. Both swaps execute against the same on-chain price snapshot. Triggers the existing `portfolio_rebalance` recipe — see "Recipe bundling" under Layer 4.

---

## What's already there (don't rebuild)

- **Protocol-level PTB builders.** `packages/sdk/src/protocols/navi.ts:270+` exposes `buildSaveTx`, `buildWithdrawTx`, `buildBorrowTx`, `buildRepayTx` (full builders that return `{ tx: Transaction, ... }`) **plus** `addSaveToTx`, `addWithdrawToTx`, `addRepayToTx`, `addClaimRewardsToTx` (in-place appenders that mutate a passed-in `Transaction` and return the produced coin ref for chaining). The pattern is consistent across NAVI ops; the SDK just doesn't expose this surface for swap/send/Volo/claim yet.
- **Audric host route already composes builders without auto-execute.** `apps/web/app/api/transactions/prepare/route.ts:285+` builds a `Transaction` per request, calls the per-protocol builder (e.g. `adapter.buildSaveTx(...)`, `adapter.buildBorrowTx(..., { skipPythUpdate: true })`), and returns the `Transaction` for Enoki to sponsor. This IS the bundle composer's natural home — Spec 7's host work extends what's already there.
- **`PendingAction.assistantContent: ContentBlock[]`** carries the full assistant message (all `tool_use` blocks) — engine can inspect "did this turn emit multiple writes" before yielding (`packages/engine/src/types.ts:117-153`).
- **`PendingAction.attemptId: string`** (UUID v4 per yield, shipped Spec 1 v1.4.2) — bundles get one `attemptId` per step, host persists N rows on `TurnMetrics`. Spec 2's resume-keying logic carries forward.
- **Engine permission resolution** is per-tool (`resolvePermissionTier` in `permission-rules.ts`). Bundling needs an aggregating wrapper, not a rewrite.
- **`useEngine.executeToolAction`** in audric (`apps/web/hooks/executeToolAction.ts`) already centralizes the build → sign → return executionResult path post-Spec-1 H.1.1. Bundling extends this helper, doesn't replace it.
- **`PermissionCard` UI** in audric is already a flexible primitive (`apps/web/components/engine/PermissionCard.tsx`). Spec 1 H.1.6 added `modifications?` + `outcome?`. Spec 7 adds a third extension point: `steps?` for multi-step rendering.
- **`postWriteRefresh` config** (`EngineConfig.postWriteRefresh`, `types.ts:395+`) handles "after a write, re-read these tools." Bundles need this to fire **once after the bundle resolves**, not once per step.
- **Harness UX foundation already shipped** (most of what the v0.2 mocks show):
  - `AgentStep` component with status (pending/running/done/error), icons, labels for every tool — `apps/web/components/engine/AgentStep.tsx`
  - "RUNNING TASKS IN PARALLEL" auto-grouping when ≥2 tools are running concurrently — `apps/web/components/engine/ChatMessage.tsx:46`
  - `ReasoningAccordion` ("How I evaluated this") for thinking blocks — already shipped in RE-1.4
  - `EarlyToolDispatcher` for parallel reads + `TxMutex` for serial writes — `packages/engine/src/early-dispatcher.ts`, `orchestration.ts:18`
  - Per-tool result cards (`balance_check` → BalanceCard, `swap_quote` → SwapQuoteCard, etc.) — `apps/web/components/engine/ToolResultCard.tsx`
  - `TurnReadCache` for tool-call dedup within a turn — `packages/engine/src/turn-read-cache.ts`

---

## Architecture sketch

### Layer 0: Canonical Write Architecture (~3.25 days, NEW in v0.4)

> **The architectural contract.** Every Audric Enoki-sponsored write — chat agent, MPP `services/prepare`, diagnostics — MUST go through one canonical compose primitive: **`composeTx(steps)` in `@t2000/sdk`**. The fragment-appender pattern (Layer 1 below) is the implementation; `composeTx` is the canonical entry-point. PayButton (dapp-kit, any-wallet payer, no Enoki) is intentionally outside this contract — see "What this spec does NOT touch" — and is documented as a `// CANONICAL-BYPASS:` exception.
>
> **Why this lands in SPEC 7 (and not as a separate SPEC 11):**
>
> 1. **SPEC 7 already requires fragment-appenders for every bundleable write tool** (Layer 1). The marginal cost of building a thin compose layer on top is ~3.25d. The marginal cost of NOT building it is the next 6+ months of feature work continuing to widen drift between `transactions/prepare`, `services/prepare`, and any new write surface added — same compounding cost class as the read-side drift was.
> 2. **`composeTx` IS the multi-write bundle composer SPEC 7 needs anyway.** A 1-step `composeTx([{ toolName: 'send_transfer', input: {...} }])` is the same primitive as a 3-step `composeTx([{...}, {...}, {...}])`. Single-write and multi-write go through the same code path. Layer 0 is just "make Layer 1's appenders dispatchable from one entry-point."
> 3. **The read-side canonicalization (April 2026 portfolio fix) proved this pattern works.** Five different paths computing wallet USD became one canonical fetcher; drift became impossible by construction. Same architectural principle, applied to writes, yields the same guarantee.
>
> **Read-side companion rules** (cross-reference): `t2000/.cursor/rules/single-source-of-truth.mdc` + `audric/.cursor/rules/audric-canonical-portfolio.mdc`. Layer 0 ships the WRITE-side equivalent rule: `audric/.cursor/rules/audric-canonical-write.mdc` (NEW in v0.4).

#### Layer 0 components

| Component | Effort | What it does |
|---|---|---|
| **`composeTx(steps)` primitive** | ~1d | New canonical entry-point in `@t2000/sdk` (`packages/sdk/src/composeTx.ts`). Takes `{ sender, steps: WriteStep[], sponsoredContext? }`, dispatches each step to its fragment-appender from a typed `WRITE_APPENDER_REGISTRY: Record<WriteToolName, AppenderFn>`, auto-derives `allowedAddresses` by scanning the assembled PTB's top-level `transferObjects` calls, returns `{ tx, txKindBytes, derivedAllowedAddresses, perStepPreviews }`. |
| **Fragment-appender registry wiring** | (in Layer 1, +0d marginal) | Layer 1's appenders (`addSaveToTx`, `addSwapToTx`, `addSendToTx`, `addBorrowToTx`, `addStakeVSuiToTx`, `addUnstakeVSuiToTx`, `addClaimRewardsToTx` — already exists) become entries in the `WRITE_APPENDER_REGISTRY` map. Layer 1 already builds the appenders; Layer 0 just wires them to a typed registry. |
| **`/api/transactions/prepare` thin-dispatcher refactor** | ~1d | Today's ~600-line fat route becomes a ~80-line dispatcher: parse input → call `composeTx` → sponsor via shared helper → return `{ bytes, digest }`. The inline send/fee/Cetus/Volo logic moves into Layer 1's appenders. **Bonus:** the hand-maintained `allowedAddresses` array becomes auto-derived (eliminates the PR-H1 + PR-H4 bug class permanently). The `skipPythUpdate` / `skipOracle` per-NAVI-step flags get applied automatically when `sponsoredContext: true` is passed (Layer 1 builders already accept these). |
| **`/api/services/prepare` migration** | ~1d | Route keeps its service-specific business logic (gateway 402 challenge negotiation, deliver-first upstream call, USDC balance pre-check, daily/monthly spending limits, `servicePurchase` audit trail, `services/complete` MPP credential round-trip) but the on-chain leg moves to `composeTx`. Route shrinks from ~389 lines to ~150. **3 latent bugs get fixed for free** — see Risk table additions below. |
| **`/api/debug-swap` deletion** | ~0.25d | Diagnostic route becomes obsolete (you debug by calling `composeTx({ steps: [{ toolName: 'swap_execute', input: {...} }] })` directly in a one-line script). Delete file + smoke test. |
| **ESLint rule `audric/canonical-write`** | ~0.25d | Mirrors `audric/canonical-portfolio`. Fails CI on direct `new Transaction()` outside the canonical files (`packages/sdk/src/protocols/`, `packages/sdk/src/wallet/`, `packages/sdk/src/composeTx.ts`, `apps/web/components/pay/PayButton.tsx` carved out via `// CANONICAL-BYPASS: PayButton uses dapp-kit (any-wallet payer signer); intentional product separation`). |
| **`audric-canonical-write.mdc` rule file** | ~0.25d | New rule at `audric/.cursor/rules/audric-canonical-write.mdc`. Documents the contract, forbidden patterns, adapter checklist, `// CANONICAL-BYPASS:` exception protocol. Cross-references the read-side rule (`audric-canonical-portfolio.mdc`). |
| **`pay_api` exclusion rationale update** | ~0d | Update the SPEC's "What this spec does NOT touch" + Resolved decision #18 to reflect the **structural** reason `pay_api` cannot be in a multi-write bundle (recipient/amount unknown at LLM intent time). Already done in v0.4. |
| **TOTAL** | **~3.25d** | Net new SPEC 7 effort over the v0.3.2 baseline. |

#### `composeTx` API (locked)

```typescript
// packages/sdk/src/composeTx.ts (NEW in v0.4)
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';

export type WriteToolName =
  | 'save_deposit' | 'withdraw' | 'borrow' | 'repay_debt'
  | 'send_transfer' | 'swap_execute' | 'claim_rewards'
  | 'volo_stake' | 'volo_unstake';
// Note: 'pay_api' and 'save_contact' are NOT in this union — pay_api's on-chain leg
// uses 'send_transfer' under the hood (the route resolves the gateway recipient first,
// then calls composeTx with a send_transfer step); save_contact has no on-chain leg.

export interface WriteStep {
  toolName: WriteToolName;
  input: unknown;  // tool-specific shape; appender validates via Zod
}

export interface ComposeTxOptions {
  sender: string;
  steps: WriteStep[];          // single-write: [{...}]; multi-write: [{...}, {...}, ...]

  /**
   * S.38 Pyth flag (sponsorship-critical). When true, NAVI-step appenders
   * automatically apply `skipPythUpdate: true` (borrow/withdraw) or
   * `skipOracle: true` (repay) to avoid the `tx.gas`-can't-be-an-argument
   * Enoki restriction. Self-funded callers (CLI, MCP, server tasks) leave
   * this `false` (or omit) — they pay Pyth's update fee from their own SUI gas.
   */
  sponsoredContext?: boolean;
}

export interface ComposeTxResult {
  tx: Transaction;
  txKindBytes: Uint8Array;     // pre-built for Enoki: tx.build({ onlyTransactionKind: true })
  derivedAllowedAddresses: string[];  // auto-computed from top-level transferObjects
  perStepPreviews: unknown[];  // one preview per step (gas estimate, expected output, HF-after, etc.)
}

export async function composeTx(opts: ComposeTxOptions): Promise<ComposeTxResult> {
  const tx = new Transaction();
  tx.setSender(opts.sender);

  const previews: unknown[] = [];
  for (const step of opts.steps) {
    const appender = WRITE_APPENDER_REGISTRY[step.toolName];
    if (!appender) {
      throw new Error(`No fragment appender registered for ${step.toolName}`);
    }
    const preview = await appender(tx, step.input, {
      sponsoredContext: opts.sponsoredContext ?? false,
      sender: opts.sender,
    });
    previews.push(preview);
  }

  const txKindBytes = await tx.build({ client: getSuiClient(), onlyTransactionKind: true });
  const derivedAllowedAddresses = deriveAllowedAddressesFromPtb(tx);

  return { tx, txKindBytes, derivedAllowedAddresses, perStepPreviews: previews };
}
```

#### Auto-derived `allowedAddresses` (eliminates the PR-H1/H4 bug class)

The `deriveAllowedAddressesFromPtb(tx)` helper walks the assembled PTB's command list and extracts every recipient from `transferObjects` calls at the top level (not inside Move calls — Enoki only inspects top-level commands). Returns the de-duplicated set.

Today, both `transactions/prepare` and `services/prepare` hand-maintain this array — and have shipped TWO production bugs in the past 60 days because someone forgot to add a recipient (PR-H1: claim-rewards self-transfer; PR-H4: borrow/withdraw self-transfer). After Layer 0, this is computed from the PTB itself — drift becomes impossible by construction.

#### Thin-dispatcher refactor target — `/api/transactions/prepare/route.ts`

```typescript
// audric/apps/web/app/api/transactions/prepare/route.ts (post-refactor, ~80 lines)
import { composeTx } from '@t2000/sdk';
import { sponsorViaEnoki } from '@/lib/sponsor';

export async function POST(req: NextRequest) {
  // ... JWT validation, rate limiting, input parsing (~25 lines unchanged) ...

  // Single-write OR multi-write — same code path.
  const composed = await composeTx({
    sender: address,
    steps: input.steps ?? [{ toolName: input.type, input: input.params }],  // backward-compat shim
    sponsoredContext: true,
  });

  const sponsored = await sponsorViaEnoki({
    txKindBytes: composed.txKindBytes,
    sender: address,
    allowedAddresses: composed.derivedAllowedAddresses,
    jwt,
  });

  return NextResponse.json({ bytes: sponsored.bytes, digest: sponsored.digest });
}
```

Net reduction: ~600 lines → ~80 lines. Hand-rolled send/fee/Cetus/Volo logic moves into Layer 1 appenders.

#### `/api/services/prepare` migration (the MPP `pay_api` route)

`services/prepare` is structurally **two layers** glued together: (1) service-specific gateway negotiation, (2) on-chain payment build. Layer 0 separates them — only the on-chain build moves to `composeTx`; the negotiation stays in the route handler.

```typescript
// audric/apps/web/app/api/services/prepare/route.ts (post-refactor, ~150 lines)

// Step 1: Resolve payment details (route-specific gateway negotiation — UNCHANGED)
const { recipient, amount, currency, preDeliveredResult } = mapping.deliverFirst
  ? await runDeliverFirstUpstream(mapping, serviceBody, address)  // includes balance + spending checks
  : await fetchMppChallenge(mapping.url, serviceBody);            // 402 challenge → { amount, recipient, currency }

// Step 2: Compose PTB via canonical primitive (NEW)
const composed = await composeTx({
  sender: address,
  steps: [{ toolName: 'send_transfer', input: { to: recipient, amount, asset: currency } }],
  sponsoredContext: true,
});

// Step 3: Sponsor via shared helper
const sponsored = await sponsorViaEnoki({
  txKindBytes: composed.txKindBytes,
  sender: address,
  allowedAddresses: composed.derivedAllowedAddresses,  // auto-derived; was hand-rolled `[recipient]`
  jwt,
});

// Step 4: Return with service-specific meta (UNCHANGED)
return NextResponse.json({
  bytes: sponsored.bytes,
  digest: sponsored.digest,
  meta: { serviceId, gatewayUrl, serviceBody, price: String(amount), address, preDeliveredResult },
});
```

`/api/services/complete/route.ts` does NOT change at all — it's purely post-payment gateway logic (MPP credential round-trip), no PTB building.

#### What this Layer does NOT touch

- **PayButton** (`audric/apps/web/components/pay/PayButton.tsx`) — different signer (dapp-kit), different identity, different trust model. Documented as `// CANONICAL-BYPASS: PayButton uses dapp-kit (any-wallet payer signer); intentional product separation` and explicitly carved out of the ESLint rule. The Audric-payer-on-someone-else's-link routing gap → **SPEC 11**.
- **Service-account-signed writes (forward-declared for SPEC 10).** SuiNS leaf-mint, leaf-revoke, and admin endpoints (~3 routes under `app/api/identity/{reserve,change,release}/route.ts` + 2 under `app/api/admin/identity/*`) sign with the **`audric.sui` parent NFT owner key** (Audric custody account), NOT the user's zkLogin key. PTB atomicity requires single signer, so these cannot be bundled with chat-agent writes via `composeTx`. **Structurally outside the canonical contract by design** — same category of carve-out as PayButton (different signer + different trust model), different reason (service-account vs any-wallet-extension). Documented in `audric-canonical-write.mdc` (G2 patch) + SPEC 10 v0.2.1 Phase A signer-model callout (G1 patch). Mainnet-validated 2026-05-01 via `scripts/smoke-suins-leaf.ts` (S.52); reference shape in `RUNBOOK_audric_sui_parent.md` §3. Each route gets a `// CANONICAL-BYPASS: SPEC 10 leaf-mint — service-account-signed (parent NFT owner), structurally outside composeTx contract` comment to satisfy the ESLint rule. Future SuiNS multi-signer support could lift this carve-out — revisit then.
- **Cron jobs** under `app/api/cron/*` — Prisma-only writes, no on-chain leg.
- **Payment-link CRUD routes** under `app/api/payments/*` — Prisma-only writes, no on-chain leg.
- **`pay_api` post-payment HTTPS call** to `mpp.t2000.ai` (handled in `services/complete/route.ts`) — stays in route handler logic; only the on-chain payment leg moves to `composeTx`.
- **Write-side wallet reads** (`getCoins`/`getBalance` calls inside Layer 1 appenders for coin selection) — these are correct as `// CANONICAL-BYPASS: write-side coin selection requires object IDs not aggregated balances` per the read-side rule. Worth a small refactor to share the merge/split helper across NAVI/Volo/Send appenders, but that's day-one work folded into Layer 1, not a separate Layer 0 deliverable.

#### Layer 0 acceptance gates

1. **Contract test:** `composeTx({ steps: [{ toolName: 'send_transfer', input: {...} }] })` produces an identical PTB to today's `transactions/prepare` `case 'send'` path on a fixed test wallet (byte-for-byte after sender stamping).
2. **Migration test:** every `case` in today's `transactions/prepare` switch statement has a paired `composeTx` test that produces an identical PTB. 11 cases × 1 test each.
3. **`services/prepare` parity test:** the migrated route returns identical `{ bytes, digest, meta }` shapes for both deliver-first and standard-MPP flows on a fixed test gateway response.
4. **Auto-derived `allowedAddresses` regression:** the existing `sponsor-allowed-addresses.test.ts` (PR-H1/H4) gets a sibling `composeTx-allowed-addresses.test.ts` asserting `derivedAllowedAddresses` matches today's hand-maintained array for every write tool.
5. **ESLint enforcement:** `audric/canonical-write` rule fails CI on a deliberately-introduced `new Transaction()` outside the canonical files.
6. **Spec consistency runner:** boot-time check (`apps/web/lib/engine/spec-consistency.ts`) asserts no parallel write paths exist — every API route under `app/api/transactions/` and `app/api/services/` either calls `composeTx` or has a `// CANONICAL-BYPASS:` comment.

#### Why Layer 0 must ship before Layer 2's bundling work

Layer 2 (engine bundling) emits bundled `pending_action`s with `steps[]`. The host needs `composeTx` to consume them — passing `composed.steps` directly into `composeTx({ steps })` is the natural shape. Without Layer 0, the host would need a parallel "bundle composer" that's structurally identical to `composeTx` but lives only on the bundle path. Building one canonical primitive that handles both N=1 and N>1 is strictly simpler.

---

### Layer 1: SDK — finish the build/execute split (~2 days, was 3d in v0.1)

> **v0.4 framing update:** Layer 1's appenders are now the implementation of Layer 0's canonical compose primitive. Each appender added/promoted here is also added to `WRITE_APPENDER_REGISTRY` in `composeTx.ts` (one extra line per appender — typed, fail-CI-on-missing). Layer 1's effort is unchanged (~2d); the registry wiring is folded into Layer 0's ~1d composeTx primitive.

The split is already half-done. Real remaining work is smaller than v0.1 implied.

**Current state (refreshed 2026-05-02 during P2.2 kickoff — corrects 3 stale rows from v0.2):**

| Tool | `buildXTx` exists? | `addXToTx` (in-place appender) exists? | Layer 1 work needed |
|---|---|---|---|
| `save_deposit` | ✅ `buildSaveTx` | ✅ `addSaveToTx` | None |
| `withdraw` | ✅ `buildWithdrawTx` | ✅ `addWithdrawToTx` | None |
| `borrow` | ✅ `buildBorrowTx` | ✅ `addBorrowToTx` *(actually shipped pre-v0.2; spec was stale — confirmed 2026-05-02 at `packages/sdk/src/protocols/navi.ts:487`)* | None |
| `repay_debt` | ✅ `buildRepayTx` | ✅ `addRepayToTx` | None |
| `send_transfer` | ✅ `buildSendTx` (in `wallet/send.ts`, ✅ promoted to agent surface 2026-05-02 at `packages/sdk/src/index.ts`) | ❌ | **Add `addSendToTx`** *(builder promotion ✅ done 2026-05-02 in P2.2.5)* |
| `claim_rewards` | ✅ `buildClaimRewardsTx` *(✅ done 2026-05-02 in P2.2.2 at `packages/sdk/src/protocols/navi.ts:686`; thin NAVI-only wrapper around existing appender, returns `{ tx, rewards }`)* | ✅ `addClaimRewardsToTx` | None |
| `swap_execute` | ✅ `buildSwapTx` *(at `packages/sdk/src/protocols/cetus-swap.ts:143`)* | ✅ `addSwapToTx` *(✅ done 2026-05-02 in P2.2.3 at `packages/sdk/src/protocols/cetus-swap.ts:166`; dual-mode — wallet-fetch w/ pagination + `swapAll` clipping, OR chain-mode that consumes an upstream coin ref. Returns `{ coin, effectiveAmountIn, expectedAmountOut, route }`. Slippage clamped to [0.001, 0.05].)* | None |
| `volo_stake` | ✅ `buildStakeVSuiTx` *(at `packages/sdk/src/protocols/volo.ts:55`)* | ✅ `addStakeVSuiToTx` *(✅ done 2026-05-02 in P2.2.4 at `packages/sdk/src/protocols/volo.ts:90`; dual-mode — wallet-fetch w/ pagination + insufficient-balance guard, OR chain-mode that consumes an upstream SUI coin ref. Returns `{ coin, effectiveAmountMist }`. Sponsored-flow safe — does NOT consume `tx.gas`.)* | None |
| `volo_unstake` | ✅ `buildUnstakeVSuiTx` *(at `packages/sdk/src/protocols/volo.ts:86`)* | ✅ `addUnstakeVSuiToTx` *(✅ done 2026-05-02 in P2.2.4; dual-mode w/ `bigint \| 'all'` semantics — `'all'` consumes the merged primary or full inputCoin without splitting. Refactored `fetchVSuiCoins` → generic `fetchCoinsByType(coinType)` shared with stake appender.)* | None |
| `pay_api` | n/a | n/a | **EXCLUDED from v1** — see "What this spec does NOT touch" |
| `save_contact` | n/a (Postgres only) | n/a | **EXCLUDED — no on-chain leg** |

**Effort revision (2026-05-02):** Layer 1 work was specced at ~2d under v0.2's stale inventory. Actually-missing items were 4 appenders (`addSendToTx`, `addSwapToTx`, `addStakeVSuiToTx`, `addUnstakeVSuiToTx`) + 1 standalone builder (`buildClaimRewardsTx`) + the 1 builder-promotion (`buildSendTx`). Revised effort: **~1–1.5d**. Saving (~0.5–1d) flows back to the SPEC 7 critical-path total (was 16d → now ~15–15.5d).

**Layer 1 status (2026-05-02): ✅ COMPLETE.** All 6 sub-stages shipped in 4 t2000 commits across one session (~6h total — under the revised budget). Layer 1 deliverables:
- ✅ `buildSendTx` promoted to agent surface (P2.2.5, commit a8ebef52)
- ✅ Stale spec/tracker rows refreshed (P2.2.6, commit a8ebef52)
- ✅ `addSendToTx` (P2.2.1, commit a8ebef52) — codifies P2.1 smoke
- ✅ `buildClaimRewardsTx` (P2.2.2, commit b792b3d0) — NAVI-only standalone wrapper
- ✅ `addSwapToTx` (P2.2.3, commit c5fe219d) — Cetus dual-mode w/ paginated wallet-fetch + chain-mode
- ✅ `addStakeVSuiToTx` + `addUnstakeVSuiToTx` (P2.2.4, this commit) — Volo dual-mode

SDK (`@t2000/sdk@1.5.0`) export surface for SPEC 7 chain-mode authoring is now complete. Next critical-path item: **P2.2b** — `composeTx({ steps })` registry adapter that dispatches between standalone builders + chain-mode appenders. Then **P2.2c** retires the audric host's 7 `// CANONICAL-BYPASS:` comments by routing every `transactions/prepare/route.ts` write through `composeTx`.

**Net:** 4 standalone builders to add (`buildSwapTx`, `buildClaimRewardsTx`, `buildStakeVSuiTx`, `buildUnstakeVSuiTx`), 4 appenders to add (`addBorrowToTx`, `addSendToTx`, `addSwapToTx`, `addStakeVSuiToTx` / `addUnstakeVSuiToTx` — pair). Plus promote `buildSendTx` to the agent surface.

**Builder return type (locked):**

```ts
interface PtbFragment<TPreview> {
  tx: Transaction;                // The mutated transaction
  preview: TPreview;              // Quote / amount-out / health-factor-after / etc.
                                  // (Same shape as today's executed result minus the `tx` digest.)
  consumes?: string[];            // Coin types this fragment consumes from wallet
  produces?: TransactionObjectArgument[];  // Coin refs other fragments can chain off
}
```

The existing high-level executor methods (`agent.swap()`, `agent.save()`, etc. in `packages/sdk/src/t2000.ts`) become trivial wrappers: call the `buildXTx`, hand the `Transaction` to the existing private `executeTx(client, signer, txFactory)` helper. **`executeWithGas` no longer exists** (deleted in PR-B1 / S.34) — the audric host doesn't use either; it composes the `Transaction` and ships it to Enoki via `/api/transactions/prepare` → `/api/transactions/execute`.

**S.38 Pyth `skipPythUpdate` plumbing (sponsorship-critical):**

Every NAVI builder in v0.51.x already accepts a per-call options object (`{ asset, skipPythUpdate, skipOracle, collectFee }`). The audric prepare route applies these conditionally today:

```ts
case 'borrow': {
  const result = await adapter.buildBorrowTx(address, amount, borrowAsset, {
    skipPythUpdate: true,  // REQUIRED under Enoki sponsorship — see S.38
  });
  return result.tx;
}
case 'withdraw': {
  const result = await adapter.buildWithdrawTx(address, amount, withdrawAsset, {
    skipPythUpdate: true,  // REQUIRED under Enoki sponsorship — see S.38
  });
  return result.tx;
}
case 'repay': {
  const result = await adapter.buildRepayTx(address, amount, asset ?? 'USDC', {
    skipOracle: true,  // safe — debt reduction has no HF risk
  });
  return result.tx;
}
```

**Constraint:** PTBs are atomic at the gas level. **If ANY step in a bundle is a NAVI op under sponsorship, the entire bundle inherits the same Pyth-fee restriction** (the whole tx can't reference `tx.gas` as an argument). The bundle composer in the audric host MUST replicate this conditional logic — for every NAVI step in the bundle, apply the appropriate `skipPythUpdate` / `skipOracle` flag.

**Self-funded callers (CLI, MCP, server tasks) keep `skipPythUpdate: undefined`** — they pay Pyth's update fee from their own SUI gas budget, no restriction. The flag is sponsorship-specific.

**Gas estimation** runs against the assembled bundle PTB, not the individual fragments — Sui's gas model handles this; no SDK change needed beyond calling `dryRun` on the composite tx before signing.

### Layer 2: Engine — bundling protocol (~3 days)

**Trigger (locked):** Implicit bundling. When the LLM emits ≥2 `tool_use` blocks in a single assistant turn AND all of them resolve to `confirm`-tier write tools AND all of them carry `bundleable: true` in their `ToolFlags`, the engine yields a single `pending_action` with `steps: PendingActionStep[]` instead of N separate `pending_action`s.

```ts
// Add to existing ToolFlags interface (packages/engine/src/types.ts:236):
interface ToolFlags {
  mutating?: boolean;
  requiresBalance?: boolean;
  affectsHealth?: boolean;
  irreversible?: boolean;
  producesArtifact?: boolean;
  costAware?: boolean;
  maxRetries?: number;
  bundleable?: boolean;  // NEW. Default false. Opt-in per write tool.
}

// New on PendingAction:
interface PendingActionStep {
  toolName: string;
  toolUseId: string;
  attemptId: string;          // Per-step UUID v4 (each step its own TurnMetrics row)
  input: unknown;
  description: string;        // Per-step user-facing summary
  modifiableFields?: PendingActionModifiableField[];
}

interface PendingAction {
  // ... existing single-write fields stay (toolName, toolUseId, input, description, attemptId, modifiableFields, turnIndex, assistantContent, completedResults, guardInjections) ...

  /**
   * [Spec 7] When set, this pending_action represents a multi-write Payment Stream.
   * Single-step bundles are NOT created — engine emits the legacy single-write
   * shape when N=1. `steps[0]` mirrors the top-level toolName/toolUseId/input/attemptId
   * for hosts that haven't been updated; new clients should iterate `steps`.
   */
  steps?: PendingActionStep[];

  /**
   * [Spec 7 v0.3] Quote-Refresh ReviewCard support — multi-write only.
   * Set on bundled pending_actions (steps !== undefined). Single-write
   * pending_actions ignore these fields entirely.
   *
   * `quoteAge` — milliseconds since the upstream read tools that fed this
   *   bundle's composition completed. Engine stamps at emit time using the
   *   max(now - tool_result.timestamp) across the listed regenerateInput.toolUseIds.
   *   Host renders as "QUOTE Ns OLD" badge in the PermissionCard header.
   *   When quoteAge exceeds the bundle's shortest-TTL upstream tool, the
   *   regenerate button auto-pulses (visual highlight; user can still approve).
   *
   * `canRegenerate` — true when the bundle was composed from re-runnable
   *   read tools (swap_quote, rates_info, balance_check, portfolio_analysis).
   *   False when the bundle was composed from non-re-runnable inputs (e.g.
   *   user-provided amounts that don't depend on upstream quotes).
   *
   * `regenerateInput` — engine-internal payload listing which upstream reads
   *   to re-fire when the user taps REGENERATE. The host echoes this back
   *   verbatim in POST /api/engine/regenerate; the engine re-runs each
   *   toolUseId's tool with the same input (no LLM call), rebuilds the
   *   bundle, returns a fresh pending_action with new per-step attemptIds
   *   in the response body (NOT via SSE — see Layer 3 v0.3 endpoint section).
   *
   * v0.3.1 NOTE: An earlier draft included a `preserveSeed: boolean` field
   * here as forward-compat for SPEC 9 content-review. Dropped — quote-refresh
   * doesn't use it, and SPEC 9 will need richer seed semantics
   * (`seed?: string` + `regenerationMode?: 'fresh' | 'variant' | 'lockedSeed'`)
   * which a boolean can't capture. SPEC 9 designs the right shape when it lands.
   */
  quoteAge?: number;
  canRegenerate?: boolean;
  regenerateInput?: {
    toolUseIds: string[];      // upstream read toolUseIds to re-execute
  };
}
```

**v0.3.1 — Permission-gate loop refactor (NEW sub-task, ~+1d, gap G2).** The current `engine.ts:851-934` permission-gate loop iterates over all `tool_use` blocks but does `pendingWrite = { call, tool }; break;` on the first write that needs confirmation — silently dropping subsequent parallel writes. v0.3 assumed this loop already collected all writes (the "factor `composeBundleFromToolResults` out" claim); it does not. Two pieces of work:

1. **Refactor the permission-gate loop** to collect ALL writes into a `pendingWrites: Array<{ call, tool }>` instead of a singular `pendingWrite`. Continue checking each write's permission tier (auto / confirm / explicit) — only `confirm`-tier writes go into the bundle candidate set.
2. **Decide the mixed-tier policy.** What if a turn yields `[swap_execute (confirm), claim_rewards (auto)]`? Three policies considered — locked: **auto-tier writes execute as today (no gate); confirm-tier writes get bundled separately**. Mixed bundles are NOT created — the auto write fires, then the bundle's `pending_action` yields with only the confirm writes. Documented in `recipes/loader.ts` validation (recipes with `bundle: true` must contain only `confirm`-tier writes).

The new `composeBundleFromToolResults` helper is then a fresh ~80 LOC function that takes the collected `pendingWrites` + earlier `tool_result`s in the same turn → returns a `PendingAction` with `steps[]` populated and `regenerateInput.toolUseIds` listing the contributing read toolUseIds. Effort: was 0.25d for the "factor-out" claim, now ~1.25d for refactor + helper (net +1d).

**Bundle composition tracks upstream reads (engine-side, ~30 LOC, unchanged from v0.3).** With the loop refactor above:

- During the same-turn `tool_use` collection, the engine also tracks which **read** `tool_use` blocks completed earlier in the turn (`balance_check`, `swap_quote`, `rates_info`, `portfolio_analysis`).
- When yielding a bundled `pending_action`, the engine checks each step's `input` for references to those read results (e.g. `swap_execute.amount` derived from `balance_check.usdc`, `swap_execute.minOut` derived from `swap_quote.estimatedOut`).
- If any step references a re-runnable read result, set `canRegenerate: true` and populate `regenerateInput.toolUseIds` with the contributing read toolUseIds.
- If no step references re-runnable reads (e.g. all amounts user-provided), set `canRegenerate: false`.
- `quoteAge` = `Date.now() - min(tool_result.timestamp for toolUseId in regenerateInput.toolUseIds)`. (Min, not max — we report the freshness of the **stalest** input; that's what gates UX urgency.)

**Per-tool TTL table (engine-side constant, `packages/engine/src/tool-ttls.ts`):**

```typescript
export const TOOL_TTL_MS: Record<string, number> = {
  swap_quote: 30_000,         // Cetus quotes drift fast on volatile pairs
  rates_info: 90_000,         // NAVI APY moves slowly
  balance_check: 120_000,     // BlockVision-cached, low drift
  portfolio_analysis: 120_000, // BlockVision-cached
  // ... add as new re-runnable reads ship
};

export function bundleShortestTtl(toolUseIds: string[], toolNamesById: Record<string,string>): number {
  return Math.min(...toolUseIds.map(id => TOOL_TTL_MS[toolNamesById[id]] ?? 60_000));
}
```

The host imports `bundleShortestTtl` to decide when the regenerate button auto-pulses. The engine itself doesn't enforce a TTL — it's a UX hint, not a correctness gate. Sui's on-chain dry-run is the actual correctness gate (a stale quote that no longer satisfies `minOut` will revert; user gets an honest error narration, no funds moved).



**Bundleable tools (v1):** `save_deposit`, `withdraw`, `borrow`, `repay_debt`, `send_transfer`, `swap_execute`, `claim_rewards`, `volo_stake`, `volo_unstake`. **Non-bundleable:** `pay_api` (HTTPS coupling), `save_contact` (Postgres only).

**Resolution protocol:** When a host resolves a bundled action via `resumeWithToolResult(action, response)`, the response carries an array of per-step results:

```ts
interface PermissionResponse {
  approved: boolean;
  // Single-step (legacy): unchanged.
  executionResult?: unknown;
  // Bundled: one per step, in order.
  stepResults?: Array<{ toolUseId: string; attemptId: string; result: unknown; isError: boolean }>;
}
```

The engine's resume loop pushes N `tool_result` blocks back into the conversation (one per `tool_use` from the original turn) instead of one. Same code path as today; just a `for` loop instead of a single push.

**Permission cap aggregation:** `resolvePermissionTier` is called once per step. The bundle is approved-with-confirmation if **any** step requires confirmation. The bundle's USD value (for `autonomousDailyLimit` / `sessionSpendUsd` accounting) is the **sum** of step USD values. If the bundle would push `sessionSpendUsd` past the daily cap, the bundle as a whole is downgraded to `confirm` — never split.

> **Audric/web note:** today, `permissionConfig` + `priceCache` are NOT passed into `ToolContext` (zkLogin trust model — every write needs user presence). So **on audric/web, every bundle is always `confirm` — one card, one tap, never auto-executed**. The aggregation logic still needs to be correct for future non-zkLogin runtimes (CLI, server-signed automations) but the audric/web behavior is "always one PermissionCard."

**`attemptId` per step (Spec 1 / Spec 2 carry-forward):** Each step gets its own UUID v4 stamped at emit time. The host writes N `TurnMetrics` rows on chat-time (one per step `attemptId`). The resume route's `updateMany({ where: { attemptId } })` clauses in `apps/web/app/api/engine/resume/route.ts` already key on `attemptId` — they extend trivially to the per-step shape (loop the `stepResults`, update each row).

**Post-write refresh:** Fires once after the bundle resolves successfully, with the **union** of refresh tools across all steps' `postWriteRefresh` entries. Deduplicated. Same `wasPostWriteRefresh` event flag.

**Failure handling:** PTB execution is atomic at the Sui layer — either all step writes commit or none do. If `executionResult.success === false`, the engine emits N `tool_result` blocks all carrying the same error, so the LLM narrates the failure cleanly ("the stream failed because the USDsui pool is full; nothing was changed").

### Layer 3: Audric (host) — Payment Stream PermissionCard + composer (~2.5 days, was 2d in v0.1)

> **v0.2.1 placement note:** Because SPEC 8 ships first, the multi-step PermissionCard renders as a `permission-card` `TimelineBlock` inside SPEC 8's `ReasoningTimeline` — NOT as a separate slot inside `ChatMessage`. Concretely: when the engine yields a bundled `pending_action` with `steps`, `useEngine.processSSEChunk` pushes a `{ type: 'permission-card', payload: action }` block onto the timeline (instead of mutating the legacy fixed `pendingAction` field). Renders inline with all preceding thinking/tool/parallel-group blocks. ~+0.5d for placement work; offset by Layer 5 simplification (~−0.5d, see below). Net: ~10.5d unchanged.

**Composer change** in `useEngine.executeToolAction`:

> **v0.4 simplification:** Because Layer 0 ships `composeTx({ steps })` as the canonical primitive, the host composer becomes trivial — pass `action.steps` directly to `composeTx`, then sponsor + execute. No host-side "internal `composeStep(tx, step)` helper" needed; that helper IS the appender registry inside `composeTx`. The bullet-list below is the post-Layer-0 simplified flow.

- Detect `action.steps` presence (multi-write) vs single-write `pending_action` shape.
- Call `composeTx({ sender: address, steps: action.steps ?? [{ toolName: action.toolName, input: action.input }], sponsoredContext: true })` once. The primitive handles N=1 and N>1 identically — single dispatch path for both.
- Per-NAVI-step `skipPythUpdate` / `skipOracle` flags are auto-applied by the appenders (Layer 1) when `sponsoredContext: true` is passed — no host-side conditional logic needed.
- Call the existing Enoki sponsor + execute round-trip once on `composed.txKindBytes`, using `composed.derivedAllowedAddresses` (auto-computed; no hand-maintained array).
- Map the on-chain `balanceChanges` back to per-step `result` shapes using `composed.perStepPreviews` for context (each step's preview + the shared tx digest).
- Return `{ approved: true, stepResults: [...] }`.

**PermissionCard UI (the v0.2 design — see mocks):**

```
┌─ N operations · 1 Payment Stream · Atomic ─────────── 57s ┐
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1  Swap $200 USDC → SUI                  [CETUS]    │  │
│  │    Cetus best-route · 0.03% slippage · 212.77 SUI   │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ 2  Swap $900 USDC → USDsui + deposit  [NAVI · 8.4%] │  │
│  │    50% of remaining · NAVI 8.4% APY · $75.60/year   │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ 3  Send $100 USDC → mom.audric.sui   [TRANSFER]     │  │
│  │    0xa3f9…b27c · resolved from contacts             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  GAS $0.005 · SPONSORED · ALL SUCCEED OR ALL REVERT        │
│                                                            │
│  [   Deny   ]                       [    Approve     ]     │
└────────────────────────────────────────────────────────────┘
```

- **Header:** *"N operations · 1 Payment Stream · Atomic"*. Right-aligned: quote validity countdown (matches existing `swap_quote` 30-60s freshness window — bundle inherits the shortest member quote's TTL).
- **Per-step row:**
  - Number badge (1/2/3)
  - Action summary (`{verb} {amount} {asset} → {target}`)
  - Detail line (route / APY / contact resolution / slippage / projected yield)
  - Right-aligned protocol badge (`CETUS`, `NAVI · 8.4%`, `TRANSFER`, `VOLO`, etc.)
  - Optional editable amount (per-step `modifiableFields`) — user can tweak individual amounts before approving
- **UX clustering rule:** consecutive `swap_execute` + `save_deposit` for the same asset render as ONE row labeled "Swap X → Y + deposit." This is a pure UI grouping; the engine still emits 2 separate `PendingActionStep`s. Algorithm: if step N is `swap_execute(from=A, to=B)` and step N+1 is `save_deposit(asset=B)`, collapse them into one visual row with both protocols' badges.
- **Footer:** aggregate gas estimate, sponsorship indicator, atomicity tagline.
- **Buttons:** single Approve / Deny gate the whole bundle. No per-step removal (resolved decision #1 from open questions — keeps atomicity guarantee intact).
- **Approving state:** button disables and shows `Approving…` while Enoki sponsors + the composite tx executes.

**Receipt card (after stream settles — see mock screenshot 3):**

```
┌─ ⚡ PAYMENT_STREAM ──────────────────── SETTLED IN 0.6S ↑ ┐
│                                                            │
│  STREAM SETTLED              0.6S · 3 OPS · TX 7BZF02…IDFEBQ │
│                                                            │
│  Swapped              $200 USDC → 212.77 SUI               │
│  USDsui deposit       $900 → NAVI 8.4%                     │
│  Sent to mom.audric.sui  $100 USDC                         │
│  Gas                  $0.005 · Sponsored                   │
│                                                            │
│  View on Suiscan ↗                                         │
└────────────────────────────────────────────────────────────┘
```

- **Header:** `⚡ PAYMENT_STREAM` lockup, right-aligned settlement time (showcases Sui speed — "settled in 0.6S" reads as magic).
- **Sub-header:** total time / total ops / single tx digest (truncated, click to expand to full).
- **Per-op row:** verb summary + amount summary. NO protocol badges in the receipt (already established in the PermissionCard).
- **Aggregate gas line:** total gas + sponsorship indicator.
- **Suiscan link:** ONE link to the bundle tx digest. (The transaction itself contains all N MoveCalls; the existing classifier walks them.)

**Activity feed:** Bundled txs get one row labeled `Stream · N actions`. Drill-in shows per-step decoded MoveCalls, mirroring the existing tx-classification pipeline. **No new classifier** — the existing one in `apps/web/app/api/activity/` walks all MoveCalls in any tx; bundled txs just have more of them.

#### v0.3.2 — Recipient rendering (SPEC 10 D10 cross-spec contract)

The "Send $100 USDC → mom.audric.sui" row in the v0.2 mock above implements **SPEC 10 v0.2.1 D10** — when a contact's resolved address has a `*.audric.sui` leaf (the unified Contact shape's `audricUsername` field is populated), the row renders the **full handle**, never bare nickname or `@mom`.

**Recipient render matrix** (computed at PermissionCard render time, NOT at engine emit time — engine just passes the Contact row + resolved 0x):

| Contact state (v0.1.2 `Contact` shape) | Recipient row renders as |
|---|---|
| `audricUsername: "mom.audric.sui"`, `name: "Mom"` (saved as Audric handle, has nickname) | **`mom.audric.sui`** + subtitle `0xa3f9…b27c · resolved from contact "Mom"` |
| `audricUsername: "alice.audric.sui"`, `name: undefined` (saved as Audric handle, no nickname) | **`alice.audric.sui`** + subtitle `0xa3f9…b27c` |
| `audricUsername: undefined`, `identifier: "alex.sui"` (external SuiNS, no Audric leaf) | **`alex.sui`** + subtitle `0xa3f9…b27c · resolved from contact` |
| `audricUsername: undefined`, `identifier: "0xa3f9…"`, `name: "Mom"` (bare 0x with nickname) | **`Mom`** + subtitle `0xa3f9…b27c` ← *only case where nickname appears alone — there is no on-chain handle to display* |
| `audricUsername: undefined`, `identifier: "0xa3f9…"`, no nickname | **`0xa3f9…b27c`** (truncated bare 0x) |

**Pre-SPEC-10 fallback (between SPEC 7 ship and SPEC 10 ship):** all rows render in the bare-0x-with-nickname form — `Mom` + `0xa3f9…b27c`. The v0.3.2 spec mock shows the **post-SPEC-10 state** (canonical end state). When SPEC 10 Phase D.4 contact-augmentation backfill runs, every Audric-handle contact retroactively flips to the full-handle render — no PermissionCard renderer change required, only the underlying Contact data shape changes.

**The single-rule guarantee** (SPEC 10 D10): **NEVER render `@mom` as a display form** in the PermissionCard. `@` is reserved for autocomplete typing in the send modal (when the user types `@mom` to find the contact). Once selected, the recipient renders as the full `mom.audric.sui` handle in every downstream surface (PermissionCard, receipt, tx history).

**Why this matters for Payment Stream:** trust verification on a 3-op atomic bundle is the highest-stakes UX surface in Audric. Bare `Mom` in row 3 risks the user confusing it with a different `mom.sui` (separate namespace, possibly different person). Full handle removes the ambiguity at the moment of signature.

#### v0.3 — Quote-Refresh ReviewCard (PermissionCard regenerate flow)

**Why this exists.** A 3-op Payment Stream is composed at T=0 with fresh upstream data (Cetus swap quote + NAVI APY snapshot + wallet balance). The user takes 47 seconds to read the card before tapping Approve. By then the swap quote has drifted, the APY may have shifted, and the on-chain dry-run may reject. Today's options are bad: auto-retry with stale data and surprise the user, or silent fail and force a re-prompt that loses the user's narrative thread. v0.3 adds a third option: an explicit "REGENERATE" button that re-fires the upstream reads (no LLM call), rebuilds the bundle in place, and emits a fresh `pending_action` with the same Payment Stream intent but fresh per-step quotes.

**SPEC 8 v0.4 ships the empty slot. SPEC 7 v0.3 fills it.** The PermissionCard renderer in `audric/apps/web/components/engine/PermissionCard.tsx` accepts an optional `regenerate?: { label, ageLabel, onClick, isRegenerating }` prop (added in SPEC 8 v0.4 Closure C). When `action.canRegenerate === true`, the host passes a populated `regenerate` prop; the renderer draws the 3-button row + "QUOTE Ns OLD" badge.

**Visual treatment** (matches SPEC 8 v0.4 Closure C visual placement):

```
┌─ 3 operations · 1 Payment Stream · Atomic ──── 12s · QUOTE 47s OLD ┐
│                                                                     │
│  ┌──── per-step rows (unchanged from v0.2) ─────────────┐           │
│  └────────────────────────────────────────────────────────┘           │
│                                                                     │
│  GAS $0.005 · SPONSORED · ALL SUCCEED OR ALL REVERT                  │
│                                                                     │
│  [   Deny   ]   [   ↻ Regenerate   ]   [    Approve     ]           │
└─────────────────────────────────────────────────────────────────────┘
```

- "QUOTE 47s OLD" badge updates every 1s (host-side `setInterval`).
- Badge typography: dim grey at `quoteAge < shortestTtl`, amber pulse when `quoteAge >= shortestTtl`, red when `quoteAge >= 2 × shortestTtl`.
- Regenerate button enabled at all `quoteAge` values — there's no hard floor; the user decides.
- When user taps Regenerate, button shows spinner + "Regenerating…", Approve disables, Deny stays enabled (escape hatch).

**New host endpoint: `POST /api/engine/regenerate`** (`audric/apps/web/app/api/engine/regenerate/route.ts`, ~140 LOC after v0.3.1 timeline-events change).

> **v0.3.1 architectural note (gap G3).** v0.3 specified that the engine "emits the new `pending_action` event over the existing SSE stream for this session." That doesn't work: `useEngine.ts:497` sets `isStreaming: false` on `pending_action`, so the SSE stream has CLOSED by the time the user sees the PermissionCard and taps Regenerate. Three fixes were considered (re-open SSE, WebSocket, synchronous endpoint); v0.3.1 picks **synchronous endpoint with timeline events in response body** — preserves SPEC 8 v0.4's "feels alive" UX (re-fired upstream reads visible in timeline) without requiring SSE plumbing on a sub-second round-trip.

```typescript
// Request shape
interface RegenerateRequest {
  sessionId: string;
  attemptId: string;          // the bundled pending_action's attemptId (top-level, not per-step)
}

// Response shape (v0.3.1 — was an "engine emits via SSE" claim, now synchronous body)
interface RegenerateResponse {
  success: true;
  newPendingAction: PendingAction;     // fresh pending_action with new per-step attemptIds
  // v0.3.1 — timeline events for the re-fired upstream reads.
  // Host pushes these onto the timeline as a "↻ Regenerated · Ns" group
  // so the user sees what was re-checked (matches SPEC 8 v0.4 transparency model).
  timelineEvents: Array<
    | { type: 'tool_start'; toolName: string; toolUseId: string; input: unknown }
    | { type: 'tool_result'; toolName: string; toolUseId: string; result: unknown; isError: boolean; durationMs: number }
  >;
} | {
  success: false;
  reason: 'pending_action_not_found' | 'cannot_regenerate' | 'engine_error';
  message: string;
}
```

**Engine-side regeneration (~80 LOC in `packages/engine/src/regenerate.ts`):**

1. Look up the original `pending_action` by `attemptId` from `MemorySessionStore`. If missing or `canRegenerate === false`, return error.
2. For each `toolUseId` in `regenerateInput.toolUseIds`: look up the original `tool_use` block from session history, re-execute the tool with the SAME input (no LLM call). Tools are **executable-without-LLM-interaction** for read tools (BlockVision/Cetus return current state on every call — that's exactly the freshness we want).
3. Stamp NEW `toolUseId`s on the re-executed reads (don't reuse the originals — host appends, doesn't overwrite). Track each `tool_start` + `tool_result` event with `durationMs`.
4. Push the new `tool_result`s into the session as if they had just streamed (with `wasRegenerated: true` audit flag — surfaces in `TurnMetrics`).
5. Re-run the **bundle composition step only** (not the LLM): the new `composeBundleFromToolResults()` helper (written from scratch in v0.3.1, see Layer 2 refactor above) takes the now-fresh tool results + the original step plan + builds a new `PendingAction` with new per-step `attemptId`s.
6. The original `attemptId`'s `TurnMetrics` row gets `pendingActionOutcome: 'regenerated'` (new enum value alongside `approved`, `denied`, `expired`). The new `attemptId`'s row is created fresh.
7. Return `{ success: true, newPendingAction, timelineEvents }` synchronously. NO SSE involvement.

**Why this keeps Spec 1 / Spec 2 invariants intact:**

- Each regeneration is its own `attemptId` → its own `TurnMetrics` row. No accidental over-write of the original.
- The original `pending_action`'s outcome is preserved in history (`'regenerated'`, not `'denied'`) — analytics can distinguish "user changed their mind" from "user re-evaluated stale quote."
- Resume route's `updateMany({ where: { attemptId } })` keys still work — the new `attemptId` resolves the new `TurnMetrics` row when the user finally approves.
- Host's `handleRegenerate` (see below) reads the response body and updates the timeline + pendingAction state in one synchronous handler — no SSE chunk-handler changes needed.

**Host-side wiring (~60 LOC in `audric/apps/web/components/engine/PermissionCard.tsx` + `useEngine.ts`, v0.3.1 — was ~40 LOC before timeline-events change):**

```typescript
// useEngine.ts — fired when user taps Regenerate
async function handleRegenerate(action: PendingAction, msgId: string) {
  setRegeneratingAttemptIds(prev => new Set(prev).add(action.attemptId));
  try {
    const res = await fetch('/api/engine/regenerate', {
      method: 'POST',
      body: JSON.stringify({ sessionId, attemptId: action.attemptId }),
    });
    const body = await res.json() as RegenerateResponse;
    if (!body.success) {
      toast.error(REGEN_ERROR_COPY[body.reason]); // map reason → user copy
      return;
    }
    // v0.3.1 — push the timeline events as a "regenerated" group BEFORE
    // updating the PermissionCard, so the user sees the re-fired reads
    // appear in the timeline above the new card.
    appendTimelineGroup(msgId, {
      type: 'regenerated',
      label: `↻ Regenerated · ${formatDurationMs(totalDuration(body.timelineEvents))}`,
      events: body.timelineEvents,
    });
    // Then swap the PermissionCard payload to the fresh action.
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, pendingAction: body.newPendingAction } : m,
    ));
  } catch (err) {
    toast.error('Could not regenerate. The original card is still valid.');
  } finally {
    setRegeneratingAttemptIds(prev => {
      const next = new Set(prev);
      next.delete(action.attemptId);
      return next;
    });
  }
}

// PermissionCard prop wiring
<PermissionCard
  action={action}
  onApprove={handleApprove}
  onDeny={handleDeny}
  isApproving={isApproving}
  regenerate={action.canRegenerate ? {
    label: 'REGENERATE',
    ageLabel: formatQuoteAge(action.quoteAge),  // "QUOTE 47s OLD"
    onClick: () => handleRegenerate(action),
    isRegenerating: regeneratingAttemptIds.has(action.attemptId),
  } : undefined}
/>
```

**`formatQuoteAge` (host helper, `audric/apps/web/lib/format-quote-age.ts`):**

```typescript
export function formatQuoteAge(ageMs?: number): string {
  if (ageMs == null) return 'QUOTE FRESH';
  const s = Math.floor(ageMs / 1000);
  if (s < 60) return `QUOTE ${s}s OLD`;
  return `QUOTE ${Math.floor(s / 60)}m ${s % 60}s OLD`;
}
```

**Failure modes:**

| Scenario | Behaviour |
|---|---|
| Engine can't find the `pending_action` (TTL expired, session evicted) | Endpoint returns `reason: 'pending_action_not_found'`. Host shows toast: "Card has expired. Please re-prompt." Approve button disables. |
| `canRegenerate === false` somehow reaches the endpoint (race / client bug) | Endpoint returns `reason: 'cannot_regenerate'`. Host clears the regenerate button (defensive). |
| Tool re-execution itself errors (BlockVision down, Cetus 5xx) | Endpoint returns `reason: 'engine_error'`. Host toasts: "Could not regenerate. Try again, or approve with the current quote." Original card stays valid. |
| User taps Regenerate, then taps Approve before the new pending_action arrives | Approve button is disabled while `isRegenerating === true`. Race impossible. |
| User regenerates 5+ times in 30s | Allow it. Each call is cheap (no LLM, no on-chain — just upstream read tools). Telemetry counter `audric.harness.regenerate_count` flags abuse if needed. |

**Telemetry additions (P3.5 in SPEC 8 v0.4 already accounts for this):**

- `regenerateClickCount` — per-attemptId counter (durable on `TurnMetrics`).
- `regenerateOutcome` — new `TurnMetrics` enum value (`'regenerated' | ...existing`) on the original attemptId row.
- `audric.harness.regenerate_count` — Vercel Observability gauge, segmented by outcome (`approved_after_regen`, `denied_after_regen`, `regen_then_expired`).

**Acceptance criterion (P2.6 eval pass — SPEC 7 v0.3 own gate):**

Run the canonical headline use case ("swap 10% / save 50% / send $100 to Mom") with a synthetic 60s delay before approve. Verify (a) badge starts grey at "QUOTE 0s OLD", (b) at 30s+ badge flips to amber pulse, (c) clicking Regenerate triggers the endpoint, response arrives in <2s, badge resets to "QUOTE Fresh", (d) the timeline above the card shows a "↻ Regenerated · 1.4s" group with the re-fired tool_result blocks, (e) the original attemptId's `TurnMetrics` row has `pendingActionOutcome: 'regenerated'`, (f) the new attemptId's row exists and is fresh, (g) approving the new card succeeds end-to-end.

> **G10 footnote — bundle execution latency.** Quote staleness is measured from bundle composition → user-tap-Approve. Once the user taps Approve, the bundle takes ~600ms to execute on Sui. If the quote drifts during execution (rare — 600ms vs 30s TTL), Sui's atomic dry-run is the actual safety gate: the bundle reverts cleanly with an honest error narration, no funds moved. Not a regenerate concern.

**Effort:** ~1.25d total (~0.5d engine endpoint + new `composeBundleFromToolResults` helper from scratch — see Layer 2 v0.3.1 refactor + ~0.5d host wire-up + ~0.25d timeline-events rendering in host + Storybook coverage). SPEC 8 v0.4 already shipped the renderer slot.

### Layer 4: System prompt + tooling guidance + recipe bundling (~1d, was 0.5d in v0.1)

> **G11 footnote — recipe loader test gate (v0.3.1).** The `bundle: true` step grouping syntax is additive to the existing recipe loader (`packages/engine/src/recipes/loader.ts`). P2.5 acceptance gate adds a unit test asserting the loader parses BOTH the legacy 3 read-mostly recipes (no `bundle:` key) AND the 3 multi-write recipes with the new `bundle: true` syntax cleanly — no parser regressions. Ship-blocker.


**Add a prompt block** (in `apps/web/lib/engine/engine-context.ts` `STATIC_SYSTEM_PROMPT`) that teaches the LLM when to bundle:

> *"When the user asks for two or more write actions that share a common goal (e.g., 'swap then save', 'withdraw then send', 'rebalance my portfolio', 'swap 10% / save 50% / send to Mom'), emit ALL the corresponding tool calls in a single assistant turn. The engine will automatically bundle them into one atomic Payment Stream the user signs once. Bundling is the default for compound requests — never confirm step-by-step unless the user explicitly says 'one at a time'. The user sees one PermissionCard with all steps, signs once, and either everything happens or nothing does. Use Payment Stream framing in your narration ('Compiled into one Payment Stream — atomic, so if any leg fails, nothing executes')."*

**Tag the bundleable tools** in their `description` (one extra sentence appended): *"This tool supports Payment Stream bundling — emit alongside other write tools in the same turn for atomic execution."*

**Recipe bundling syntax (NEW in v0.2):**

The current recipe loader (`packages/engine/src/recipes/loader.ts`) parses YAML into linear `RecipeStep[]`. Today the existing `swap_and_save` recipe drives sequential calls — `swap_to_usdc` finishes, agent waits for the result, then `deposit` fires. After Spec 7, the same recipe should emit both writes as parallel `tool_use` blocks so the engine bundles them.

**New step grouping syntax:**

```yaml
name: swap_and_save
description: Swap a token to a stable and deposit into savings
triggers:
  - "swap and save"
steps:
  - name: check_balance
    tool: balance_check
    purpose: Get current token balances

  - name: bundle_swap_and_deposit
    bundle: true                      # NEW — emit all child writes in parallel
    children:
      - name: swap_to_stable
        tool: swap_execute
        requires:
          - step: check_balance
            field: available_amount
      - name: deposit
        tool: save_deposit
        requires:
          - step: swap_to_stable
            field: received           # typed coin-ref handoff (Layer 1)
    on_error:
      action: abort                   # Atomic — both succeed or stream reverts
      message: "Stream failed. No funds moved."
```

The 3 multi-write recipes (`swap_and_save`, `portfolio_rebalance`, `emergency_withdraw`) get the new syntax. The 3 read-mostly recipes (`safe_borrow`, `send_to_contact`, `account_report`) stay as-is — they're already single-write per execution path.

### Layer 5: Pre-bundle planning surface (NEW in v0.2 — was ~1d, simplified to ~0.5d in v0.2.1)

> **v0.2.1 simplification:** Because SPEC 8 ships first, the entire `ReasoningTimeline` infrastructure (TimelineBlock array, `parallel-group` block type, mid-flight narration, todos) already exists when SPEC 7 lands. The two "synthetic AgentStep" rows from v0.2 (`CONTACT · "MOM"`, `PLAN STREAM`) become natural `TimelineBlock` instances pushed by `useEngine.processSSEChunk` — no host-side AgentStep injection hacks, no separate auto-grouping logic (already in SPEC 8's `parallel-group`). Effort: ~1d → ~0.5d. The "Why not a separate SPEC 8?" footnote below is now obsolete (SPEC 8 exists, ships first).

The v0.2 mocks show a pre-bundle "RUNNING N TASKS IN PARALLEL" group with task rows like `BALANCE_CHECK`, `CETUS · SUI ROUTE`, `NAVI USDSUI POOL`, `CONTACT · "MOM"`, `PLAN STREAM`. Most of this is **already shipped** (and post-SPEC 8, all of it is shipped except the two synthetic rows):

| Mock element | Current state | Layer 5 work |
|---|---|---|
| "RUNNING N TASKS IN PARALLEL" group | ✅ Shipped — `ChatMessage.tsx:46` auto-groups when ≥2 tools running | None |
| Per-tool icon + LABEL row | ✅ Shipped — `AgentStep.tsx` icon/label maps for every tool | None |
| Reasoning accordion ("HOW I EVALUATED THIS") | ✅ Shipped — `ReasoningAccordion` (RE-1.4) | None |
| Per-protocol preview cards (CETUS_ROUTE, NAVI_USDSUI_POOL) | ✅ Shipped — these ARE the existing `swap_quote` + `rates_info` tool result cards rendered inline | None |
| `CONTACT · "MOM"` resolution row | ❌ Today contacts are passed silently to LLM via `EngineConfig.contacts`; no synthetic AgentStep for resolution | **NEW: emit synthetic `contact_lookup` AgentStep (UI-only) when LLM uses a contact name in a tool input** |
| `PLAN STREAM` row (final pre-confirm planning step) | ❌ No equivalent today | **NEW: emit synthetic `plan_stream` AgentStep with status `running` between the LLM's final assistant message and the bundle PermissionCard yield** |

**Implementation:** both new rows are **client-side synthetic AgentSteps** — no engine changes needed. The audric chat hook detects:
- "Does any `tool_use.input` reference a contact name from `useContacts()`?" → inject a `CONTACT · "<name>"` step before the actual tool calls
- "Did the engine just emit a bundled `pending_action` with `steps`?" → inject a `PLAN STREAM` step that resolves once the PermissionCard renders

These are pure UX polish rows. They make the agent feel like it's "thinking out loud" in the way Cursor's agent does. Cost: ~1 day of audric-side React work, zero engine changes.

> **Why not a separate SPEC 8?** Because (a) most of the harness UX is already shipped, (b) the two genuinely new rows (`CONTACT`, `PLAN STREAM`) are tightly coupled to bundle emission and would create a spec-coupling headache if separated, and (c) keeping the work in SPEC 7 keeps the demo coherent — one spec, one ship, one full-stack story. If we later want broader Cursor-style harness work (multi-agent handoff, inline file/data browsers, persistent todos surface, etc.), THAT becomes SPEC 8 — but that's product-design territory, not "finish the bundle UX." See "On a future SPEC 8" at the bottom of this doc.

---

## Tool inventory (v0.2 — corrected names + bundleable flags)

| Tool | Permission | `bundleable` | Notes |
|---|---|---|---|
| `save_deposit` | `confirm` | ✅ | USDC + USDsui (P1) |
| `withdraw` | `confirm` | ✅ | NAVI step → `skipPythUpdate: true` under sponsorship |
| `borrow` | `confirm` | ✅ | USDC + USDsui (P1); NAVI step → `skipPythUpdate: true` under sponsorship |
| `repay_debt` | `confirm` | ✅ | USDC + USDsui (P1); repay symmetry rule (P1.7); NAVI step → `skipOracle: true` under sponsorship |
| `send_transfer` | `confirm` | ✅ | All Tier 2 assets supported |
| `swap_execute` | `confirm` | ✅ | Cetus aggregator; quote TTL is the bundle's shortest TTL |
| `claim_rewards` | `confirm` | ✅ | Multi-asset reward claim (NAVX + vSUI/CERT) |
| `volo_stake` | `confirm` | ✅ | SUI → vSUI minting |
| `volo_unstake` | `confirm` | ✅ | vSUI → SUI redemption |
| `pay_api` | `confirm` | ❌ | EXCLUDED v1 — sync HTTPS coupling. Revisit after P4. |
| `save_contact` | `confirm` | ❌ | Postgres only, no on-chain leg |

---

## Surface area in numbers

| Surface | Today | After Spec 7 v0.4 |
|---|---|---|
| SDK build/execute split — total method count | 11 high-level + 8 partial PTB primitives | 11 high-level + 18 PTB primitives (9 builders + 9 appenders) |
| SDK new methods to ship | — | 4 standalone builders + 4 appenders + 1 promotion |
| **(v0.4) SDK canonical compose primitive** | — | **`composeTx(steps)` + `WRITE_APPENDER_REGISTRY` + `deriveAllowedAddressesFromPtb`** |
| **(v0.4) `/api/transactions/prepare/route.ts` LOC** | ~600 lines (fat route, inline send/fee/Cetus/Volo) | **~80 lines (thin dispatcher over `composeTx`)** |
| **(v0.4) `/api/services/prepare/route.ts` LOC** | ~389 lines (inline merge/split/transfer + 3 latent bugs) | **~150 lines (gateway negotiation only; on-chain leg via `composeTx`; 3 bugs fixed)** |
| **(v0.4) `/api/debug-swap/`** | exists | **DELETED** (obsoleted by `composeTx`) |
| **(v0.4) Audric write surfaces using `composeTx`** | 0 | **2** (`transactions/prepare`, `services/prepare`) |
| **(v0.4) Audric write surfaces with `// CANONICAL-BYPASS:` comment** | n/a | **1** (`PayButton.tsx` — intentional, dapp-kit not Enoki) |
| **(v0.4) ESLint rules** | `audric/canonical-portfolio` (read-side) | `+ audric/canonical-write` (write-side) |
| **(v0.4) Cursor rule files** | `audric-canonical-portfolio.mdc` (read-side) | `+ audric-canonical-write.mdc` (write-side) |
| **(v0.4) Spec consistency runner checks** | read-side only (no parallel `getPortfolio` re-implementations) | + write-side (no parallel write paths under `app/api/transactions/`/`services/`) |
| Engine `pending_action` shapes | 1 | 2 (single + bundled) |
| Engine event types | 11 | 11 (no new events; bundling is an attribute of `pending_action`) |
| Engine internal helpers (v0.3) | — | `composeBundleFromToolResults` (factored from agentLoop) + `bundleShortestTtl` + `regenerateBundle` |
| Audric resume protocol versions | 1 (modifications + outcome) | 2 (+ stepResults) |
| Audric PermissionCard variants | 2 (single, modifiable) | 3 (+ bundle, with optional v0.3 `regenerate` slot) |
| Audric AgentStep synthetic rows | 0 | 2 (`CONTACT`, `PLAN STREAM`) |
| Audric API endpoints (v0.3) | `/api/engine/chat`, `/api/engine/resume` | + `/api/engine/regenerate` (Quote-Refresh ReviewCard) |
| Recipes with `bundle: true` syntax | 0 | 3 (`swap_and_save`, `portfolio_rebalance`, `emergency_withdraw`) |
| Engine-side synthetic events | — | None (Layer 5 is host-side) |
| `TurnMetrics.pendingActionOutcome` enum (v0.3) | `'approved' \| 'denied' \| 'expired'` | `+ 'regenerated'` |

---

## Open questions (deferred to v0.3 unless data shows otherwise)

1. **Implicit-only or also explicit bundling?** Locked v0.2: implicit-only. Re-evaluate if eval pass shows <80% bundle-emission rate from Sonnet — then add an explicit `bundle_actions(steps)` meta-tool.
2. **Should the user be able to remove individual steps from a bundle in the PermissionCard?** Locked v0.2: **no**. "Approve 2 of 3" breaks atomicity by definition. If the user wants to skip a step, they decline the whole bundle and re-prompt.
3. **Cross-protocol PTBs (NAVI + Volo + Cetus in one tx) — supported in v1?** Locked v0.2: **yes, with one explicit cross-protocol regression test** (Cetus swap → NAVI deposit, which IS Use case 1 / the headline). Per-pair test surface stays bounded; Sui's atomicity catches anything that fails in dry-run.

## Resolved decisions (running list)

| # | Question | Decision |
|---|---|---|
| 1 | Naming (engineering) | **PTB bundle** / **bundle**. Matches Sui terminology. Used in code, tests, specs. |
| 1b | Naming (product) | **Payment Stream**. Used in chat narration, PermissionCard, receipt, activity feed, marketing. |
| 2 | Trigger model | **Implicit only** for v1. LLM emits parallel `tool_use` blocks → engine bundles. |
| 3 | Backward compat | **Single-write `pending_action` shape unchanged.** Hosts opt in by handling `action.steps`. |
| 4 | Atomicity guarantee | **PTB-native atomic.** Sui's transaction model guarantees all-or-nothing; no engine-level rollback logic. |
| 5 | Permission cap aggregation | **Sum across steps.** If sum > daily cap → downgrade entire bundle to `confirm`. Never split a bundle. (On audric/web every bundle is `confirm` anyway under zkLogin.) |
| 6 | Post-write refresh | **Union of step refresh tools, fired once after bundle.** Deduplicated. |
| 7 | Step modifiability | **Per-step `modifiableFields`.** User can tweak individual amounts before approving the bundle. |
| 8 | Failure narration | **Engine emits N matching `tool_result` blocks (all error).** LLM narrates the bundle failure as one event. |
| 9 | Activity feed | **One row, labeled with step count.** Drill-in shows per-step MoveCalls. |
| 10 | Engine version | `**@t2000/engine 1.1.0`.** Next minor from current 1.0.1. |
| 11 | SDK version | `**@t2000/sdk 1.1.0`.** Matched bump (release workflow ships all 4 packages together). |
| 12 | Cross-turn bundling | **Out of scope for v1.** Same-turn only. |
| 13 | `attemptId` per step | **Each step gets its own UUID v4 stamped at emit time.** Host writes N `TurnMetrics` rows. Resume route's existing `updateMany({ where: { attemptId } })` extends trivially. |
| 14 | Sponsorship coupling (S.38) | **Bundle composer must inherit per-tool `skipPythUpdate` / `skipOracle` flags from the single-write path.** NAVI step under sponsorship → flag required, otherwise tx fails with GasCoin error. |
| 15 | UX clustering | **Consecutive `swap_execute(from=A, to=B)` + `save_deposit(asset=B)` render as ONE PermissionCard row** ("Swap X → Y + deposit"). Engine still tracks 2 separate `PendingActionStep`s. |
| 16 | Recipe syntax | **`bundle: true` step grouping in YAML loader.** 3 recipes get the new syntax. Other recipes unchanged. |
| 17 | Pre-bundle planning surface | **Folded into SPEC 7 as Layer 5.** Two new client-side synthetic AgentSteps (`CONTACT`, `PLAN STREAM`); no engine changes. |
| 18 | `pay_api` bundling | **EXCLUDED from v1.** Re-evaluate after P4 async queue ships. |
| 19 | `save_contact` bundling | **EXCLUDED.** Postgres-only, no on-chain leg. |
| **20** (v0.3) | **Quote-Refresh ReviewCard scope** | **v0.3 (May 2026):** multi-write Payment Streams only. Single-write `pending_action`s set `canRegenerate: false`. **SUPERSEDED 2026-05-04 (engine ≥1.16.0, SPEC 15 v0.7 follow-up):** confirm-tier single-write actions whose composition consumed a same-turn regeneratable read (e.g. a $50 swap_execute that referenced a prior `swap_quote`) now also carry `canRegenerate: true` + `regenerateInput.toolUseIds`. PermissionCard renders the same `↻ Refresh quote` button on the single-write branch as on the bundle branch; `regenerateBundle()` rebuild branches on `action.steps?.length`. Closes the gap surfaced during SPEC 15 v0.7 smoke testing where a confirm-tier 6 USDC swap had no recovery affordance once the quote went stale. Content-review variant (Audric Store music/art Accept/Regenerate/Cancel) is still deferred to SPEC 9 — same UI vocabulary, different engine wiring (re-run content-generation tool, not re-run reads + rebuild action). |
| **21** (v0.3.1) | **Regenerate endpoint contract** | **`POST /api/engine/regenerate`** with `{ sessionId, attemptId }`. Engine re-fires the read tools listed in `regenerateInput.toolUseIds` (no LLM call), rebuilds the bundle, returns `{ success, newPendingAction, timelineEvents[] }` **synchronously in the response body** (NOT via SSE — the original chat stream has already closed). Host renders `timelineEvents[]` as a "↻ Regenerated · Ns" group above the new card, then swaps the PermissionCard payload. Original `attemptId`'s `TurnMetrics.pendingActionOutcome = 'regenerated'`; new `attemptId` is its own row. **v0.3.1 dropped the `preserveSeed: boolean` field** — SPEC 9 will design the right shape (`seed?: string` + `regenerationMode?: enum`) when content-review lands. |
| **22** (v0.3) | **Quote TTL source of truth** | **`packages/engine/src/tool-ttls.ts` `TOOL_TTL_MS`** — canonical map. Cetus swap_quote: 30s; rates_info: 90s; balance_check: 120s; portfolio_analysis: 120s. Bundle inherits the **shortest** member TTL. Host calls `bundleShortestTtl(toolUseIds, toolNamesById)` to decide when the regenerate button auto-pulses. Engine itself doesn't enforce the TTL (Sui dry-run is the actual correctness gate); it's a UX hint. |
| **23** (v0.3) | **PermissionCard slot ownership** | **SPEC 8 v0.4 owns the empty `regenerate` prop slot** on the PermissionCard renderer (`audric/apps/web/components/engine/PermissionCard.tsx`). **SPEC 7 v0.3 owns when to fill it** (gated by `action.canRegenerate`) + the endpoint round-trip + the engine bundle re-composition logic. Clean separation. |
| **24** (v0.4) | **Canonical write primitive** | **`composeTx(steps)` in `@t2000/sdk`** is the single canonical entry-point for every Audric Enoki-sponsored write. Single-write (N=1) and multi-write (N>1) bundles go through the same code path. Dispatches to a typed `WRITE_APPENDER_REGISTRY: Record<WriteToolName, AppenderFn>` map populated by Layer 1's appenders. This is the write-side equivalent of `getPortfolio()` (read-side) — drift becomes impossible by construction. |
| **25** (v0.4) | **Auto-derived `allowedAddresses`** | `composeTx` returns `derivedAllowedAddresses` computed from the assembled PTB's top-level `transferObjects` calls. Hand-maintained arrays (today's pattern in both `transactions/prepare` and `services/prepare`) are forbidden going forward. Eliminates the PR-H1 + PR-H4 bug class permanently. |
| **26** (v0.4) | **Thin-dispatcher refactor of `transactions/prepare`** | Today's ~600-line route → ~80-line dispatcher. Inline send/fee/Cetus/Volo PTB-building moves into Layer 1 appenders. Single-write OR multi-write = one code path. Backward-compat shim accepts today's `{ type, params }` shape AND the new `{ steps }` shape during the transition window (1 release; deprecated next release). |
| **27** (v0.4) | **`services/prepare` migration** | The on-chain leg of MPP `pay_api` payments routes through `composeTx({ steps: [{ toolName: 'send_transfer', input: { to: gatewayRecipient, amount, asset: currency } }] })`. Service-specific business logic (gateway 402 challenge, deliver-first upstream, USDC balance pre-check, daily/monthly spending limits, `servicePurchase` audit trail, `services/complete` MPP credential round-trip) STAYS in the route handler. Route shrinks from ~389 lines to ~150. |
| **28** (v0.4) | **`/api/debug-swap` deletion** | Diagnostic route is obsoleted by `composeTx`. Delete the route + the test file. Future swap debugging happens via `pnpm exec node -e 'import("@t2000/sdk").then(({composeTx}) => composeTx({...}))'` style one-liners. |
| **29** (v0.4) | **PayButton intentional bypass** | PayButton stays on dapp-kit `useSignAndExecuteTransaction` (any-wallet payer, no Enoki, no zkLogin). Documented as `// CANONICAL-BYPASS: PayButton uses dapp-kit (any-wallet payer signer); intentional product separation` and explicitly carved out in the ESLint rule. The Audric-payer-on-someone-else's-link routing gap → **SPEC 11**. |
| **30** (v0.4) | **`pay_api` non-bundleable rationale (sharpened)** | True structural reason: recipient/amount/currency aren't known at LLM intent time — they come from the gateway's 402 challenge response (standard MPP) or deliver-first upstream call. PTB cannot be composed at `composeTx` time without a network round-trip the engine has no knowledge of. The on-chain leg of `pay_api` IS canonical (via `composeTx` from `services/prepare`) — it's *bundling* that's structurally impossible, not canonicalization. The "synchronous HTTPS call after payment" reason (true but secondary) remains documented. |

---

## Risks

- **LLM doesn't reliably emit parallel `tool_use` blocks for compound requests.** Mitigation: prompt block + tool description hint (Layer 4). **Eval (P2.6):** run the 4 canonical use cases through both Haiku and Sonnet at low/medium effort and measure bundle-emission rate. If <80%, escalate to explicit `bundle_actions` (open question 1).
- **PTB dry-run failure modes are different per protocol.** A bundle with a NAVI op fails dry-run differently than one with a Cetus op (different error shapes from underlying Move modules). The PermissionCard error UI needs to surface "step N failed in simulation: {reason}" rather than a generic "transaction will fail" message. Cost: ~1 day of error-shape mapping; folded into Layer 3 effort.
- **Coin-reference chaining bugs (Use case 2).** If `addSendToTx` consumes the coin returned by `addWithdrawToTx.produces`, the SDK build layer needs typed handoff. Use typed `TransactionObjectArgument` references, validated at bundle-assembly time. Untyped chaining will break in surprising ways. **P2.1 prototype validates this before locking the SDK API.**
- **Pyth-fee + sponsorship coupling cascade (S.38).** Bundles that mix sponsored NAVI ops with non-NAVI ops still inherit the `tx.gas`-can't-be-an-argument restriction at the whole-tx level. Test: assemble a `swap (Cetus) → save (NAVI)` bundle under sponsorship; verify `skipPythUpdate: true` is applied on the NAVI step. Cetus aggregator's existing Pyth-DEX exclusion path handles its own side; no double-fix needed.
- **Users may distrust the multi-step card.** "Why am I signing 3 things in one click?" — the card UX needs to feel safer, not less safe, than today's per-action confirmation. Atomicity language ("ALL SUCCEED OR ALL REVERT") is the right framing. Test in a usability pass before GA.
- **Recipe bundling silently changes behaviour for existing users.** The current `swap_and_save` recipe produces 2 confirms today; after Layer 4 it produces 1. This is the desired behaviour but warrants a release note and the optional "one at a time" prompt escape hatch for users who explicitly want stepwise.
- **(v0.4) Layer 0 surfaces 3 latent issues in `services/prepare` that get fixed for free during the migration** (G5 — risk language refined post May 1 audit of the actual route file). Reviewers of the migration PR should explicitly verify: **(a) Real bug:** `Math.round` on raw amount conversion (current `services/prepare/route.ts` lines 193, 318) violates `financial-amounts.mdc` and can produce amounts > on-chain balance; the canonical Layer 1 send-appender uses `Math.floor`. Both deliver-first AND standard-MPP paths affected. **(b) Code duplication (not over-fetch):** the `merge/split/transfer` pattern is duplicated within the file — `handleDeliverFirst` (lines 195–204) and `handleStandardMpp` (lines 320–341) implement the same ~30-LOC pattern twice with subtle differences. They're mutually exclusive at request time (no double-fetch within a single flow — deliver-first reuses coins from its balance check via line 199's "Reuse coins from balance check" comment). The actual cross-route duplication is between `services/prepare` and `transactions/prepare` — both build the same coin-merge/split/transfer pattern with hand-rolled logic. Layer 0 collapses both forms via the canonical send-appender. **(c) Hand-maintained invariant (not currently broken):** `allowedAddresses` divergence — `services/prepare` passes `[recipient]` only; `transactions/prepare` passes `[treasury, sender, recipient]`. Currently correct because services don't have fee transfers and don't return coins to sender, but it's a hand-maintained invariant that future-self could break (same bug class as PR-H1/H4). Auto-derivation from PTB shape makes it correct by construction. None of (a)/(b)/(c) are SPEC 7 work — they're already in production today; the migration just incidentally fixes them. Worth a `before/after` table in the PR description for reviewer trust.
- **(v0.4) Layer 0 backward-compat shim must not silently accept malformed inputs.** During the transition window, `transactions/prepare` accepts both today's `{ type, params }` shape AND the new `{ steps }` shape. The shim MUST validate that `params` (legacy) translates to a single valid `WriteStep` before calling `composeTx` — silently accepting a malformed legacy payload would manifest as a confusing `composeTx` error one layer down. Mitigation: add a Zod schema that validates legacy payloads against the appender's input contract; reject with a clear "this shape is deprecated; use { steps: [...] }" error if invalid.
- **(v0.4) ESLint rule `audric/canonical-write` may produce false positives in tests.** Test fixtures often build a `Transaction` directly to assert against. Mitigation: scope the lint rule to `apps/web/app/api/transactions/`, `apps/web/app/api/services/`, `apps/web/components/`, and `apps/web/lib/` — explicitly exclude `__tests__/` and `*.test.ts`/`.spec.ts` files. If a non-test surface needs to bypass, the `// CANONICAL-BYPASS:` comment escape hatch is the documented path.

---

## What this spec depends on

- **Spec 1 (Harness Correctness)** ✅ shipped (engine 0.41.0–0.46.x) — gives us `useEngine.executeToolAction` as the single executor entry point + `attemptId` + modifiable fields.
- **Spec 2 (Latency + intelligence)** ✅ shipped (engine 0.47.0–1.0.x) — `attemptId` per-yield resolution is in production. No further blockers.
- **Spec 3 (On-chain verification)** — NOT a blocker. P2 (this spec) ships before P3. Spec 3 will enhance verification to handle bundle decomposition (one tx digest, N expected balance deltas) in its own PR after P2 lands.
- **USDsui-to-NAVI enablement (P1)** ✅ shipped (sdk 0.51.0/0.51.1 on 2026-04-27/28). USDsui in `OPERATION_ASSETS.save` and `.borrow`. Use case 1 unblocked end-to-end.
- **PR-B1 / S.34 (Bootstrap + Gas Station removal)** ✅ shipped. Sponsorship now lives at the audric host layer (Enoki via `/api/transactions/prepare`), not the SDK. Bundle composer slots into the same prepare-route pattern.
- **S.38 (Pyth GasCoin sponsorship hotfix)** ✅ shipped (sdk 1.0.1). `skipPythUpdate` option exists on `buildBorrowTx`/`buildWithdrawTx`/`buildRepayTx`/`addWithdrawToTx`/`addRepayToTx`. Bundle composer reuses it.
- **SPEC 8 (Interactive Agent Harness) v0.4** — **ships BEFORE SPEC 7 v0.3** per 2026-04-30 founder direction (v0.4 visual primitives + `regenerate` button slot land 2026-05-01). SPEC 7's multi-step PermissionCard renders inside SPEC 8's `ReasoningTimeline`. SPEC 8 v0.4 ships the empty `regenerate` prop slot on the renderer (Closure C) — SPEC 7 v0.3 fills it with the Quote-Refresh logic. SPEC 8 is NOT a hard prerequisite for SPEC 7 design (SPEC 7 was already specced standalone), but SPEC 7 ships SECOND so users see one coherent harness shift, not two.
- **PR-B3 closeout (wallet decommissioning cleanup), PR-B4 (Mercuryo Audric CTA, ~0.5d), PR-B5 (Cetus swap fee fix, ~0.5-1d)** — all slot BEFORE SPEC 8 → SPEC 7. PR-B5 in particular fixes real revenue loss before more swap volume accrues.

---

## Suggested next steps

1. **Founder review of v0.4 spec** — confirm Layer 0 scope (composeTx + thin-dispatcher refactor + services/prepare migration + debug-swap deletion + ESLint rule + new audric-canonical-write.mdc rule), confirm PayButton SPEC 11 deferral, confirm `pay_api` exclusion rationale sharpening. (~30 min, async.)
2. **P2.1 Prototype Use case 2** (withdraw-then-send) **via mainnet dry-run** — single hand-built PTB chaining `addWithdrawToTx.produces` into `addSendToTx`, validated via `client.dryRunTransactionBlock` on mainnet. Goal: prove the typed coin-reference handoff works before locking the SDK API. **No testnet** (founder direction 2026-05-01) — mainnet dry-run is a strict superset (real NAVI pool config, real USDsui liquidity, no gas spent, no faucet faff). Same pattern as the SuiNS smoke test (S.52 — see `scripts/smoke-suins-leaf.ts`) — re-use that harness shape. (~0.5 day, was 1d on testnet.)
3. **P2.2 SDK build/execute split** (Layer 1, ~2 days, was 3d). 4 standalone builders + 4 appenders + 1 promotion. Ship as a sub-version of `@t2000/sdk 1.0.x` (no engine change yet — every existing call still works because the high-level methods stay).
4. **P2.2b Layer 0 — `composeTx` primitive + appender registry** (Layer 0, ~1 day, **NEW in v0.4**). New `packages/sdk/src/composeTx.ts` + `WRITE_APPENDER_REGISTRY` + `deriveAllowedAddressesFromPtb` helper + 11-case migration test (one per write tool) + `composeTx-allowed-addresses.test.ts` regression suite. Ships in same `@t2000/sdk` minor as Layer 1.
5. **P2.2c Audric host migrations** (Layer 0 audric-side, ~2.25 days, **NEW in v0.4**). (a) Refactor `app/api/transactions/prepare/route.ts` from ~600-line fat route → ~80-line thin-dispatcher calling `composeTx` (~1d). (b) Migrate `app/api/services/prepare/route.ts` to use `composeTx` for the on-chain leg; verify deliver-first + standard-MPP parity (~1d). (c) Delete `app/api/debug-swap/` route + tests (~0.25d). All three behind a `NEXT_PUBLIC_CANONICAL_WRITE_ENABLED` flag during ramp; flip on after parity tests green for 48h on staging.
6. **P2.2d Tooling — ESLint rule + new rule file** (Layer 0, ~0.5 day, **NEW in v0.4**). (a) Write `audric/.eslintrc.canonical-write.js` rule (mirror of `canonical-portfolio` rule shape). (b) Write `audric/.cursor/rules/audric-canonical-write.mdc` rule file. (c) Update `apps/web/lib/engine/spec-consistency.ts` to assert no parallel write paths.
7. **P2.3 Engine bundling protocol** (Layer 2, ~4 days, **was 3d in v0.3 — v0.3.1 +1d for permission-gate refactor + composeBundleFromToolResults from scratch — see Layer 2 v0.3.1 section**). Ship as `@t2000/engine 1.1.0`. **v0.3 added:** `quoteAge`/`canRegenerate`/`regenerateInput` fields on `PendingAction` + `tool-ttls.ts` + bundle composition tracks upstream read toolUseIds. **v0.3.1 added:** permission-gate loop refactor (collect ALL writes, not break-on-first), mixed-tier policy (auto-tier writes execute as today; only confirm-tier writes get bundled), recipe loader validation that `bundle: true` recipes contain only confirm-tier writes.
8. **P2.4 Audric Payment Stream PermissionCard + composer** (Layer 3, ~2.5 days, was 2d). **v0.4 simplification:** composer becomes trivial (one `composeTx` call) because Layer 0 ships the canonical primitive. The 2.5d budget stays — saved time goes into PermissionCard polish + edge-case handling.
9. **P2.4b Audric Quote-Refresh ReviewCard wiring** (Layer 3 v0.3.1, ~1.25 day) — `POST /api/engine/regenerate` endpoint (synchronous response with `timelineEvents[]`) + engine `regenerateBundle` + host `handleRegenerate` + `formatQuoteAge` helper + timeline-event rendering ("↻ Regenerated · Ns" group) + Storybook stories for the regenerate slot. SPEC 8 v0.4 already shipped the renderer slot.
10. **P2.5 System prompt + tool description + recipe bundling syntax** (Layer 4, ~1 day, was 0.5d). **v0.3.1 acceptance gate added:** loader unit-test parses both old + new recipe syntax (G11).
11. **P2.5b Audric pre-bundle planning surface** (Layer 5, ~0.5 day — simplified in v0.2.1 since SPEC 8's `ReasoningTimeline` already provides the infrastructure). Push `CONTACT · "<name>"` + `PLAN STREAM` `TimelineBlock`s from the chat hook.
12. **P2.6 Eval pass on the 4 canonical use cases** (~1 day) — measure bundle-emission rate, time-to-first-card, signature count. Run on Haiku and Sonnet at low/medium effort. Target ≥80% bundle emission. **v0.3 added:** Quote-Refresh acceptance gate. **v0.4 added:** Layer 0 acceptance gates (see "Layer 0 acceptance gates" section above) — contract test, migration test, services/prepare parity test, auto-derived `allowedAddresses` regression, ESLint enforcement, spec-consistency runner.
13. **P2.7 Production rollout behind a feature flag** (`NEXT_PUBLIC_PAYMENT_STREAM_ENABLED`) for the first ~100 users — flip on once bundle-emission rate ≥80% and zero PTB-construction errors observed for 48h. **v0.4 added:** Layer 0 ramp uses a separate `NEXT_PUBLIC_CANONICAL_WRITE_ENABLED` flag; can ship Layer 0 BEFORE Layer 2 if desired (Layer 0 stands alone and benefits even single-write users by eliminating the PR-H1/H4 `allowedAddresses` bug class permanently).
14. **P2.8 Release** `@t2000/sdk 1.1.0` + `@t2000/engine 1.1.0` (and matched MCP + CLI bumps via the release workflow). **v0.4:** SDK 1.1.0 ships Layer 0 + Layer 1 together (one breaking-change-window for the SDK API surface).

**Total wall time:** **~15.5 days** end-to-end, single developer (was ~12.75d in v0.3.2; v0.4 +3.25d for Layer 0 minus 0.5d from no-testnet P2.1 — composeTx primitive 1d, audric host migrations 2.25d, ESLint + rule 0.5d, P2.1 mainnet dry-run prototype 0.5d (was 1d on testnet), with `pay_api` rationale sharpening at 0d). ~11.5 days of code, ~3 days of design + eval + rollout, ~1 day of documentation. SPEC 8 v0.4 still shipped the empty renderer slot at no cost to SPEC 7's budget. The Layer 0 work is largely independent of Layer 2/3/4/5 and CAN ship first as `@t2000/sdk 1.1.0-rc.1` to derisk the canonical-write architecture before layering bundling on top.

---

## Remaining work (v0.5 closeout — 2026-05-04)

> **All Layers (0/1/2/3/3b/4/5) shipped to production.** Bundle emission, multi-step PermissionCard, Quote-Refresh, fast-path bypass, chained-coin handoff, single-source composer — all live. Verified end-to-end via SPEC 13/14/15 smoke tests on real mainnet bundles (most recently `swap 10 USDC for SUI then save 10 USDC` succeeding with `↻ Regenerated · 505ms` indicator, single `txDigest`).

What's left:

| # | Item | Owner | Estimate | Reference |
|---|---|---|---|---|
| 1 | **P2.6 — structured eval pass.** Build the 4-canonical-use-case eval harness (Save 50% / Swap-and-save / Withdraw-then-send / Rebalance), run on Haiku + Sonnet at low/medium effort, measure bundle-emission rate against ≥80% target. Capture as `loadtest/eval/spec7-baseline-2026-MM-DD/` with screenshots, SSE event logs, TurnMetrics rows, cost/latency. The smoke tests done during SPEC 13/14/15 ship cycles validate the path end-to-end; this is the structured corpus run that formally closes P2.6. | Next sprint | ~1d | spec § "Suggested next steps" P2.6 |
| 2 | **Tracker cleanup — `NEXT_PUBLIC_PAYMENT_STREAM_ENABLED` flag.** P2.7's "ship behind a flag for first ~100 users" plan is moot — fast-path is currently live in production for everyone (no flag gate). Update the build tracker P2.7 row to "shipped without flag, no rollback path, atomic semantics + dry-run gate the safety net." | Tracker sweep | ~5 min | `audric-build-tracker.md` P2 SPEC 7 row |
| 3 | **`pay_api` bundling — DEFERRED** (out of scope by design). Gateway 402 challenge response means recipient/amount aren't known at compose time, so PTB can't be composed at compose time. Revisit after P4 async queue ships. | P4-blocked | — | spec § "What this spec does NOT touch" + v0.4 sharpened rationale |
| 4 | **PayButton + Audric-payer routing → SPEC 11.** When an Audric user (zkLogin) visits another Audric user's `/pay/[slug]`, today's PayButton uses dapp-kit which won't work cleanly for them; SPEC 11 designs the dual-path routing fix (Audric session → chat-agent send via `composeTx` + Enoki; non-Audric → unchanged dapp-kit). | SPEC 11 | ~3-5d when speccing | spec § "On SPEC 11" + Master Priorities P2.9 |

**The phase table above (P2.0 → P2.8) is preserved as the build-time record.** All effort estimates and acceptance gates from the original spec stand — they're how we got here. The Layer-by-Layer architecture sketch (lines 162–893) is also unchanged; treat it as canonical implementation reference for SPEC 11 + any future bundle-shape extensions.

---

## On SPEC 8 (Interactive Agent Harness) — already exists

> **2026-04-30 / 2026-05-01 update:** SPEC 8 was drafted as v0.1 → v0.4 between 2026-04-29 and 2026-05-01 and **ships BEFORE SPEC 7 v0.3** per the v0.2.1 sequencing flip. See `spec/SPEC_8_INTERACTIVE_HARNESS.md` for the canonical version. SPEC 7's v0.3 Quote-Refresh ReviewCard depends on SPEC 8 v0.4's empty `regenerate` button slot on the PermissionCard renderer (SPEC 8 v0.4 Closure C). The original v0.2.1 placeholder text suggesting "broader Cursor-style harness work could become SPEC 8" is now obsolete — that work is what SPEC 8 IS. Future broader work (multi-agent handoff, persistent cross-turn todos, inline data browsers, etc.) is now slated for SPEC 9 — see the SPEC 9 section in `spec/SPEC_8_INTERACTIVE_HARNESS.md`.

## On SPEC 9 (deferred — don't write it yet)

When SPEC 7 v0.3 (Payment Stream + Quote-Refresh ReviewCard) and SPEC 8 v0.4 (Interactive Harness + v2 visual primitives) both ship, SPEC 9 becomes discussable. Candidate scope (from the v2-demo audit + carry-over from earlier specs):

- **Content-review ReviewCard** — Audric Store music / art / ebook generation, Accept / Regenerate / Cancel button vocabulary. Same UI primitive as SPEC 7 v0.3 Quote-Refresh ReviewCard, but the "regenerate" side-effect is "re-run the content-generation tool with a fresh seed (or a user-locked seed)" rather than "re-fire upstream reads + rebuild bundle." Different engine wiring; same UI primitive. **v0.3.1 dropped the `regenerateInput.preserveSeed: boolean` forward-compat field** — a boolean conflates two distinct content-review needs (default = "different seed for variation"; rare = "lock to user-chosen seed"). SPEC 9 will design the right shape (`seed?: string` + `regenerationMode?: 'fresh' | 'variant' | 'lockedSeed'`) when content-review lands.
- **`pending_input` inline forms** — when the agent needs structured input mid-turn (recipient address, shipping details), render a typed form inline in the timeline instead of asking via free-text. v2 demos `05-moms-birthday` + `07-xmas-gifts`.
- **Multi-agent handoff** — sub-agent that handles "research what's the best DeFi rate right now" while the main agent continues.
- **Persistent cross-turn todo surface** — long-running goal tracking (carry-over from SPEC 8's deferred list).
- **Inline data/file browsers** — portfolio position drill-in as a context panel.
- **Streaming follow-up dispatch** — agent proactively starts the next likely tool call while user reads the previous result.

SPEC 7 v0.3 explicitly does NOT scope any of these. **Don't pre-emptively spec SPEC 9** — wait until SPEC 7 v0.3 ships and we see what the next pain point actually is.

> **Status as of v0.4:** SPEC 9 v0.1 was drafted 2026-04-30 and is in the queue (post SPEC 8 v0.5.1, post SPEC 7 v0.3.2). The candidate scope above is partially superseded — see `spec/SPEC_9_AUDRIC_STORE_HARNESS.md` for the actual current SPEC 9 contents.

## On SPEC 11 (Pay UX — placeholder, NEW in v0.4)

SPEC 7 v0.4's Layer 0 explicitly defers the **PayButton + Audric-payer-on-someone-else's-link** gap to SPEC 11. The gap:

> When an Audric user (signed in via zkLogin) visits another Audric user's `/pay/[slug]` page, today they see PayButton — which uses `@mysten/payment-kit` + dapp-kit `useSignAndExecuteTransaction` to sign with an external wallet extension. But the Audric user's identity is the zkLogin ephemeral key, not a wallet extension key. So the PayButton flow doesn't actually work for them — they'd need to either (a) sign in to a separate wallet extension with the same address, or (b) abandon the link and ask the recipient for their address to send via Audric chat.

Candidate SPEC 11 scope:

- **Detect Audric session on `/pay/[slug]`** — if the visitor is signed in via zkLogin, route them through the Audric chat-agent send flow (canonical `composeTx` + Enoki sponsored). Pre-fill the `send_transfer` PermissionCard with the link's amount + recipient. One-tap confirm.
- **Non-Audric payer path stays unchanged** — PayButton + dapp-kit + `@mysten/payment-kit`. Documented as the canonical pay-from-any-wallet path.
- **Edge case: Audric user is also the recipient** — show "this is your own link" message, don't render either path.
- **Receipt parity** — both paths produce the same `Payment` row shape on the recipient side; the indexer doesn't care which signer minted the on-chain tx.

Effort estimate: ~3-5 days (signature detection + routing + UI for the dual-path landing page + tests).

**Don't write SPEC 11 until SPEC 7 v0.4 Layer 0 ships** — Layer 0's `composeTx` primitive is the substrate the Audric-payer path uses, and reviewing SPEC 11 before that primitive exists would be premature.

---

## Appendix: why not "just teach the LLM to call them sequentially"?

We could keep today's two-`pending_action` flow and rely on the LLM to handle the chain *cognitively* — call swap, wait for result, then call save. This is what happens today when users say "swap then save" and the LLM does the right thing. Three reasons we want PTBs anyway:

1. **Atomicity matters more than UX latency.** The "swap succeeds, save fails" failure mode is real on Sui (USDsui pool full, oracle staleness, gas exhaustion mid-chain). Sequential chaining can't fix this. Only a single PTB can.
2. **N confirmations is bad UX.** Every confirmation is a chance for the user to abandon. Sequential bundles stack that risk multiplicatively.
3. **Sui's PTB model is the protocol's biggest UX advantage over EVM.** Audric should be the showcase product for it. "Sign once, do five things" is a marketing line that makes sense to non-crypto users — and "Payment Stream" is the brand that makes it land.
