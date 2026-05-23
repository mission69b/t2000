# BENEFITS_SPEC v0.7e — Tier C Migration + Final apps/web Archive

> **Status:** **v1.1 LOCKED 2026-05-22 ~08:30 AEST (S.245 D-2 REFRAME).** Founder reframed D-2 from A (DEFER pay_api shim to v0.7f) → **B+ (DELETE pay_api entirely + redesign in Audric Store SPEC)**. Phase 5 RESTORED to v0.7e scope (no longer deferred). apps/web dies en bloc at end of v0.7e Phase 5. Engine `pay_api` + `mpp_services` tools DELETED in S.245. Web-v2 pay_api scaffolding DELETED in S.245.
>
> **S.245 reframe rationale:** pay_api was already dead for web-v2 production users (filter at `apps/web-v2/app/api/chat/route.ts:635`). The S.244 D-2=A lock was preserving a feature already gone for ~3 days. Founder framing: *"deleted and not migrated to v2 also and redesigned with Audric Store and mpp and pay_api so we can design it cleanly."* See `V07E_D_QUESTION_AUDITS.md` D-2 section for the full reframe analysis.
>
> **v1.0 → v1.1 promotion delta (2026-05-22 ~08:30 AEST):**
> - **D-2 OVERTURNED:** Phase 5 RESTORED to v0.7e scope. apps/web dies en bloc. Engine pay_api + mpp_services deleted. Web-v2 pay_api scaffolding deleted. V07F_FORWARD_MAP Stream A reframed from "Agentic Commerce Phase 1 pay_api migration" → "Audric Store SPEC clean-slate Commerce design."
> - **L-5 RESTORED:** Final archive ritual ships in v0.7e Phase 5 (was deferred to v0.7f per v1.0).
> - **L-7 OBSOLETE:** "pay_api defers to v0.7f" lock no longer applies. Marked SUPERSEDED below.
> - **Scope back to 5 phases:** Phases 1A → 1B (collapses per S.239 zombie-code lesson) → 2 → 3 → 4 → 5 (final archive). Net surface delete grows from ~58k LoC (v1.0) to ~63k LoC (v1.1, includes ~5k MPP shim).
>
> **v0.1 → v1.0 promotion delta (2026-05-22 ~00:45 AEST) — historical:**
>
> **v0.1 → v1.0 promotion delta (2026-05-22) — D-2 portion SUPERSEDED by v1.1:**
> - ~~**Major scope change (D-2):** Phase 5 (final apps/web archive) deferred to v0.7f. v0.7e ships Phase 1-4 only. apps/web survives as ~5,000 LoC MPP-only shim until Agentic Commerce SPEC ships pay_api in web-v2.~~ ← OVERTURNED by S.245 reframe; see v1.1 banner above. Net effect post-v1.1: v0.7e ships Phases 1-5 fully, apps/web dies en bloc, engine pay_api + mpp_services tools deleted, Store SPEC owns pay_api fresh design.
> - **Phase 1 restructured (audit correction):** Phase 1 splits to Phase 1A (5 shippable-today slices, ~3.5h) + Phase 1B (chat-shell cutover work, formally subsumed into Phase 2). Phase 1A unblocks immediately post-founder-lock; Phase 1B's chat-shell cutover prep merges with Phase 2 engine migration.
> - **Phase 2 expanded:** absorbs Phase 1B chat-shell cutover (path-remap rewrites + 6 missing web-v2 route equivalents) + the original Phase 2 engine migration + the fn-injection refactor (per L-2 + the AUDIT_ENGINE_FN_INJECTION_REFACTOR.md corrected scope). Effort revised from ~3-4d to ~5-7d.
> - **Phase 0 baseline captured:** Per V07E_PHASE_0_BASELINE.md, apps/web is ~63k LoC source (~83k including tests + generated). Refines SPEC §1.3 estimates.
> - **D-question audit results folded in:** all 7 questions now have evidence-backed recommendations. D-1/D-4/D-5/D-7 ratify defaults; D-3/D-6 revised to delete-earlier (Phase 1A.2/1A.3 instead of Phase 3); D-2 forces scope-shrink per above.
> - **New risk surface R-1: vitest infrastructure parity.** Phase 2 migrates 37 `.test.ts` files from apps/web's vitest setup into web-v2 which doesn't have vitest configured. Either configure vitest in web-v2 first OR delete tests-not-in-vital-coverage during migration (founder call).
> - **New backlog row: `phase-5c-post-write-refresh-surface`** registered S.236 (audit-only) — Phase 5c PWR cluster is blocked by missing engine work + crosses Phase 7 boundary + agent recommends permanent shelf. Not part of v0.7e structural scope; references the v0.7f decision in §10.
> - **Block 1 retrospective findings absorbed:** v0.7c shipped at ~30% SPEC effort via audit-first cadence — same discipline applied to v0.7e D-question audits compressed estimates further. Lessons (audit-first, dead-rewritten code discovery, multi-version runbook, founder push reframes) carried forward to v0.7e + v0.7f.
>
> **What v0.7e is.** The next hop in the (now) 4-phase apps/web archive trajectory locked by audit-3 at 2026-05-19 (`RUNBOOK_v07c_phase_6_cutover.md` §11) + extended by D-2 finding tonight. v0.7c forked the chat shell. v0.7d landed MemWal + HITL native + engine library decouple. v0.7e migrates everything except pay_api and archives most of apps/web. v0.7f ships Agentic Commerce + completes the final archive.
>
> **End state (REVISED v1.0 per D-2 finding):** apps/web shrinks to a ~5,000 LoC MPP-only shim hosting `app/api/services/*` (pay_api 3-leg flow) + supporting MPP UI components/hooks + ~minimal chat-shell support routes. audric.ai DNS still points to apps/web (which retains the rewrite layer for everything-not-pay_api). Single Vercel project for chat/settings/store/pay/marketing (web-v2). Two-app monorepo continues until v0.7f Agentic Commerce SPEC ships pay_api migration to web-v2, then apps/web archives completely.
>
> **Why scope shrunk:** D-2 audit (V07E_D_QUESTION_AUDITS.md) found that web-v2 EXPLICITLY EXCLUDES pay_api via `apps/web-v2/app/api/chat/route.ts:631` `WRITE_TOOLS.filter((t) => t.name !== "pay_api")` per Phase 4b deferral 2026-05-19. Web-v2 retains the skeleton (`skeleton-variants.ts:65`) and system-prompt docs (`system-prompt.ts:191`) for FUTURE pay_api support, but the implementation doesn't exist. Forcing pay_api into v0.7e Phase 2 adds ~3-5 days for the most complex tool in the suite (3-leg flow + MppCard renderer + classify-gateway-response logic) — better fit for a dedicated v0.7f Agentic Commerce SPEC than bundling into v0.7e's mechanical migration scope.
>
> **Promotion trigger (v0.1 → v1.0).** v0.7e Phase 1 kickoff is gated on:
> 1. **v0.7d Phase 7 observation passes** (founder-owned 48-72h passive watch through ~2026-05-23 ~17:00 AEST) with zero P0/P1 regressions on web-v2 (Memory + HITL + classifier surfaces).
> 2. **v0.7d Phase 8 G12 closes** (engine-fn-injection-refactor decision lands — see §11.2 of the v0.7c runbook + `spec/active/AUDIT_ENGINE_FN_INJECTION_REFACTOR.md` postscript for the corrected scope).
> 3. **`/api/portfolio` deletion + spec30 test migration ships** (last dead-rewritten route in apps/web; ~45 min follow-on slice).
>
> **All 3 gates close → founder triggers v0.7e Phase 1.** The pre-v0.7e backlog work (4-route cleanup, /api/portfolio deletion, fn-injection scope decision) compounds the surface-reduction story: v0.7e starts against the smallest possible apps/web baseline.
>
> **Why this SPEC exists.** v0.7c + v0.7d are paradigm shifts (chat fork; memory + HITL native). v0.7e is **execution-of-locked-decisions** — no new patterns, no new frameworks, the migration is mostly `git mv` + update imports + redeploy. The bet is that 3 lower-risk hops finish what 1 mega-hop would have done in v0.7c (17-25 days), but with 3 independently rollbackable slices instead of one cliff.
>
> **What this is NOT:** new product work. No new features. No new tools. v0.7e is the last hop to a single-Next-app monorepo. New product work (Audric Store catalog, agentic commerce, etc.) starts FROM the post-v0.7e baseline.
>
> **Cross-references:**
> - `BENEFITS_SPEC_v07c.md` (chat-shell fork; defines the 3-phase trajectory locked by audit-3)
> - `BENEFITS_SPEC_v07d.md` (memory + HITL native + engine library decouple; v0.7e Phase 1 trigger)
> - `RUNBOOK_v07c_phase_6_cutover.md` §11.2 (the v0.7e skeleton — surfaces + LoC delta + effort estimate)
> - `RUNBOOK_v07c_phase_6_cutover.md` §11.3 (the cron cutover gotcha — `*/5 * * * *` window risk)
> - `spec/active/AUDIT_ENGINE_FN_INJECTION_REFACTOR.md` (2-app boundary + execution-order rebaseline — fn-injection executes WITHIN v0.7e, not before)
> - `audric-build-tracker.md` S.228 + S.229 (deletion-ship pattern + audit corrections that pre-shrank v0.7e surface)
> - `audric/HANDOFF_NEXT_AGENT.md` rows: `apps-web-portfolio-deletion-with-test-migration` (pre-v0.7e), `engine-fn-injection-refactor` (v0.7e+), `engine-internal-key-final-delete` (v0.7e+)
>
> **Total committed effort:** **~10-15 agent days** (~4-6 calendar weeks including founder ops + 7d soak + cron cutover window + DNS verification). Smaller than v0.7d (~8-12d) because mechanical work and most surfaces are already factored into web-v2.

