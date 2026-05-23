# v0.7e Phase 2 — Pre-Execution Audit (H1 scoping)

> **Status:** ✅ **ALL LOCKS STAMPED** (S.252 — 2026-05-22 ~15:00 AEST). Phase 2 is **GO for coding**. Originally audit-first scoping (S.250/S.251); founder ratified all 5 decisions in a single review pass.
>
> **Source SPECs synthesised:** `BENEFITS_SPEC_v07e.md` v1.1 LOCKED 2026-05-22 ~08:30 AEST (S.245), `V07E_PHASE_2_SURFACE_MAP.md`, `V07E_PHASE_1_EXECUTION_PLAN.md`, `AUDIT_ENGINE_FN_INJECTION_REFACTOR.md`, `V07E_D_QUESTION_AUDITS.md`.
>
> **HANDOFF row:** H1 (🟢 READY-TO-CODE) — "v0.7e Phase 2 — chat-shell cutover + 1A.2/1A.3 absorption + fn-injection refactor."

---

## LOCKED DECISIONS (S.252 — 2026-05-22)

| ID | Decision | Locked answer | Confidence |
|---|---|---|---|
| **Q1 / R-1 / D-8 / L-8** | Vitest infrastructure | **L-8A — configure vitest in web-v2 in sub-slice 2.0 (~1d)**. Tests are framework-agnostic engine unit tests; port as-is. | High (verified by spot-check of `harness-metrics.test.ts` + `prepare-bundle-tool.test.ts`) |
| **Q2** | Feature-loss matrix for 6 legacy `/api/engine/*` routes | **KILL ALL 6 — no feature loss.** All 6 have structural replacements in v2: resume / resume-with-input folded INTO `/api/chat` (per `web-v2/lib/audric/resume-outcome.ts`), regenerate / regen-append handled by AI SDK `useChat.reload()` / `.append()` (client-side), sessions / sessions/[id] replaced by web-v2 Persistent Chats (S.247). | High (verified by code inspection + grep) |
| **Q3** | Legacy `/api/history` | **DELETE — dies naturally with Phase 2.5 + Phase 6.** Audit doc was wrong on framing: legacy `/api/history` is **TX history** (not chat history), called only by engine's `transaction_history` tool via `audric-api.ts` HTTP path + `apps/web/app/new/dashboard-content.tsx` (which dies with apps/web). Phase 2.5 fn-injection eliminates the engine HTTP caller; Phase 6 eliminates the dashboard caller; legacy `/api/history` deletes cleanly with apps/web. | High (verified by reading `apps/web/app/api/history/route.ts` source + `audric-api.ts` engine client) |
| **D-3** | Voice routes (`/api/voice/*` 337 LoC + hooks/lib) | **RATIFY DELETE en-bloc with Phase 2.4.** Same risk class as S.245 pay_api delete. | High |
| **D-6** | `/api/build-id` + 4 version-check consumers | **RATIFY DELETE en-bloc with Phase 2.4.** Same zombie-code class as Phase 1A.3 deferrals. | High |
| **Scope-split** | Single-block vs 2.A+2.B | **Single block 2.0–2.5** per founder pick. Risk noted: if sub-slice 2.5 (fn-injection) hits surprise complexity, the whole 7–10d block slips with no mid-point smoke release. Acceptable given fn-injection scope is well-bounded (12 methods, 13 fetch sites per `AUDIT_ENGINE_FN_INJECTION_REFACTOR.md`). |  |

**Regenerate button decision (side note):** Web-v2 currently exposes no regenerate UI. Audit found this while verifying Q2. Decision: **DEFER** — no current user pain, no product gap, adding now would be speculative per `coding-discipline.mdc` Principle 2 (Simplicity First). Revisit if a user actually asks.

---

---

## 1. What Phase 2 actually is (post-v1.1 lock)

One structural shippable that merges THREE formerly-separate tracks:

