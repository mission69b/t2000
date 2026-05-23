# v0.7e Phase 1 Execution Plan

> **Status:** DRAFTED 2026-05-21 ~21:00 AEST.
> **Purpose:** Concrete delete-and-smoke checklists for Phase 1 sub-slices. Each slice has a verifiable goal, pre-deploy smoke, ship action, post-deploy smoke, rollback step. Built from D-question audits + G3 cutover-semantics finding + rewrite-coverage check.
> **Critical correction from SPEC §4 Phase 1:** the chat-shell has NOT been cut over yet (audit-finding 2026-05-21 ~21:00). What SPEC §4 called "Phase 1" splits into Phase 1A (genuinely-safe deletes today) + Phase 1B (requires rewrite-with-remap work — actually Phase 2 work).

---

## Pre-condition: rewrite-coverage map (audit-finding 2026-05-21 ~21:00 AEST)

Per `apps/web/next.config.ts:114-166`, the COMPLETE list of rewrites today:

| Source path | Status | Action |
|---|---|---|
| `/pay/:slug` | ✅ REWRITE EXISTS | Page directory deletion safe |
| `/api/payments/:slug` | ✅ REWRITE EXISTS | Route deletion safe (cutover pattern) |
| `/api/payments/:slug/verify` | ✅ REWRITE EXISTS | Route deletion safe (cutover pattern) |
| `/invoice/:slug` | ✅ REWRITE EXISTS (→ web-v2 `/pay/:slug`) | Page directory deletion safe |
| `/settings` + `/settings/:path*` | ✅ REWRITE EXISTS | Page directory deletion safe |
| `/api/internal/payments` | ✅ REWRITE EXISTS (S.229 cutover live) | Already deleted |
| `/api/portfolio` | ✅ REWRITE EXISTS (G3 cutover live) | Already deleted |
| `/api/analytics/portfolio-history` + yield-summary + activity-summary + spending | ✅ REWRITE EXISTS (S.228/S.229 cutover live) | Already deleted |
| `/:username` catch-all | ✅ REWRITE EXISTS (Store) | Page directory deletion safe |

**NOT REWRITTEN (Phase 1.1 cannot simply delete):**

| Source path | Status | Phase 1A action |
|---|---|---|
| `/new` (chat-shell entry page) | ❌ NO REWRITE | **REQUIRES rewrite addition + web-v2 verification BEFORE delete** |
| `/chat/:sessionId` (chat-shell page) | ❌ NO REWRITE | **REQUIRES rewrite addition + web-v2 verification BEFORE delete** |
| `/api/engine/chat` | ❌ NO REWRITE; web-v2 uses `/api/chat` (DIFFERENT PATH) | **REQUIRES rewrite with path remap** |
| `/api/engine/regenerate`, `regen-append`, `resume`, `resume-with-input`, `sessions`, `sessions/[id]` | ❌ NO REWRITE; web-v2 has no equivalents | **REQUIRES rewrite + web-v2 route creation** OR deletion-with-feature-loss |
| `/api/transactions/execute` + `/api/transactions/prepare` | ❌ NO REWRITE; web-v2 has equivalents (same paths) | **REQUIRES simple rewrite addition; then standard cutover delete** |
| `/api/swap/quote` + `/api/quote` | ❌ NO REWRITE; web-v2 has no equivalents | **REQUIRES web-v2 route creation FIRST** |
| `/api/history` | ❌ NO REWRITE; web-v2 has its own history via lib/db queries | **REQUIRES decision: delete history capability OR migrate to web-v2** |
| `/api/payments` (root LIST) | ❌ NO REWRITE; web-v2 has `/api/internal/payments` (different auth model) | **DELETE in Phase 1.1 along with PayPanel (no migration; web-v2 chat-shell renders lists differently)** |
| `/api/voice/*` (3 routes) | ❌ NO REWRITE; web-v2 has no voice | **DELETE per D-3 Option A (matches v0.7c audit-3 zero-usage)** |
| `/api/build-id` | ❌ NO REWRITE; web-v2 has no version-check | **DELETE per D-6 revised recommendation** |

