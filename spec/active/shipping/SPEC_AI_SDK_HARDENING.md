# SPEC — AI SDK Hardening

> **Status:** SHIPPING · drafted 2026-05-24 · revised 2026-05-24 (Phase 5 closed, Phase 6 closed, P3.2 + P3.4 closed — **3 of 7 phases shipped + 2/4 of Phase 3**) · author: agent (Opus 4.7)
> **Local-only?** No — this SPEC is tracked. `audric-build-tracker.md` references stay founder-local.
> **Promoted from:** `.cursor/plans/ai_sdk_hardening_bc37c5e8.plan.md` (the working plan that drove this work — original is the source of truth for full per-item rationale + AI SDK doc citations).
> **Why tracked:** the plan has 7 phases / 32 items across ~3 weeks of work. Multiple agents and sessions will work on it. Without a tracked SPEC, the next agent risks re-shipping completed phases (the exact failure mode that triggered this promotion).

---

## 1. Goal

Close the gap between Audric's AI SDK v6 integration and Vercel's documented best practices. Evidence: subagent survey of `packages/engine/src/v2/define-tool.ts`, `audric/apps/web-v2/components/audric/tool-result-router.tsx`, and the host stream handler at `audric/apps/web-v2/app/api/chat/route.ts` cross-referenced against the AI SDK docs (foundations/tools, chatbot-tool-usage, prompt-engineering, loop-control, building-agents, workflows, tool-approval, artifacts).

## 2. Sequencing rationale (per the plan)

1. **Phase 1** — Tier 1 user-visible bugs · ships first
2. **Phase 2** — Tier 4 hygiene (low risk, sets up Phase 4 safely)
3. **Phase 5** — Tier 2 chat UX gaps (visible-to-user impact)
4. **Phase 6** — Tier 2 error handling (depends on Phase 5 Edit for user-side recovery)
5. **Phase 3** — Tier 2 best-practice alignment (host-level wins, no engine bump)
6. **Phase 7** — Bundle hardening (gated on Phase 3 stability)
7. **Phase 4** — Tier 3 architectural (defineTool migration touches every tool)

## 3. Phase status

### Phase 1 — Tier 1 bugs ✅ SHIPPED 2026-05-24 (S.284)

- ✅ **P1.1** Fix JSON-flash after confirm — `tool-result-router.tsx` gains `approval-responded` branch
- ✅ **P1.2** Forward `tool-input-start/delta/end` chunks through `translateChunk`
- ✅ **P7.1** Defensive `MAX_BUNDLE_OPS` enforcement in `BundleBuffer.flush()` (Option A: synthesize `tool-output-error` for overrun legs)

Audric commit: `6f9d940`. Live smoke green at 08:33 AEST. No engine bump.

### Phase 2 — Tier 4 hygiene ✅ SHIPPED 2026-05-24 (S.285 + S.286-S.289)

- ✅ **P2.1** `.optional()` → `.nullable()` audit (13 fields across 6 tool schemas) — engine v2.19.3
- ✅ **P2.2** Stream resume host wiring — extracted into companion SPEC `SPEC_AUDRIC_STREAM_RESUME.md` (Phases 1, 1.5, 2, 3 all shipped). Single largest slice of Phase 2.
- ✅ **P2.3** `defaultSettingsMiddleware` wraps chat model (temperature 0.3, maxOutputTokens 8192)
- ✅ **P2.4** `TelemetryIntegration` native-lifecycle audit (custom kept; rationale documented inline)
- ✅ **P2.5** Redis-backed IP rate limit on `/api/chat` (30 msgs / 60s / IP, degrade-open posture)

Audric commits: `45a457f` (P2.3+P2.4+P2.5), then `0e3812f`/`6dca31d`/`afa83cb`/`2a8922e`/`2239d30` for the SPEC_AUDRIC_STREAM_RESUME phases. Engine bumped 2.19.2 → 2.19.3.

### Phase 5 — Chat UX gaps ✅ SHIPPED 2026-05-24 (S.290 + S.291 + S.292)