| Track | Origin | What it touches |
|---|---|---|
| **A. Chat-shell cutover** | Former Phase 1B (absorbed into Phase 2 per v1.1) | Vercel rewrites: `/api/engine/chat` → web-v2 `/api/chat`; `/api/transactions/{prepare,execute}`; `/new`, `/chat/[sessionId]`. Create missing web-v2 route equivalents for 6 `/api/engine/{regenerate,regen-append,resume,resume-with-input,sessions,sessions/[id]}` routes (OR define feature-loss matrix — see Q2 below). Delete apps/web chat-shell routes/pages after 4-hop cutover smoke. |
| **B. Phase 1A.2 + 1A.3 absorbed work** | S.239 zombie-code lesson (surgical voice/build-id deletes were deferred in Phase 1A) | En-bloc deletes alongside chat-shell: `/api/voice/*` (337 LoC), voice hooks/lib, `/api/build-id`, version-check consumers (`useExpirySoonToast`, `useVersionCheck`, `ChunkErrorReloader`, `version-drift-check.ts`). |
| **C. Engine fn-injection refactor** | L-2 lock + `AUDIT_ENGINE_FN_INJECTION_REFACTOR.md` corrected scope | After `git mv` of `lib/engine/*` to web-v2, run the 6-phase plan: extract analytics/payments libs, add `AudricApi` (12 methods) to `@t2000/engine`, migrate 13 fetch sites, wire in `engine-factory.ts`, engine release, delete `AUDRIC_INTERNAL_KEY` / `audric-api.ts` HTTP plumbing. |