## Phase 1A — SAFE TO SHIP TODAY (no chat-shell cutover work)

These slices are independent of the chat-shell cutover and can ship in v0.7e Phase 1A immediately.

### Slice 1A.1 — Page directory deletion sweep (~1h)

Page directories that ALREADY have rewrites (smoke-confirmed cutover pattern: deletion flips from 2-hop apps/web → 4-hop web-v2 proxy).

**Targets:**

| Page | LoC | Pre-delete smoke | Post-delete smoke target |
|---|---|---|---|
| `app/pay/[slug]/page.tsx` + subdirectory | (TBD) | `curl -sI https://audric.ai/pay/test123` → `syd1::iad1::` (apps/web origin) | `syd1:syd1:syd1::iad1::` (4-hop proxy to web-v2) |
| `app/invoice/[slug]/page.tsx` | ~10 LoC | `curl -sI https://audric.ai/invoice/test123` → `syd1::iad1::` | `syd1:syd1:syd1::iad1::` |
| `app/settings/page.tsx` + sub-pages | (TBD) | `curl -sI https://audric.ai/settings` → `syd1::iad1::` | `syd1:syd1:syd1::iad1::` |
| `app/settings/contacts/page.tsx` | (TBD) | `curl -sI https://audric.ai/settings/contacts` → `syd1::iad1::` | `syd1:syd1:syd1::iad1::` |
| `app/[username]/page.tsx` (Store catch-all) | (TBD) | `curl -sI https://audric.ai/test-username` → `syd1::iad1::` | `syd1:syd1:syd1::iad1::` |

**Ship steps:**
1. Pre-deploy smoke: capture x-vercel-id per page (expect 2-hop).
2. Delete page directory + any orphaned components (e.g. `components/panels/PayPanel.tsx` if only used by `/pay/[slug]`).
3. `pnpm --filter @audric/web typecheck && lint && test` — all green.
4. Commit + push.
5. Post-deploy smoke (~60s after push): per page, capture x-vercel-id (expect 4-hop).
6. ROLLBACK: revert commit + push; smoke returns to 2-hop pattern.

**Estimated LoC delete:** ~3,000-5,000 (pages + their components + their custom hooks). Final number captured per-page during execution.

**Verification gate:** All 5 page deletions show 4-hop proxy in post-deploy smoke. No errors in Vercel logs for 1h post-ship.

### Slice 1A.2 — Voice routes + hooks deletion (~30m)

Per D-3 Option A (matches v0.7c audit-3 zero-usage).

**Targets:**

| File | LoC |
|---|---|
| `app/api/voice/status/route.ts` | 30 |
| `app/api/voice/synthesize/route.ts` | 165 |
| `app/api/voice/transcribe/route.ts` | 142 |
| `hooks/useVoiceStatus.ts` | TBD |
| `hooks/useVoiceMode.ts` | TBD |
| `next.config.ts:37` CSP `microphone=(self)` → `microphone=()` | -1 word |

**Ship steps:**
1. Pre-deploy smoke (zero-usage assertion): `vercel logs --since 30d | grep '/api/voice/'` — confirm <10 hits/day.
2. Delete 3 routes + 2 hooks + any voice UI components.
3. Remove `microphone=(self)` from CSP.
4. `pnpm --filter @audric/web typecheck && lint && test`.
5. Commit + push.
6. Post-deploy smoke: `curl -sI https://audric.ai/api/voice/transcribe` → 404 expected (NO REWRITE; deletion is total).

**Verification gate:** voice routes 404; chat-shell still works (apps/web chat-shell exists; voice button absent from UI).

### Slice 1A.3 — Build-id + version-check deletion (~30m)

Per D-6 revised recommendation.

**Targets:**