- ✅ **P5.5** Stop button + abort plumbing — shipped via `SPEC_AUDRIC_STREAM_RESUME` Phase 2 (S.288 client wiring) + Phase 3 (S.289 cross-instance abort). Cross-references the same `useChat` invocation.
- ✅ **P5.2** Copy buttons on user + assistant rows — `getMessageText` helper + `MessageAction` wiring (S.290, audric `313f6ed`)
- ✅ **P5.3** Vote hydration from `GET /api/vote` on chat mount — batched fetch + `initialVote` prop on `MessageVoteThumbs` (S.290, audric `313f6ed`)
- ✅ **P5.4** Regenerate action on last assistant row — `useChat.regenerate()` no-args (S.290, audric `313f6ed`). Per-message regenerate (with `messageId`) deferred to P5.1 / Edit territory.
- ✅ **P5.1** Edit user message + re-send + `truncateMessagesAfter` server helper + 5 chat-persistence integration tests (11 cases) folded in (S.291, audric `9029eb1`). Includes a `bundle-status.ts` extraction so `isBundleSpent` is unit-testable. Self-audit caught + fixed a legacy-schema edge case (penultimate `{role, content}` without `id` would have triggered a full-chat wipe; now skipped with a warn log).
- ✅ **P5.6** Surface live HF/APY metadata through `buildAudricToolMetadata` + PermissionCard (S.292). New `lib/audric/live-data.ts` host-side enrichment module replicates the engine's `enrichPendingActionWithLiveData` subset (the engine's helper is unreachable from web-v2's `Experimental_Agent` path). `currentHF` / `projectedHF` / `borrowApyBps` thread through `tool-input-available` → `parseAudricMetadata` → `PermissionCard` → `renderPreviewBody`, lighting up the existing HFRow / APYRow rich previews. 19 unit tests for `projectHF` + `computeMetadataEnrichment` cover the 8-tool decision matrix + graceful degradation. **Quote-refresh UI + per-reward breakdown + cetusRoute deferred to backlog per Round 3 trim** — first-time borrowers (no existing position) still see the existing "Variable rate" disclaimer rather than a live APY.

### Phase 6 — Error handling alignment ✅ SHIPPED 2026-05-24 (S.298)

- ✅ **P6.1** `onError` callback on `createUIMessageStream` (the correct seam — plan said `createUIMessageStreamResponse` but AI SDK types put `onError` on the stream constructor, NOT the response wrapper; corrected during implementation)
- ✅ **P6.2** Client `useChat({ onError })` minimal observability hook — banner-only UX (finance app · recovery via P5.1 Edit + P5.4 Regenerate is the gentle path · revisit if telemetry shows banner blindness)
- ✅ **P6.3** Replace string-heuristic error classification with typed AI SDK error classes — `classifyStreamError()` does `isInstance` first (RetryError / APICallError with status-code switch / NoSuchToolError / InvalidToolInputError / InvalidToolApprovalError / ToolCallNotFoundForApprovalError), falls back to the heuristic sanitizer for raw strings. Back-compat `sanitizeStreamErrorMessage(raw)` preserved for the engine-chunk error path. 29 unit tests; 64/64 lib/audric tests pass.

Audric commit: `ab4f789`. No engine bump (host-only). No new dependencies.

### Phase 3 — Best-practice alignment 🟡 IN PROGRESS

