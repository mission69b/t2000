# BENEFITS_SPEC v0.7d — Memory + HITL Native + Engine Library Decouple

> **Status:** **ARCHIVED 2026-05-23 — ALL PHASES CLOSED.** Phases 1-3 + 6 + 8 SHIPPED via Block A (S.221, 2026-05-21) + S.253 (apps/web archive 2026-05-22) + S.224 (ECS retire). Phase 4 (D-16 classifier migration) SKIPPED per S.219 audit (named files are pure regex/heuristic — no LLM). Phase 5 (SPEC 40 HITL native) SKIPPED per S.220 audit (already in prod via v0.7c Phase 3 D-8). **Phase 7 D-14 first-session memory-reset banner formally RETIRED 2026-05-23 ~16:10 AEST (founder time-box)** — cold-start window had been live since Block A ship 2026-05-21 (~2.5 days) with zero user complaints; ½d engineering cost not justified for the active user count. Operational close gates remain: v0.7c 7d soak (2026-05-28) + MemWal stability checkpoint (2026-05-29). See `audric-build-tracker.md` S.276 for the D-14 retirement closeout.
>
> **Status (historical, pre-archive):** **v1.0 LOCKED — PHASE 0 IN PROGRESS.** Promoted from v0.1 DRAFT 2026-05-21 ~08:10 AEST after founder lock on the 7 outstanding D-questions (D-1, D-4, D-5, D-8, D-10, D-13, D-14). Phase 0 Day 0a (baseline capture) ran 2026-05-21 ~08:00 AEST. Phase 1 trigger remains gated on the two operational gates below (MemWal stability + v0.7c 7d soak); Phase 0 work proceeds in parallel.
>
> **⚡ MAJOR SCOPE COMPRESSION (2026-05-22, S.253 + S.254 — out-of-band v0.7e Phase 5 ship):** While v0.7d was in Phase 0, the user moved DNS to `audric-web-v2` and archived the entire `apps/web` directory in S.253. This collapsed the bulk of E-1's deletion targets (every `apps/web/...` row in the inventory table is now DONE-BY-DELETION). v0.7d's remaining E-1 scope shrinks from ~9 surfaces to ~2 web-v2-side surfaces (`apps/web-v2/lib/audric/moat-context.ts buildMemoryContext()` + `apps/web-v2/lib/audric/system-prompt.ts` legacy memory plumbing). The engine library tendril 6 decouple (`@audric/engine-helpers` workspace package per D-8) was also resolved by deletion — the chat-only `lib/engine/*` files were archived with `apps/web`, no extraction needed. The remaining v0.7d workstreams are: (a) MemWalMemoryStore adapter ship (still gated on 2026-05-29 stability checkpoint); (b) Settings Memory UI per D-4; (c) HITL native migration / SPEC 40 batch 3 (the big one); (d) classifier migration (D-7 by-fragility order); (e) first-session memory-reset banner per D-14. Re-baseline at Phase 0 Day 0b ahead of Phase 1 kickoff.
>
> **Founder locks (all 7 outstanding D-questions, captured 2026-05-21 ~08:05 AEST):**
> - **D-1** → Plan A (MemWal stability primary) with Plan B fallback evaluation (Mem0 / Letta / Supermemory / Hindsight) executing BEFORE Phase 1 if Plan A fails by hard deadline 2026-06-26.
> - **D-4** → Recall-oriented Settings Memory UI (top-K most-recalled + "explain why" + "forget this"). NOT per-row CRUD.
> - **D-5** → Atomic batch swap for SPEC 40 HITL native migration with 24h `USE_NATIVE_HITL_WIRE=1` feature-flag soak before flipping production.
> - **D-8** → New workspace package `@audric/engine-helpers` for tendril 6 extraction location.
> - **D-10** → Both automatic retention (MemWal-managed) AND user-controlled `MemoryStore.forget(recordId)`.
> - **D-13** → `toolMetadata` extension bag carries audric's 15 extension fields on AI SDK native `tool-approval-request` (mirrors v0.7c D-8).
> - **D-14** → **NO BACKFILL** (founder counter to SPEC v0.1 recommendation). Cold start; agent learns from new chats only. Mitigation: one-time UI banner on first post-v0.7d session ("we just rebuilt audric's memory layer — over the next ~30 days, your agent will learn about you from new conversations"). Trade-off accepted: ≤30d short-term memory loss for ALL users (matching the legacy SQL retention cliff), unbounded long-term memory growth post-Phase-7. Removes Phase 6 `/api/internal/memwal-backfill` cron entirely + removes acceptance gate G10. SPEC E-1 / E-2 / U-1 measurements updated accordingly below.
>
> **Promotion criterion (the trigger).** v0.7d Phase 1 kickoff is gated on TWO conditions firing together:
> 1. **MemWal stability checkpoint passes by 2026-05-29** (per `CLAUDE.md` L141; the engine `MemoryStore` interface is already shipped in v2.7.0+ and audric's `MemWalMemoryStore` adapter is the unblocking deliverable). IF Plan A fails by hard deadline 2026-06-26 (per `WHY_v07a.md` cost table), Plan B fallback evaluation matrix (Mem0 / Letta / Supermemory / Hindsight) executes BEFORE v0.7d Phase 1 kickoff — see D-1.
> 2. **v0.7c Phase 6 7d production soak passes** with zero P0/P1 regressions (per `RUNBOOK_v07c_phase_6_cutover.md` Section 7.5 + Section 5.5 sign-off). 7d soak started effectively 2026-05-21 ~07:30 AEST after S.213a verified the multi-turn break was fixed; soak window closes 2026-05-28.
>
> Both gates close → founder triggers v0.7d Phase 1. Either gate fails → v0.7d Phase 1 is paused; Phase 0 work + the MemWal-independent workstreams (HITL native, classifier migration, library decouple) can still proceed under any backend choice.
>
> **Why this SPEC exists.** v0.7c shipped the chat-shell fork (audric/web → web-v2 on AI SDK v6 + chatbot template). That work was a paradigm shift — the audric route is now AI-SDK-native end-to-end. v0.7d is the natural execution-of-locked-decisions slice that closes four loose ends v0.7c deliberately deferred:
> 1. **Memory wiring** — the engine's `MemoryStore` interface (v2.7.0+) needs a production-grade store; D-11 of v0.7c deferred MemWal adoption explicitly. The post-2026-05-29 stability checkpoint is the natural unlock.
> 2. **Legacy memory pipeline + Settings Memory UI** — apps/web's daily Claude inference cron + `UserMemory` CRUD + `MemorySection.tsx` are doubled-up infra (the engine no longer reads from them after the cutover). Delete them.
> 3. **HITL native migration** — v0.7c deferred SPEC 40 batch 3 (replace bespoke `pending_action` event with AI SDK v6's native `tool-approval-request`). 12 writes are already on a unified harness; the migration is mechanical at this point.
> 4. **Engine library decouple (tendril 6) + D-16 classifier migration** — both deferred from v0.7c Phase 4.5 and Phase 6 because they would have widened the cutover blast radius. v0.7d ships them on a stable post-cutover baseline.
>
> **This is execution, not paradigm shift.** No new framework. No new strategy. The bet is identical to v0.7a + v0.7c (AI SDK + MCP + MemWal stays the locked stack). v0.7d cashes the deferred wins.
>
> **Author intent (mirrors v0.7c).** The contract between this SPEC and the founder. List every benefit we expect to realize, every cost we accept, the phase plan that gets us there, the realization checks per phase. Drift between SPEC and reality is the bug; the SPEC is the source of truth.
>
> **Cross-references:**
> - `BENEFITS_SPEC_v07c.md` (immediate predecessor — chat-shell fork; defines D-11 memory deferral, D-16 classifier deferral, the Phase 6 cutover routing, and the audit-first slice discipline that compressed Phase 5/5.5 by 80-99%)
> - `BENEFITS_SPEC_v07a.md` (engine drain; defines `MemoryStore` interface + Phase 7 commitment + Plan B fallback evaluation matrix)
> - `WHY_v07a.md` (the strategic case — three reasons the AI SDK + MCP + MemWal bet is sound; still binding)
> - `SPEC_PHASE_7_DRAFT.md` (engine-side memory prototype design — D-1 through D-5 already locked in v0.7a)
> - `.cursor/rules/memory-injection-architecture.mdc` (the binding 5-layer prompt assembly contract — `system → financial_context → memory → skill → user`)
> - `.cursor/rules/agent-harness-spec.mdc` (Spec 1 + Spec 2 — the `attemptId` / `approvalId` mirror, `EngineConfig.onAutoExecuted`, BlockVision intelligence layer)
> - `RUNBOOK_v07c_phase_6_cutover.md` §11.1 (the v0.7d skeleton — workstreams + LoC delta + effort estimate)
> - `audric-build-tracker.md` S.173 (D-14 lock — intent-dispatcher stays regex), S.176 (Phase 4 close — TurnMetrics outcome-update slice), S.184 (Phase 5.5 close — LMM activation + log-redact port; reframes D-17 architectural home)
> - `MystenLabs/MemWal/tree/dev/apps/chatbot` (Mysten's reference integration — cross-reference at every memory architectural fork)
>
> **Total committed effort:** **~8-12 agent days** (~3-4 calendar weeks including founder ops + 7d soak). Phase 0 starts immediately on trigger; Phase 1 starts after G1 (Phase 0 acceptance) closes.

---

## How to use this SPEC

1. Each benefit gets a **claim** (the bet) + a **measurement plan** (how we'll know).
2. **No fuzzy wins.** Either we can measure it or we don't claim it.
3. **Two layers, mirroring v0.7a + v0.7c:**
    - **E / O / S / U / F categories** — the benefit ledger (what we expect to win).
    - **D-questions + acceptance gates** — the contract (what we promise to verify before declaring done).
4. **Re-read at start, mid, end** of every working session.
5. **One column per benefit** in the realization table: Phase 0 baseline → Phase 7 (cutover) actual.

---

## Benefit categories

| Letter | What it means | Examples |
|---|---|---|
| **E** | Engineering wins — LoC, complexity, file count, deletion of duplicated machinery | Delete legacy memory pipeline (~-1,500), delete engine `buildMemoryContext()` (~-500), engine library tendril 6 decouple (~-10,000 chat-only) |
| **O** | Operational wins — deploy posture, ops cost, infra surface | Daily Claude inference cron eliminated → ECS task removed (~$50-200/mo savings); HITL routing collapses from 2 wire formats to 1 |
| **S** | Strategic wins — alignment with broader ecosystem | Mysten MemWal partnership reinforced (production usage); AI SDK alignment at the HITL surface (track `tool-approval-request` evolution for free) |
| **U** | User-facing wins — UX, latency, capability the user feels | Memory recall ("your agent knows your patterns"); HITL latency floor; Settings Memory section becomes recall-oriented disclosure |
| **F** | Future-proofing — what becomes possible after, not just easier | Per-step memory refresh hook (already wired in engine `prepareStep`); cross-product memory namespace primitives; AI SDK HITL feature surface |

**Cost accounting** sits separately in `What we give up` — see §7.

---

## E — Engineering benefits

### E-1 — Legacy memory pipeline + engine library tendril 6 deletion (the headline)

**Claim:** apps/web's daily Claude inference cron, `UserMemory` CRUD routes, settings `MemorySection.tsx`, the user-memory retention cron, AND the engine's `buildMemoryContext()` + companion legacy injection paths all delete. Plus the chat-only bits of `lib/engine/{strip-llm-directives,init-engine-stores,harness-metrics}.ts` decouple (tendril 6 from `RUNBOOK_v07c_phase_6_cutover.md` Section 1.1).

**Inventory (Phase 0 Day 0a actuals — captured 2026-05-21 ~08:00 AEST):**

| Surface | SPEC v0.1 estimate | **Phase 0 actual** | Disposition | Net |
|---|---|---|---|---|
| `apps/web/app/api/internal/memory-extraction/route.ts` (daily Claude inference cron — triggered EXTERNALLY at 03:15 UTC per `cron-job-architecture.mdc`, NOT in `vercel.json`) | ~400 | **246** | DELETE | **−246** |
| `apps/web/app/api/cron/user-memory-retention/route.ts` (in `vercel.json` at 03:45 UTC) | ~80 | **46** | DELETE | **−46** |
| `apps/web/app/api/user/memories/route.ts` (GET active memories) | ~120 | **99** | DELETE | **−99** |
| `apps/web/app/api/user/memories/[id]/route.ts` (DELETE single memory) | ~80 | **56** | DELETE | **−56** |
| `apps/web/components/settings/MemorySection.tsx` (legacy CRUD UI) | ~250 | **233** | DELETE | **−233** |
| `apps/web/prisma/schema.prisma` `UserMemory` model (L252-271) + index (migration to drop) | ~30 + migration | **~20** + migration | DELETE | **−20** |
| `apps/web/lib/engine/engine-context.ts` `buildMemoryContext()` + `formatMemoryAge()` + injection sites in `buildFullDynamicContext{,Separated}` (host-side, NOT engine-side) | ~500 (location was wrong in SPEC v0.1) | **~50 LoC** in a 906 LoC file | DELETE (memory funcs only; rest of file stays) | **−50** |
| `apps/web-v2/lib/audric/moat-context.ts` `buildMemoryContext()` + memory injection plumbing | (not in SPEC v0.1) | **~80 LoC** in a 169 LoC file | DELETE (memory funcs only) | **−80** |
| `apps/web-v2/lib/audric/system-prompt.ts` legacy memory block plumbing | (not in SPEC v0.1) | **~20 LoC** in a 608 LoC file | DELETE | **−20** |
| **Subtotal — legacy memory pipeline (actuals)** | **~1,460 (estimate)** | **~850** | | **−850** |
| `lib/engine/*` non-test LoC (chat-only bits subset) | ~10,000 | **10,295** (non-test) / **20,996** (total) | DELETE chat-only; EXTRACT shared neutral bits to `@audric/engine-helpers` per D-8 | **−9,500 to −10,000** |
| **Subtotal — engine library tendril 6** | **~10,295** | **same** | | **−9,500 to −10,000** |
| Web-v2 `MemWalMemoryStore` adapter (NEW) | +200 | TBD (Phase 1) | ADD | **+200** |
| Web-v2 settings `/settings/memory` rebuild (recall-oriented per D-4 lock) | +400 | TBD (Phase 3) | ADD | **+400** |
| Web-v2 first-session memory-reset banner (D-14 mitigation; founder lock 2026-05-21) | (added 2026-05-21) | TBD (Phase 7) | ADD | **+30** |
| ~~`/api/internal/memwal-backfill` cron + idempotency layer~~ | (SPEC v0.1: +200-400 LoC) | **CANCELLED** by D-14 founder lock | — | **±0** |
| **Subtotal — additions** | **+600 (v0.1)** | **+630** | | **+630** |
| **Estimated total LoC delta (v0.7d v1.0)** | **−10,300 to −11,500 (v0.1)** | **−9,720 to −10,220** | | |

**Engine memory layer (NEW pattern, STAYS — already shipped in v2.7.0+):**
| File | LoC | Role |
|---|---|---|
| `packages/engine/src/memory/store.ts` | 148 | `MemoryStore` interface + `MemoryRecord` type |
| `packages/engine/src/memory/in-memory-store.ts` | 112 | `InMemoryMemoryStore` default impl (CLI / MCP / tests) |
| `packages/engine/src/memory/build-memory-block.ts` | 47 | Builds `<memory_recall>` block from records |
| `packages/engine/src/memory/extract-user-message.ts` | 61 | Extracts latest user msg for recall query |
| **Subtotal** | **368** | The contract; v0.7d ships `MemWalMemoryStore` adapter against it |

**Phase 0 findings to note (corrections to SPEC v0.1):**
1. Legacy pipeline LoC was overstated by ~250 (route + section sizes are leaner than the v0.1 draft estimated).
2. `buildMemoryContext()` does NOT live in `@t2000/engine`; it lives host-side in `apps/web/lib/engine/engine-context.ts` AND in `apps/web-v2/lib/audric/moat-context.ts` (web-v2's own copy). The engine memory layer (368 LoC across 4 files) is a separate, newer surface that STAYS as the MemoryStore contract.
3. `memory-extraction` cron is triggered by an EXTERNAL scheduler (per `cron-job-architecture.mdc`: t2000 hits POST /api/internal/memory-extraction at 03:15 UTC daily). Phase 6 deletion must coordinate with whoever owns that scheduler — `vercel.json` only carries the `user-memory-retention` cleanup cron.

The v0.7c Phase 6 cutover was a routing change (not a deletion event) precisely because tendril 6 + the legacy memory pipeline still had non-chat consumers (crons, `/api/internal/*`, dashboard surfaces). v0.7d is the natural slot where those tendrils unwind on a stable post-cutover baseline.

**Measurement plan:**
1. Phase 0 baseline: capture exact LoC for each row in this table (per `wc -l` + `rg`).
2. Phase 6 acceptance: re-run the same `wc -l` against the deleted files (should not exist), verify delta.
3. Combined v0.7c + v0.7d LoC reduction: target ≥ -34,000 LoC (per `RUNBOOK_v07c_phase_6_cutover.md` §1.2 + §11.1 cumulative). Verify at Phase 7 acceptance against the v0.7c Phase 0 audric/web baseline of ~83k LoC source.

**Realization (filled in at Phase 7):** `TBD — Phase 7 cutover acceptance`

### E-2 — One memory mental model (engine-owned 5-layer assembly)

**Claim:** today the system prompt is assembled in two places: the engine's static `systemPromptString()` for legacy hosts, and audric's hand-rolled `buildMemoryContext()` + `buildProfileContext()` + `buildAdviceContext()` + `buildFinancialContextBlock()` concatenation. Post-v0.7d, the engine's `prepareStep` 5-layer assembler (`system → financial_context → memory → skill → user` per `.cursor/rules/memory-injection-architecture.mdc`) owns the entire prompt. Audric passes `financialContextBlock` + `memoryStore` + (optionally) `skillRecipeBlock` to `EngineConfig` and the engine handles ordering, per-turn caching, and degradation.

This collapses 4 hand-rolled concat helpers into ONE engine-side primitive. Every new context-block addition becomes a config field instead of a route-side concat patch.

**Measurement plan:**
- Count `<financial_context>` / `<memory_recall>` injection sites across the audric route before/after — should drop from N (today) to 0 (post-v0.7d; engine owns assembly).
- Verify the binding 5-layer invariant via `packages/engine/src/memory/five-layer-ordering.test.ts` (already present; assertion stays green through audric integration).
- Founder-vibe-check at Phase 7: "is reasoning about prompt assembly easier than at Phase 0?"

### E-3 — HITL on AI SDK primitives (deletes bespoke `pending_action` event)

**Claim:** v0.7c shipped the HITL flow on the engine's bespoke `pending_action` event (15 fields including `attemptId`, `modifiableFields`, `cetusRoute`, `steps[]`, guard injections, etc.) translated client-side via `experimental_providerMetadata` per D-8 lock. SPEC 40 batch 3 (deferred from v0.7c) migrates this to AI SDK v6's native `tool-approval-request` + `tool-approval-response` primitive.

The engine retains its 15-field `PendingAction` extension data — but as `toolMetadata` field-bag, NOT as a parallel custom event. The wire shape becomes:

```typescript
// Before (v0.7c):
type EngineEvent = ... | { type: 'pending_action'; action: PendingAction };
// Client custom-handles `pending_action` via experimental_providerMetadata extraction.

// After (v0.7d):
// Engine emits AI SDK's native tool-approval-request part with toolMetadata carrying audric's extension fields.
// useChat's addToolApprovalResponse({ id, approved, reason }) IS the resume primitive.
```

Net LoC delete on the engine side: the custom `pending_action` emission sites (`v2/engine.ts` single-write, `regenerate.ts` quote refresh, `compose-bundle.ts` per-step + top-level) collapse into the AI SDK native pattern. Estimate: ~300-500 LoC engine + ~200-400 LoC audric route translation layer.

**Measurement plan:**
- Pre/post grep for `pending_action` event emissions in `@t2000/engine`; target 0 post-v0.7d.
- Pre/post grep for `extractPendingAction(providerMetadata)` / equivalent in audric route; target 0 post-v0.7d.
- All 12 writes round-trip through `addToolApprovalResponse` (canary per D-5 atomic batch).
- TurnMetrics row shape stays identical (the `attemptId === approvalId` mirror per `agent-harness-spec.mdc` §Item 3a guarantees this).

### E-4 — Structured-output classifier migration drains JSON-parse cluster

**Claim:** v0.7c locked D-16 (migrate 8+ classifiers to `generateObject({ schema: zodSchema })`) for Phase 4.5 but DEFERRED execution (per v0.7c Status header — "D-16 deferred from Phase 4.5"). v0.7d ships it on the now-stable post-cutover baseline. Each classifier deletes ~20-40 LoC of stream-then-parse-then-regex-fallback boilerplate; structural validation moves from runtime regex to dev-time Zod schema mismatch.

**Inventory (per D-16 lock + S.173 follow-up):**

| Classifier | LoC today | Migration shape | Net |
|---|---|---|---|
| `classify-effort.ts` | ~120 | `generateObject({ schema: EffortSchema })` → ~40 | **−80** |
| `classify-gateway-response.ts` | ~150 | `generateObject({ schema: GatewayResponseSchema })` → ~50 | **−100** |
| `complexity-classifier.ts` | ~80 | `generateObject({ schema: ComplexitySchema })` → ~30 | **−50** |
| Chain-fact 5-sub-classifier | ~250 | 5× `generateObject` → ~100 (one per sub-classifier) | **−150** |
| Pattern-detection classifiers | ~100 | 2× `generateObject` → ~40 | **−60** |
| Recipe-matcher heuristics | ~60 | `generateObject` → ~20 OR stay regex (D-7 likely outcome) | **−40 to 0** |
| Intent-dispatcher heuristics (per S.173 lock — KEEP regex; `generateObject` is COMPOUND-query secondary) | — | NO regex deletion; secondary classifier ~80 LoC ADDED for unmatched-pattern fallback | **+80** |
| **Estimated total LoC delta (classifier surface)** | **~760** | | **−380 to −470** |

Note: the S.173 reconciliation made the LoC math more honest than the v0.7c v0.2 estimate of "≥150 LoC net delete". The intent-dispatcher regex stays (it's deterministic, 0% miss rate on matched patterns, ~50µs/turn vs ~300-500ms for `generateObject`). The net target is conservatively ≥150 LoC delete (per v0.7c G7.5) but realistic range is −380 to −470.

**Measurement plan:**
- Pre/post `wc -l` against each migrated classifier file; sum delta.
- Grep for `JSON.parse(text` + regex-fallback patterns; target 0 post-Phase 4.
- Each migration deletes ad-hoc fallback path; verify each classifier still produces the same outputs against Phase 0 baseline fixture set.

### E-5 — `lib/engine/*` decouple unblocks v0.7e

**Claim:** v0.7c Phase 6 left `lib/engine/{strip-llm-directives, init-engine-stores, harness-metrics}.ts` in `apps/web` because non-chat consumers (crons, `/api/internal/*`, instrumentation) still imported them. The post-soak deletion sweep stalled at this boundary. v0.7d extracts the shared neutral bits to a new location (probably `apps/web/lib/shared/engine-helpers/*` or `@audric/engine-helpers` workspace pkg — design lock in D-8) and deletes the chat-only bits.

This unblocks v0.7e's Tier C copy-port sweep (per `RUNBOOK_v07c_phase_6_cutover.md` §11.2) because apps/web's `lib/engine/*` is the single largest tendril blocking the apps/web → web-v2 final migration.

**Measurement plan:**
- Phase 0: inventory all importers of `lib/engine/{strip-llm-directives,init-engine-stores,harness-metrics}.ts` across apps/web + web-v2 (`rg "from .*lib/engine/(strip-llm-directives|init-engine-stores|harness-metrics)"`).
- Phase 6 acceptance: same grep; target = only non-chat surfaces import from the new extracted neutral location, chat-only files are deleted.

---

## O — Operational benefits

### O-1 — Daily Claude inference cron eliminated

**Claim:** apps/web's `app/api/internal/memory-extraction/route.ts` runs daily via Vercel cron, calls Claude to extract memories from chat transcripts (~30-60 LLM calls per active user per day), and writes `UserMemory` rows. Post-v0.7d, MemWal's vector ingestion (called fire-and-forget from the engine's `remember()` hook per `memory-injection-architecture.mdc`) replaces this entirely.

**Measurement plan:**
- Vercel dashboard: confirm `memory-extraction` cron disappears from the scheduled jobs list.
- Anthropic API spend report: month-over-month delta on `audric.cron.memory-extraction` functionId after Phase 6 deletion. Target: net reduction matching the cron's prior daily spend (per `WHY_v07a.md` §1 estimate of $50-200/mo).
- MemWal usage dashboard: verify `remember()` write throughput matches the prior cron's extraction rate (per active user).

### O-2 — MemWal scales horizontally (no SQL retention cliff)

**Claim:** apps/web's `UserMemory` table grew unboundedly until the retention cron (`/api/cron/user-memory-retention`) expired rows older than 30 days. Post-v0.7d, MemWal's vector store retrieves top-K by similarity (not recency); retention is structurally a non-issue. A user's "year-old recurring pattern" stays retrievable.

**Measurement plan:**
- Per `WHY_v07a.md` §1 + `SPEC_PHASE_7_DRAFT.md` §1 F-11 + F-12: MemWal retrieval p95 sub-linear; <200ms at 100k records. Audric `MemWalMemoryStore` smoke at Phase 1 acceptance verifies this against a synthetic 100k-record fixture.
- Founder-vibe-check at Phase 7: "ask the agent to recall something from a chat 60+ days ago — does it remember?"

### O-3 — HITL routing surface collapses

**Claim:** v0.7c shipped HITL on 2 parallel wire formats — AI SDK native `tool-approval-request` (for engine-natively-approved tools, never used today) AND audric's bespoke `pending_action` event translated via `experimental_providerMetadata`. Both flows reach `useChat`'s `addToolApprovalResponse` / `addToolOutput` on the client side, but the engine emits + the route translates two shapes.

Post-v0.7d, ONE shape (AI SDK native) round-trips end-to-end. The bespoke event shape extinct. Bug class F-5 (envelope mismatch) + F-11 (hardcoded asset) regressions become structurally even more impossible than v0.7c made them.

**Measurement plan:**
- 30-day post-Phase-7 F-5 / F-11 class regression count. Target: 0 (the v0.7c G13 baseline; v0.7d extends the structural impossibility).
- Grep audit for `pending_action` event emission sites; target 0 post-v0.7d.

### O-4 — AI SDK upstream HITL feature compatibility

**Claim:** today, when AI SDK ships a new HITL feature (e.g., approval response streaming, multi-step approval flows, approval-with-counter-proposal) we'd have to port to our bespoke `pending_action` wire. Post-v0.7d, we bump `@ai-sdk/*` and get the feature for free — same pattern as v0.7a's E-3 / F-1 for model features, extended to the HITL surface.

**Measurement plan:** track AI SDK release notes for 30d post-Phase-7; count HITL features adopted with zero code change.

---

## S — Strategic benefits

### S-1 — Mysten partnership reinforced at the memory layer

**Claim:** MemWal is Mysten's flagship product. Production audric usage (not just engine integration tests) is the partnership signal that matters. Per `WHY_v07a.md` §4 + §10, this aligns audric to Mysten's reference stack across every layer — engine (v0.7a), app (v0.7c), and now memory (v0.7d).

**Measurement plan:** founder + Mysten direct conversation at Phase 7 close. Cross-reference at every architectural fork against `MystenLabs/MemWal/apps/chatbot` per the v0.7c S-2 + this SPEC's S-1.

### S-2 — AI SDK alignment at the HITL surface

**Claim:** v0.7c locked the audric route onto AI SDK primitives (D-15 `Agent` interface adoption, D-18 `experimental_telemetry`). v0.7d extends that alignment to the HITL surface — SPEC 40 batch 3 makes `tool-approval-request` / `tool-approval-response` the canonical wire instead of `pending_action`.

The post-v0.7d audric route is fully AI-SDK-native: orchestration (Agent), telemetry (experimental_telemetry), HITL (needsApproval), memory (MemoryStore via prepareStep), structured outputs (generateObject). No bespoke wire formats remaining.

**Measurement plan:** grep audit at Phase 7 — every wire format the engine emits MUST be either (a) AI SDK native chunk type OR (b) `toolMetadata` extension on an AI SDK chunk. Zero bespoke `EngineEvent`-only emissions. (The legacy `EngineEvent` union stays exported from `@t2000/engine` for back-compat with CLI / MCP / non-audric hosts; the audric route just doesn't consume it.)

### S-3 — Repo path to v0.7e (Tier C copy-port + apps/web final archive)

**Claim:** per `RUNBOOK_v07c_phase_6_cutover.md` §11.4, v0.7d is phase 2 of 3 in the locked apps/web archive trajectory. v0.7d unblocks v0.7e by:
1. Closing the engine library tendril 6 (E-5) — the single largest dep blocking apps/web's lib decouple.
2. Closing the memory pipeline (E-1) — removes 4 cron + 2 route surfaces from the v0.7e copy-port set.
3. Closing HITL native (E-3) — removes the wire-format ambiguity that would have made the v0.7e marketing-landing copy-port more fragile.

**Measurement plan:** at v0.7d close, verify the v0.7e SPEC kickoff dependency map (per `RUNBOOK_v07c_phase_6_cutover.md` §11.2) shows zero residual chat-shell or memory-pipeline deps blocking the Tier C copy-port.

---

## U — User-facing benefits

### U-1 — Memory recall (the "your agent knows your patterns" feel)

**Claim:** today users explicitly tell audric what they want every turn ("save 50 USDC", "swap SUI to USDC"). Post-v0.7d with MemWal, the agent recalls patterns ("you usually save the residual after a swap" → suggests it), preferences ("you've always borrowed against USDsui, not USDC" → defaults to that), and recurring intents ("you set up a weekly $20 save 3 weeks ago" → reminds you).

The 5-layer prompt's layer 3 (`<memory_recall>`) gives the LLM up to top-K relevant records per turn (per `memory-injection-architecture.mdc`). With MemWal's cosine-distance retrieval (vs the in-memory mock's bag-of-words overlap), the relevance is dramatically better.

**Measurement plan:**
- Phase 6 acceptance: founder-driven 5-turn smoke against a real chat history with ≥30 days of activity. Verify the agent surfaces recurring patterns naturally (not via explicit "what do I usually do" prompts).
- 30d post-Phase-7: track user-volunteered "wow, it remembered" anecdotes in support tickets / founder DMs.

### U-2 — Settings Memory section becomes recall-oriented disclosure

**Claim:** apps/web's legacy `MemorySection.tsx` is per-row CRUD — "delete this fact about you" with tag tones (FACT / GOAL / PATTERN / PREFERENCE). That UI was built against a SQL-backed model where each row was independently meaningful.

MemWal's recall model isn't list-oriented; it's similarity-oriented. The right UI per D-4 recommendation is: "your agent currently knows X about you" (top-K most-frequently-recalled records) + "explain why it remembered this" (which chat turn ingested it) + "forget this" (single-row delete). NOT per-row CRUD across the whole store.

**Measurement plan:**
- Phase 4 acceptance: web-v2 `/settings/memory` renders against the live `MemWalMemoryStore` adapter; founder smoke verifies the recall-oriented UI matches the D-4 lock.
- 30d post-Phase-7: monitor settings page session duration vs the legacy CRUD page; the recall-oriented page should keep users engaged shorter (it's disclosure, not curation work).

### U-3 — HITL latency floor

**Claim:** v0.7c's U-2 measurement plan (revised at Day 0d per `BENEFITS_SPEC_v07c.md` §"Phase 0 baseline values") added `TurnMetrics.resumeRoundTripMs` for hop-2 latency (client tap → first new event back). v0.7d's HITL native migration (E-3) removes the bespoke `pending_action → experimental_providerMetadata → custom translation` path; AI SDK's native `tool-approval-request` round-trip is a same-channel write with no translation layer.

Expected savings: ~50-100ms median on every write tool's confirm round-trip. Smaller than v0.7c's ~150-300ms claimed savings (the v0.7c migration was the bigger architectural shift; v0.7d is incremental polish on top).

**Measurement plan:** `TurnMetrics.resumeRoundTripMs` p50 / p95 comparison Phase 0 (v0.7c post-cutover baseline, n≥200) vs Phase 7 (v0.7d post-cutover, n≥200). Target: ≥50ms median reduction.

---

## F — Future-proofing benefits

### F-1 — Per-step memory refresh hook (already wired)

**Claim:** the engine's `prepareStep` callback (per `SPEC_PHASE_7_DRAFT.md` §4b) is already structurally extensible to per-step memory refresh — today recall fires once at step 0 + cached, but a topic-shift detector could re-fire mid-turn at any step. v0.7d ships the production wire; v0.7e+ extensions (topic-shift detection, agent-on-demand recall, multi-namespace recall) cost ~50-100 LoC each.

**Measurement plan:** at any future per-step recall feature SPEC, verify the extension lands in ≤100 LoC against the v2.7.0 `prepareStep` hook + zero engine architectural changes. Folds into the v0.7e+ SPEC that motivates it.

### F-2 — Cross-product memory namespace primitives

**Claim:** the `MemoryStore.recall(query, { namespace })` interface (per `memory-injection-architecture.mdc` + `SPEC_PHASE_7_DRAFT.md` §3) accepts an optional namespace. Today audric uses one namespace per user. Future cross-product memory sharing (e.g., Audric Store creator preferences visible to Audric Finance) becomes a namespace design decision, not an interface change.

**Measurement plan:** at any future cross-product memory feature SPEC, verify it ships as a namespace config + zero engine changes. Folds into the Audric Store SPEC.

### F-3 — AI SDK HITL feature surface

**Claim:** same as O-4 but the "future" framing — features we don't even know about today, ship in AI SDK v6.x / v7, drop in for free post-v0.7d's native migration (e.g., approval response streaming, multi-step approval flows, approval-with-counter-proposal).

**Measurement plan:** track AI SDK release notes through the 365d post-Phase-7 window; count HITL features adopted with zero code change. Folds into the v0.7c S-2 ongoing measurement plan (AI SDK upstream feature adoption rate).

### F-4 — Generative UI / RSC / artifacts substrate (deferred, but unblocked)

**Claim:** per v0.7c F-2 + F-3 + S-4: the chatbot template's artifacts panel + RSC integration becomes a 1-2 week SPEC post-v0.7d. v0.7d doesn't ship them, but the engine library decouple (E-5) + the AI SDK native HITL wire (E-3) remove the two structural blockers that would have made a v0.7e+ "ship artifacts for Audric Store creator tooling" SPEC into a 4-6 week refactor.

**Measurement plan:** when the artifacts / RSC SPEC kicks off post-v0.7d, verify the kickoff dependency map shows zero residual blockers from the v0.7d workstreams. Cost-of-shipping estimate at SPEC time should be ≤2 weeks (down from the pre-v0.7d 4-6 week estimate).

---

## What we give up (cost accounting)

| Cost | Why it's worth it |
|---|---|
| 3-4 calendar weeks of single-engineer time (~8-12 agent days + founder ops + 7d soak) | Smaller than the ongoing cost of carrying duplicated memory infra (daily Claude cron + SQL retention cliff + per-row CRUD UI) plus the tendril 6 boundary that blocks v0.7e |
| Legacy memory data (`UserMemory` rows pre-v0.7d) | One-way deletion. Mitigation: 30d pre-deletion window during the v0.7d soak where both pipelines run dual; post-deletion, recovery is via MemWal re-ingest from chat transcripts (the engine's `remember()` hook covers new turns; backfill cron covers history) |
| Bespoke `pending_action` event shape (12 writes, 15 extension fields) | Replaced by AI SDK native + `toolMetadata` extension bag. All 15 fields preserved via `toolMetadata`; the WIRE CONTRACT becomes AI SDK's. Per Spec 1 §Item 3a, `attemptId === approvalId` mirror is the forward-compat guarantee that makes this safe |
| `buildMemoryContext()` + companion legacy memory-injection paths in engine | Both deleted in v0.7d; the engine's `prepareStep` 5-layer assembler (per `memory-injection-architecture.mdc`) is the SSOT going forward. Pre-Phase-7 hosts that still use legacy `system: this.systemPromptString()` (CLI, MCP, examples) stay on the legacy path — branch on `memoryStore` presence, no breakage |
| MemWal vendor dependency in production | If MemWal stability degrades, Plan B fallback evaluation matrix executes (Mem0 / Letta / Supermemory / Hindsight per `WHY_v07a.md` cost table). The `MemoryStore` interface is engine-owned + portable; swapping the backend is a 1-day audric-side adapter swap |
| Settings Memory page redesign (legacy CRUD → recall-oriented) | One-time UX redesign cost (per D-4). Counterbalanced by the page becoming materially more useful (recall-oriented surfaces information users actually want to see; per-row CRUD across thousands of records was a maintenance UI) |
| `lib/engine/*` extraction churn (chat-only bits delete; shared bits move to neutral location) | One-time refactor pain. Counterbalanced by unblocking v0.7e's Tier C copy-port sweep + final apps/web archive |
| HITL migration acceptance window | All 12 writes must round-trip on a fresh wire format. Mitigation: per D-5 recommendation, atomic batch swap (12 writes already on unified harness in v0.7c) is safer than per-write canary (which would force the route to handle 2 wire formats in parallel during the rollout) |

**What we DON'T give up:**
- Every financial tool (37) — unchanged.
- Every guard (14) — unchanged (activated in v0.7c Phase 5.5).
- Every recipe / skill — unchanged.
- Silent intelligence stack (`<financial_context>`, `UserFinancialProfile`, `ChainMemory`, `AdviceLog`, TurnMetrics) — unchanged. (See D-3 for ChainMemory + AdviceLog interaction with MemWal — they STAY on Postgres.)
- Audric Passport surface (zkLogin + Enoki) — unchanged.
- Sponsored-tx flow — unchanged.
- All 159 v0.7c behaviors — unchanged (verify at G11 against `apps/web/__tests__/v0.7c-behavior-catalogue.md`).

---

## D-questions (formal locks)

Same pattern v0.7a + v0.7c established: each question gets a recommendation; the founder locks before Phase 1 starts.

| # | Question | Recommendation | Status |
|---|---|---|---|
| **D-1** | **MemWal stability gate — proceed even if Plan A hasn't closed by 2026-06-26?** Plan A is the post-2026-05-29 stability checkpoint per `CLAUDE.md` L141. Plan B is the fallback evaluation matrix (Mem0 / Letta / Supermemory / Hindsight per `WHY_v07a.md` cost table). | Plan A stays primary; **hard deadline 2026-06-26**. If Plan A fails by hard deadline, Plan B fallback evaluation executes BEFORE v0.7d Phase 1 kickoff (~2-3d evaluation slice + ~1d adapter swap). v0.7d's other workstreams (HITL native, classifier migration, library decouple) are MemWal-independent and could ship in parallel under any backend choice. | ✅ LOCKED 2026-05-21 (founder) |
| **D-2** | **MemWal namespace strategy** — per-user only, or also per-product (Passport / Intelligence / Finance / Pay / Store)? | **(a) per-user namespace only for v0.7d** (default per `SPEC_PHASE_7_DRAFT.md` D-1). Per-product namespacing is a future cross-product memory feature (F-2); v0.7d ships the single-namespace primitive and defers product-aware namespacing to a follow-on SPEC when product motion demands it. | ✅ LOCKED (inherited from v0.7a `SPEC_PHASE_7_DRAFT.md` D-1) |
| **D-3** | **Memory write timing** — fire-and-forget post-turn, or sync mid-stream? Also: do ChainMemory + AdviceLog migrate to MemWal or stay on Postgres? | **(a) fire-and-forget post-turn** (per `memory-injection-architecture.mdc` — MemWal p50 ingest 25s; sync would wedge the stream). Bound: ChainMemory + AdviceLog STAY on Postgres for v0.7d — they're structured Prisma rows consumed by typed Server Components (`/settings/memory`, the AdviceLog scan in `audric-build-tracker.md`'s monitoring queries) AND they're cheap to query (indexed lookups, not vector retrieval). Migrating them to MemWal would force every Server Component query through a vector-store round-trip for a use case (recent N rows by recency) that SQL serves trivially. **Future consideration:** if ChainMemory grows past ~100k rows per user, revisit. | ✅ LOCKED |
| **D-4** | **Settings Memory UI shape** — list-oriented CRUD (legacy) or recall-oriented? | **(b) recall-oriented** — "your agent currently knows X about you" (top-K most-recalled records) + "explain why it remembered Y" (link to source chat turn) + "forget this" (single-row delete). NOT per-row CRUD across the whole store. Matches MemWal's similarity model + matches the "recall is the product surface, not the storage list" framing the v0.7c §1.1 Memory deferral signpost already pre-committed to. | ✅ LOCKED 2026-05-21 (founder) |
| **D-5** | **SPEC 40 cutover — gradual per-write canary (D-13 pattern from v0.7c Phase 3) or atomic batch swap?** | **(b) atomic batch swap** — 12 writes are already on a unified harness in v0.7c (per S.176 Phase 4 close). The wire format change is invisible to the renderer layer (the engine + audric route + `useChat` form a typed path; per-write divergence does NOT exist in the post-v0.7c shape). Per-write canary would force the route to handle 2 wire formats in parallel during the rollout — strictly more complexity than atomic swap. Mitigation: feature-flag the route entry path (`USE_NATIVE_HITL_WIRE=1`) for a 24h soak before flipping production. | ✅ LOCKED 2026-05-21 (founder) |
| **D-6** | **`attemptId` deprecation timing** — remove from `pending_action` emission or keep the mirror? | **(c) keep `attemptId` mirror** per Spec 1 §Item 3a forward-compat alias guarantee. The deprecation surface is engine-internal (the `pending_action` event shape itself); the FIELD `attemptId` continues to flow through `toolMetadata` so legacy hosts (CLI, MCP, integration tests) reading either `approvalId` or `attemptId` keep working. Engine v3.0.0 (post-v0.7d) deprecates the `pending_action` EVENT TYPE; the FIELD names stay until at least v4.0.0. | ✅ LOCKED via `agent-harness-spec.mdc` §Item 3a |
| **D-7** | **Classifier migration order** — by-fragility (highest miss rate first) or by-coupling (lightest deps first)? | **(a) by-fragility** — start with `classify-gateway-response.ts` (the highest impact + most user-facing classifier; mis-classifications surface as wrong agent narration for MPP errors). Then `complexity-classifier.ts` (thinking budget routing). Then `classify-effort.ts` (similar). Then chain-fact 5-sub-classifier batch. Then pattern detectors. Recipe-matcher heuristics + intent-dispatcher's 8 known-pattern rules STAY regex per S.173 lock (the regex is deterministic + sub-100µs + 0% miss rate on matched patterns; `generateObject` would add 300-500ms round-trip pre-LLM, doubling per-turn latency for zero accuracy gain on the matched set). `generateObject` IS introduced as a SECONDARY classifier (~+80 LoC ADDED) for COMPOUND / UNMATCHED queries the 8 regex rules don't catch — that's the full Vercel-native posture: primitive where it earns its cost; regex where it's structurally superior. | ✅ LOCKED 2026-05-20 AM (by-fragility migration order + regex-vs-generateObject boundary; see `apps/web-v2/lib/audric/dispatch-intents.ts` header "ALTERNATIVES RULED OUT" section for the full reconciliation) |
| **D-8** | **Legacy memory pipeline deletion gate** — gate on MemWal stability OR independent timeline? Also: where do shared `lib/engine/*` bits extract to? | **(a) gate on MemWal stability + 7d soak window** — deleting the legacy pipeline before MemWal is production-stable + the new pipeline has 7d in production would be a one-way data deletion with no recovery surface. Sequencing: Phase 1 ships MemWal adapter; Phases 2-3 verify production performance + soak window; Phases 5-6 delete legacy pipeline. **Library extraction location:** new workspace package `@audric/engine-helpers` (matches the audric-monorepo convention of `@audric/*` for app-shared utilities). Single import path; standard monorepo dep wiring. Beats the "shared bits inside apps/web/lib/shared" alternative because the latter pulls apps/web back into the import graph of web-v2 (which the v0.7c cutover decoupled). | ✅ LOCKED 2026-05-21 (founder) — Plan A: new workspace pkg `@audric/engine-helpers` |
| **D-9** | **Memory recall API surface** — top-K only, or also full-text search? | **(a) top-K only** — matches MemWal's native API + matches the engine's `MemoryStore.recall(query, { topK })` interface (per `SPEC_PHASE_7_DRAFT.md` §3). Full-text search would be a backend-specific capability MemWal doesn't expose; building it on top means re-implementing what vector retrieval already does (similarity > keyword match for the audric use case). If a future feature demands full-text (e.g., "find every chat where I mentioned 'SOL'"), it gets shipped as a separate read tool, NOT via the memory store. | ✅ RECOMMENDED |
| **D-10** | **Memory deletion API** — user-controlled `forget(recordId)` vs automatic retention? | **(c) both** — automatic retention via MemWal's native TTL/policy (zero engine code; backend-managed) + user-controlled forget via `MemoryStore.forget(recordId)` extension on the engine interface (new addition to the v2.7.0 `MemoryStore` shape; ~30 LoC engine + ~20 LoC audric adapter). User-forget is required to make the Settings Memory UI's "forget this" button (per D-4) functional. | ✅ LOCKED 2026-05-21 (founder) |
| **D-11** | **Chain memory + AdviceLog interaction with MemWal** — migrate to MemWal or stay on Postgres? | **(b) stay on Postgres** — see D-3 bound. ChainMemory + AdviceLog are structured Prisma rows consumed by typed queries; vector retrieval is the wrong primitive for them. MemWal handles the chat-derived memory layer; Postgres handles the structured on-chain / advice-log layer. The two co-exist as different layers of the silent intelligence stack. | ✅ LOCKED (subsumed by D-3) |
| **D-12** | **Settings Memory UI surface in web-v2** — full rebuild vs delegate to MemWal's own dashboard? | **(a) full rebuild in web-v2** per D-4 recall-oriented framing. Delegating to MemWal's own dashboard is the right call if MemWal ships a turnkey hosted UI — but as of 2026-05-20 MemWal is engine-integration-focused, not dashboard-focused. A simple recall-oriented page in web-v2 (~400 LoC per `RUNBOOK_v07c_phase_6_cutover.md` §11.1) is cheaper than the integration cost of embedding an external dashboard inside web-v2's auth + layout chrome. | ✅ RECOMMENDED |
| **D-13** | **HITL `tool-approval-request` wire shape — `toolMetadata` extension fields or sidecar event?** AI SDK's native `tool-approval-request` carries `approval.id` + the tool input, but not our 15-field extension data. | **(a) `toolMetadata` extension** — same pattern v0.7c D-8 locked for `experimental_providerMetadata` (one cleaner shape). Engine `pending_action` emission becomes engine-internal; audric route translates to `toolMetadata: { audric: extensionFields }` on the AI SDK chunk. Same renderer reads the same flat shape it reads today; only the wire serialization changes. | ✅ LOCKED 2026-05-21 (founder) |
| **D-14** | **Backfill strategy — replay chat history into MemWal on first user session post-Phase-7?** Users have 30-365 days of chat history; the legacy `UserMemory` rows captured some of it, but switching to MemWal means starting cold. | **FOUNDER COUNTER to SPEC v0.1 recommendation. (a) NO BACKFILL — cold start; agent learns from new chats only.** Rationale (founder, 2026-05-21): the opportunistic-backfill cron would re-call Claude to synthesize turn summaries — that's exactly the legacy `memory-extraction` pattern we're tearing out under E-1. Rebuilding it one more time to delete it again is structural noise. Plus: legacy `UserMemory` already had a 30d retention cliff, so users could only lose ≤30d of pre-v0.7d memory anyway. **Mitigation:** one-time UI banner on first post-v0.7d session ("We rebuilt audric's memory layer — over the next ~30 days, your agent will learn about you from new conversations. Your money, wallet, and positions are unaffected."). ~30 LoC. Sets expectation; replaces "wait where'd my memory go?" surprise with informed consent. Removes `/api/internal/memwal-backfill` cron + acceptance gate G10 + Phase 6 cron deployment. | ✅ LOCKED 2026-05-21 (founder) — (a) NO BACKFILL + UI banner |

---

## Acceptance gates (per phase, per benefit)

Same pattern v0.7a + v0.7c established: each gate is a binary pass/fail check tied to a specific benefit claim. Every gate must close before Phase 6 cutover signoff.

| Gate | What | Tied to | Verifier |
|---|---|---|---|
| **G1** — Phase 0 baseline captured | LoC inventory of legacy memory pipeline + tendril 6 surfaces (per E-1); current memory pipeline metrics (Claude cron daily invocation count, mean LLM calls per active user, monthly Anthropic spend on `audric.cron.memory-extraction` functionId); current TurnMetrics shape with `attemptId`-only + `resumeRoundTripMs` distribution (n≥200 from v0.7c soak window); 14 D-questions locked | E-1, U-3, O-1, D-1 through D-14 | Agent + founder spot-check |
| **G2** — `MemWalMemoryStore` adapter shipped + engine integration verified | Audric's `MemWalMemoryStore` implements `MemoryStore` interface (per `SPEC_PHASE_7_DRAFT.md` §3) + passes the engine's `five-layer-ordering.test.ts` against a live MemWal instance + per-turn caching verified (5 steps → 1 `recall()` call); MemWal recall p95 ≤ 700ms single + ≤ 50ms session-cached (per `memory-injection-architecture.mdc` performance contract) | O-2, F-1, D-1, D-2, D-9 | Agent smoke + founder spot-check against production MemWal |
| **G3** — First memory recall round-trip live in production | Web-v2 chat route with `EngineConfig.memoryStore` set; one production turn produces a `<memory_recall>` block in the system prompt (verified via Vercel function logs); user-perceived turn doesn't regress vs v0.7c baseline | U-1, F-1, D-3 | Agent smoke + Vercel log inspection |
| **G4** — Settings Memory UI rebuild ships against MemWal data model | Web-v2 `/settings/memory` renders the recall-oriented UI per D-4 lock; founder smoke verifies "your agent knows" + "explain why" + "forget this" all work end-to-end against the live `MemWalMemoryStore`; the v0.7c deferral signpost card is replaced | U-2, D-4, D-12 | Agent smoke + founder UX review |
| **G5** — Legacy memory pipeline deletion (4 surfaces removed: cron, 2 routes, settings section, `buildMemoryContext()`) | After 7d soak (per D-8 gate): `/api/internal/memory-extraction/route.ts` + `/api/cron/user-memory-retention/route.ts` + `/api/user/memories/*` + `MemorySection.tsx` + Prisma `UserMemory` model (migration) + engine `buildMemoryContext()` ALL deleted; pre/post grep verifies zero residue; engine tests pass at the post-cleanup baseline | E-1, O-1 | grep + LoC measurement |
| **G6** — HITL native migration ships; `pending_action` event deprecated | All 12 writes round-trip through AI SDK's native `tool-approval-request` + `addToolApprovalResponse`; `toolMetadata` extension bag carries audric's 15 extension fields (per D-13 lock); engine `pending_action` emission sites removed; `attemptId === approvalId` mirror invariant verified per Spec 1 §Item 3a | E-3, O-3, O-4, S-2, D-5 | Agent smoke + grep audit |
| **G7** — `approvalId` becomes canonical; `attemptId` mirror documented as forward-compat alias | Engine type docs flag `attemptId` as forward-compat alias for `approvalId`; engine internals read `approvalId` (the mirror guarantee makes both safe); legacy host paths (CLI / MCP / integration tests reading `attemptId`) continue to work unchanged | D-6, agent-harness-spec.mdc §Item 3a | grep audit + test suite |
| **G8** — Classifier migration shipped per D-16 + D-7 | Targeted classifiers migrated to `generateObject({ schema })`; per E-4 inventory, ≥150 LoC net delete (target range -380 to -470); ad-hoc JSON-parse + regex-fallback code paths deleted in the migrated set; Zod schemas committed as the contract | E-4, D-7 | grep for `JSON.parse(text` + LoC measurement |
| **G9** — Engine library decouple (tendril 6) closes | Per D-8 extraction location lock: chat-only bits of `apps/web/lib/engine/{strip-llm-directives, init-engine-stores, harness-metrics}.ts` deleted; shared bits relocated; pre/post grep verifies non-chat consumers import from the new location only | E-5, S-3 | grep + LoC measurement |
| ~~**G10** — Backfill cron lands + first wave runs successfully~~ | **REMOVED 2026-05-21 by D-14 founder lock (no backfill).** Replaced by lighter Phase 7 acceptance: first-session memory-reset banner renders correctly for first 50 users post-Phase-7 + founder spot-check confirms the U-1 cold-start window is the expected ~30d (not a regression). | U-1, D-14 | Founder spot-check + Vercel log inspection |
| **G11** — 7d soak in production passes with zero P0/P1 | After Phase 6 cutover: 7d Vercel log review + TurnMetrics dashboard + memory recall telemetry shows zero P0/P1 regressions; founder explicit go-ahead for Phase 7 deletion sweep | All categories | Founder lock |
| **G12** — v0.7e unblocked (no chat-only deps remain in apps/web's lib) | Per `RUNBOOK_v07c_phase_6_cutover.md` §11.2 + §11.3: dependency map at v0.7e kickoff shows zero residual chat-shell, memory-pipeline, or HITL-wire-format deps blocking Tier C copy-port sweep | E-5, S-3 | grep + dependency-map audit |

---

## Phases (mirroring v0.7a + v0.7c cadence)

Each phase is gated by the acceptance gates above; phase N+1 cannot start until phase N's gates close.

### Phase 0 — Baseline capture + D-question lock (~1 day)

- **Day 0a:** Capture all G1 baselines (LoC inventory per E-1 + E-4 + E-5 tables; current memory pipeline metrics — daily Claude cron invocation count, mean LLM calls per active user, monthly Anthropic spend on the `audric.cron.memory-extraction` functionId; TurnMetrics `resumeRoundTripMs` distribution from v0.7c post-cutover soak window, n≥200; HITL wire-format inventory).
- **Day 0b:** Lock all 14 D-questions with founder. Confirm MemWal stability (D-1 trigger).

**Acceptance:** G1 closed.

### Phase 1 — `MemWalMemoryStore` impl + engine wire (~1 day)

- **Day 1a:** Audric `MemWalMemoryStore` adapter implements the `MemoryStore` interface (per `SPEC_PHASE_7_DRAFT.md` §3) against MemWal SDK v0.0.4+; smoke against engine's `five-layer-ordering.test.ts` + per-turn cache verification.
- **Day 1b:** Wire `EngineConfig.memoryStore` in audric web-v2's chat route; verify `<memory_recall>` layer appears in production system prompts via Vercel log inspection.

**Acceptance:** G2 closed.

### Phase 2 — `<memory_recall>` block live in production prompt (~½ day)

- **Day 2a:** Production deploy of Phase 1; one verified production turn produces a non-empty `<memory_recall>` block; user-perceived latency stays within v0.7c baseline (per the `memory-injection-architecture.mdc` performance contract).

**Acceptance:** G3 closed.

### Phase 3 — Settings Memory UI rebuild (~2 days)

- **Day 3a:** Build web-v2 `/settings/memory` recall-oriented page per D-4 lock. Top-K most-recalled records + "explain why" link to source chat turn + "forget this" button wired to new `MemoryStore.forget(recordId)` (per D-10 lock).
- **Day 3b:** Replace the v0.7c deferral signpost card with the new page. Founder UX review verifies the recall-oriented model lands.

**Acceptance:** G4 closed.

### Phase 4 — D-16 classifier migration (~2 days) — **❌ ROLLED INTO PHASE 6 PER S.219 (2026-05-21)**

> **AUDIT FINDING (2026-05-21, S.219): The classifier inventory in this section and in E-4 above is OUTDATED.** Pre-flight audit revealed:
>
> - `classify-effort.ts` (engine, 90 LoC) — pure regex, no LLM call. Header comment explicit: "Heuristics only." Per S.173 lock the regex is intentional.
> - `classify-gateway-response.ts` (audric, 97 LoC) — pure HTTP header check (`response.status + x-settle-verdict` header). Zero LLM.
> - `complexity-classifier.ts` — **does not exist in either repo**. Phantom SPEC reference.
> - `lib/chain-memory/classifiers.ts` (audric, 306 LoC) — pure statistical heuristics over typed Prisma records. 7 classifier functions (SPEC said 5), all math. Zero LLM, zero `JSON.parse`.
> - Pattern detectors — folded into the chain-memory classifiers above; pure math.
> - Recipe-matcher heuristics — already deleted in v0.7a Phase 6.
>
> **The ONLY two files matching the SPEC's described pattern** (raw `@anthropic-ai/sdk` + manual JSON prompt + markdown-fence strip + `JSON.parse` + manual field validation) are:
>
> - `app/api/internal/profile-inference/route.ts` (audric, 207 LoC)
> - `app/api/internal/memory-extraction/route.ts` (audric, 247 LoC)
>
> Both are slated for **Phase 6 deletion** anyway (MemWal's `recall()` + `analyze()` structurally replace them). Migrating them to `generateObject` first and then deleting them is wasted work.
>
> **FOUNDER LOCK 2026-05-21 ~11:42 AEST: Path A — Skip Phase 4 entirely.** Phase 4's LoC target (−380 to −470) is delivered in Phase 6 instead via deletion of the 2 cron routes (−454 LoC, matches SPEC target exactly).
>
> **G8 (Phase 4 acceptance) auto-closes when G10 closes** — the LoC measurement that confirms Phase 6's deletion sweep IS the measurement that would have confirmed Phase 4's migration target.
>
> **Future agents: DO NOT attempt to migrate the named classifier files.** Read `audric-build-tracker.md` S.219 before any classifier-related work. The 2 legitimate v0.7d deletion targets belong to Phase 6's scope, not Phase 4's.

~~- **Day 4a:** Migrate `classify-gateway-response.ts` + `complexity-classifier.ts` + `classify-effort.ts` per D-7 by-fragility order. Each becomes a `generateObject({ schema: zodSchema })` call with the Zod schema committed as the contract.~~
~~- **Day 4b:** Migrate chain-fact 5-sub-classifier batch + pattern detectors. Recipe-matcher + intent-dispatcher likely STAY regex (per S.173 + D-7 follow-up). Verify ≥150 LoC net delete (target -380 to -470).~~

**Acceptance:** ~~G8 closed.~~ G8 auto-closes via G10 (Phase 6 deletion measurement). See S.219.

### Phase 5 — SPEC 40 HITL native migration (~3 days) — **❌ ROLLED INTO v0.7e PER S.220 (2026-05-21)**

> **AUDIT FINDING (2026-05-21, S.220): SPEC 40 HITL native migration is structurally COMPLETE in production.** Pre-flight audit revealed:
>
> - **web-v2 production** has been on AI SDK v6 native `tool-approval-request` since **v0.7c Phase 3 / D-8** (chat-flip closed 2026-05-20). Code reference: `apps/web-v2/app/api/chat/route.ts:1877 + L2103-2113` annotated `[Phase 3 Day 3a / D-8]`.
> - **The "4 emit sites" framing is misleading.** Only **1 actual yield** exists in engine source (`v2/engine.ts:1569`). `compose-bundle.ts` returns a value (no yield). `regenerate.ts` returns a `RegenerateResult` value via host POST endpoint (no yield).
> - **`toolMetadata: { audric: extensionFields }`** is already wired in web-v2 route.ts L2094-2099. Production.
> - **`attemptId ≡ approvalId` mirror** already shipped (engine v2.6.0, Spec 1 §Item 3a per CLAUDE.md + `.cursor/rules/agent-harness-spec.mdc`).
> - **12 writes atomic batch swap** — no swap needed. All 12 writes already flow through `needsApproval` in web-v2 production.
> - **`USE_NATIVE_HITL_WIRE=1` 24h soak** — already happened in v0.7c. Production has been on native HITL for weeks.
> - **Engine v3.0.0 bump** — premature; apps/web still consumes `pending_action` (12 references in `/api/engine/chat/route.ts`). Bumping now breaks apps/web before its scheduled v0.7e archive.
>
> **Where the legacy `pending_action` flow still lives:** ENTIRELY in `apps/web` (the chat surface scheduled for v0.7e archive per `RUNBOOK_v07c_phase_6_cutover.md` L1) — `~15-20 files`, `~2000-3000 LoC`. Engine: 4 references (`v2/engine.ts:1569` yield, `streaming.ts:80` type union, `types.ts:140` event type union, `bridge/sse-format-adapter.ts:285` SSE case).
>
> **FOUNDER LOCK 2026-05-21 ~11:55 AEST: Path A — Phase 5 = no-op. Fold into v0.7e apps/web archive.**
>
> - **G6 + G7 redirect**: G6 auto-closes via v0.7e apps/web archive (when `apps/web/api/engine/{chat,resume,resume-with-input}` get deleted, the legacy `pending_action` consumer is gone). G7 (native HITL contract) is **ALREADY MET** in production via web-v2's v0.7c work. The engine v3.0.0 bump fires at v0.7e when the legacy emit gets deleted.
> - **Combined with Phase 4 fold-in (S.219)**, v0.7d remaining = Phase 6 + Phase 7 soak + Phase 8 unblock. ~2-3 days code work vs original ~10d budget.
>
> **Future agents: DO NOT attempt this migration.** It's done. Read `audric-build-tracker.md` S.220 before any HITL / pending_action / tool-approval-request work. The named SPEC scope is structurally complete; only the cleanup remains, and it belongs to v0.7e.

~~- **Day 5a:** Engine work — replace `pending_action` event emission at 4 sites (`v2/engine.ts` single-write, `regenerate.ts` quote refresh, `compose-bundle.ts` per-step + top-level) with AI SDK native `tool-approval-request`. Maintain `attemptId === approvalId` mirror per Spec 1 §Item 3a. Engine bump to v3.0.0 candidate (the wire format change is a major-API break for hosts still reading `pending_action`).~~
~~- **Day 5b:** Audric route translation layer — convert the route's `pending_action` extraction to `tool-approval-request` reading. `toolMetadata: { audric: extensionFields }` carries the 15 extension fields (per D-13 lock). The renderer layer is unchanged (consumes the flat shape).~~
~~- **Day 5c:** Atomic batch swap (per D-5 lock). Feature-flag the route entry path (`USE_NATIVE_HITL_WIRE=1`) for 24h soak before flipping production.~~

**Acceptance:** ~~G6 + G7 closed.~~ G6 + G7 auto-close at v0.7e apps/web archive (G7 already met in production). See S.220.

### Phase 6 — Engine library decouple (tendril 6) + legacy memory pipeline deletion (~2 days)

> **🚧 REVISED + IN FLIGHT per founder lock 2026-05-21 ~13:00 AEST. See [S.221 in audric-build-tracker.md](../../audric-build-tracker.md) for full revision rationale.**
>
> The SPEC's original Day 6a + Day 6b structure mis-described the actual state of the codebase. Three audit findings reshaped Phase 6:
>
> 1. **Day 6a's "extract to workspace package" premise was outdated** — web-v2 already has its own copies of every helper and does not cross-import from apps/web. The named files retire wholesale in v0.7e's apps/web archive. **Day 6a folds into v0.7e — zero pre-work needed in v0.7d.**
> 2. **`UserFinancialProfile` was missing from the SPEC's deletion list** — but web-v2 chat route reads it alongside `UserMemory`. Both tables get dropped together (founder Q2 lock: MemWal subsumes Silent Profile too).
> 3. **`UserMemory` carries chain-memory rows via `source: 'chain'` discriminator** — deleting the table breaks the chain-memory Audric Intelligence system unless we rebuild it. Founder Q1 lock: "C — move it to MemWal all together." Chain-memory rebuild on `memwal.store` deferred to Block B alongside the cron migration.
> 4. **Founder's bonus expansion (2026-05-21 ~12:45 AEST):** the entire `t2000/apps/server` indexer can be deleted (only `/api/stats` reads its output; that page becomes static marketing copy). Block C absorbs the indexer + the whole `apps/server` directory + the ECS task retirement.
>
> **Revised Phase 6 structure (3 blocks):**

- **Block A (SHIPPED 2026-05-21 / S.221, ~1h 45m):** Memory pipeline retirement. Cut web-v2 + apps/web readers of UserMemory + UserFinancialProfile; delete `profile-inference` + `memory-extraction` + `chain-memory` routes + `user/memories/*` CRUD + `user-memory-retention` cron + `lib/chain-memory/*` library + the 3 matching ECS cron jobs in `t2000/apps/server/src/cron/jobs/*`; drop the `UserMemory` + `UserFinancialProfile` Prisma models. **~−6200 LoC** (code + Prisma client regen combined).
- **Block B (next, ~4h impl + 24h soak):** Vercel cron migration + chain-memory rebuild on MemWal. Port `portfolioSnapshots` + `financialContextSnapshot` cron job logic from `t2000/apps/server/src/cron/jobs/*` to `audric/apps/web-v2/app/api/cron/*` endpoints. Wire `apps/web-v2/vercel.json` cron triggers. Rebuild chain-memory on `memwal.store` (per founder Q1 — "C, move it to MemWal all together"). Soak 24h with both ECS + Vercel running, then disable ECS cron jobs.
- **Block C (after Block B soak, ~2h impl + ops):** Indexer + `apps/server` deletion. Refactor `t2000.ai/api/stats` to static marketing copy (founder lock: option A — manual monthly numbers, no live indexer feed). Drop `ProtocolFeeLedger` + `Transaction` + `YieldSnapshot` + `IndexerCursor` + `Agent.lastSeen` Prisma fields. Delete entire `t2000/apps/server/` directory. Retire `AUDRIC_INTERNAL_KEY` env var (no longer needed once ECS↔Vercel bridge endpoints are dead). ECS task definition + ECR repo retirement (ops).

**Total estimated Phase 6 LoC reduction:** −2100 to −3200 LoC (Block A alone: ~−6200 LoC counting Prisma client regen; net code-only: ~−2200 LoC).

**Acceptance:** G5 + G9 + G10 closed. (G10 originally removed by D-14 lock but recycled here as the "legacy deletion confirmed via git diff --stat" marker for Block A+B+C combined.)

> ~~Day 6a:~~ ~~Per D-8 lock — extract shared neutral bits from~~ ~~`apps/web/lib/engine/{strip-llm-directives,init-engine-stores,harness-metrics}.ts`~~ ~~to `@audric/engine-helpers` workspace package (or the founder-locked alternative). Delete chat-only bits. Verify non-chat consumers (crons,~~ ~~`/api/internal/*`)~~ ~~import from the new location.~~ **FOLDED into v0.7e apps/web archive per S.221 audit.**
>
> ~~Day 6b:~~ ~~Delete legacy memory pipeline — `/api/internal/memory-extraction` (coordinate with t2000 external scheduler owner to stop the 03:15 UTC trigger BEFORE deletion) +~~ ~~`/api/cron/user-memory-retention` (remove from `vercel.json`) +~~ ~~`/api/user/memories/*` +~~ ~~`MemorySection.tsx` +~~ ~~Prisma `UserMemory` model migration +~~ ~~`apps/web/lib/engine/engine-context.ts`'s `buildMemoryContext` +~~ ~~`formatMemoryAge` +~~ ~~`apps/web-v2/lib/audric/moat-context.ts` memory plumbing +~~ ~~`apps/web-v2/lib/audric/system-prompt.ts` legacy memory block plumbing.~~ **No backfill cron ships** (D-14 founder lock — cold start accepted). **FOLDED into Block A — SHIPPED per S.221. Note: the SPEC's "03:15 UTC trigger" was outdated; actual trigger was HOUR_INTELLIGENCE=19 UTC in t2000 server cron, now deleted.**

### Phase 7 — Cutover ops + first-session banner + 7d soak (founder-owned)

7-day production soak. During soak: daily Vercel log review (memory recall + HITL latency); daily TurnMetrics dashboard; any P0 → rollback per the runbook pattern from v0.7c.

**First-session memory-reset banner ships in this phase (per D-14 mitigation).** Renders on each user's first chat post-Phase-7 cutover: "We rebuilt audric's memory layer — over the next ~30 days, your agent will learn about you from new conversations. Your money, wallet, and positions are unaffected." ~30 LoC; dismissible; once-per-user (sessionStorage flag).

**Acceptance:** G11 closed.

### Phase 8 — Post-soak deletion sweep + v0.7e unblock (~½ day agent + founder approval)

After 7d soak passes with zero P0/P1, agent verifies the v0.7e dependency map: zero chat-shell deps, zero memory-pipeline deps, zero HITL-wire-format deps remain in apps/web's `lib/`. v0.7e Tier C copy-port + apps/web final archive is now unblocked.

**Acceptance:** G12 closed.

---

## Estimated effort

| Phase | Estimated effort | Cumulative |
|---|---|---|
| Phase 0 — Baseline + D-question lock | ~1 day | ~1d |
| Phase 1 — `MemWalMemoryStore` impl + engine wire | ~1 day | ~2d |
| Phase 2 — `<memory_recall>` live in production prompt | ~½ day | ~2.5d |
| Phase 3 — Settings Memory UI rebuild | ~2 days | ~4.5d |
| Phase 4 — D-16 classifier migration | ~2 days | ~6.5d |
| Phase 5 — SPEC 40 HITL native migration | ~3 days | ~9.5d |
| Phase 6 — Engine library decouple + legacy pipeline deletion | ~2 days | ~11.5d |
| Phase 7 — Cutover + 7d soak | founder-owned + 7d | ~18.5d (calendar) / ~11.5d (work) |
| Phase 8 — Post-soak v0.7e unblock | ~½ day | ~19d (calendar) / ~12d (work) |
| **Total (one focused engineer)** | **~8-12 working days / ~3-4 calendar weeks** | |

Note: this is an execution-of-locked-decisions slice; the v0.7c estimate of ~37 working days was for paradigm-shift work. v0.7d's smaller scope reflects that the architectural decisions have been made — Phases 1-6 are mostly mechanical implementation of contracts already locked in `memory-injection-architecture.mdc` + `agent-harness-spec.mdc` + `SPEC_PHASE_7_DRAFT.md`.

---

## Risks (R-1 through R-10)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R-1** | MemWal stability degrades during v0.7d execution | Medium | High | D-1 trigger gates kickoff; Plan B fallback evaluation matrix (Mem0 / Letta / Supermemory / Hindsight) executes if Plan A fails. `MemoryStore` interface is engine-owned + portable; swapping backends is a 1-day audric-side adapter swap. |
| **R-2** | Memory recall latency exceeds the `memory-injection-architecture.mdc` p95 contract (700ms single / 50ms session-cached) under production load | Medium | Medium | Phase 2 acceptance gate G3 verifies live latency; if it regresses, falls back to disabling `EngineConfig.memoryStore` per-turn (the engine takes the legacy `system: this.systemPromptString()` path when undefined, per `memory-injection-architecture.mdc` §"branch on memoryStore presence"). |
| **R-3** | HITL native migration breaks confirm-card chrome (modifiableFields, guard injections, regenerate input, bundle steps) | Low | High | All 15 extension fields preserved via `toolMetadata` per D-13 lock; renderer layer reads the flat shape; pre-Phase-5 unit tests + post-Phase-5 founder smoke covers all 12 writes. Feature-flag soak per D-5 catches anything missed. |
| **R-4** | Legacy memory deletion is one-way; users with valuable `UserMemory` rows pre-v0.7d lose context | Medium | Medium | 30d pre-deletion dual-pipeline window during the Phase 7 soak; backfill cron per D-14 covers the cold-start gap by replaying chat history into MemWal; founder-owned rollback procedure if Phase 7 soak surfaces P0. |
| **R-5** | Settings Memory recall-oriented UI lands but users want the legacy CRUD shape back | Low | Low | Per D-4 lock the recommendation is strong but UX is a founder call. Worst case: ship the recall page + add a "list view" toggle as a follow-on; ~½d cost. |
| **R-6** | Classifier migration (D-16) regresses a classifier's output shape against the v0.7c fixture set | Low | Medium | Phase 4 verification per E-4 measurement plan; each classifier still produces the same outputs against Phase 0 baseline fixtures; failed classifier rolls back independently. |
| **R-7** | Engine library tendril 6 extraction surfaces unexpected non-chat consumers (e.g., a cron import we missed) | Medium | Low | Phase 0 dependency-map audit + Phase 6 grep validation; extraction location per D-8 lock keeps shared bits accessible to all consumers. |
| **R-8** | Backfill cron (D-14) misbehaves (over-ingests, under-ingests, dedup failure) | Medium | Medium | Phase 6 idempotency check + Phase 7 soak monitors MemWal write throughput per user; cron is rate-limited + checkpointed; rollback is "stop the cron + delete the orphan records" (MemWal supports namespace clear). |
| **R-9** | 30d soak after Phase 7 surfaces a memory recall accuracy regression (the agent recalls wrong patterns vs the legacy SQL retention) | Low | Medium | Per `WHY_v07a.md` cost table, this is the F-12 "Top-K retrieval > 30-day SQL window" benefit — recall accuracy SHOULD improve, not regress. If it regresses, root-cause + tune (top-K config, namespace, embedding model). Engine `MemoryStore` interface accepts tuning params; no architectural changes needed. |
| **R-10** | Founder loses confidence mid-execution (scope creep, surprises) | Low | High | Phase-gated cadence; every phase has an explicit acceptance gate the founder verifies before proceeding. Stop-or-continue decision is structural, not vibes. Mirrors v0.7c R-10. |

---

## Verification process

### Phase 0 baseline values (TO BE CAPTURED)

The Phase 0 day-of agent fills in these tables; the SPEC then becomes the SSOT for "what we saw before".

#### Day 0a — Legacy pipeline LoC inventory + metrics

| Surface | Expected (per E-1 estimate) | Phase 0 actual | Delta |
|---|---|---|---|
| `apps/web/app/api/internal/memory-extraction/route.ts` | ~400 | TBD | TBD |
| `apps/web/app/api/cron/user-memory-retention/route.ts` | ~80 | TBD | TBD |
| `apps/web/app/api/user/memories/route.ts` + `[id]/route.ts` | ~200 | TBD | TBD |
| `apps/web/components/settings/MemorySection.tsx` | ~250 | TBD | TBD |
| Engine `buildMemoryContext()` + companions | ~500 | TBD | TBD |
| `apps/web/lib/engine/{strip-llm-directives,init-engine-stores,harness-metrics}.ts` chat-only LoC | ~10,000 | TBD | TBD |

#### Day 0a — Current memory pipeline operational metrics

| Metric | Source | Phase 0 actual |
|---|---|---|
| Daily `memory-extraction` cron invocation count | Vercel cron logs | TBD |
| Mean LLM calls per active user per day | NeonDB query against `UserMemory` extraction timestamps | TBD |
| Monthly Anthropic spend on `audric.cron.memory-extraction` functionId | Anthropic billing dashboard | TBD |
| Mean `UserMemory` row count per user (pre-retention) | NeonDB query | TBD |

#### Day 0a — TurnMetrics `resumeRoundTripMs` baseline (v0.7c post-cutover soak)

| Percentile | Value (TBD) | Sample size |
|---|---|---|
| p50 | TBD | n≥200 |
| p95 | TBD | n≥200 |
| p99 | TBD | n≥200 |

This is the U-3 baseline (HITL latency floor). Phase 7 acceptance compares against it.

### Per-phase realization checks

Each phase closes with a structured check that updates the realization table:

| Phase | Benefit checks | Honest assessment column |
|---|---|---|
| Phase 0 | Baselines captured | n/a |
| Phase 1 | G2 (MemWal adapter shipped + engine integration verified) | "MemWal adapter live: yes / no; engine integration p95 ≤ 700ms: yes / no" |
| Phase 2 | G3 (first memory recall round-trip live) | "`<memory_recall>` block appears in production system prompt: yes / no" |
| Phase 3 | G4 (Settings Memory UI rebuild) | "Recall-oriented UI live: yes / no; founder UX accepts: yes / no" |
| Phase 4 | G8 (classifier migration) | "Classifiers migrated to `generateObject`: N/8+; LoC deleted: N (target ≥150)" |
| Phase 5 | G6 (HITL native), G7 (`approvalId` canonical) | "All 12 writes round-trip via `addToolApprovalResponse`: yes / list exceptions; `pending_action` emission sites deleted: yes / list residue" |
| Phase 6 | G5 (legacy deletion), G9 (lib decouple), G10 (backfill) | "Legacy pipeline deleted: yes / list residue; lib decouple closed: yes / extraction location used; backfill cron operational: yes / no" |
| Phase 7 | G11 (7d soak) | "Soak P0 count, P1 count, founder go-ahead" |
| Phase 8 | G12 (v0.7e unblock) | "v0.7e dependency map shows zero chat-only deps: yes / list residue" |

### Per-benefit realization table

Each benefit gets a row; the realization column updates at the gate where the benefit's claim closes. Founder reviews at Phase 8 acceptance.

| Benefit | Tied gate | Realization (post-Phase-7 actual) |
|---|---|---|
| **E-1** — Legacy memory pipeline + tendril 6 deletion | G5 + G9 | TBD — Phase 7 cutover acceptance |
| **E-2** — One memory mental model (engine-owned 5-layer assembly) | G3 + G5 | TBD — Phase 7 cutover acceptance |
| **E-3** — HITL on AI SDK primitives (`pending_action` deleted) | G6 | TBD — Phase 7 cutover acceptance |
| **E-4** — Structured-output classifier migration | G8 | TBD — Phase 7 cutover acceptance |
| **E-5** — `lib/engine/*` decouple unblocks v0.7e | G9 + G12 | TBD — Phase 7 cutover acceptance |
| **O-1** — Daily Claude inference cron eliminated | G5 | TBD — Phase 7 cutover acceptance |
| **O-2** — MemWal scales horizontally (no SQL retention cliff) | G2 + G3 | TBD — Phase 7 cutover acceptance |
| **O-3** — HITL routing surface collapses | G6 | TBD — Phase 7 cutover acceptance |
| **O-4** — AI SDK upstream HITL feature compatibility | G6 + 365d post-Phase-7 | TBD — Phase 7 cutover acceptance |
| **S-1** — Mysten partnership reinforced at memory layer | G3 + Phase 7 | TBD — Phase 7 cutover acceptance |
| **S-2** — AI SDK alignment at the HITL surface | G6 + G7 | TBD — Phase 7 cutover acceptance |
| **S-3** — Repo path to v0.7e unblocked | G12 | TBD — Phase 7 cutover acceptance |
| **U-1** — Memory recall ("your agent knows your patterns") — D-14 lock: **30d cold-start window accepted** (no backfill); memory accumulates organically from new chats; first-session banner sets expectations | G3 + first-session banner ships in Phase 7 | TBD — Phase 7 cutover acceptance |
| **U-2** — Settings Memory recall-oriented disclosure | G4 | TBD — Phase 7 cutover acceptance |
| **U-3** — HITL latency floor (~50ms median reduction) | G6 + Phase 7 telemetry | TBD — Phase 7 cutover acceptance |
| **F-1** — Per-step memory refresh hook (already wired) | n/a — future | TBD — Phase 7 cutover acceptance |
| **F-2** — Cross-product memory namespace primitives | n/a — future | TBD — Phase 7 cutover acceptance |
| **F-3** — AI SDK HITL feature surface | n/a — future | TBD — Phase 7 cutover acceptance |
| **F-4** — Generative UI / RSC / artifacts substrate (unblocked) | n/a — future | TBD — Phase 7 cutover acceptance |

### Final scorecard format (Phase 8 acceptance)

```
v0.7d BENEFITS SPEC — Final Realization Scorecard

E (Engineering): N/M wins realized
O (Operational): N/M wins realized
S (Strategic):   N/M wins realized
U (User-facing): N/M wins realized
F (Future):      N/M wins realized (or "n/a — future")

Honest fails:
- <list any benefit that didn't materialize, with root cause>

Honest defers:
- <list any benefit deferred to v0.7e, with rationale>

Net LoC delta (audric/web legacy memory pipeline): X LoC removed
Net LoC delta (engine library tendril 6): Y LoC removed
Net LoC delta (engine `buildMemoryContext()` + companions): Z LoC removed
Net LoC delta (classifiers, Phase 4): N LoC removed (target ≥150)
Combined v0.7c+v0.7d LoC reduction: W (target ~-34,000 per RUNBOOK §1.2 + §11.1)

HITL latency p50: X ms baseline (v0.7c post-cutover) → Y ms post-v0.7d (target: ≥50ms reduction)

Memory operational wins:
- Daily Claude inference cron: eliminated yes / no
- Anthropic spend reduction:  $X/mo (target: $50-200/mo per WHY_v07a §1)
- MemWal recall p95 single:   X ms (target ≤ 700ms)
- MemWal recall p95 cached:   X ms (target ≤ 50ms)
- Backfill coverage:          N% of users have ≥30 records (target ≥80%)

D-questions resolved:
- D-1 through D-14:           N/14 founder-locked at v0.7d kickoff
```

---

## What changed since v0.7c

- v0.7d is **scoped to execution-of-locked-decisions**, not paradigm shift — every architectural decision is already made (engine `MemoryStore` interface in v2.7.0+; `memory-injection-architecture.mdc` 5-layer contract; `agent-harness-spec.mdc` `attemptId === approvalId` mirror).
- **D-1 (MemWal stability)** added — Plan A primary, Plan B fallback evaluation matrix executes if hard deadline 2026-06-26 misses.
- **D-4 (Settings Memory UI shape)** added — recall-oriented disclosure, not per-row CRUD.
- **D-5 (HITL cutover)** added — atomic batch swap (per-write canary pattern from v0.7c D-13 doesn't fit a unified harness).
- **D-7 (classifier migration order)** added — by-fragility, with the S.173 reconciliation honoring the regex-stays-regex outcome for intent-dispatcher.
- **D-8 (legacy memory pipeline deletion gate)** added — gate on MemWal stability + 7d soak window; library extraction location open-locked.
- **D-9, D-10, D-11, D-12, D-13, D-14** added — recall API surface, memory deletion API, ChainMemory/AdviceLog interaction with MemWal, Settings UI delegation, HITL wire shape, backfill strategy.
- **Phases 0-8** added — execution-of-locked-decisions cadence.

## Re-read schedule

Mirror v0.7c:
- **At start of every working session** — re-read this SPEC's "Benefit categories" + "Phase N" status before starting work.
- **Mid-session** — re-read the section relevant to the current task.
- **End of session** — update the realization table; commit the SPEC change in the same commit as the code change.

---

## Cross-references

- `BENEFITS_SPEC_v07c.md` — immediate predecessor (chat-shell fork); defines D-11 memory deferral, D-16 classifier deferral, the v0.7c Phase 6 cutover routing, and the audit-first slice discipline.
- `BENEFITS_SPEC_v07a.md` — engine drain; defines `MemoryStore` interface + Phase 7 commitment + Plan B fallback evaluation matrix + the original 48-benefit ledger that this SPEC's execution slice closes.
- `WHY_v07a.md` — the founder-facing strategic case for the AI SDK + MCP + MemWal bet. Three reasons still hold; v0.7d cashes the deferred wins on the memory + HITL surfaces.
- `SPEC_PHASE_7_DRAFT.md` — engine-side memory prototype design; D-1 through D-5 (within that doc) locked the engine-side decisions v0.7d's audric integration consumes.
- `.cursor/rules/memory-injection-architecture.mdc` — binding 5-layer prompt assembly contract; the engine implementation is shipped in v2.7.0+; v0.7d wires the audric host into it.
- `.cursor/rules/agent-harness-spec.mdc` — Spec 1 + Spec 2 contracts; §Item 3a is the `attemptId === approvalId` mirror that makes the v0.7d HITL native migration safe.
- `RUNBOOK_v07c_phase_6_cutover.md` §11.1 — the v0.7d skeleton (workstreams + LoC delta + effort estimate). This SPEC is the formal expansion of that section.
- `RUNBOOK_v07c_phase_6_cutover.md` §11.2 — the v0.7e skeleton; v0.7d Phase 8 unblocks it.
- `audric-build-tracker.md` S.173 — D-14 lock (intent-dispatcher stays regex); informs E-4 + D-7 reconciliation.
- `audric-build-tracker.md` S.176 — Phase 4 close (TurnMetrics outcome-update slice via `attemptId` updateMany); the contract Spec 1 §Item 3 calls for that v0.7d HITL native migration preserves verbatim.
- `audric-build-tracker.md` S.184 — Phase 5.5 close (LMM activation + log-redact port); reframes the D-17 architectural home (guards live in `tool.execute()`, not model middleware) — same architectural-correction discipline applies to v0.7d's HITL migration.
- `MystenLabs/MemWal/tree/dev/apps/chatbot` — Mysten's reference integration; cross-reference at every memory architectural fork.
- AI SDK v6 `tool-approval-request` reference — [ai-sdk.dev/docs/agents/tools-and-approvals](https://ai-sdk.dev/docs/agents/tools-and-approvals).
- MemWal SDK reference — `@mysten-incubation/memwal@0.0.4+`.

---

## v0.7c UI/UX carry-over (S.208/S.209 — added 2026-05-20)

A small set of UI/UX polish items surfaced during v0.7c Phase 6.5 + Session 5.5 smoke that were deliberately not shipped in S.207, S.208, or S.209. They are NOT in the v0.7d benefit ledger (no LoC/recall/latency claim attached) — they are tracked here so the next agent picking up the v0.7c → v0.7d transition can decide whether to (a) bundle them into the v0.7d UI work that lands alongside the Settings Memory section (D-4), (b) ship them as a one-off polish PR before v0.7d kickoff, or (c) defer further.

| Item | Source | Why deferred | Where it lands |
|---|---|---|---|
| **MessageActions** (copy, thumb up/down, edit) | chatbot.ai-sdk.dev template parity | Out of scope for S.208 ("3 bugs + template parity" scope-lock); requires a Vote / Feedback table in the v2 schema | v0.7d UI sweep alongside D-4 Settings Memory section, OR pre-kickoff polish PR |
| **MessageEditor** (inline edit user prompt + regenerate) | chatbot template parity | Out of scope for S.208; requires `regenerate()` plumbing in transport + UI state for in-place edit; non-trivial state machine | v0.7d UI sweep |
| **Group D — `streamCheckpointStore` (Upstash)** | BENEFITS_SPEC_v07c §6.5.D.1 | Phase 6.5 scope-locked at Option B+ (MUSTS + CRITICAL P1s); Group D was on the cutting-room floor by founder explicit choice. Engine v2.2.0 has the `StreamCheckpointStore` interface ready; audric just needs to inject Upstash. | Pre-v0.7d-kickoff (low-risk, ~0.5d) OR fold into v0.7d Phase 1 |
| **Group E — `sessionSpendUsd` ledger + `onAutoExecuted` hooks** | BENEFITS_SPEC_v07c §6.5.E | Same scope-lock rationale as Group D. `sessionSpendUsd: 0` in `lib/audric/telemetry-integration.ts` is a deliberate placeholder; safe because web-v2 has zero auto-tier writes in production today (all confirm-tier). USD-aware permission auto-tier becomes live AFTER E.2 ships. | Pre-v0.7d-kickoff (~0.5d) OR fold into v0.7d Phase 1 |
| ~~`Reasoning` accordion smoke verification~~ | Founder feedback post-S.208 ("thinking state / thought dropdown accordion is that deferred?") | ✅ **CLOSED 2026-05-21 in S.210 + S.211.** S.210 wired reasoning-* chunk forwarding through `translateChunk`; S.211 then fixed the missing `display: 'summarized'` by switching from `thinking.type: 'enabled'` to `thinking.type: 'adaptive'` (the only mode where AI SDK Anthropic provider honors `display`, and the only mode the Vercel AI Gateway surfaces reasoning chunks on for Claude 4.6+). Accordion now renders live in prod. | — |
| **v1 RECENTS persistence parity** | S.207 finding F1 (chrome was ported but new v2 turns don't write to v1 ChatSession table) | The template's `SidebarHistory` shipped in S.208 reads from web-v2's `/api/history` (DB-backed by web-v2's `Chat` table). Empty until web-v2 starts persisting turns — which is the MemWal Phase 7 work. Folds into D-4 (Settings Memory) + the v0.7d turn-persistence wire-up. | v0.7d Phase 1 (memory write path naturally covers turn persistence) |
| **EmptyState skeleton hover for portfolio canvas** | S.207 finding F2 (brief "$0 / 450% APY" placeholder before real data hydrates) | Cosmetic skeletal loading flash; same pattern as v1 (verified in S.207 recon). Not a regression. | Backlog (optional polish) |

**Decision criterion for inclusion in v0.7d Phase 1.** If MemWal stability checkpoint passes 2026-05-29 AND v0.7c 7d soak passes, the Group D + Group E items + MessageActions + MessageEditor become reasonable additions to v0.7d Phase 1 (the audric host integration phase). MessageActions specifically becomes more valuable WITH memory in place (thumb feedback feeds the memory write path). If MemWal slips, ship Group D + Group E as a pre-kickoff polish PR (they don't depend on memory).

---

**End of v1.0 LOCKED (2026-05-21).** All 14 D-questions locked: D-2, D-3, D-6, D-7, D-9, D-11, D-12 inherited from v0.7a / v0.7c; D-1, D-4, D-5, D-8, D-10, D-13, D-14 locked by founder 2026-05-21 ~08:05 AEST. D-14 was the only founder counter to SPEC v0.1 (no backfill instead of opportunistic backfill; trade-off: 30d cold-start window for cleaner deletion + removed G10 + removed Phase 6 backfill cron). Phase 0 Day 0a baseline captured 2026-05-21 ~08:00 AEST; Day 0b D-question lock complete same session. Phase 1 trigger remains gated on (a) MemWal stability 2026-05-29 + (b) v0.7c 7d soak (closes 2026-05-28). Phase 1 starts on dual-gate close; G2 through G12 (G10 removed) close progressively per their phase mapping.