| File | LoC |
|---|---|
| `app/api/build-id/route.ts` | TBD |
| `hooks/useExpirySoonToast.ts` | TBD |
| `hooks/useVersionCheck.ts` | TBD |
| `components/shell/ChunkErrorReloader.tsx` | TBD |
| `lib/version-drift-check.ts` | TBD |
| `next.config.ts` `RESOLVED_DEPLOYMENT_ID` references + `env.NEXT_PUBLIC_DEPLOYMENT_ID` | ~10 LoC |
| `lib/env.ts` `NEXT_PUBLIC_DEPLOYMENT_ID` schema entry | 1 LoC |

**Ship steps:**
1. Pre-deploy smoke: `curl -sI https://audric.ai/api/build-id` → 200 (currently apps/web-served).
2. Delete route + 4 chat-shell consumers + remove next.config.ts version-check infrastructure.
3. `pnpm --filter @audric/web typecheck && lint && test`.
4. Commit + push.
5. Post-deploy smoke: `curl -sI https://audric.ai/api/build-id` → 404.

**Verification gate:** build-id 404; chat-shell still works (loses version-check capability — same as web-v2's intentional non-feature).

### Slice 1A.4 — Dead-code cleanup (Memory + Settings stale paths) (~45m)

Per D-1 finding (route already gone from v0.7d Block A; UI is dead code).

**Targets:**

| File | LoC |
|---|---|
| `components/settings/MemorySection.tsx` | 184 |
| `app/settings/page.tsx` (entire page — rewritten to web-v2 anyway) | TBD |
| `next.config.ts:93-95` stale comment about `/api/user/memories` | 3 lines |

**Ship steps:**
1. Pre-deploy smoke: confirm `/settings` rewrite returns from web-v2 (`curl -sI https://audric.ai/settings` → 4-hop proxy).
2. Delete MemorySection + apps/web settings page.
3. Update stale comment in next.config.ts.
4. `pnpm --filter @audric/web typecheck && lint && test`.
5. Commit + push.
6. Post-deploy smoke: `/settings` still 4-hop proxy (web-v2 still serving).

**Verification gate:** settings page still works for users (web-v2 serves it); no apps/web dead UI hung around.

### Slice 1A.5 — Payments LIST + slug cutover (~45m)

Per D-4 (DELETE in Phase 1.1 along with PayPanel + slug routes).

**Targets:**

| File | LoC |
|---|---|
| `app/api/payments/route.ts` (LIST + CREATE) | 222 |
| `app/api/payments/[slug]/route.ts` (single GET) | TBD |
| `app/api/payments/[slug]/verify/route.ts` (verify POST) | TBD |
| `components/panels/PayPanel.tsx` (only caller of LIST) | TBD |

**Cutover semantics:**
- LIST route: NO REWRITE → DELETE = total (PayPanel which was the only user-facing consumer is also deleted)
- Slug + verify routes: REWRITE EXISTS → DELETE = cutover (2-hop → 4-hop proxy)

**Ship steps:**
1. Pre-deploy smoke: `curl -sI https://audric.ai/api/payments` → 401 (auth gate, apps/web origin); `curl -sI https://audric.ai/api/payments/test/verify` → 401 (apps/web origin).
2. Confirm web-v2's `/api/payments/[slug]` + verify are functionally equivalent (already done in audit).
3. Delete 3 routes + PayPanel + remove `app/api/payments/` directory entirely.
4. `pnpm --filter @audric/web typecheck && lint && test`.
5. Commit + push.
6. Post-deploy smoke:
   - LIST: `curl -sI https://audric.ai/api/payments` → 404 (no rewrite, no route)
   - Slug: `curl -sI https://audric.ai/api/payments/test/verify` → 4-hop proxy (web-v2 serves)

**Verification gate:** LIST 404 (acceptable — PayPanel removed; web-v2 chat-shell renders payment list differently); slug cutover working.

## Phase 1A Summary

| Slice | Effort | Risk | LoC delete | Cutover or total? |
|---|---|---|---|---|
| 1A.1 — Page directory sweep | ~1h | LOW | ~3-5k | Mostly cutover (rewrites exist) |
| 1A.2 — Voice routes + hooks | ~30m | LOW | ~600 | Total (no rewrites, no web-v2 equivalent) |
| 1A.3 — Build-id + version-check | ~30m | LOW | ~400 | Total |
| 1A.4 — Memory/Settings dead-code | ~45m | LOW | ~250 | Cleanup of unreachable code |
| 1A.5 — Payments LIST + slug cutover | ~45m | MEDIUM | ~500 | Mixed (LIST=total; slug=cutover) |
| **Phase 1A total** | **~3.5h** | LOW-MED | **~5-7k LoC** | — |

**Phase 1A acceptance gates:**
- All 5 page directories deleted (1A.1)
- Voice/* routes 404 (1A.2)
- Build-id 404 (1A.3)
- MemorySection gone (1A.4)
- Payments LIST 404, slug cutover working (1A.5)
- Vercel logs show no 5xx errors during 24h post-ship observation
- Zero Sentry alerts triggered

## Phase 1B — REQUIRES chat-shell cutover work (defer to Phase 2)

Phase 1B is the chat-shell deletion, but it cannot ship until web-v2 has:

1. Routes at compatible paths (or path-remapping rewrites added to apps/web's `next.config.ts`)
2. Functional equivalence verified per route (some web-v2 routes don't exist yet: regenerate, regen-append, resume, resume-with-input, sessions)
3. Migration of test coverage (e.g. `__tests__/spec30-idor-regression.test.ts` imports apps/web routes)

**Phase 1B scope (now Phase 2 per architectural correction):**

| Slice | Routes | Required prep |
|---|---|---|
| 1B.1 — `/api/transactions/*` cutover | execute (169 LoC) + prepare (773 LoC) | Add 2 rewrites; web-v2 equivalents already exist |
| 1B.2 — `/api/engine/chat` cutover | chat (1,705 LoC) | Add rewrite with path remap to web-v2's `/api/chat` |
| 1B.3 — `/api/engine/*` (5 more routes) | regenerate + regen-append + resume + resume-with-input + sessions + sessions/[id] | Create web-v2 equivalents OR define feature-loss matrix |
| 1B.4 — `/new` + `/chat/[sessionId]` page cutover | 2 chat-shell pages | Add 2 page rewrites; web-v2 has equivalents |
| 1B.5 — `/api/history` decision | history (70 LoC) | Decide: migrate / delete with feature loss |
| 1B.6 — `/api/swap/quote` + `/api/quote` decision | 2 routes (104 LoC) | Web-v2 doesn't have equivalents — likely DELETE in chat-shell (swap UI lives there) |
| **Phase 1B total** | ~3,000 LoC delete + ~1-2 days web-v2 work | High complexity |

**Phase 1B is now formally part of v0.7e Phase 2.** SPEC §4 Phase 1 splits to "Phase 1A (safe-today) + Phase 1B (requires Phase 2 prep)."

## Forward windows

- **Ready to ship after founder lock:** Phase 1A (all 5 slices, ~3.5h total).
- **Founder lock required before Phase 1A ship:**
  - D-2 finding accepted: v0.7e Phase 5 deferred to v0.7f (apps/web survives as MPP shim).
  - D-3 Option A accepted: voice DELETE.
  - D-6 revised default accepted: build-id DELETE.
  - The other D-decisions (D-1, D-4, D-5, D-7) have unambiguous defaults.
- **Phase 1A ship sequencing recommendation:** ship slices 1A.4 + 1A.5 first (dead-code + payments, ~1.5h, LOW-MED risk) → soak ~1h → ship 1A.2 + 1A.3 (voice + build-id, ~1h, LOW risk) → soak ~1h → ship 1A.1 last (page directory sweep, ~1h, has the most cutover-pattern smoke checks needed).

## Cross-references

- v0.7e SPEC: `BENEFITS_SPEC_v07e.md` §4 Phase 1
- D-question audits: `V07E_D_QUESTION_AUDITS.md` (D-1 through D-7)
- Phase 0 baseline: `V07E_PHASE_0_BASELINE.md`
- Cutover semantics (4-hop vs 2-hop x-vercel-id): `audric-build-tracker.md` G3 stamp (S.231)