- ⏳ **P3.1** `prepareStep.activeTools` (intent classifier v1 cuts 26 → 5-8 tools per turn)
- ✅ **P3.2** Enable `experimental_repairToolCall` on `Experimental_Agent` (S.300 — 2026-05-24). `lib/audric/tool-call-repair.ts` factors the callback: `NoSuchToolError` returns null (model re-plans), `InvalidToolInputError` does a single structured-output `generateText` call with the tool's JSON Schema + the validation error and returns the repaired `toolCall.input`. Graceful null-fallback whenever the secondary call itself fails. 10 unit tests. Stale `Option B (post-P3.2)` comment in `BundleBuffer.flush()` updated to note the seam is now wired (the BundleBuffer A→B swap stays as a follow-up; it needs bundle-aware context, not just schema validation).
- ⏳ **P3.3** Wire McpPromptAdapter to populate `skillRecipeBlock` (or delete `t2000-skills/` — decide during implementation; recommendation: wire it, it's the moat we advertise)
- ✅ **P3.4** Unify post-write logic via engine `onStepFinish` (S.301 — 2026-05-24). Engine 2.20.0 publicly exports `buildStepFinishHandler` + `StepFinishMutableState`; audric/web-v2's `Experimental_Agent` now wires `onStepFinish: buildStepFinishHandler([...READ_TOOLS, ...WRITE_TOOLS], internalContext, stepFinishMutable)` so four post-step concerns the legacy `AISDKEngine.submitMessage` path runs automatically finally reach the v2 host path: (1) `updateGuardStateAfterToolResult` (guard trackers — swap_quote pairing, balance freshness, retry counts, lastHealthFactor), (2) `extractTrustedAddressesFromResult` (lookup_user / resolve_suins → guardState.trustedAddresses), (3) sessionSpend USD accumulation + `onAutoExecuted` hook (Upstash daily-spend ledger increment via `incrementSessionSpend(sessionId, usdValue)` — closes the dead Group E TODO at `translateChunk` → tool-result case), (4) `clearPortfolioCacheFor` + `clearDefiCacheFor` (BV 60s cache invalidation after every successful write so the next balance_check / portfolio_analysis hits fresh state — ALSO load-bearing for host PWR pre-fired reads). `buildInternalContext({...})` now passes `onAutoExecuted` + `permissionConfig` + `priceCache` (the latter two as the SAME references the toolContext holds). Host PWR module stays — it pre-runs balance_check / savings_info / health_check at the START of the resume turn (different concern than guard / cache / spend bookkeeping). `pnpm typecheck` clean, `pnpm lint` clean, 112/112 web-v2 tests pass. The four concerns no longer drift between the legacy and v2 paths.

### Phase 7 — Bundle hardening (remainder) ⏳ PENDING

- ✅ **P7.1** Cap enforcement — already shipped in Phase 1 (defensive Option A; swap to Option B after P3.2 lands for cleaner repair-tool-call recovery)
- ⏳ **P7.2** Wire `inputCoinFromStep` end-to-end (engine → marker → sponsored-tx payload → SDK `composeTx`)
- ⏳ **P7.3** cetusRoute fast-path threading for bundle swap legs (latency optimization ~150-200ms/leg)
- ⏳ **P7.4** Bundleable flag on `defineTool` / `TOOL_METADATA` (folds into P4.1)
- ⏳ **P7.5** Streaming bundle assembly progress UX (`data-audric-bundle-progress` parts)

### Phase 4 — Architectural ⏳ PENDING

- ⏳ **P4.1** Migrate 26 tools from `defineTool()` to native `tool()` + sidecar `TOOL_METADATA` registry — engine v3.0.0 major bump
- ⏳ **P4.2** `spec/reference/CANVAS_VS_ARTIFACT.md` decision doc (no migration; canvases stay inline read-only)
- ⏳ **P4.3** Subagent pilot for `portfolio_analysis` (Vercel-native subagent pattern; context-heavy read with `toModelOutput` summarization)
- ⏳ **P4.4** `spec/reference/PRISMA_VS_DRIZZLE.md` decision doc (no migration; reverses recent S.247 migration)
- ⏳ **P4.5** `spec/reference/LONG_RUNNING_WORKFLOWS.md` decision doc (no migration today; trigger criteria for Audric Store generation Phase 5)
- ⏳ **P4.6** `spec/reference/LLM_CACHING_DECISION.md` decision doc (no Redis response cache; AI Gateway prompt cache already covers it)
- ⏳ **P4.7** USD-aware auto-execute rule correction (2-line edit in 2 rules + 1 dormant TODO comment per Round 3 trim)

### Deferred to follow-up SPEC

- `SPEC_BUNDLE_CAP_REMOVAL.md` — P7.6 (cap policy design doc) + P7.7 (BatchPermissionCard implementation). Trigger criteria: ≥10 users hit cap in 4 weeks OR Audric Pay ships send-to-many verb OR business use case lands.

## 4. Engine version cadence

- ✅ After Phase 1: no bump (host-only)
- ✅ After Phase 2: minor → **engine v2.19.3** (P2.1 schema nullable conversion)
- After Phase 5: no engine bump (host-only)
- After Phase 6: no engine bump unless we export a shared `sanitizeStreamError` helper
- After Phase 3: minor (intent classifier hook, repair, skill block wiring)
- After Phase 7.2: SDK minor bump (composeTx accepts `inputCoinFromStep`); engine minor possible
- After Phase 4.1: **major v3.0.0** (Tool type removed from public API)

## 5. Cross-references

- **Working plan** (full per-item rationale + AI SDK doc citations) → `.cursor/plans/ai_sdk_hardening_bc37c5e8.plan.md`
- **Stream resume sub-SPEC** → `spec/active/shipping/SPEC_AUDRIC_STREAM_RESUME.md` (P2.2)
- **Build tracker entries** (founder-local, gitignored) → `audric-build-tracker.md` S.284 (Phase 1), S.285 (Phase 2 4/5), S.286-S.289 (P2.2 / Stream Resume)
- **Spec inventory** → `spec/SPEC_INVENTORY_SSOT.md`

## 6. Promotion criteria

This SPEC moves to `spec/archive/v07f/` (or whichever version is active when it closes) when:

- All 7 phases marked SHIPPED above OR
- A clean deferral is documented for any open phase (with trigger criteria for a follow-up SPEC)

Until then it stays in `spec/active/shipping/` so the next session can pick up where the last one left off without re-litigating completed work.