**Sub-slice numbering (per BENEFITS_SPEC §4):**
- 2.0 — vitest infra (Q1 dependent)
- 2.1 — `git mv` `apps/web/lib/engine/*` → web-v2/lib/engine/* (56 files + 37 tests)
- 2.2 — chat-shell cutover (rewrites + 6 route creations OR feature-loss matrix — Q2)
- 2.3 — create web-v2 `/api/swap/quote`, `/api/quote`, `/api/history` (Q3 — Q3 is the `/api/history` decision)
- 2.4 — delete remaining apps/web chat-shell + 1A.2/1A.3 voice/build-id en-bloc
- 2.5 — engine fn-injection P1–P6 (~14–20h per surface map)

---

## 2. The 3 founder-blocking D-questions (✅ ALL LOCKED S.252)

### Q1 (R-1 / D-8 / L-8) — Vitest infrastructure

**The decision.** Phase 2 migrates 37 `.test.ts` files from apps/web's vitest setup. web-v2 doesn't have vitest configured.

- **L-8A (RECOMMENDED per SPEC):** Configure vitest in web-v2 in sub-slice 2.0 (~1d). Tests migrate cleanly. Net cost ~1d up front, full test coverage preserved through the migration.
- **L-8B:** Delete the 37 tests during migration. Save ~1d. Lose test coverage exactly when the engine wiring is most likely to break under migration stress.

**Status:** ✅ **LOCKED L-8A (S.252).** Pre-lock founder asked: "are the tests relevant for v2 or do we need to rewrite them following Vercel chatbot AI template patterns?" Evidence: spot-checked `harness-metrics.test.ts` (pure-function unit tests on `TurnMetricsCollector` + helper detectors, no UI deps) and `prepare-bundle-tool.test.ts` (tool unit tests with mocked `@t2000/sdk`, no UI deps). Both are **framework-agnostic engine unit tests** that port unchanged. The "Vercel template patterns" framing is a category mismatch — template patterns are for chat E2E (Playwright); these are tool-correctness unit tests. Adding Playwright chat-E2E is a SEPARATE Phase 3+ decision, NOT bundled with this migration.

### Q2 — Feature-loss matrix for `/api/engine/*` routes

**The decision.** Six legacy `/api/engine/*` routes in apps/web: `regenerate`, `regen-append`, `resume`, `resume-with-input`, `sessions`, `sessions/[id]`. None have web-v2 equivalents today.

- **Option A:** Build all 6 web-v2 equivalents in sub-slice 2.2 (~0.5–1d additional). Full feature parity. Phase 2 ships clean.
- **Option B (stub + observe):** Stub all 6 with 410 Gone + telemetry log, decide which to revive in 30-day follow-up.
- **Option B (kill now):** Delete all 6 with feature loss.

**Status:** ✅ **LOCKED "KILL ALL 6 — NO FEATURE LOSS" (S.252).** Audit framing was too generous — implied any of the 6 might be needed. Code inspection proved otherwise. Evidence:

| Legacy route | v2 replacement | Status |
|---|---|---|
| `/api/engine/chat` | web-v2 `/api/chat` | ✅ Shipped |
| `/api/engine/resume` | Folded INTO web-v2 `/api/chat` via `extractResumeOutcomes()` per "D-3(c) lock: merge resume route into chat route" | ✅ Shipped (`web-v2/lib/audric/resume-outcome.ts`) |
| `/api/engine/resume-with-input` | Folded INTO web-v2 `/api/chat` via AI SDK modifiable-fields flow | ✅ Shipped |
| `/api/engine/regenerate` | AI SDK `useChat.reload()` (client-side primitive, not a server route) | ✅ Available via SDK (not yet wired to UI — see "Regenerate button decision" in LOCKED DECISIONS) |
| `/api/engine/regen-append` | AI SDK `useChat.append()` (client-side) | ✅ Available via SDK |
| `/api/engine/sessions` + `[id]` | web-v2 Persistent Chats (S.247) own endpoints | ✅ Shipped |

**Net:** the feature-loss matrix is EMPTY. All 6 routes are structural dead code in v2.

### Q3 — `/api/history` (legacy) migrate vs delete

**The decision.** apps/web's `/api/history` predates v0.7e Persistent Chats (S.247) which created a new `/api/history` in web-v2.

- **Option A:** Migrate the legacy `/api/history` route to web-v2 in sub-slice 2.3.
- **Option B:** Delete the legacy route with feature loss.

**Status:** ✅ **LOCKED "DELETE — dies naturally with Phase 2.5 + Phase 6" (S.252).**

**Audit framing was WRONG and needs correction.** The audit doc speculated the legacy route "may serve sidebar pagination from before persistent chats; reports surface; one-off CLI." Code reading shows legacy `/api/history` is a **TRANSACTION-HISTORY endpoint** (calls `getTransactionHistory()`, returns on-chain tx records), not a chat-history endpoint. The path collision with web-v2's new `/api/history` (chat) is coincidental — different domains entirely.

Actual callers of legacy `/api/history` (TX):
1. Engine's `transaction_history` tool via `packages/engine/src/audric-api.ts` (HTTP roundtrip from engine → audric/web)
2. `apps/web/app/new/dashboard-content.tsx` (legacy dashboard UI; dies with apps/web in Phase 6)

**Order of operations:**
- Phase 2.5 (engine fn-injection) replaces `audric-api.ts` HTTP calls with injected JS function pointers in `ToolContext.audricApi` → engine HTTP caller eliminated
- Phase 6 (apps/web death) deletes `dashboard-content.tsx` → UI caller eliminated
- Legacy `/api/history` then has zero callers → deletes cleanly with apps/web

No separate migration or rewrite needed. The audit's "migrate vs delete" framing implied a choice; the actual path is "let it die in place when its callers die."

---

## 3. Items audit recommends but NOT founder-ratified (✅ BOTH RATIFIED S.252)

| ID | Item | Status | Risk |
|---|---|---|---|
| D-3 | Voice routes (`/api/voice/*` 337 LoC + hooks/lib) | ✅ **RATIFIED DELETE** (S.252) — en-bloc with Phase 2.4 | Low — same class as S.245 pay_api delete (no callers in web-v2; deferred from Phase 1A.2) |
| D-6 | `/api/build-id` + 4 version-check consumers | ✅ **RATIFIED DELETE** (S.252) — en-bloc with Phase 2.4 | Low — deferred from Phase 1A.3 with the same zombie-code logic; consumers don't run in web-v2 |

---

## 4. Effort estimate (3 sources, increasing realism)

| Source | Estimate | Note |
|---|---|---|
| BENEFITS_SPEC §1.3 (v1.0) | 3–4d | Pre-v1.1, before Phase 1B absorption |
| BENEFITS_SPEC v1.1 (today) | **5–7d** | Includes absorbed work + fn-injection |
| `V07E_PHASE_2_SURFACE_MAP.md` §6 | **45–68h (6–9d)** | Surface-level walk; flags components migration tail (~8–16h) |
| Pre-execution audit (this doc) | **7–10d realistic** | If all 3 Qs locked + no scope changes mid-flight |

**Recommended scope-split** (if 7–10d is too long for one block):
- **Phase 2.A** — vitest + lib/engine migration + fn-injection (~3–4d, ship engine release)
- **Phase 2.B** — chat-shell cutover + Phase 1A.2/1A.3 deletes (~3–4d, structural)

The split reduces blast radius per ship and gives a natural mid-Phase-2 founder smoke point.

---

## 5. Production code surface (concrete files)

Source: `V07E_PHASE_2_SURFACE_MAP.md`.

**Migrate (`git mv` + import updates):**
- `apps/web/lib/engine/*` → `apps/web-v2/lib/engine/*` — 56 source files, 37 tests
- ~100 chat-coupled `apps/web/lib/*` files (~30k LoC): `portfolio.ts`, `transaction-history.ts`, `rates.ts`, `auth.ts`, `prisma.ts`, `identity/*`, `redis/*`, `jobs/*`, harness/chip libs
- Chat-coupled `apps/web/components/*` (~35k LoC, mostly `components/engine/*`) — partial migrate; delete where web-v2 V2 cards already exist
- Hooks: `useAgent.ts`, `executeToolAction.ts`

**Create in web-v2:**
- `apps/web-v2/app/api/engine/{regenerate,regen-append,resume,resume-with-input,sessions,sessions/[id]}/route.ts` (Q2 dependent)
- `apps/web-v2/app/api/{swap/quote,quote,history}/route.ts` (Q3 dependent for history)
- `apps/web-v2/vitest.config.ts`, `vitest.setup.ts` (Q1 dependent)
- `apps/web-v2/lib/analytics/{spending,yield-summary}.ts`, `lib/payments.ts` (fn-injection extractions)

**Rewrite config:**
- `apps/web/next.config.ts` — path-remap `/api/engine/chat` → web-v2 `/api/chat` + rewrites for transactions + `/new` + `/chat/:sessionId`

**Delete from apps/web (Phase 2.4 + absorbed 1A.2/1A.3):**
- `app/api/engine/*` (6 routes; chat alone ~1,705 LoC per execution plan)
- `app/api/transactions/{prepare,execute}` (prepare ~773 LoC, execute ~169 LoC)
- `app/api/swap/quote`, `app/api/quote`, `app/api/history`
- `app/new`, `app/chat/[sessionId]`
- `app/api/voice/*` (3 routes), voice hooks/lib
- `app/api/build-id` + 4 version-check consumers

**Engine package (`packages/engine/`):**
- New: `audric-api.ts`, `ToolContext.audricApi` field in `types.ts`
- Modified: 7 tool files (13 fetch sites): `balance.ts`, `portfolio-analysis.ts`, `history.ts`, `spending.ts`, `yield-summary.ts`, `activity-summary.ts`, `receive.ts`

**STAYS in apps/web until Phase 5** (per v1.1 L-8, NOT Phase 2): `lib/marketing/*`, legal page components. MPP libs already DELETED per S.245 — the surface map's MPP-shim rows are stale.

---

## 6. Stale-doc reconciliation needed

Before execution, reconcile these doc drifts:

1. `V07E_PHASE_2_SURFACE_MAP.md` §3.1 — MPP-shim rows describe code deleted in S.245 (D-2 reframe). Update or strike.
2. `BENEFITS_SPEC_v07e.md` §7 + §8 G5/G6 — describe pre-S.245 D-2 deferral. v1.1 banner overrides, but the table text itself is stale. Either patch the table or add a banner note.
3. `V07E_D_QUESTION_AUDITS.md` — doesn't address Q2 (feature-loss matrix) or Q3 (`/api/history`). Either add them as D-9 / D-10, or document in HANDOFF.

---

## 7. Open vs locked summary (✅ FULLY LOCKED S.252)

| ID | Status | Owner |
|---|---|---|
| D-1 (dead code) | ✅ Locked by audit (Phase 1A) | — |
| D-2 (pay_api) | ✅ Locked S.245 B+ (DELETE) | — |
| D-3 (voice) | ✅ **Ratified DELETE (S.252)** | — |
| D-4 (payments) | ✅ Locked by audit (DELETE Phase 1A) | — |
| D-5 (L-4 copy-port) | ✅ Locked S.244 | — |
| D-6 (build-id) | ✅ **Ratified DELETE (S.252)** | — |
| D-7 (`apps/web-legacy/`) | ✅ Locked S.244 (DELETE 24h grace) | — |
| **D-8 / R-1 / L-8 (Vitest)** | ✅ **LOCKED L-8A (S.252)** | — |
| **Q2 (feature-loss matrix)** | ✅ **LOCKED kill all 6 / no feature loss (S.252)** | — |
| **Q3 (`/api/history`)** | ✅ **LOCKED delete with Phase 2.5+6 (S.252)** | — |
| **Scope split** | ✅ **LOCKED single-block 2.0–2.5 (S.252)** | — |

---

## 8. Next-session execution checklist (post-lock S.252)

All founder locks stamped. The next session opens Phase 2 code with this checklist:

1. ✅ **Q1 LOCKED L-8A** — proceed with Phase 2.0 vitest setup.
2. ✅ **Q2 LOCKED kill all 6** — sub-slice 2.2 becomes a pure deletion task (no routes to create).
3. ✅ **Q3 LOCKED delete with 2.5+6** — sub-slice 2.3 is now `/api/swap/quote` + `/api/quote` only; `/api/history` (TX) needs no migration.
4. ✅ **D-3 + D-6 RATIFIED DELETE** — Phase 2.4 absorbed-deletes proceed as planned.
5. **Phase 2.0 spike (THIS SESSION S.252)** — configure web-v2 vitest + copy ONE engine test file to validate paths BEFORE bulk `git mv`. Catches path / config issues early.
6. **Phase 2.1 start (NEXT SESSION)** — bulk `git mv apps/web/lib/engine/* apps/web-v2/lib/engine/*` (56 files + 37 tests); fix import paths.
7. **Sub-slice 2.2** — pure deletion of 6 `/api/engine/*` routes (no creation).
8. **Sub-slice 2.3** — create web-v2 `/api/swap/quote` + `/api/quote` only.
9. **Sub-slice 2.4** — chat-shell + voice + build-id en-bloc delete.
10. **Sub-slice 2.5** — engine fn-injection P1–P6 (14–20h per surface map).
11. **Single-block ship** — no mid-Phase smoke release per founder pick; risk-noted in scope-split lock.

---

## 9. Go/no-go assessment — POST-LOCK

**Verdict: ✅ GO ON CODING (S.252 stamp).**

Post-lock revised effort: **6–8d realistic** (down from 7–10d). Two locks turned out cheaper than the worst-case audit estimate:
- Q2 → kill all 6 (zero `/api/engine/*` route creation in 2.2; saves ~0.5–1d vs Option A)
- Q3 → no migration needed (zero `/api/history` rebuild in 2.3; saves ~0.5d vs Option A)
- Q1 → L-8A keeps tests in motion (~1d up-front cost, but earns it back by catching breakage in 2.5 fn-injection)

Net: the 5–7d v1.1 SPEC estimate is now realistic, NOT optimistic. The audit's 7–10d cushion factored in worst-case Q1/Q2/Q3 outcomes that didn't materialise.

**Risk register (residual):**
- Single-block scope means sub-slice 2.5 (fn-injection) complexity surprises slip the whole block. Fn-injection scope is well-bounded (12 methods, 13 fetch sites per `AUDIT_ENGINE_FN_INJECTION_REFACTOR.md`), so risk is contained but not zero.
- Vitest config in web-v2 is straightforward (Vercel template tooling already has the deps), but `tsconfig` path mappings may surprise — Phase 2.0 spike validates this BEFORE the bulk `git mv`.
- 37 tests use `@/lib/...` path imports that depend on `tsconfig.paths` matching apps/web's; Phase 2.0 spike must verify.

---

## 10. Audit corrections worth surfacing for future agents

These are documentation lessons from the pre-execution audit (S.251 → S.252):

1. **Q2 framing was too generous.** The audit listed "6 routes that need either build or kill" as an open question. Code inspection (post-audit) proved 5 of 6 already have shipped structural replacements in v2; the 6th (regenerate) needs only an AI SDK client-side call. The audit could have done this code inspection upfront and surfaced the lock without the founder round-trip. **Lesson: when the SPEC says "feature-loss matrix", verify via grep before treating it as open.**

2. **Q3 was misidentified as a chat-history endpoint.** The audit relied on SPEC text ("predates v0.7e Persistent Chats which created a new `/api/history` in web-v2") and assumed semantic equivalence with the path collision. Actual reading of `apps/web/app/api/history/route.ts` revealed it's a TX-history endpoint. The new web-v2 `/api/history` (S.247) is a chat-history endpoint. Same path, different domains. **Lesson: when two routes share a path, read both — don't assume.**

3. **Audit doc said "Q1 is the only HANDOFF-flagged blocker."** True but slightly misleading — Q1 was the only blocker pre-audit, but Q2+Q3 became visible during the audit pass and were correctly surfaced. Future audits should call out which questions emerged from the audit itself vs. which were pre-existing.

---

## 11. Phase 2.1 Sub-Decision Matrix (S.253 pre-Wave 1 discovery — 2026-05-22 ~16:30 AEST)

> **⚠️ S.253 LATER FINDING (2026-05-22 ~18:30 AEST):** This sub-matrix was written assuming v0.7e Phase 2 (engine wrapper migration to web-v2) was the next blocker. The S.253 audit trail later revealed Phase 6.5 Groups A+B+C SHIPPED 2026-05-20 per `audric-build-tracker.md` S.199/S.200/S.201 (the SPEC was never updated). The remaining v0.7e tail is likely **~3-5d of marketing/legal/cron copy-port + DNS flip**, not a 6-8d Phase 2 engine-migration block. **This matrix remains valid forward-planning** IF post-cutover cleanup still scopes a `apps/web/lib/engine/*` migration — but execution is NOT current next-session work. See `audric-build-tracker.md` S.253 for the full re-framing.

Before the bulk `git mv apps/web/lib/engine/* → apps/web-v2/lib/engine/*`, a discovery pass surfaced the actual dep fan-out (much smaller than SPEC §1 estimated). This sub-matrix drives Phase 2.1 execution.

### 11.1 Actual file counts (vs SPEC §1 estimates)

| What | SPEC est. | Discovered | Notes |
|---|---|---|---|
| `apps/web/lib/engine/*` source | 56 | **45** | Includes `account-age-gate.ts`, `advice-tool.ts`, `bundle-*`, `confirm-detection.ts`, `engine-context.ts` (67k LoC), `engine-factory.ts` (58k LoC), `fast-path-bundle.ts`, `harness-metrics.ts`, `intent-dispatcher.ts`, `permission-tiers-client.ts`, `post-write-*`, `prepare-bundle-tool.ts`, `spec-consistency.ts`, `upstash-*-cache.ts`, etc. |
| `apps/web/lib/engine/*` tests | 37 | **32** | Inline `.test.ts` (10) + `__tests__/` subdir (22) |
| Chat-coupled `apps/web/lib/*` fan-out | "~100 files / ~30k LoC" | **15 unique dep paths / ~1,126 LoC migrate** | SPEC included ALL chat-shell coupling (cards/UI/hooks); actual lib/engine fan-out is ~30x smaller |

### 11.2 Per-dep classification

8 of 15 deps already exist in web-v2 → REUSE. 7 of 15 need migration. 1 needs a precursor fix.

| `@/lib/X` (engine imports this) | Tier | LoC | Web-v2 status | Decision |
|---|---|---|---|---|
| `env` | A | — | ✅ Exists (different schema, but `process.env` derived) | **REUSE** |
| `prisma` | A | — | ✅ Exists | **REUSE** |
| `portfolio` | A | — | ✅ Exists (identical exports verified: `Portfolio`, `WalletSnapshot`, `getPortfolio`, `prewarmPortfolio`, `getWalletSnapshot`, `getTokenPrices`) | **REUSE** |
| `sui-rpc` | A | — | ✅ Exists | **REUSE** |
| `suins-cache` | A | — | ✅ Exists | **REUSE** |
| `identity/reserved-usernames` | A | — | ✅ Exists | **REUSE** |
| `identity/validate-label` | A | — | ✅ Exists | **REUSE** |
| `protocol-registry` | A | 44 | ✅ Exists in both (shape verification deferred — spot-check during Wave 1) | **REUSE** (verify shapes match; if drift, dedupe) |
| `interactive-harness` | B | 104 | ❌ Missing | **MIGRATE** |
| `rates` | B | 99 | ❌ Missing | **MIGRATE** (canonical NAVI rates fetcher) |
| `transaction-history` | B | 320 | ❌ Missing | **MIGRATE** (will become unused after Phase 2.5 fn-injection but needed during transition) |
| `upstash-tx-history-cache` | B | 174 | ❌ Missing | **MIGRATE** (companion to transaction-history) |
| `redis` (top-level) | B | 10 | ❌ Missing | **MIGRATE** (tiny — likely a re-export) |
| `redis/user-financial-context` | B | 164 | ❌ Missing | **MIGRATE** (UFC store, engine-specific) |
| `identity/contact-schema` | B | 211 | ❌ Missing | **MIGRATE** (dead in H3.4; migrate as inert support) |
| `generated/prisma/client` | C | — | ⚠️ Cross-coupled (web-v2 imports from `../../../../web/lib/generated/prisma/client` today) | **PRECURSOR FIX** — see §11.3 |

Tier B migration total: **~1,126 LoC across 7 files.**

### 11.3 Precursor fix — Prisma generation path

Discovery surfaced a pre-existing cross-package coupling: `apps/web-v2/app/api/chat/route.ts` and `apps/web-v2/lib/prisma.ts` BOTH import Prisma types via relative path `../../../../web/lib/generated/prisma/client`. This will break when apps/web dies (Phase 6) regardless of Phase 2.1 actions.

**Fix (~20 min):**
1. Edit `apps/web-v2/prisma/schema.prisma` — add `output = "../lib/generated/prisma"` to the generator block (matches apps/web pattern).
2. `pnpm --filter @audric/web-v2 exec prisma generate`
3. Patch the 2 web-v2 files using the cross-package path → `@/lib/generated/prisma/client`.
4. Typecheck web-v2.

Net: web-v2 owns its Prisma generation. apps/web's generation can die with apps/web.

### 11.4 Execution waves

| Wave | Action | Est. | Validation |
|---|---|---|---|
| **Pre-Wave** | Precursor Prisma fix (§11.3) | ~20 min | typecheck web-v2 |
| **Wave 1** | `git mv` 7 Tier-B lib files (apps/web → web-v2 — preserving git history); fix transitive imports in moved files | ~1h | typecheck web-v2 |
| **Wave 2** | `git mv apps/web/lib/engine/*` → `apps/web-v2/lib/engine/` (45 source + 32 tests + `__tests__/` subdir) | ~1.5–2h | vitest + typecheck web-v2 |
| **Wave 3** | Apps/web typecheck WILL show broken imports from deleted lib/engine — those callers (chat-shell routes) are scheduled for Phase 2.2/2.4 delete. Document as expected, don't fix yet. | ~30 min | Single commit + push |

**Realistic total: 3–4h for Phase 2.1 in one session, or split at Wave 1/2 boundary for a clean two-session ship.**

### 11.5 Risk register

| Risk | Mitigation |
|---|---|
| Web-v2 portfolio.ts exports drifted from apps/web's | Spot-check exports verified IDENTICAL during discovery (S.253). Type signatures match. |
| Web-v2 env.ts schema doesn't expose vars engine code needs | env.ts in web-v2 was just confirmed in S.252 to validate the required server-side vars; spot-check during Wave 1 typecheck. |
| protocol-registry shapes drifted between apps/web and web-v2 | Verify during Wave 1 spot-check; if drift, dedupe to one canonical version (likely web-v2's wins). |
| Prisma client path resolution surprises after the precursor fix | The fix mirrors apps/web's pattern exactly; same Prisma version; same generator config. Low risk. |
| Engine tests import `@/lib/generated/prisma/client` and break post-Wave-2 | Pre-Wave fix ensures `@/lib/generated/prisma/client` resolves in web-v2; tests should pass without further touch. |
| Tests have additional `@/` imports we haven't mapped | Discovery showed engine tests import only 2 lib/* paths (already covered). Low risk. |
| Web-v2's @ alias points to wrong root after move | vitest.config.ts already aliases @ to web-v2 root (verified working in S.252). Low risk. |

### 11.6 What this matrix supersedes

- Surface map §1 file counts: 56 source / 37 tests → revised to **45 / 32** (use this matrix).
- Surface map §6 "components migration tail ~8-16h": OUT OF SCOPE for Phase 2.1; that's `components/engine/*` (a separate slice that lands later in the Phase 2 block, not as part of the lib/engine migration).
- Audit doc §6 stale-doc reconciliation item 1 (MPP-shim rows): already banner-patched in S.252; surface map's file-count rows now also superseded by this matrix.

---

## 12. Sister entries

- v0.7e v1.1 SPEC banner (LOCKED 2026-05-22 ~08:30 AEST) → `spec/active/BENEFITS_SPEC_v07e.md`
- D-question lock audit (updated S.252 with Q2 + Q3 as D-9 / D-10) → `spec/active/V07E_D_QUESTION_AUDITS.md`
- Phase 2 surface map → `spec/active/V07E_PHASE_2_SURFACE_MAP.md`
- Fn-injection refactor scope → `spec/active/AUDIT_ENGINE_FN_INJECTION_REFACTOR.md`
- Phase 1 plan (origin for 1A.2/1A.3) → `spec/active/V07E_PHASE_1_EXECUTION_PLAN.md`
- Build tracker → S.250 (P2 batch close + audit kickoff), S.251 (audit + founder Qs surfaced), S.252 (all locks stamped + audit corrections + Phase 2.0 vitest spike)
