# v0.7e D-Question Audits — Founder Decision Brief

> **Status:** **ALL OUTSTANDING D-QUESTIONS LOCKED 2026-05-22 ~15:00 AEST (S.252).** The final 5 (D-3 voice / D-6 build-id / D-8 vitest / NEW D-9 feature-loss matrix / NEW D-10 legacy `/api/history`) ratified in one founder pass. Combined with prior S.244 + S.245 locks (D-1, D-2, D-4, D-5, D-7), every D-question for v0.7e Phase 2 now has a stamped answer.
>
> | Lock | Resolution | Source |
> |---|---|---|
> | **D-2 (REFRAMED)** | **B+ — DELETE entirely + redesign in Audric Store SPEC.** v0.7e ships Phases 1-5 FULLY. apps/web dies en bloc. Engine `pay_api` + `mpp_services` tools DELETED. web-v2 pay_api scaffolding DELETED. Store SPEC (v0.7f/v0.7g) takes pay_api as a Commerce primitive on a clean-slate redesign. | Founder lock S.245 |
> | D-3 | **RATIFY DELETE (S.252)** — voice routes/hooks/lib en-bloc with Phase 2.4. Same risk class as S.245 pay_api delete. | Founder lock S.252 |
> | D-5 | **L-4 (pure copy-port)** — no marketing redesign in v0.7e; legal-vetted text preserved verbatim. | Founder lock S.244 |
> | D-6 | **RATIFY DELETE (S.252)** — `/api/build-id` + 4 version-check consumers en-bloc with Phase 2.4. | Founder lock S.252 |
> | D-7 | **DELETE apps/web-legacy/ with 24h grace** post-Phase 5. git history is SSOT. | Founder lock S.244 |
> | **D-8 / R-1 / L-8 (Vitest)** | **L-8A — configure vitest in web-v2 in sub-slice 2.0 (~1d).** Tests are framework-agnostic engine unit tests; port as-is. Spike SHIPPED in S.252 (7 tests pass). | Founder lock S.252 |
> | **D-9 (NEW — feature-loss matrix for 6 `/api/engine/*` routes)** | **KILL ALL 6 — no feature loss.** All 6 have structural replacements in v2 (resume / resume-with-input folded into `/api/chat`, regenerate / regen-append → AI SDK `useChat.reload()` / `.append()` client-side, sessions / sessions/[id] → web-v2 Persistent Chats). | Founder lock S.252 |
> | **D-10 (NEW — legacy `/api/history` TX endpoint)** | **DELETE — dies naturally with Phase 2.5 + Phase 6.** Audit doc had wrong framing (called it chat history; it's actually TX history). Used only by engine's `transaction_history` tool via `audric-api.ts` HTTP path (eliminated by Phase 2.5 fn-injection) + `apps/web/app/new/dashboard-content.tsx` (dies with apps/web in Phase 6). No separate migration needed. | Founder lock S.252 |
>
> **D-2 reframe rationale (S.245):** pay_api is ALREADY dead in production for web-v2 users — web-v2 filters it out (`writeToolsForWebV2 = WRITE_TOOLS.filter((t) => t.name !== "pay_api")`). The original S.244 D-2=A (DEFER to v0.7f shim) was preserving a feature that's been gone since web-v2 became default chat ~3 days ago (v0.7d Phase 7). Per founder reframe: stop pretending. DELETE the legacy implementation cleanly; redesign as part of Audric Store SPEC alongside Commerce primitives (listings, payouts, creator splits). Net result: cleanest possible v2 codebase; pay_api returns when Store SPEC ships as a properly-designed primitive, not a port.
>
> **D-2 scope impact (vs S.244 lock):**
> - v0.7e Phase 5 RESTORED to scope (was deferred to v0.7f per S.244; now ships in v0.7e per S.245).
> - apps/web ~5k LoC MPP shim eliminated — apps/web dies en bloc at end of v0.7e.
> - Engine `pay_api` + `mpp_services` tools DELETED in S.245 (~605 LoC engine + ~100 LoC web-v2 + downstream cleanup).
> - V07F_FORWARD_MAP Stream A reframed from "Agentic Commerce Phase 1 pay_api migration" → "Audric Store SPEC clean-slate Commerce design."
>
> D-1, D-3, D-4, D-6 audit recommendations remain in this doc but were not part of the H1 lock sweep — defer to per-phase founder-locks at phase boundaries.
>
> Original (pre-lock) status: IN PROGRESS 2026-05-21 ~20:10 AEST. Captures evidence-backed recommendations for the 7 founder open questions (D-1 through D-7) in `BENEFITS_SPEC_v07e.md` §7. Each entry: question / agent default / audit evidence / revised recommendation / blocks-v0.7e? flag.

---

## D-2 — `services/*` migrate vs delete?

**Question:** Should we migrate the 3 `services/*` routes (complete, prepare, retry; 1,050 LoC) to web-v2 in Phase 3, or delete them in Phase 1?

**SPEC agent default:** AUDIT FIRST — if zero 30-day usage, DELETE.

**Audit findings (2026-05-21 ~20:10 AEST):**

1. **Apps/web has 3 services routes** with active callers in the chat-shell:
   - `hooks/useAgent.ts` (the pay_api turn dispatcher)
   - `hooks/executeToolAction.ts` (the pay_api 3-leg flow controller)
   - `components/engine/cards/mpp/TrackPlayer.tsx` (the audio/video result renderer)
   - `components/engine/cards/mpp/registry.tsx` (MppCard renderer registry)

2. **Web-v2 has NO `services/*` directory.** Confirmed via `ls apps/web-v2/app/api/services/` → "No such file or directory."

3. **Web-v2 EXPLICITLY EXCLUDES pay_api.** Direct quote from `apps/web-v2/lib/audric/sponsored-tx.ts:23-28`:
   > `pay_api` is intentionally EXCLUDED from web-v2's tool set (Phase 4b deferral 2026-05-19). The legacy `/api/services/{prepare, complete, retry}` 3-leg flow stays in `apps/web` until the Agentic Commerce spec ships its first phase. See the comment block in `app/(chat)/api/audric-chat/route.ts` near `writeToolsForWebV2` for the full framing.

4. **Web-v2 actively filters pay_api out** at `apps/web-v2/app/api/chat/route.ts:631`:
   ```typescript
   const writeToolsForWebV2 = WRITE_TOOLS.filter((t) => t.name !== "pay_api");
   ```

5. **Web-v2 retains the SKELETON for pay_api** (skeleton-variants.ts line 65 handles `pay_api` as a loading skeleton), and the SYSTEM PROMPT documents MPP capabilities (system-prompt.ts line 191) — implying web-v2 expects to GAIN pay_api capability eventually, just not yet.

**Original recommendation: DEFER services/* migration to v0.7f (Agentic Commerce spec).** ← SUPERSEDED 2026-05-22 ~08:30 AEST per founder reframe S.245.

**FINAL LOCK (S.245): Option B+ — DELETE entirely + Store SPEC redesign.**

**The S.245 reframe:** Founder pointed out that the S.244 D-2=A (DEFER) lock was preserving a feature ALREADY DEAD for web-v2 users. `apps/web-v2/app/api/chat/route.ts:635` filters pay_api out of WRITE_TOOLS; `apps/web-v2/lib/audric/sponsored-tx.ts:23-28` explicitly excludes it. Production users on web-v2 (default chat since v0.7d Phase 7, 2026-05-21 ~20:00 AEST) have had zero pay_api capability for ~3 days already. The original audit (and the S.244 lock) was preserving an apps/web-only feature in the name of "no feature loss" — but the loss already happened the day web-v2 became default.

**S.245 reframe consequences:**

| Item | S.244 lock (A — DEFER) | S.245 lock (B+ — DELETE + Store redesign) |
|---|---|---|
| v0.7e Phase 5 | DEFERRED to v0.7f | **SHIPS IN v0.7e** (restored to scope) |
| apps/web end state | ~5k LoC MPP shim survives ~3mo | **DIES EN BLOC** at end of v0.7e Phase 5 |
| Engine `pay_api` tool | KEEPS exporting | **DELETED in S.245** (`packages/engine/src/tools/pay.ts` -151 LoC + tests -268 LoC) |
| Engine `mpp_services` tool | KEEPS exporting | **DELETED in S.245** (`packages/engine/src/tools/mpp-services.ts` -186 LoC) |
| Web-v2 pay_api scaffolding | KEEPS (skeleton, filter, system prompt MPP block, sponsored-tx comments) | **DELETED in S.245** (~100 LoC) |
| pay_api UX availability | Restored when v0.7f Agentic Commerce ships pay_api in web-v2 (~3mo) | Restored when Audric Store SPEC ships (Commerce primitives redesigned from scratch; pay_api is one primitive of many) |
| Net codebase LoC impact | ~5k LoC apps/web preserved + ~600 LoC engine + ~100 LoC web-v2 = ~5,700 LoC carried | All deleted = ~5,700 LoC removed |
| Strategic position | "Migrate the legacy 3-leg flow" | "Design Commerce primitives properly as part of the Store product" |

**Founder's framing:** *"deleted and not migrated to v2 also and redesigned with Audric Store and mpp and pay_api so we can design it cleanly."* Aligns with the consistent simplification pattern (voice deferred-to-die, invoices deprecated, contacts deleted, apps/web zombie code lesson per S.239).

**v0.7e scope NOW (post-S.245):**
- Ships Phases 1-5 fully. apps/web deletes en bloc.
- pay_api feature gap is acknowledged (already zero web-v2 usage; effectively no-op from user POV).
- v0.7f / v0.7g Audric Store SPEC takes pay_api as one of its Commerce primitives on a clean-slate design.

**No founder call pending.** D-2 LOCKED to B+ DELETE.

---

## D-4 — `/api/payments` rewrite-cover verify

**Question:** Verify `/api/payments` is rewrite-covered and the apps/web route can be deleted.

**SPEC agent default:** AUDIT FIRST → DELETE apps/web's version if confirmed dead.

**Audit findings (2026-05-21 ~20:15 AEST):**

1. **Apps/web has 3 payment routes:**
   - `app/api/payments/route.ts` (root LIST + CREATE) — zkLogin JWT auth — **NOT REWRITTEN** (no rewrite entry for `/api/payments` root)
   - `app/api/payments/[slug]/route.ts` (single GET) — REWRITTEN per `next.config.ts:118`
   - `app/api/payments/[slug]/verify/route.ts` (verify POST) — REWRITTEN per `next.config.ts:119`

2. **Web-v2 has 2 payment routes:**
   - `app/api/payments/[slug]/route.ts` — equivalent to apps/web's slug GET
   - `app/api/payments/[slug]/verify/route.ts` — equivalent to apps/web's verify
   - **NO root `/api/payments`** LIST endpoint

3. **Web-v2 has `/api/internal/payments` (different)** which is an internal-key-auth GET + POST + PATCH covering create, list, cancel — but called BY THE ENGINE tools (`create_payment_link`, `list_payment_links`, `cancel_payment_link`), NOT by user-facing UI.

4. **Apps/web `/api/payments` callers:**
   - `components/panels/PayPanel.tsx:109` — `fetch('/api/payments', { headers })` — the user-facing payment list in the chat-shell dashboard.
   - PayPanel is rendered by `app/new/dashboard-content.tsx` (the chat-shell entry).

5. **Phase 1.1 chat-shell deletion will:**
   - Delete `app/new/page.tsx` (chat-shell entry)
   - Delete `components/panels/PayPanel.tsx` (only caller of `/api/payments` LIST)
   - At that point, no caller of `/api/payments` LIST remains

**Revised recommendation: DELETE apps/web `/api/payments` LIST in Phase 1.1 along with PayPanel.tsx, AND delete the slug routes in Phase 1.1 to activate the rewrites (cutover pattern from G3).**

**Cutover semantics for slug routes:** Same as G3 — currently 2-hop apps/web-handled; deletion flips to 4-hop web-v2 proxy. Smoke needed per slug route deletion to verify cutover.

**Blocks v0.7e:** ❌ NO. Standard Phase 1 work.

---

## D-1 — `/api/user/memories` (GET + DELETE) — delete in Phase 3 or keep as legacy fallback?

**Question:** Delete entirely vs keep as legacy fallback?

**SPEC agent default:** DELETE entirely (signpost flow owned by web-v2).

**Audit findings (2026-05-21 ~20:25 AEST):**

1. ✅ **`/api/user/memories` route ALREADY DELETED.** `find apps/web/app/api/user/memories/` → "0 files found." Per v0.7d Block A (Memory pipeline retirement, S.221), the route was deleted.
2. ❌ **Stale comment in `next.config.ts:95`:** "Legacy `/api/user/memories` on apps/web stays operational for direct calls." This comment is now wrong — the route is gone. Update during next.config.ts cleanup.
3. **Dead code in apps/web:**
   - `components/settings/MemorySection.tsx` (184 LoC) — still references `/api/user/memories` in line 17 comment + actual `authFetch('/api/user/memories')` calls in body
   - `apps/web/app/settings/page.tsx:30` imports MemorySection and renders it at line 167 when `activeSection === 'memory'`
4. **BUT** `/settings` is rewritten to web-v2 per `next.config.ts:129-130` — apps/web's settings page never renders → MemorySection.tsx + apps/web's settings page are DEAD CODE that hasn't been cleaned up.
5. Web-v2 has its own settings/memory page (Phase 6 Block A signpost card per S.188).

**Revised recommendation:** **DELETE MemorySection.tsx + `apps/web/app/settings/page.tsx` (and the full Settings directory) in Phase 1.2 along with the page-directory deletion sweep.** Update the stale `next.config.ts:95` comment to reflect that `/api/user/memories` is gone.

**Blocks v0.7e:** ❌ NO. Standard Phase 1.2 work — dead code cleanup along with Settings page deletion.

---

## D-3 — `/api/voice/*` — migrate or delete?

**Question:** Migrate or delete the 3 voice routes (status, synthesize, transcribe; 337 LoC)?

**SPEC agent default:** DELETE (confirmed in v0.7c audit-3).

**Audit findings (2026-05-21 ~20:30 AEST):**

1. **Apps/web has 3 voice routes:** status (30 LoC), synthesize (165 LoC), transcribe (142 LoC) = 337 LoC total.
2. **Apps/web callers (chat-shell only):**
   - `hooks/useVoiceStatus.ts`
   - `hooks/useVoiceMode.ts`
   - `app/new/dashboard-content.tsx` (the chat-shell entry page)
   - `__tests__/spec30-idor-regression.test.ts` (security regression test)
   - `app/api/payments/route.ts` (false positive — line 32 comment reference)
3. **Web-v2 has ZERO voice mode.** Confirmed via grep: no voice/* routes, no useVoiceMode/useVoiceStatus hooks, no microphone-related code. The only "voice" matches in web-v2 are unrelated (e.g. `voiceover/TTS` for MPP services, `second-opinion voice` for GPT-4o tone).
4. **CSP allows microphone:** `next.config.ts:37` has `microphone=(self)` — voice mode WAS built and shipped at some point.
5. **After Phase 1.1 chat-shell deletion:** hooks + dashboard-content + voice routes + spec30-idor test all go together. No caller of `/api/voice/*` remains.

**Voice mode usage check (Vercel logs):** Cannot query directly from this session. Trust the v0.7c audit-3 finding (zero usage) referenced in HANDOFF.

**Revised recommendation:** **DELETE voice/* routes in Phase 1.1 along with the chat-shell** — same trade-off class as pay_api (D-2). Voice mode capability is LOST on cutover.

**Alternative path:** If founder values voice mode preservation, defer voice mode to v0.7f along with pay_api (D-2) — apps/web stays as shim host for both. Adds maintenance burden for a feature the v0.7c audit-3 flagged as zero-usage.

**Founder call needed:**
- **A (RECOMMENDED — matches SPEC default):** DELETE voice in Phase 1.1. Accept zero-usage finding from v0.7c audit-3. CSP microphone directive can also be removed from next.config.ts (mic permission no longer needed when voice mode is gone).
- **B (defer):** Keep voice mode + pay_api in apps/web shim post-v0.7e. apps/web survives as MPP + voice host until both migrate to web-v2 in future SPECs.

**Blocks v0.7e:** ❌ NO if A; ⚠️ MAYBE if B (extends apps/web archive deferral beyond just pay_api).

---

## D-5 — Marketing landing scope: pure copy-port or redesign?

**Question:** Marketing landing (litepaper + 4 legal pages) — pure copy-port to web-v2 vs redesign-while-here?

**SPEC agent default:** LOCK L-4 (pure copy-port; redesign is post-v0.7e product work).

**Audit findings (2026-05-21 ~20:40 AEST):**

1. **Apps/web marketing surface:**
   - `app/litepaper/page.tsx` + `litepaper.module.css` (litepaper page with custom styling)
   - `app/(legal)/disclaimer/page.tsx`
   - `app/(legal)/privacy/page.tsx`
   - `app/(legal)/security/page.tsx`
   - `app/(legal)/terms/page.tsx`
   - Total: 5 marketing-class pages

2. **Web-v2 has NONE of these.** No litepaper, no legal pages. Must copy-port if v0.7e is to fully archive apps/web.

3. **Why copy-port (NOT redesign):**
   - L-6 lock: "No new features in v0.7e — migration-only discipline."
   - Marketing redesign is a separate product work item; lumping it into v0.7e doubles scope without architectural benefit.
   - Legal pages are LITERALLY legally-vetted text — touching them requires legal review, which is post-v0.7e work.

**Recommendation:** **RATIFY L-4 (pure copy-port).** No content/design changes in Phase 5.

**Blocks v0.7e:** ❌ NO (standard Phase 5 work).

---

## D-6 — `/api/build-id` keep post-v0.7e?

**Question:** Migrate `/api/build-id` to web-v2, delete it, or keep in apps/web?

**SPEC agent default:** MIGRATE for now; revisit in post-v0.7e cleanup.

**Audit findings (2026-05-21 ~20:45 AEST):**

1. **`/api/build-id` callers in apps/web (5 files):**
   - `hooks/useExpirySoonToast.ts` (chat-shell)
   - `components/shell/ChunkErrorReloader.tsx` (chat-shell)
   - `hooks/useVersionCheck.ts` (chat-shell)
   - `lib/version-drift-check.ts` (chat-shell)
   - `lib/env.ts` (env-validation gate; references in error formatting)

2. **Middleware does NOT call build-id.** False positive from earlier grep — `middleware.ts` has no actual `/api/build-id` fetch.

3. **Web-v2 has NO version-check capability.** No build-id route, no useVersionCheck hook, no version-drift-check.ts. Web-v2 deliberately doesn't implement this pattern.

4. **All 4 chat-shell consumers go in Phase 1.1.** The 5th (lib/env.ts) only mentions build-id in error formatting (deployment-id label).

5. **After Phase 1.1 chat-shell deletion:** no callers of `/api/build-id` remain. The route is dead code.

**Revised recommendation:** **DELETE `/api/build-id` in Phase 1.1** along with the chat-shell hooks that consume it. The version-check capability is a chat-shell concern web-v2 deliberately doesn't implement. Marketing pages don't need version-check (they're static).

**Blocks v0.7e:** ❌ NO (standard Phase 1.1 work).

**SPEC §7 D-6 default REVISED:** from "MIGRATE for now" → "DELETE in Phase 1.1."

---

## D-7 — Keep `apps/web-legacy/` directory on disk for grep convenience?

**Question:** After Phase 5 archive ritual, keep `apps/web-legacy/` directory in working tree OR delete (git history is SSOT)?

**SPEC agent default:** DELETE after archive ritual (git history is SSOT).

**Audit findings:** No audit needed — pure founder preference call.

**Trade-offs:**

| Path | Pros | Cons |
|---|---|---|
| **A: DELETE `apps/web-legacy/`** (SPEC default) | Cleaner working tree; `pnpm install` + `turbo build` time drops; no risk of accidentally editing legacy code; `audric` mono surface shrinks dramatically | Future grep for "how did apps/web do X?" requires `git log`/`git show` (slower than IDE search) |
| **B: KEEP `apps/web-legacy/`** | IDE grep convenience for first ~30 days post-v0.7e; smoother onboarding for any new agent who joins post-archive | Working tree stays bloated; `turbo` would still attempt to build the legacy code unless explicitly excluded; risk of accidentally editing legacy by autocomplete |

**Recommendation:** **DELETE** per SPEC default. Reasoning:

1. **Git history is permanent and queryable.** `git show abc123:apps/web/app/api/portfolio/route.ts` gives the same content as opening the file in the IDE.
2. **Turbo workspace exclusion is fragile.** If we keep `apps/web-legacy/`, we'd need to add it to `.gitignore`-equivalent and explicit turbo workspace exclusions — easy to forget, and the legacy code would silently get built if exclusions break.
3. **Cleaner working tree forces honest grep behavior.** If a future agent needs old code, they consult git history (which captures intent + commit messages, NOT just code). That's a better signal than "open the legacy file and copy-paste."
4. **The whole point of v0.7e is shrinking apps/web's surface.** Keeping `apps/web-legacy/` defeats the purpose.

**Blocks v0.7e:** ❌ NO (Phase 5 final step). Defer the actual `rm -rf apps/web-legacy/` to a separate slice 24h after Phase 5 closes to allow founder to grep around if needed during the transition window.

---

## SUMMARY (after Blocks 3 + 4 complete)

| ID | Question | Default | Recommendation | Blocks v0.7e? |
|---|---|---|---|---|
| D-1 | `/api/user/memories` keep or delete? | DELETE | **DEAD CODE — delete MemorySection.tsx + apps/web/app/settings/page.tsx in Phase 1.2**; route is already gone (v0.7d Block A) | NO |
| D-2 | `services/*` migrate or delete? | AUDIT-FIRST | **B+ DELETE ENTIRELY (S.245 reframe)** — apps/web dies en bloc in v0.7e Phase 5; engine pay_api + mpp_services deleted; pay_api redesigned cleanly in Audric Store SPEC (Commerce primitive) | ✅ NO — v0.7e Phase 5 restored to scope |
| D-3 | `voice/*` migrate or delete? | DELETE | **DELETE in Phase 1.1 (recommended, matches v0.7c audit-3 zero-usage)** OR defer with pay_api (extends apps/web shim scope) | ❌ NO if A; ⚠️ MAYBE if B |
| D-4 | `/api/payments` rewrite-cover verify | AUDIT-FIRST → DELETE | **DELETE in Phase 1.1 along with PayPanel + slug routes (cutover pattern)** | NO |
| D-5 | Marketing landing scope | L-4 pure copy-port | **RATIFY L-4 (pure copy-port; legal-vetted text, no redesign)** | NO |
| D-6 | `/api/build-id` keep post-v0.7e? | MIGRATE for now | **REVISED: DELETE in Phase 1.1 (all consumers are chat-shell; web-v2 deliberately doesn't have version-check)** | NO |
| D-7 | Keep `apps/web-legacy/` dir? | DELETE after archive | **RATIFY DELETE** (git history is SSOT; defer actual rm 24h post-Phase 5 for transition grep window) | NO |
| D-8 | Vitest infra in web-v2? | OPEN | **L-8A — configure vitest in sub-slice 2.0 (~1d); tests port as-is.** Spike shipped S.252. | NO |
| D-9 | Feature-loss matrix for 6 `/api/engine/*` routes? | OPEN | **KILL ALL 6 — empty feature-loss matrix.** All replaced structurally in v2. | NO |
| D-10 | Legacy `/api/history` TX endpoint? | OPEN | **DELETE — dies with Phase 2.5 + Phase 6; no separate migration.** | NO |

**SUPERSEDED by S.245 reframe (2026-05-22 ~08:30 AEST):**

**Original biggest finding (S.244):** ~~D-2 forces v0.7e Phase 5 (final archive) to defer to v0.7f.~~ ← OVERTURNED. Founder D-2=B+ reframe deletes pay_api entirely → Phase 5 restored to v0.7e → apps/web dies en bloc → no shim needed → no v0.7f shim dependency.

**S.245 net effect:**
- v0.7e scope ships Phases 1-5 fully (Phase 5 restored).
- ~5,700 LoC deleted across engine + web-v2 + apps/web (pay_api + mpp_services + scaffolding + en-bloc apps/web archive).
- V07F_FORWARD_MAP Stream A reframed from "Agentic Commerce Phase 1 pay_api migration" → "Audric Store SPEC clean-slate Commerce design (pay_api = one of N primitives)."
- pay_api UX restored when Store SPEC ships; no fixed timeline (~product-paced, not migration-paced).

**Original D-3 compounding finding still stands:** D-3 voice deletion path is now in the Phase 1B/2 zombie-code-en-bloc-delete (per S.239 lesson) — no separate decision needed.

---

## D-9 — Feature-loss matrix for 6 legacy `/api/engine/*` routes (NEW — S.252)

**Question:** Six legacy `/api/engine/*` routes in apps/web (regenerate, regen-append, resume, resume-with-input, sessions, sessions/[id]) — none exist in web-v2. Build them, or accept feature loss?

**SPEC agent default:** Implicit OPEN — `BENEFITS_SPEC_v07e.md` §4 said "create … OR define feature-loss matrix (founder call)." The pre-execution audit (S.251) surfaced this as Q2.

**Audit findings (S.252, 2026-05-22 ~15:00 AEST):**

1. **`/api/engine/resume` + `/api/engine/resume-with-input`:** ALREADY HANDLED inside web-v2 `/api/chat`. Per `apps/web-v2/lib/audric/resume-outcome.ts` header: "This mirrors the legacy audric/web `/api/engine/resume` route's updateMany logic, but folded INTO the chat route (per D-3(c) lock: 'merge resume route into chat route + keep TurnMetrics row split')." The AI SDK uses `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` to auto-fire the resume turn via `/api/chat` with HITL outcomes attached; the chat route extracts them via `extractResumeOutcomes()` and runs the `prisma.turnMetrics.updateMany({where: {attemptId}})` inline.

2. **`/api/engine/regenerate` + `/api/engine/regen-append`:** AI SDK v6 provides `useChat.reload()` and `useChat.append()` as client-side primitives. No server route needed. Note: web-v2 chat UI does NOT currently expose a regenerate button (grep `reload|regenerate|\.append\(` in `web-v2/components/chat/**` → zero matches). Adding regenerate is ~30 min when product wants it; it doesn't require the legacy server route.

3. **`/api/engine/sessions` + `/api/engine/sessions/[id]`:** Replaced by web-v2 Persistent Chats (S.247) with its own session model + endpoints (`/api/history`, `/api/chat/[id]`, etc.). The legacy engine-managed sessions are a different abstraction entirely; no callers remain in v2.

**Revised recommendation:** **KILL ALL 6.** Feature-loss matrix is EMPTY — every route has a structural replacement in v2 (3 inline, 2 client-side AI SDK primitives, 1 in Persistent Chats). Save ~0.5–1d of sub-slice 2.2 build effort by deleting instead of porting.

**Blocks v0.7e:** ❌ NO (sub-slice 2.2 becomes pure deletion).

**SPEC agent default REVISED:** "create equivalents OR define feature-loss matrix" → **"DELETE all 6 — empty feature-loss matrix."**

---

## D-10 — Legacy `/api/history` TX endpoint (NEW — S.252)

**Question:** apps/web's `/api/history` — migrate to web-v2 in sub-slice 2.3, or delete?

**SPEC agent default:** Implicit OPEN — `V07E_PHASE_1_EXECUTION_PLAN.md` 1B.5 said "Decide: migrate / delete with feature loss." The pre-execution audit (S.251) surfaced this as Q3.

**Audit findings (S.252, 2026-05-22 ~15:00 AEST):**

1. **AUDIT-DOC FRAMING WAS WRONG.** The S.251 audit doc speculated legacy `/api/history` might serve "sidebar pagination from before persistent chats; reports surface; one-off CLI." That was based on path-collision reasoning (new web-v2 `/api/history` from S.247 = chat history; assumed semantic equivalence). Code reading of `apps/web/app/api/history/route.ts` revealed it's a **TX-history endpoint** — calls `getTransactionHistory()`, returns on-chain tx records via the canonical fetcher. Different domain entirely; path collision is coincidental.

2. **Actual callers of legacy `/api/history` (TX):**
   - Engine's `transaction_history` tool via `packages/engine/src/audric-api.ts` (HTTP roundtrip from engine → audric/web). Eliminated by Phase 2.5 (engine fn-injection): `audric-api.ts` HTTP calls become injected JS function pointers in `ToolContext.audricApi`.
   - `apps/web/app/new/dashboard-content.tsx` (legacy dashboard UI). Eliminated by Phase 6 (apps/web death).

3. **Web-v2 has zero callers of legacy `/api/history`.** Verified via grep across `apps/web-v2/**` — the only `/api/history` references in web-v2 point to web-v2's OWN chat-history endpoint.

**Revised recommendation:** **DELETE — dies naturally with Phase 2.5 + Phase 6.** No separate migration or rewrite needed. Sub-slice 2.3 scope shrinks to `/api/swap/quote` + `/api/quote` only (TX history not in scope). Order of operations: Phase 2.5 (fn-injection eliminates engine caller) → Phase 6 (apps/web death eliminates UI caller) → legacy `/api/history` zero-callers → deletes cleanly with apps/web.

**Blocks v0.7e:** ❌ NO (sub-slice 2.3 simplified).

**SPEC agent default REVISED:** "Decide: migrate / delete with feature loss" → **"DELETE — naturally dies with Phase 2.5 + Phase 6; no separate migration."**
