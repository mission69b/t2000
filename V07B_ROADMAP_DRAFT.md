# v0.7b Roadmap — Working Draft

> **Status:** working draft as of 2026-05-17 ~21:30 AEST. Tracked alongside `BENEFITS_SPEC_v07a.md` (this repo's planning surface is public; v0.7b direction is engine-infra direction).
>
> **Purpose:** answer the question "what should we work on next?" in 30 seconds instead of 1 hour of `BENEFITS_SPEC_v07a.md` re-read. Not a substitute for the full BENEFITS_SPEC — that doc is the verifiable contract; this is the working triage.
>
> **Promotion path:** once §3 has ≥3 locked-in items with measurable acceptance criteria, rename to `BENEFITS_SPEC_v07b.md` and adopt the full verification-criteria structure of v07a.
>
> **Re-read trigger:** at the end of every engine release day. Update what's shipped, what's open, what's been re-prioritized.

---

## 0. SPEC 37 phase-status cheat sheet (canonical — keep current)

> Mirror of the table in `HANDOFF_NEXT_AGENT.md` banner. Source of truth for "where are we in the 8-phase 12-14 week plan" question. Original plan: `~/.cursor/plans/audric-v07a-engine-drain.plan.md`.

| Phase | Status | Engine version | Realizes |
|---|---|---|---|
| 0 — Preparation (bridge, baselines, R6, R8, R9) | ✅ DONE 2026-05-15 | — | E-7 |
| 1 — Provider migration (Anthropic → AI SDK) | ✅ DONE (rolled into v2.0.0) | v2.0.0 | F-1, F-2 prep |
| 2 — Tool migration (37 tools → `tool()`) | ✅ DONE 2026-05-16/17 (~36h) | v1.35.0 → v1.38.0 | F-6 |
| 3 — Engine loop migration (streamText + prepareStep) | ✅ DONE (rolled into v2.0.0) | v2.0.0 | F-3 prep |
| 4 — MCP migration (createMCPClient + prompt adapter) | ✅ DONE 2026-05-17 | v2.1.0 | **F-7 ✅** |
| 5 — Streaming protocol | 🟡 PARTIAL (Slices A+C done; B+D deferred to v0.7c) | v2.2.0 + v2.5.0 | partial U-3 |
| 6 — Recipes → Skills | ✅ DONE 2026-05-17 (Phase 6 + 6G) | v2.3.0 + v2.4.0 | **F-10 ✅ S-7 ✅** |
| 7 — MemWal integration + memory-infra refactor | 🟡 PROTOTYPE + CANARY LIVE; production gated on MemWal 2026-06-26 hard deadline | v2.7.0 | **F-4 ✅** (prototype); F-11/F-12/O-1/S-1/S-10 pending |
| 8 — Hardening + ship | 🟡 PARTIAL (H6, per-package release, D-4 column shipped; 130-behavior catalogue walk + R9 smoke + final release framing pending) | — | E-1 (Phase 8 close) |

**Original estimate:** 12-14 weeks. **Actual:** Phases 0-6 done in ~3 days due to Phase 2/3/4 AI-SDK-native consolidation collapsing 5 weeks of phased work into ~36h of single-rewrite execution. **Remaining work** is Phase 7 production close (MemWal-gated, deadline 2026-06-26) + Phase 8 hardening (most items not externally blocked).

**What v0.7b shipped early (without committing to full v0.7b):**
- D-4 (`TurnMetrics.streamResumeOutcome` column) ✅ S.155
- D-6 (`approvalId` forward-compat alias) ✅ v2.6.0
- D-7 (audric dry-run integration) ✅ S.153

**What's deferred to v0.7c (chatbot UI fork):**
- D-1 Slice D full (`pending_action` → `tool-approval-request` native)
- D-3 Slice B (UIMessage production path)
- D-2 Path A (silent in-flight re-execution) — only if D-4 data shows mid_tool >5%

**What's gated on external timing:**
- D-5 MemWal Plan B pivot trigger — only if Plan A misses 2026-06-26

---

## 1. What shipped under the v0.7a label (engine releases)

Recent run (Phase 4 → Phase 5 → Phase 5.5 → Phase 6 → Phase 6G → Phase 5 deferred follow-ups → D-6 prep → Phase 7 engine prototype), 2026-05-17 + 2026-05-18:

| Release | Phase | What shipped | Audric impact |
|---|---|---|---|
| `2.0.5` | post-Phase-3 patch | `validateHistory` Anthropic strict-shape safety net | Self-heals corrupt fast-path-bundle sessions; bundle resume unblocked |
| `2.1.0` | Phase 4 | `McpClientManager` internals → `@ai-sdk/mcp`'s `createMCPClient`; new `McpPromptAdapter` | F-7 realized; zero engine changes per new MCP server |
| `2.2.0` | Phase 5 Slice C | `StreamCheckpointStore` + `stream_started` event + Path B mid-tool resume | Engine primitive for page-reload survival |
| `2.3.0` | Phase 6 | Skills baked into `@t2000/mcp` as `skill-*` prompts; legacy `RecipeRegistry` deleted; `classifyEffort` decoupled from `matchedRecipe` | F-10 realized; one source of truth for agent capabilities |
| `2.4.0` | Phase 6G | `mcp/prompts.ts` rewritten as skill-compositions via `composeSkillBody` / `composeSkillSections` | Drift firewall — skill edits propagate to every dependent workflow prompt automatically |
| `2.5.0` | Phase 5 deferred | P1 JSDoc hygiene + `onStreamResume` telemetry callback + `replay(opts: { signal })` AbortSignal threading | Audric wires `onStreamResume` → Vercel-log telemetry (shipped same day in audric `0255fc7`) |
| `2.6.0` | D-6 prep | `approvalId` forward-compat alias for `attemptId` on `PendingAction` (mirrors AI SDK v6 HITL terminology) — 4 emission sites stamp `approvalId === attemptId` verbatim; ~half day | No-op today (legacy reads of `attemptId` continue working); reduces v0.7c migration cost when full Slice D lands |
| `2.7.0` | Phase 7 engine prototype | `MemoryStore` interface + `InMemoryMemoryStore` mock + `EngineConfig.memoryStore` + `financialContextBlock` + `skillRecipeBlock` + `prepareStep` 5-layer F-4 assembler + per-turn cache + honest degradation; 37→40 new tests (post-audit hardening), full suite 1313/0 pass/fail | Engine-side F-4 realized. Audric integration awaits 2026-05-29 MemWal checkpoint OR earlier dry-run via the in-memory mock |

**Plus Phase 5.5 (audric-side, engine 2.2.0 consumer):** `UpstashStreamCheckpointStore` + chat-route `resumeStreamId` plumbing + `useEngine` retry-pill + cold page-reload auto-resume + sessionStorage quota fallback. Logged as S.152 in `audric-build-tracker.md`.

**Plus same-day MemWal smoke action:** [MystenLabs/MemWal#159](https://github.com/MystenLabs/MemWal/issues/159) filed 2026-05-15; re-run comment same day showed Mysten patched the headline `balance::split` error (0/10 → 7/10 ingest). Next checkpoint 2026-05-29.

---

## 2. What's still open in v0.7a

| Item | Owner | Why deferred | Trigger to pick up |
|---|---|---|---|
| **Slice B** — UIMessage / `sse-format-adapter` production path | Engine | "When UIMessage is a goal" — audric still on `EngineEvent` + `serializeSSE` (works fine) | Audric commits to Vercel chat UIMessage protocol OR cross-product chat surface needs UIMessage |
| **Path A** — silent in-flight tool re-execution on resume | Engine | Need production data on how often Path B (mid-tool) fires; engine v2.5.0 just shipped the `onStreamResume` callback to capture it | ~2 weeks of `[stream-resume]` Vercel logs showing `mid_tool` is non-trivial AND correlated to recoverable tools |
| **Phase 7 (production)** — F-11 + F-12 (vector retrieval at scale) + S-1 (Mysten partnership) + S-10 (SEAL→Walrus encrypted memory) + O-1 (ECS daily Claude cron eliminated). | Audric + MemWal | **Engine prototype SHIPPED in v2.7.0 2026-05-18** (F-4 ✅). Production realization gated on (a) MemWal infra stability and (b) audric `MemWalMemoryStore` impl + cron + telemetry. Hard deadline 2026-06-26 (Plan B pivot day) | 2026-05-29 smoke re-run; 2026-06-12 fallback eval matrix start (parallel); 2026-06-26 Plan A vs B decision. Audric dry-run with engine's mock store can land EARLIER (de-risks the wiring change before MemWal is live). |
| ~~**`onStreamResume` → `TurnMetrics` column**~~ ✅ **SHIPPED audric `d5b50a2` 2026-05-18 as S.155 / D-4.** | Audric | ~~Today's wiring logs to Vercel only; needs Prisma migration to add `streamResumeOutcome` JSON column for dashboarding~~ Column + migration + collector + tests all shipped. | ~~Vercel-log volume justifies dashboarding~~ done |
| **Sidecar drop-out follow-up issue against MemWal** | Founder | Distinct failure mode from #159 (Seal encryption sidecar dropping mid-batch); awaiting 2026-05-29 re-run to see if it persists | Drop-out reproduces on 2026-05-29 smoke |

**Audric-side P1 polish (from S.152 backlog — non-blocking):**
- `useEngine` JSDoc tightening on `retryInterruptedTurn` contract — already shipped in S.152 p1-1
- Two-tab-same-session streamId clobber — catalogued as future polish, low probability
- Path B `case 'error'` clearing stale streamId — already shipped in S.152 p1-3

---

## 3. What v0.7b actually IS now

v0.7a's plan defined v0.7b as **F-8 "engine deletion path open"** — the option to delete the legacy bridge layer once the drop-in `AISDKEngine` proved stable. In practice this happened EARLIER than planned:

- The legacy `QueryEngine` was **already deleted** in engine `v2.0.0` (commit `f87d7329`, 2026-05-17). v2.0.0 is the cutover; v2.0.1 → 2.0.5 are the production-soak fixes (cache invalidation, bundle resume, validateHistory).
- The bridge layer (`engineToSSE`) was **already deleted** in engine `v2.2.0`. Hosts now iterate the EngineEvent generator raw and call `serializeSSE` per event.
- The `buildTool` factory was **already deleted** in engine `1.38.0` (pre-v2.0.0). All 39 tools migrated to `defineTool`.

**So v0.7b is NOT "delete the engine" anymore — that's done.** It's the next batch of platform-alignment moves that didn't fit cleanly into v0.7a's Phase 0-8 plan because they emerged from v0.7a soak experience.

### v0.7b candidate scope (recommended)

| # | Item | Source | Effort | Risk |
|---|---|---|---|---|
| ~~**D-1**~~ | ~~**Slice D — `pending_action` ↔ native `tool-approval-request`**~~ **DEMOTED — see `SPEC_SLICE_D_DRAFT.md` 2026-05-18.** Scoping showed AI SDK v6's `needsApproval` is for server-executed tools; our zkLogin model needs client-side tools (`onToolCall` + `addToolOutput`), which requires audric to adopt `useChat` from `@ai-sdk/react` — that's Slice B's scope. D requires B as prerequisite; both naturally ride the v0.7c chatbot template fork. | Was Phase 5 backlog | **v0.7c-class, not v0.7b-class** | Doing D in v0.7b would either force B early (also v0.7c-class) or build cosmetic-only workarounds. |
| **D-2** | **Path A — silent in-flight tool re-execution** | Phase 5 5e-3 telemetry consumer | ~3-5 days | Gated on ~2 weeks of `onStreamResume` Vercel-log volume (already shipping post-audric `0255fc7`). Engine-side change in `v2/engine.ts` resume branch. |
| **D-3** | **Slice B — UIMessage / `sse-format-adapter` production path** | Phase 5 backlog | ~3-5 days engine + multi-week audric | Re-gated post-D-scoping (2026-05-18): now linked to v0.7c chatbot template fork since that's when audric naturally commits to `useChat`. Engine-side adapter remains shippable standalone. |
| **D-4** | ~~**`TurnMetrics.streamResumeOutcome` column**~~ ✅ **SHIPPED audric `d5b50a2` 2026-05-18 as S.155.** New nullable JSONB column on `TurnMetrics`; `TurnMetricsCollector.onStreamResume(info)` normalizes the engine's discriminated union (flattening `replay_error.error: Error` → `errorMessage: string` for JSON safety) and persists it alongside the existing `[stream-resume]` Vercel log. 12 new tests (5 normalize + 7 collector). Migration auto-applies via `maybe-migrate.mjs` on next Vercel deploy. Two ready-to-paste analytic queries in the schema JSDoc + migration SQL (outcome histogram + `mid_tool` tool histogram for Path A trigger evaluation). Dashboard tile deferred — column ships with the SQL, panel-building is ops-side work that doesn't gate the D-2 evaluation. | onStreamResume telemetry consumer | ✅ done | De-risked: nullable column → safe backfill-free; existing rows store SQL NULL; telemetry persistence wrapped in independent try/catch from the existing log path. |
| **D-5** | **MemWal Path B pivot** (Mem0 / Letta cloud / Letta self-hosted / Supermemory / Hindsight) | Phase 7 commitment gate | ~1-2 weeks if triggered | Only if 2026-06-26 Plan A decision fails. Otherwise Phase 7 absorbs MemWal as scoped. |
| **D-6** | ~~**AI SDK shape alignment (prep)**~~ ✅ **SHIPPED engine v2.6.0 2026-05-18.** D-6.1 (approvalId alias) + D-6.3 (impedance docs) landed; D-6.2 (event-name rename) + D-6.4 (compat mode) remain deferred to v0.7c with full Slice D. | This scoping doc (2026-05-18) | ✅ done | — |
| **D-7** | ~~**Audric dry-run integration of engine v2.7.0 memory path**~~ ✅ **SHIPPED audric `363e4f1` 2026-05-18 as S.153.** Opt-in via `ENGINE_MEMORY_PATH_ENABLED` env flag (default OFF). Wires `EngineConfig.memoryStore` (`InMemoryMemoryStore` mock; audric never calls `remember()` in dry-run so layer 3 stays empty) + extracts `<financial_context>` from inline dynamic block into `EngineConfig.financialContextBlock` via new `buildFullDynamicContextSeparated` helper. `skillRecipeBlock` left undefined (audric does not use `McpPromptAdapter` today; layer 4 stays empty). Operator-side smoke check via `vercel logs \| grep '[memory-path]'`. When MemWal lands, only the store impl swap is required (replace `new InMemoryMemoryStore()` with `new MemWalMemoryStore(...)`). | Phase 7 audric prep | ✅ done | De-risked: legacy path bit-identical when flag OFF; mock-recall returns [] → prompt-caching preserved in dry-run. |

### v0.7b explicit NON-goals

- **NOT** another MCP migration (Phase 4 is done; further MCP work belongs in product, not infra).
- **NOT** another tool factory migration (`defineTool` is the end state; no `defineToolV2`).
- **NOT** any audric UI work — that's v0.7c.
- **NOT** the MemWal commitment itself — that's Phase 7.

---

## 4. Decision matrix for "what's next this session"

| Signal | Pick |
|---|---|
| Founder wants user-visible progress | ~~Phase 7 design scoping + audric dry-run~~ ✅ both shipped 2026-05-18 (engine v2.7.0 + audric S.153 `363e4f1`). Next user-visible Phase 7 step: flip `ENGINE_MEMORY_PATH_ENABLED=1` in Vercel for canary observation (~1 week of token usage + cache-hit comparison), then promote to default-ON. Production realization (F-11/F-12/O-1/S-1/S-10) remains MemWal-gated. |
| Founder wants platform-alignment win in v0.7b | ~~**D-6** lightweight cosmetic prep (~half day)~~ ✅ shipped 2026-05-18 as engine v2.6.0. Full Slice D remains v0.7c-class. |
| Founder wants platform-alignment win and is ready for v0.7c | Pair D + B as a coupled migration alongside chatbot template fork |
| Vercel logs show `mid_tool` resumes >5% of resume volume | **D-2** Path A engine-side prototype |
| Audric chat UI commits to UIMessage | **D-3** Slice B (UIMessage path) — best paired with the v0.7c chatbot fork |
| Audric telemetry needs dashboarding | ~~**D-4** `TurnMetrics.streamResumeOutcome` column + dashboard tile~~ ✅ column shipped 2026-05-18 as S.155 (`d5b50a2`); dashboard tile remains an ops-side follow-up (column ships with two ready-to-paste analytic queries — outcome histogram + `mid_tool` tool histogram). Promote to a panel after ~7d of production data accumulates. |
| Engineering bandwidth low (<2h session) | Spec hygiene (this doc + `audric-build-tracker.md` + BENEFITS_SPEC `[ ]` checkbox audit) |
| 2026-05-29 is approaching | Re-run MemWal smoke against `https://relayer.memwal.ai`, update #159 comment, update §1 of this doc |
| 2026-06-12 is approaching | Start passive fallback eval matrix (Mem0 / Letta / Supermemory / Hindsight — pricing + p95 + SEAL-equivalent encryption) |
| 2026-06-26 is approaching | **D-5** trigger evaluation — Plan A vs Plan B decision day |

---

## 5. Re-read schedule for this doc

- Update at the **end of every engine release day** with the new release row in §1 and any item moves between §2/§3.
- **Hard re-read** at every Phase 7 deadline-grid checkpoint (`2026-05-29`, `2026-06-12`, `2026-06-26`, `2026-07-03`).
- Promote to a proper `BENEFITS_SPEC_v07b.md` once §3 has ≥3 locked-in items with measurable acceptance criteria — at that point the working triage is heavy enough to deserve the formal SPEC structure.

---

## 6. Cross-references

- Full v0.7a contract → `BENEFITS_SPEC_v07a.md`
- **Slice D scoping result (2026-05-18)** → `SPEC_SLICE_D_DRAFT.md`
- **Phase 7 engine-side scoping (2026-05-18)** → `SPEC_PHASE_7_DRAFT.md`
- Audric build tracker (S.NNN entries) → `audric-build-tracker.md` (local-only)
- Engine releases ledger → `packages/engine/CHANGELOG.md`
- Audric chat-route resume wiring → `audric/apps/web/app/api/engine/chat/route.ts`
- MemWal smoke harness → `packages/engine/scripts/memwal-smoke.ts`
- MemWal issue → [MystenLabs/MemWal#159](https://github.com/MystenLabs/MemWal/issues/159)