---

## 0 — Architectural lock decisions (binding)

Locked at SPEC v0.1 drafting time. Any change requires founder approval + SPEC version bump.

### L-1 — Tier C migration is `git mv` + import updates, NOT rebuild

Every surface in v0.7e gets COPIED to web-v2 (not rebuilt to v2 patterns). The 5 surfaces that warranted v2-pattern rebuild already migrated in v0.7c Phase 6 Sessions 2/3/4/4.5/4.7. What remains has zero v2-pattern benefit — admin/legal/marketing/cron/backend-API don't get UI value from v2 patterns, and the migration mechanic is intentionally boring.

### L-2 — Engine-fn-injection-refactor lands AS PART OF v0.7e Phase 2

Per the S.228 audit correction in `AUDIT_ENGINE_FN_INJECTION_REFACTOR.md` postscript: the fn-injection refactor (eliminate engine→audric HTTP self-fetches by injecting lib functions directly into `ToolContext`) cannot execute on apps/web today because the routes it would target are dead-rewritten (their actual runtime is web-v2). The clean execution path is: v0.7e Phase 2 moves engine-factory + lib/* from apps/web to web-v2 FIRST → fn-injection then runs as a within-app refactor in the same phase. Net effect: 2 refactors become 1 atomic migration.

### L-3 — Cron cutover risk gets a dedicated phase

Per `RUNBOOK_v07c_phase_6_cutover.md` §11.3: the `*/5 * * * *` `turn-metrics-pending-sweep` cron creates a window where pending-actions could miss sweep if apps/web's cron stops before web-v2's starts. Mitigation: deploy web-v2 crons first → both run in parallel for 10 minutes → remove apps/web's. Idempotent sweeper makes the dual-run safe. Gets its own phase because it's the highest-risk slice of v0.7e.

### L-4 — Marketing landing migration is a 1-day port, NOT a redesign

`apps/web/app/page.tsx` + `components/landing/*` (~1,800 LoC) gets copied verbatim. Any landing-page redesign is a separate post-v0.7e product slice. The migration mechanic is the value here; design changes carry independent UX risk.

### L-5 — The final archive is a 4-step ritual

After all surfaces migrate + 7d soak + cron cutover verified:
1. Rename `apps/web` → `apps/web-legacy` (git mv, keeps history).
2. Delete the Vercel project for apps/web-legacy (DNS no longer routes to it).
3. Verify `audric.ai` DNS resolves to web-v2 directly.
4. Delete `apps/web/next.config.ts` rewrites (web-v2 is the only app — no rewrite layer needed).

Each step has a verification gate. No big-bang archive — if step 1 surfaces a missed import, the previous 3 phases hold.

### L-6 — No new features in v0.7e

If a "feature" suggestion lands during v0.7e drafting / execution, it's punted to post-v0.7e. v0.7e is migration-only. The discipline that compressed v0.7c Phases 5-5.5 by 80-99% — and that S.228 just demonstrated again with the audit-first deletion-ship pattern — is rejected scope creep.

### L-7 — ~~pay_api defers to v0.7f (Agentic Commerce SPEC)~~ SUPERSEDED BY L-8 IN v1.1 PER D-2 REFRAME

~~pay_api (the `/api/services/*` 3-leg flow + MppCard renderer + classify-gateway-response logic in apps/web) does NOT migrate in v0.7e.~~

**L-7 IS OBSOLETE.** S.245 D-2 reframe overturned the "defer pay_api shim to v0.7f" lock. See L-8 for the replacement.

### L-8 — pay_api DELETED in v0.7e; redesigned in Audric Store SPEC — NEW IN v1.1 PER S.245 D-2 REFRAME

The S.244 D-2=A lock (defer to v0.7f shim) preserved a feature already dead for web-v2 production users — `apps/web-v2/app/api/chat/route.ts:635` filters pay_api out of WRITE_TOOLS as of Phase 4b deferral 2026-05-19. Founder reframed 2026-05-22 ~08:30 AEST: stop preserving the legacy implementation; delete entirely and redesign cleanly in Audric Store SPEC alongside Commerce primitives.

**L-8 actions (executed in S.245, 2026-05-22 ~09:00 AEST):**

1. **Engine package:** DELETE `packages/engine/src/tools/pay.ts` (151 LoC) + `mpp-services.ts` (186 LoC) + tests (268 LoC). Remove from tool-flags, tool-policy, canonical-route, prompt, permission-rules, describe-action, types, index, README, CHANGELOG, behavior catalogue. Minor `@t2000/engine` version bump.
2. **Web-v2 package:** DELETE pay_api scaffolding (`WRITE_TOOLS.filter` line, `skeleton-variants.ts:65`, `tool-result-router.tsx` pay_api case, `system-prompt.ts:191` MPP block, sponsored-tx comments, safety-section refs). ~100 LoC delete.
3. **SDK package:** Update `composeTx.ts` exclusion comment (remove pay_api bullet — no longer relevant).
4. **t2000-skills:** Update `t2000-engine/SKILL.md` tool catalog (remove pay_api + mpp_services).
5. **CLAUDE.md:** Read 25→24, Write 12→11, Agent Harness 37→35, rule #3 reframe.
6. **apps/web:** NO surgical cleanup. Dies en bloc in v0.7e Phase 5 per S.239 zombie-code lesson.

**v0.7e end state with L-8 in effect:** apps/web archives completely at end of v0.7e Phase 5. No MPP shim. No pay_api capability in either chat shell. Web-v2 system prompt no longer mentions MPP/40+ services. Audric Intelligence Agent Harness tool count: 35 (was 37).

**pay_api capability restoration timeline:** When Audric Store SPEC ships (v0.7f or v0.7g — product-paced, not migration-paced). pay_api becomes one Commerce primitive among many (listings, payouts, creator splits, etc.) designed properly from scratch — NOT a port of the legacy 3-leg flow.

**Net codebase impact:** ~5,700 LoC deleted (engine 605 + web-v2 ~100 + apps/web 5,000 en-bloc at Phase 5).

**v0.7f scope (forecast):** ship pay_api in web-v2 with new MPP UI + ServiceCatalogCard / MppReceiptGrid / DownloadableArtifact cards + classify-gateway-response logic. Then execute the L-5 archive ritual to retire apps/web. Estimate ~5-7 days agent + Agentic Commerce SPEC drafting.

### L-8 — vitest infrastructure decision (NEW IN v1.0 PER R-1 RISK) — ✅ LOCKED L-8A (S.252)

Phase 2 needs to migrate 37 `.test.ts` files from apps/web's vitest setup into web-v2. Web-v2 today does NOT have vitest configured. Two paths:

- **L-8A (RECOMMENDED): Configure vitest in web-v2 first.** ~1d setup work in Phase 2.0 sub-slice. Tests migrate cleanly. Future test additions in web-v2 land naturally.
- **L-8B: Delete tests during migration.** Save ~1d but lose ~37 test files of coverage (engine context assembly, intent dispatcher, txn-metrics, bundle composition, etc.). Risk: introduces blind spots in web-v2 right when the engine wiring is most likely to break under migration stress.

✅ **LOCKED L-8A (S.252 — 2026-05-22 ~15:00 AEST).** Founder ratified after audit clarification: the 37 tests are framework-agnostic engine unit tests (verified via spot-check of `harness-metrics.test.ts` + `prepare-bundle-tool.test.ts`), so they port unchanged. The "Vercel chatbot template patterns" framing (raised in founder Q) is a category mismatch — template patterns are for chat E2E (Playwright); these are tool-correctness unit tests. **Phase 2.0 spike SHIPPED in S.252:** `apps/web-v2/{vitest.config.ts,vitest.setup.ts,lib/utils.test.ts}` + vitest@^3 + jsdom@^29 in devDeps; `pnpm --filter @audric/web-v2 test` → 7/7 pass in 1.04s.

---

## 1 — Surface inventory (post-S.229 baseline)

Audit-first reading of `apps/web/` as of 2026-05-21 ~18:30 AEST (post-S.228+S.229). Numbers will refresh at Phase 0 baseline capture (pre-v0.7e Phase 1 kickoff) — that audit is the binding inventory.

### 1.1 Routes (20 surfaces in `app/api/`)

| Route group | Routes | Status today | v0.7e disposition |
|---|---|---|---|
| `/api/activity` | 1 | LIVE in apps/web | MIGRATE (Phase 3) |
| `/api/analytics/*` | 3 (activity-heatmap, portfolio-multi, weekly-summary) | LIVE in apps/web | MIGRATE (Phase 3) |
| `/api/build-id` | 1 | LIVE in apps/web | MIGRATE (Phase 3) — used by version-drift hook |
| `/api/cron/*` | 5 (conversation-log-retention, financial-context-snapshot, portfolio-snapshot, turn-metrics-cleanup, turn-metrics-pending-sweep) | LIVE in apps/web (in `vercel.json`) | MIGRATE (Phase 4 — dedicated cron cutover phase) |
| `/api/engine/*` | 6 (chat, regen-append, regenerate, resume, resume-with-input, sessions) | LIVE in apps/web — legacy chat backend for `/new` | DELETE (Phase 1 — `/new` is rewritten to web-v2's `/chat`; these routes are dead) |
| `/api/history` | 1 | LIVE in apps/web | MIGRATE (Phase 3) — used by activity / portfolio-history canvas |
| `/api/identity/*` | 4 (change, check, reserve, search) | LIVE in apps/web | MIGRATE (Phase 3) |
| `/api/payments` | 1 | LIVE in apps/web | VERIFY then MIGRATE/DELETE (Phase 1) — check if rewrite covers + web-v2 has equivalent |
| `/api/portfolio` | 1 | LIVE in apps/web (dead-rewritten — S.229 deferred deletion to pre-v0.7e slice) | DELETE (pre-v0.7e backlog slice — `apps-web-portfolio-deletion-with-test-migration`) |
| `/api/positions` | 1 | LIVE in apps/web | MIGRATE (Phase 3) — verify web-v2 equivalent first |
| `/api/prices` | 1 | LIVE in apps/web | MIGRATE (Phase 3) — verify web-v2 equivalent first |
| `/api/quote` | 1 | LIVE in apps/web | MIGRATE (Phase 3) — verify web-v2 equivalent (chat-coupled) |
| `/api/rates` | 1 | LIVE in apps/web | MIGRATE (Phase 3) |
| `/api/services/*` | 3 (complete, prepare, retry) | LIVE in apps/web — MPP pay_api | VERIFY USAGE → MIGRATE or DELETE (Phase 1) per S.7 pay_api deferral lock |
| `/api/stats` | 1 | LIVE on t2000.ai (refactored to static marketing in C.1) | KEEP-IN-T2000 — not part of audric/apps/web archive |
| `/api/suins` | 1 | LIVE in apps/web | MIGRATE (Phase 3) — verify web-v2 equivalent |
| `/api/swap/quote` | 1 | LIVE in apps/web | MIGRATE (Phase 3) — chat-coupled |
| `/api/transactions/*` | 2 (execute, prepare) | LIVE in apps/web — sponsored tx backend | VERIFY ROUTING (might already be rewritten); MIGRATE (Phase 2) — chat-coupled (engine-factory's runtime home) |
| `/api/user/*` | 7 (financial-profile, memories, preferences, status, tos-accept, wallets, watch-addresses) | LIVE in apps/web | MIGRATE 6 + DECISION on `memories` (Phase 3) — v0.7d Phase 6 Block A retired the cron but the GET/DELETE routes may still be alive for the deferral signpost flow |
| `/api/voice/*` | 3 (status, synthesize, transcribe) | LIVE in apps/web — voice mode | DELETE (Phase 1 — voice was rebuilt in audric Phase 6.5 OR is unused per S.198 audit; verify) |

**Counts:**
- Total routes: 41 across 20 groups
- Pre-v0.7e cleanup deletions: ~7 routes (`/api/engine/*` (6) + `/api/portfolio`)
- Verification-then-delete candidates: ~4 routes (`/api/payments`, `/api/voice/*` (3), `/api/services/*` (3))
- MIGRATE candidates: ~30 routes

### 1.2 Pages (12 surfaces in `app/`)

| Page group | Files | Status today | v0.7e disposition |
|---|---|---|---|
| `app/page.tsx` (marketing landing) | 1 page + `components/landing/*` (~10 components, ~1,800 LoC) | LIVE in apps/web | MIGRATE (Phase 5 — last to move before final archive, to minimize landing-page downtime risk) |
| `app/(internal)/admin/scaling` | 1 | LIVE in apps/web | MIGRATE (Phase 3) — verify usage; if zero, DELETE instead |
| `app/(legal)/{disclaimer, privacy, security, terms}` | 4 pages + layout | LIVE in apps/web | MIGRATE (Phase 5) — copy verbatim |
| `app/[username]` | Store profile | DEAD-REWRITTEN to web-v2/[username] | DELETE (Phase 1) |
| `app/auth/callback` | OAuth callback | DEAD-REWRITTEN to web-v2/auth/callback (per `next.config.ts` exclusion list — both apps have it; rewrite layer handles routing) | DELETE (Phase 1) |
| `app/chat/[id]` | Legacy chat session | DEAD-REWRITTEN to web-v2/chat (per S.197b rename) | DELETE (Phase 1) |
| `app/invoice/[slug]` | Legacy invoice | DEAD-REWRITTEN to web-v2/pay/[slug] (per Session 4 lock) | DELETE (Phase 1) |
| `app/litepaper` | Marketing-adjacent | LIVE in apps/web | MIGRATE (Phase 5) — copy verbatim |
| `app/new` | Legacy chat dashboard | DEAD-REWRITTEN to web-v2/chat | DELETE (Phase 1 — heaviest single delete: ~2,941 LoC + 651 LoC `UnifiedTimeline.tsx`) |
| `app/pay/[slug]` | Pay landing | DEAD-REWRITTEN to web-v2/pay/[slug] | DELETE (Phase 1) |
| `app/settings` | Settings shell + 4 sections | DEAD-REWRITTEN to web-v2/settings | DELETE (Phase 1 — verify Memory section disposition first; v0.7d Block A retired the memory pipeline, deferral signpost owned by web-v2) |
| `app/opengraph-image.tsx` + `app/sitemap.ts` + `app/layout.tsx` + `globals.css` + `fonts/` | SEO + framework | LIVE in apps/web | MIGRATE (Phase 5) — copy to web-v2 |

**Counts:**
- Total page groups: 12
- Dead-rewritten DELETIONS (Phase 1): 7 (`app/[username]`, `app/auth/callback`, `app/chat/[id]`, `app/invoice/[slug]`, `app/new`, `app/pay/[slug]`, `app/settings`)
- MIGRATE candidates (Phase 5): 5 (`page.tsx`, `(internal)/admin`, `(legal)/*`, `litepaper`, SEO + framework)

### 1.3 Library + components

- **`apps/web/lib/`**: ~100 files, 3.3M of source. Mix of chat-coupled (engine, chip-configs, harness-transitions, intent-parser, interactive-harness, etc.), backend (portfolio, portfolio-data, activity-data, rates, transaction-history, sui-rpc, prisma, etc.), and shared utilities (auth, env, log-redact, sui-address, format, slug, etc.).
- **`apps/web/components/`**: 2.2M of source. Mostly chat-coupled (engine timeline + cards + dashboard + settings + voice). After Phase 1 deletes the chat shell, most components delete with it.

**Estimated breakdown post-Phase-1 (Phase 0 baseline TBD):**
- Chat-coupled lib deletions: ~10,000 LoC (matches the `tendril 6` chat-only portion from v0.7d D-8)
- Chat-coupled component deletions: ~15,000-20,000 LoC (engine timeline + dashboard + UnifiedTimeline + voice + chip-flow modals)
- Backend lib MIGRATIONS to web-v2: ~5,000-7,000 LoC (portfolio, activity-data, rates, transaction-history — many already factored in web-v2 from Session 4.5)
- Shared utility MIGRATIONS: ~2,000-3,000 LoC (auth, env, log-redact, etc.)

### 1.4 Pre-v0.7e backlog work that shrinks the surface further

Three slices land BEFORE v0.7e Phase 1 kicks off. They're not part of v0.7e proper, but they reduce the v0.7e baseline:

| Slice | Effort | Surface reduction | Status |
|---|---|---|---|
| `/api/portfolio` deletion + spec30 test migration | ~45 min | -90 LoC route + small test move | OPEN (HANDOFF row `apps-web-portfolio-deletion-with-test-migration`) |
| `/api/voice/*` audit + verification | ~30 min | If unused → -3 routes + voice lib + voice components (~5,000 LoC) | OPEN (latent — flagged S.198) |
| `/api/services/*` (MPP pay_api) audit + verification | ~30 min | If unused → -3 routes + MPP components (~500 LoC) | OPEN (latent — flagged in v0.7c audit-3 §1.1.1) |

If all 3 land, v0.7e Phase 1 starts against ~10,500 LoC less surface than today's baseline.

---

## 2 — Pre-conditions + promotion criterion

v0.7e Phase 1 cannot start until ALL of:

| Gate | What closes it | Status today |
|---|---|---|
| **G1: v0.7d Phase 7 observation passes** | Founder-owned 48-72h passive watch on web-v2 closes with zero P0/P1 regressions on Memory + HITL + classifier surfaces. Closes ~2026-05-23 ~17:00 AEST. | IN PROGRESS (Day 0 GREEN, see S.225) |
| **G2: v0.7d Phase 8 G12 closes** | engine-fn-injection-refactor decision lands (see `AUDIT_ENGINE_FN_INJECTION_REFACTOR.md` postscript — corrected scope rebaselines execution to within v0.7e). | OPEN |
| **G3: Pre-v0.7e backlog cleanup slices ship** | (a) `/api/portfolio` deletion (~45 min) + (b) optional `/api/voice/*` + `/api/services/*` audit-verify-delete slices. Minimum (a); (b) and (c) are bonus. | OPEN |
| **G4: Pre-v0.7e baseline capture** | Phase 0 of v0.7e — `wc -l` audit of every surface in §1.1 + §1.2 + §1.3 against this SPEC's estimates. Captures the binding inventory for measurement plans. | NOT STARTED |

Either gate fails → v0.7e Phase 1 is paused; the post-cutover stability work continues independently.

**Promotion (v0.1 → v1.0):** all 4 gates close → founder triggers v0.7e Phase 1 → SPEC promotes to v1.0 LOCKED with Phase 0 actuals filled into §1.

---

## 3 — Benefit categories

Same letter scheme as v0.7a + v0.7c + v0.7d for consistency.

| Letter | What it means | v0.7e expectations |
|---|---|---|
| **E** | Engineering wins — LoC, complexity, file count, deletion of duplicated machinery | -83,000 LoC apps/web entire archive; -2,000 to -4,000 LoC net (web-v2 absorbs migrated surface but most chat-coupled is pure deletion); single Next.js app eliminates cross-app import shims, dual-Prisma-client surface, dual-env surface, dual-CI surface |
| **O** | Operational wins — deploy posture, ops cost, infra surface | Single Vercel project (deletion of apps/web project; one deploy URL); single cron schedule; eliminates the rewrite layer (zero edge proxy hops); one CI cycle per deploy; one feature-flag surface |
| **S** | Strategic wins — alignment with broader ecosystem | Audric brand surface is single-app (audric.ai = web-v2 directly); future product slices (Audric Store catalog, agentic commerce, etc.) start from a clean monorepo; clean handoff to future agents (no "what's in apps/web vs web-v2" cognitive tax) |
| **U** | User-facing wins — UX, latency, capability the user feels | -150ms p50 latency on rewritten paths (eliminates the apps/web → web-v2 proxy hop verified in S.228 smoke); faster cold starts (web-v2's smaller boot surface); cleaner OAuth callback flow (no cross-app session ambiguity) |
| **F** | Future-proofing — what becomes possible after, not just easier | New product slices land in a single codebase (no architectural decision per feature about "which app does this live in"); engine + audric library decoupling fully realized (engine-fn-injection-refactor lands within Phase 2); Mysten-stack alignment maximized (audric is now end-to-end on the AI SDK + MCP + MemWal trio in a single app) |

**Cost accounting** sits separately in §6 — what we give up.

---

## 4 — Phase plan (v1.1 RESTRUCTURED PER S.245 D-2 REFRAME — Phase 5 RESTORED)

**5 phases all in v0.7e.** Each phase is independently shippable + rollbackable. Sequencing matters: deletions land before migrations (smaller surface to migrate); migrations land before final archive (verified working state). Final archive ritual (Phase 5) restored to v0.7e scope per L-8 (was deferred to v0.7f per L-7 SUPERSEDED).

**Phase summary table:**

| Phase | Scope | Effort | Owner | Status |
|---|---|---|---|---|
| Phase 1A | 5 safe-today deletion slices (page directories with rewrites + voice + build-id + dead code + payments) | ~3.5h | Agent (sequential ship) | **3 of 5 slices SHIPPED S.238** (4,233 LoC delete); 1A.2 voice + 1A.3 build-id deferred to Phase 2 zombie-code en-bloc delete |
| Phase 1B | ~~Chat-shell cutover prep~~ | — | — | **COLLAPSED per S.239 zombie-code lesson** — surgical apps/web cleanup is wasted work; defer to Phase 2 en-bloc delete |
| **S.245 pay_api delete** | Engine pay.ts + mpp-services.ts deletion + web-v2 pay_api scaffolding deletion + SDK/skills/CLAUDE.md updates | ~1.5-2h | Agent + 1 engine release | **IN PROGRESS S.245** (D-2 reframe execution) |
| Phase 2 | Engine + chat-coupled backend migration + chat-shell cutover + fn-injection refactor + 6 web-v2 route creations + absorbs voice/build-id surgical-defer | ~5-7d | Agent + 1 engine release | Gated on S.245 close + persistent chats Phase 1 close (per LOCK-0 B sequencing) |
| Phase 3 | Backend API migration (Tier C copy-port, 20+ routes) | ~2-3d | Agent | Gated on Phase 2 close |
| Phase 4 | Cron cutover (5 schedules + 24h soak) | ~1d + 24h passive | Founder ops + Agent | Gated on Phase 3 close |
| **Phase 5 (RESTORED v1.1)** | Marketing + legal + admin + L-5 archive ritual (apps/web → apps/web-legacy → delete Vercel project → DNS verify → delete rewrites → 24h grace → `rm -rf apps/web-legacy/`) | ~2-3d + 24h grace | Agent + Founder DNS verify | Gated on Phase 4 close |

### Phase 1A — Safe-today deletion sweep (~3.5h across 5 slices)

5 independently-shippable slices following the V07E_PHASE_1_EXECUTION_PLAN.md sequence. All slices use the proven cutover/total-delete pattern from S.228/S.229/S.231.

**Slice 1A.1 — Page directory deletion sweep (~1h)** — Delete `app/pay/[slug]`, `app/invoice/[slug]`, `app/settings/*`, `app/[username]` (rewrites all in place per `next.config.ts:114-166`). Cutover semantics: 2-hop apps/web → 4-hop web-v2 proxy. Verify per-page via `x-vercel-id` chain.

**Slice 1A.2 — Voice routes + hooks deletion (~30m)** — Per D-3 Option A. Delete 3 voice routes (337 LoC) + 2 hooks + remove CSP `microphone=(self)`. Total deletion (no rewrites, no web-v2 equivalent). Voice mode capability LOST.

**Slice 1A.3 — Build-id + version-check deletion (~30m)** — Per D-6 revised. Delete `/api/build-id` route + 4 chat-shell consumers (`useExpirySoonToast`, `useVersionCheck`, `ChunkErrorReloader`, `version-drift-check.ts`). Version-check capability LOST — same as web-v2's intentional non-feature.

**Slice 1A.4 — Dead-code cleanup (Memory + Settings) (~45m)** — Per D-1 audit finding. Delete `components/settings/MemorySection.tsx` (184 LoC) + `app/settings/page.tsx` + update stale `next.config.ts:93-95` comment. The `/api/user/memories` route is already gone (v0.7d Block A); this slice cleans up the orphan UI.

**Slice 1A.5 — Payments LIST + slug cutover (~45m)** — Per D-4. Delete `/api/payments` LIST + slug + verify routes + `components/panels/PayPanel.tsx`. LIST is total delete (no rewrite); slug + verify are cutover (rewrites exist).

**Acceptance (per slice):** typecheck/lint/test GREEN; per-slice post-deploy smoke confirms expected behavior (404 for total deletes; 4-hop proxy for cutovers); cumulative LoC delta in build tracker.

**Phase 1A cumulative LoC delete:** ~5-7k.

**Ship sequencing:** 1A.4 + 1A.5 first (lowest risk) → soak 1h → 1A.2 + 1A.3 → soak 1h → 1A.1 last (most cutover verification). Per V07E_PHASE_1_EXECUTION_PLAN.md §Forward windows.

### Phase 1B — DEFERRED INTO PHASE 2 (audit correction)

Per audit-correction 2026-05-21 ~21:00 AEST (V07E_PHASE_1_EXECUTION_PLAN.md §"Phase 1B"): the chat-shell cutover work (delete `/api/engine/*`, `/api/transactions/*`, `/new`, `/chat/[sessionId]`, etc.) requires path-remap rewrites + 6 missing web-v2 route equivalents (`regenerate`, `regen-append`, `resume`, `resume-with-input`, `sessions`, `sessions/[id]`, plus decisions on `/api/swap/quote`, `/api/quote`, `/api/history`). This is not safe-today work and structurally belongs with Phase 2's engine migration. Phase 1B is formally subsumed into Phase 2.

### Phase 2 — Engine + chat-coupled backend migration + chat-shell cutover + fn-injection refactor (~5-7 days, revised from ~3-4d)

**Scope:**

| Sub-slice | Surface | Mechanic | Effort |
|---|---|---|---|
| **2.0** | vitest infra (L-8A choice) | Configure vitest in web-v2; copy `apps/web/vitest.config.ts` + `vitest.setup.ts` + adapt setup for web-v2 env contract | ~1d |
| **2.1** | `apps/web/lib/engine/*` migration (56 files, ~10,277 LoC source + 10,701 LoC tests) | `git mv apps/web/lib/engine apps/web-v2/lib/engine`; update imports across web-v2 chat routes; migrate 37 test files (drop mpp-services-tool.ts per L-7 — stays in apps/web shim) | ~1.5-2d |
| **2.2** | chat-shell cutover (former Phase 1B) | Add rewrites for `/api/transactions/{prepare,execute}` (web-v2 has equivalents at same paths); add path-remap rewrite `/api/engine/chat` → `/api/chat`; create web-v2 equivalents for `/api/engine/{regenerate,regen-append,resume,resume-with-input,sessions,sessions/[id]}` OR define feature-loss matrix (founder call); add page rewrites for `/new`, `/chat/[sessionId]` | ~1.5-2d |
| **2.3** | `/api/swap/quote` + `/api/quote` + `/api/history` | Create web-v2 equivalents (~3 routes, ~250 LoC); update engine tools that call them | ~0.5-1d |
| **2.4** | Delete apps/web chat-shell | After 2.1-2.3 cutover: delete `app/api/engine/*` (6 routes), `app/api/transactions/*`, `app/api/swap/*`, `app/api/quote`, `app/api/history`, `app/new`, `app/chat/[sessionId]` | ~0.5d |
| **2.5** | engine-fn-injection-refactor | Per AUDIT_ENGINE_FN_INJECTION_REFACTOR.md corrected scope: extract `lib/analytics/{spending,yield-summary}.ts` (P1) + extract payments lib functions (P2) + define `AudricApi` interface in engine (P3) + migrate 13 fetch sites to use injection (P4) + wire `AudricApi` impl in web-v2's engine-factory (P5) + release engine vNNN + commit + smoke (P6) | ~1.5-2d |

**Acceptance:** all chat-coupled APIs serve from web-v2 directly (no proxy hop); engine-factory imports web-v2's lib directly (no audric-api.ts HTTP self-fetches); engine vNNN published; one full chat-turn smoke against a real wallet against web-v2 directly (skip the audric.ai rewrite) to verify no engine-fetch breaks; 37 migrated tests GREEN in web-v2; `AUDRIC_INTERNAL_KEY` deleted (closes engine-internal-key-final-delete backlog row); apps/web's chat-shell routes deleted (cutover pattern confirmed via x-vercel-id chain).

**Estimated effort:** 5-7 days (revised from 3-4d to absorb 1B cutover prep + L-8A vitest setup + 6 missing route creations).

### Phase 3 — Backend API migration (Tier C copy-port, 20+ routes) (~2-3 days)

Migrate the remaining backend routes that are NOT chat-coupled. Most have web-v2 counterparts already (from Session 4.5). For those that don't, copy-port.

**Scope:**

| Surface | Effort |
|---|---|
| `app/api/activity` | ~¼ day |
| `app/api/analytics/{activity-heatmap, portfolio-multi, weekly-summary}` (3 routes) | ~½ day |
| `app/api/build-id` | ~¼ day |
| `app/api/identity/{change, check, reserve, search}` (4 routes) | ~½ day |
| `app/api/positions` | ~¼ day (verify web-v2 equivalent first) |
| `app/api/prices` | ~¼ day |
| `app/api/rates` | ~¼ day (verify web-v2 equivalent first — `lib/rates.ts` was factored in Session 4.5) |
| `app/api/suins` | ~¼ day |
| `app/api/user/{financial-profile, preferences, status, tos-accept, wallets, watch-addresses}` (6 routes) | ~1 day |
| `app/api/user/memories` (GET + DELETE) | DECISION — keep as legacy fallback for direct calls (per v0.7d signpost rationale) OR delete entirely (v0.7d completed memory pipeline retirement); founder lock needed |

**Acceptance:** each route has a web-v2 equivalent with identical request/response shape; web-v2 typecheck/lint/test/build GREEN; production smoke against each migrated route via web-v2 direct URL.

**Estimated effort:** 2-3 days.

### Phase 4 — Cron cutover (~1 day + 7d soak buffer)

The dedicated cron-migration phase (per L-3 lock). 5 cron schedules move from apps/web's `vercel.json` to apps/web-v2's `vercel.json`. Per §11.3 of the v0.7c runbook: `*/5 * * * *` `turn-metrics-pending-sweep` creates a window risk if apps/web stops before web-v2 starts.

**Mitigation plan (locked):**

1. Add cron handlers to `apps/web-v2/app/api/cron/*` (5 routes — same paths, same logic).
2. Create `apps/web-v2/vercel.json` with the same 5 schedules.
3. Deploy web-v2 with new crons LIVE (both web-v2 + apps/web crons firing — idempotent operations safe to double-fire).
4. **Monitor TurnMetrics dashboard for 10 minutes:** verify both crons see the same row movement; no rows missed; no rows duplicated.
5. Remove cron schedules from apps/web's `vercel.json`.
6. Deploy apps/web → only web-v2 crons firing.
7. Monitor TurnMetrics dashboard for 24h: zero missed rows, zero stuck rows.

**Critical idempotency check:** before deploying step 3, verify every cron handler is idempotent (running twice in the same minute must produce the same result as running once). All 5 today's crons claim to be — verify this pre-Phase-4 in a dry-run script.

**Scope:**

| Cron | Schedule | Idempotent? | Notes |
|---|---|---|---|
| `conversation-log-retention` | `30 3 * * *` daily | ✅ verified — deletes >90d rows; running twice is a no-op | |
| `financial-context-snapshot` | (every 6h?) | TBD | Daily UserFinancialContext snapshot per CLAUDE.md |
| `portfolio-snapshot` | `0 7 * * *` daily | TBD | Daily PortfolioSnapshot row write; needs upsert semantics for double-fire safety |
| `turn-metrics-cleanup` | `0 3 * * *` daily | ✅ verified — deletes >7d completed rows | |
| `turn-metrics-pending-sweep` | `*/5 * * * *` every 5min | TBD — **highest risk** | Pending-actions sweeper; double-fire OK if updates are conditional on pending state |

**Acceptance:** all 5 crons firing from web-v2 only; 24h of TurnMetrics observability with zero anomalies; apps/web's `vercel.json` either deleted or has zero `crons[]` entries.

**Estimated effort:** 1 day + 24h passive observation (founder-owned).

### Phase 5 — RESTORED to v0.7e scope per S.245 D-2 REFRAME (L-8 supersedes L-7)

**v1.1 RESTORATION RATIONALE:** S.244 deferred Phase 5 to v0.7f to preserve pay_api capability via an apps/web shim. S.245 reframed D-2 to "DELETE pay_api entirely + redesign in Audric Store SPEC." With pay_api gone from engine + web-v2, apps/web has no remaining reason to exist — Phase 5 executes the L-5 archive ritual cleanly in v0.7e.

**Scope (v1.1):** Migrate the last surfaces (marketing landing + legal pages + admin + SEO/framework files) then execute the L-5 archive ritual.

**Sequencing:** Ships LAST in v0.7e. Phase 5 dependencies: Phases 1A, 2, 3, 4 complete + cron cutover 24h soak clean + S.245 pay_api delete complete.

### Phase 5 detail — Marketing + legal + admin + L-5 archive ritual

Migrate the last surfaces (marketing landing + legal pages + admin + SEO/framework files) then execute the L-5 archive ritual.

**Scope:**

| Surface | Effort |
|---|---|
| `app/page.tsx` (marketing landing) + `components/landing/*` (~1,800 LoC) | ~1 day (per L-4 — copy verbatim, no redesign) |
| `app/(legal)/{disclaimer, privacy, security, terms}` (4 pages + layout) | ~½ day |
| `app/litepaper` | ~¼ day |
| `app/(internal)/admin/scaling` | ~¼ day (verify usage; if zero, DELETE) |
| `app/opengraph-image.tsx` + `app/sitemap.ts` + `app/layout.tsx` + `globals.css` + `fonts/` | ~¼ day (web-v2 already has its own; need to merge OG/sitemap into web-v2's layout) |
| **L-5 archive ritual:** rename apps/web → apps/web-legacy + delete Vercel project + DNS verification + delete next.config.ts rewrites | ~½ day |

**Acceptance:** `audric.ai/` resolves to web-v2 directly (no proxy hop); all 5 surfaces above render from web-v2; `apps/web-legacy/` exists as the archived git history; the Vercel project for apps/web no longer exists in the dashboard; `apps/web-v2/next.config.ts` has no rewrites block.

**Estimated effort:** 2-3 days including the archive ritual + verification.

---

## 5 — Risk surface (v1.0 — augmented)

### R-1 — vitest infrastructure parity (P1 — Phase 2.0)

Phase 2 migrates 37 `.test.ts` files from `apps/web/lib/engine/__tests__/` into web-v2 which doesn't have vitest configured today. Without vitest infra, the migrated tests fail silently (`pnpm test` returns "no test files"). Per L-8: agent recommends L-8A (configure vitest first, ~1d setup work). Mitigation locked in Phase 2.0 sub-slice. Founder lock on L-8A vs L-8B required before Phase 2 starts.

### R-2 — Cron cutover window risk (P1 — dedicated mitigation in Phase 4)

Per §11.3 of the v0.7c runbook. Mitigation strategy locked above. Probability: low given idempotent semantics. Impact if it fires: medium (some pending-actions wait 5 minutes longer than expected, but no data loss).

### R-3 — Marketing landing regression risk (DEFERRED with Phase 5 to v0.7f)

Marketing landing is the highest-traffic page on audric.ai (anonymous visitors). Risk is now a v0.7f concern. Mitigation pattern carried forward: ship marketing migration as a Vercel preview deploy first; founder smoke against the preview before flipping production rewrite.

### R-4 — DNS cutover risk (DEFERRED with Phase 5 to v0.7f)

DNS propagation can take up to 48h depending on TTL. Now a v0.7f concern. Mitigation pattern carried forward: lower TTL to 60s 24h before the final archive ritual; bump back to default after verification.

### R-5 — Hidden cross-app import discovery during Phase 1 (P3)

Some apps/web → web-v2 cross-app imports may exist that aren't surfaced by simple typecheck (e.g. dynamic imports, string template paths). Mitigation: Phase 1A includes deep `rg` audit per V07E_PHASE_1_EXECUTION_PLAN.md sub-slice checklists for any string match against deleted apps/web paths.

### R-6 — Engine release timing during Phase 2 (P2)

The engine-fn-injection-refactor (per L-2) requires an engine release. If web-v2 picks up the new engine version BEFORE the apps/web cleanup ships (concurrent merge), engine could call lib functions that don't exist yet. Mitigation: serialize the release — engine release SHIPS first → web-v2 pnpm update + deploy → THEN apps/web deletion (Phase 2.4).

### R-7 — Founder bandwidth for Phase 4 cron observation (P3)

Phase 4's 24h dashboard observation needs founder eyes (TurnMetrics anomaly detection isn't automated). Mitigation: ship Phase 4 on a Monday so the observation window covers a full business cycle; book the observation window explicitly in the calendar.

### R-8 — Phase 5c PostWriteRefreshSurface shelf is permanent (P3, INFO)

Per S.236 audit (2026-05-21): the legacy PWR surface in apps/web wraps post-write refresh tool blocks ("AFTER YOUR APPROVAL · REFRESHING STATE" header) by reading `source: 'pwr'` markers. AISDKEngine v2 does NOT emit these markers; web-v2 relies on cache invalidation + LLM re-firing reads instead. v0.7e does NOT restore this UX. Decision: PWR surface stays shelved through v0.7e+; reconsider in v0.7f only if user feedback signals a UX gap. No risk to v0.7e — calling it out so future agents don't try to "fix" the missing surface mid-migration.

---

## 6 — What we give up (cost accounting — v1.0 REVISED PER D-2)

| Cost | Why it's acceptable |
|---|---|
| ~2-3 calendar weeks of agent + founder time (v0.7e Phase 1-4 only) | Compounds every future product slice's velocity. Pay_api deferred to v0.7f Agentic Commerce SPEC. |
| apps/web survives as ~5,000 LoC MPP-only shim until v0.7f | Forced by D-2 finding; web-v2 explicitly excludes pay_api (Phase 4b 2026-05-19 lock). Trying to bundle pay_api into v0.7e would extend the SPEC by ~3-5 days for the most complex tool. |
| Final archive ritual + DNS cutover (former Phase 5) deferred to v0.7f | Decoupled because pay_api migration timeline is the gating factor for archive. |
| 24h soak between each phase + 24h cron cutover observation | Catches problems faster than batching observation. |
| Code review for ~10-15k LoC of `git mv` patches in Phase 2 | Mostly mechanical; founder review focused on the interface points (engine release, cron cutover). |
| L-8A vitest setup cost (~1 day) | Preserves 37 test files of coverage; alternative (L-8B delete) saves a day but creates blind spots in web-v2 during max-stress migration. |

**What we DON'T give up:**
- The chat surface stays on web-v2 throughout (no rollback exposure to apps/web's chat shell).
- The memory layer + HITL native stays on MemWal + AI SDK native (v0.7d locked).
- Phase 7 observation + Phase 8 work continues independently.
- New product slices can start drafting against the post-v0.7e baseline DURING v0.7e execution (e.g. Audric Store catalog SPEC, v0.7e persistent-chats SPEC, v0.7f Agentic Commerce SPEC).
- Test coverage (L-8A locks vitest setup; 37 test files survive the migration).

---

## 7 — D-questions (v1.0 — AUDITED, awaiting founder lock) — ⚠️ STALE TABLE

> **⚠️ Table text below is PRE-S.245 + PRE-S.252.** The v1.1 banner (top of doc) supersedes D-2 with the B+ DELETE reframe; the S.252 banner (`V07E_D_QUESTION_AUDITS.md` updated header) supersedes D-3, D-6, D-8 with founder ratifications + adds D-9 (kill all 6 `/api/engine/*` routes — empty feature-loss matrix) + D-10 (delete legacy `/api/history`; dies with Phase 2.5 + Phase 6). Do NOT trust the per-row "v1.0 recommendation" or "Blocks v0.7e?" columns — defer to `V07E_D_QUESTION_AUDITS.md` (it has the post-S.252 SSOT). Re-rewriting the table inline is deferred housekeeping; the cross-doc pointer is sufficient for now.

All 7 questions audited in `V07E_D_QUESTION_AUDITS.md` 2026-05-21. Evidence-backed recommendations below supersede SPEC v0.1 defaults. Founder lock makes them binding.

| ID | Question | v0.1 default | v1.0 recommendation (post-audit) | Blocks v0.7e? |
|---|---|---|---|---|
| **D-1** | `/api/user/memories` (GET + DELETE) — delete or keep as legacy fallback? | DELETE entirely | **DEAD CODE — already deleted by v0.7d Block A.** Audit found the route is gone, but `components/settings/MemorySection.tsx` (184 LoC) + `app/settings/page.tsx` are orphan UI. Stale comment at `next.config.ts:93-95`. **Action:** ship in Phase 1A.4 dead-code cleanup slice. | NO |
| **D-2** | `/api/services/*` (MPP pay_api) — migrate or delete? | AUDIT FIRST | **DEFER TO v0.7f (Agentic Commerce SPEC).** Web-v2 EXPLICITLY EXCLUDES pay_api via `WRITE_TOOLS.filter` (Phase 4b 2026-05-19 lock). Pulling pay_api into v0.7e Phase 2 adds ~3-5d for the most complex tool. **Action:** apps/web survives as ~5,000 LoC MPP-only shim until v0.7f. L-7 lock added; Phase 5 deferred. | **⚠️ YES — forces v0.7e scope shrink to Phase 1-4; L-5 archive deferred to v0.7f.** |
| **D-3** | `/api/voice/*` — migrate or delete? | DELETE | **DELETE in Phase 1A.2 (matches v0.7c audit-3 zero-usage finding).** Voice mode capability LOST. Alternative: defer with pay_api (Option B) — agent recommends Option A to keep shim minimal. | NO (Option A); MAYBE (Option B extends shim scope) |
| **D-4** | `/api/payments` rewrite-cover verify | AUDIT FIRST → DELETE | **DELETE in Phase 1A.5** along with PayPanel + slug routes (cutover pattern for slug; total delete for LIST). | NO |
| **D-5** | Marketing landing scope (Phase 5 — now v0.7f) | LOCK L-4 (pure copy-port) | **RATIFY L-4 (pure copy-port; legal-vetted text, no redesign).** Now executes in v0.7f. | NO |
| **D-6** | `/api/build-id` keep post-v0.7e? | MIGRATE for now | **REVISED: DELETE in Phase 1A.3.** All 4 consumers are chat-shell; web-v2 deliberately doesn't have version-check. | NO |
| **D-7** | Keep `apps/web-legacy/` dir on disk? | DELETE after archive | **RATIFY DELETE** (git history is SSOT). Now executes in v0.7f. Defer actual `rm -rf` 24h post-Phase-5 for transition grep window. | NO |
| **D-8 (NEW v1.0)** | L-8: vitest infrastructure decision for Phase 2.0 | — | **L-8A (configure vitest in web-v2).** ~1d setup work in Phase 2.0. Preserves 37 test files of coverage. L-8B (delete tests during migration) saves 1d but loses coverage at the worst time. | Yes (gates Phase 2 start) |

**Single biggest finding:** D-2 forces v0.7e Phase 5 (final archive) to defer to v0.7f. v0.7e ships Phases 1-4 only.

**Founder lock required on:**
1. D-2 acceptance (scope-shrink to Phase 1-4 only)
2. D-3 Option A vs B (DELETE voice vs defer with pay_api)
3. D-8 L-8A vs L-8B (vitest setup vs delete tests)
4. Ratify D-1 / D-4 / D-5 / D-6 / D-7 (all unambiguous post-audit)

---

## 8 — Acceptance gates (v1.0 REVISED PER D-2) — ⚠️ G5/G6 STALE

> **⚠️ G5 + G6 below describe the v1.0 D-2=DEFER world (apps/web shim survives v0.7e).** Per v1.1 (S.245) + S.252 locks: G5 is REVIVED (Phase 5 ships in v0.7e); G6 closes when apps/web dies entirely (no MPP shim survives). The G2 row also predates the S.252 Q2 lock (kill all 6 `/api/engine/*` routes — empty feature-loss matrix) and Q3 lock (`/api/history` dies with Phase 2.5 + Phase 6, NOT a separate migration). Defer to `V07E_PHASE_2_PRE_EXECUTION_AUDIT.md` §LOCKED DECISIONS + §8 next-session checklist for the post-S.252 phase-gate semantics.

Each phase has a gate. Phase N+1 doesn't start until Phase N's gate closes.

| Gate | What closes it |
|---|---|
| **G1A — Phase 1A (5 deletion slices)** | All 5 sub-slices (1A.1-1A.5) shipped per V07E_PHASE_1_EXECUTION_PLAN.md; typecheck/lint/test/build GREEN on apps/web + apps/web-v2; per-slice post-deploy smoke confirms expected behavior (404 for total deletes; 4-hop proxy for cutovers); cumulative LoC delta in build tracker. |
| **G2 — Phase 2 (engine + chat-coupled backend + chat-shell cutover + fn-injection)** | Sub-slices 2.0-2.5 complete; engine-fn-injection-refactor SHIPPED (engine vNNN released); 13 fetch sites use function injection (not HTTP); web-v2's engine-factory imports lib directly; 37 migrated tests GREEN in web-v2 (L-8A executed); `AUDRIC_INTERNAL_KEY` deleted; apps/web's chat-shell routes deleted (cutover verified via x-vercel-id chain); one full chat-turn smoke against a real wallet via web-v2 direct URL succeeds. |
| **G3 — Phase 3 (backend API migration, Tier C copy-port)** | All 20+ remaining backend routes serving from web-v2; production smoke confirms identical request/response shapes. |
| **G4 — Phase 4 (cron cutover)** | All 5 crons firing from web-v2 only; 24h TurnMetrics observation passed with zero anomalies; apps/web's `vercel.json` has zero `crons[]` entries. |
| ~~**G5**~~ | DEFERRED TO v0.7f per D-2 / L-7 |
| **G6 — Final v0.7e acceptance (v1.0 REVISED)** | Phase 1-4 gates closed; apps/web shrunk to ~5,000 LoC MPP-only shim hosting `/api/services/*` (pay_api 3-leg flow) + supporting MPP UI/hooks + minimal chat-shell routes; web-v2 hosts everything else (chat, settings, store, pay primitives, backend, crons); founder sign-off on the brand surface (audric.ai still works correctly + chat works + all non-pay_api Audric flows live in web-v2). v0.7f Agentic Commerce SPEC drafted as the forward window. |

---

## 9 — Measurement plan (v1.0 — Phase 0 baseline captured)

Phase 0 baseline captured 2026-05-21 ~20:30 AEST per `V07E_PHASE_0_BASELINE.md` (referenced; not duplicated here). Targets revised for v1.0 scope-shrink (Phase 5 deferred to v0.7f).

| Measurement | Phase 0 baseline | Target (post-v0.7e Phase 4 close) | Target (post-v0.7f archive) | Source |
|---|---|---|---|---|
| apps/web LoC (`wc -l` excluding tests/node_modules) | ~30,000 source LoC (per V07E_PHASE_0_BASELINE.md) | ~5,000 (MPP-only shim) | 0 (archived) | `wc -l` |
| Active Vercel projects | 2 (audric, audric-web-v2) | 2 (unchanged in v0.7e) | 1 (audric-web-v2) | Vercel dashboard |
| Active Vercel cron schedules | 5 in apps/web's `vercel.json` | 5 in apps/web-v2's `vercel.json` | unchanged | `vercel crons list` |
| Edge proxy hops on chat-coupled `/api/*` | 2 (audric.ai → web-v2 via rewrite) | 1 (apps/web routes deleted; web-v2 direct via rewrite) | 1 (DNS direct) | `x-vercel-id` chain length |
| Edge proxy hops on `/api/services/*` (pay_api) | 0 (served direct by apps/web) | 0 (unchanged in v0.7e) | 1 (web-v2 direct) | `x-vercel-id` chain length |
| Cross-app imports (`rg "from \"apps/web/" apps/web-v2/`) | TBD (run pre-Phase-2.1) | 0 | 0 | `rg` output |
| Engine HTTP self-fetches (per AUDIT_ENGINE_FN_INJECTION_REFACTOR.md) | 13 sites across 7 tools | 0 (all use function injection) | unchanged | `rg "fetch.*audric-api" packages/engine/` |
| Engine env-var dependency `AUDRIC_INTERNAL_KEY` | Required (validated by env-gate) | DELETED (fn-injection removes need) | unchanged | `apps/web-v2/lib/env.ts` schema |
| Test coverage in web-v2 (post Phase 2.0 + 2.1) | 0 vitest files (web-v2 has no vitest config) | 37 migrated tests GREEN (L-8A) | unchanged | `pnpm --filter audric-web-v2 test` |
| p50 latency on `/api/analytics/spending` | TBD (current 2-hop chain) | -100ms to -200ms (single-hop) | unchanged | Vercel Analytics |

---

## 10 — Forward windows (v1.0 — REORDERED)

After v0.7e Phase 4 closes (Phase 5 deferred to v0.7f per D-2 / L-7), the natural next slices:

1. **v0.7f Agentic Commerce SPEC** (immediate next SPEC) — ships pay_api in web-v2 with new MPP UI (ServiceCatalogCard / MppReceiptGrid / DownloadableArtifact) + classify-gateway-response logic + L-5 archive ritual of apps/web. Per L-7. Forecast ~5-7d agent + ~2-3d archive ritual.
2. **v0.7e Persistent Chats SPEC** (independent of v0.7e structural; can ship in parallel) — `spec/active/BENEFITS_SPEC_v07e_persistent_chats.md` v0.1 SKELETON (drafted 2026-05-21 / S.233). 5 phases, ~1.5-3d depending on ORM lock (LOCK-1). MUST wait for v0.7d Phase 7 close.
3. **Audric Store catalog** (post-v0.7f product work) — agentic commerce per `AUDRIC_AGENTIC_COMMERCE_SPEC_DRAFT.md`.
4. **Engine v3.0.0 ship** — drain BENEFITS_SPEC_v07a Phase 7 (engine `bridge/` deletion sweep). Independent of v0.7e/v0.7f but easier post-archive.
5. **MemWal Phase 3.5** — full memory controls in `/settings/memory` per v0.7d Phase 3.5 backlog.
6. **PERMISSION_PRESETS extraction** — extract to `@t2000/engine/presets` per v0.7c Session 4.6 P0 (deferred). Trivial post-archive.

None of these are v0.7e structural scope. v0.7e is the second-to-last migration hop (v0.7f closes it); new work starts FROM the post-v0.7f baseline.

---

## 11 — How this SPEC gets used

1. **At Phase 0 baseline capture:** ✅ DONE — V07E_PHASE_0_BASELINE.md captures `wc -l` actuals; §9 baseline column references it.
2. **At each Phase N start:** re-read §0 (locks), §1 (surface), §2 (gates), §N (scope + acceptance), §13 (anti-patterns).
3. **At each Phase N close:** stamp the gate; capture the actual LoC delta in §1; update HANDOFF backlog rows.
4. **At v0.7e close (G6 — Phase 1-4):** stamp final measurement numbers in §9 (Phase 1-4 column); promote v0.7f Agentic Commerce SPEC + retain BENEFITS_SPEC_v07e.md in spec/active (open scope — Phase 5 belongs to v0.7f).
5. **At v0.7f close:** archive BENEFITS_SPEC_v07e.md to `spec/archive/v07e/` ALONGSIDE v0.7f's SPEC archive.
6. **Founder review per phase close:** ~15 min review of the build tracker entry + this SPEC's relevant section.

The drift between this SPEC and reality is the bug. The SPEC is the source of truth. Updates land as SPEC version bumps (v0.1 SKELETON → v1.0 LOCKED-PENDING-FOUNDER 2026-05-22 → v1.0 LOCKED on founder accept).

---

## 12 — Block 1 retrospective findings (lessons carried forward from v0.7c)

Per `V07C_RETROSPECTIVE.md` (Block 1 of 12h prep plan, 2026-05-22 ~00:00 AEST). The retrospective produced 6 lessons that directly shape v0.7e execution:

| Lesson | v0.7e application |
|---|---|
| **Audit-first cadence compresses scope by 50-99%** | Every phase has a pre-coding audit step. v0.7c Phase 6 Session 5 compressed 5 days to ~2h via audit. The D-question audit (V07E_D_QUESTION_AUDITS.md) compressed v0.7e scope via D-2 finding. Phase 2.1 (engine migration) gets an audit pass before `git mv`. |
| **Dead-rewritten routes hide in plain sight** | v0.7c discovered ~25k LoC of routes that never executed at runtime (rewrites to web-v2 made them dead). Phase 1A uses `RUNBOOK_v07c_phase_6_cutover.md` §9 rewrite-coverage map as its checklist. |
| **Cutover semantics ≠ deletion (rewrites are `afterFiles`)** | Local route deletion is the trigger that activates rewrites by default. Phase 1A.1 page-directory deletions are CUTOVERS (page-vis change from local to proxy), not pure deletes. Per-slice smoke verifies the proxy hop count. |
| **Multi-version runbooks force founder coordination** | v0.7c Phase 6 had 5 sessions; each session shipped independently. v0.7e Phase 1A has 5 sub-slices; each ships independently. Founder reviews after each slice, not after each phase. |
| **Founder push reframes the SPEC** | Multiple v0.7c phases compressed via founder "skip soak" / "skip preview / ship now" pushes. v0.7e bakes the same pattern: Phase 4 has explicit "founder may compress 24h soak" path. |
| **SPEC numbering chaos costs cycles** | v0.7d SPEC drift cost ~2h of "where does this go?" confusion. v0.7e numbering decisions land at SPEC v1.0 → SPEC v1.1 → SPEC v1.2 (semantic versions, not phase numbers). Phase numbers stay stable. |

---

## 13 — Anti-patterns explicitly rejected

Things that LOOK like good ideas during v0.7e execution but were rejected during v0.1 → v1.0 promotion:

| Anti-pattern | Why rejected |
|---|---|
| "While we're migrating pay_api in v0.7e Phase 2, let's redesign the MppCard for v2 patterns." | D-2 / L-7 forces pay_api deferral. Don't bundle it back in. |
| "Phase 5 (final archive) can ship in v0.7e if we just defer pay_api elsewhere first." | Same as above — pay_api migration is v0.7f scope; archive ritual is meaningless without it. |
| "Just delete the 37 test files instead of configuring vitest in web-v2 (L-8B)." | Test coverage during migration stress is exactly when bugs land. Pay the 1d vitest setup cost. |
| "Run Phase 2 fn-injection refactor BEFORE engine-fn migration (S.228 path1)." | Rejected by S.228 audit correction — engine-factory lives in apps/web today but the routes it self-fetches are rewritten. Run fn-injection AFTER engine moves to web-v2. |
| "Skip the per-slice smoke for Phase 1A — they're all deletions, what could break?" | v0.7c Phase 6 Session 5 caught a rewrite-coverage miss via per-slice smoke. Cutovers are NOT pure deletes — the proxy hop matters. |
| "Restore Phase 5c PostWriteRefreshSurface in v0.7e since we're already touching engine code." | S.236 audit blocked this — needs `source: 'pwr'` engine event emissions which AISDKEngine v2 doesn't implement. Cross-phase work + Phase 7 boundary crossing. Permanent shelf candidate. |
| "Migrate marketing landing now since it's only ~1,800 LoC." | Per L-4 + D-5: marketing is v0.7f scope (Phase 5 deferred). Pulling it into v0.7e fragments the brand surface review. |
| "Add `audric/web-v2` to the engine release smoke test via CI." | Out of scope for v0.7e structural. v0.7e is the LAST mechanical migration; CI improvements are post-v0.7f work. |
