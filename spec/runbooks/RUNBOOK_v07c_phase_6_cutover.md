# RUNBOOK — v0.7c Phase 6 Cutover (v3 — PHASED apps/web ARCHIVE TRAJECTORY)

> **Founder-owned ops + multi-session agent rebuild work.** Phase 6 of `spec/active/BENEFITS_SPEC_v07c.md`. Locked end state: **apps/web fully archived end of v0.7e** (3-phase trajectory: v0.7c → v0.7d → v0.7e).
>
> **Version history.**
> - **v1 (2026-05-19 ~17:30 AEST):** "freeze apps/web forever" model — route chat to web-v2, leave everything else untouched. **Superseded.**
> - **v2 (2026-05-19 ~18:30 AEST):** rebuild-don't-port discipline. Found two errors in v1: routing target wrong (`/` ≠ chat; chat is at `/new`); "keep everything" scope lazy. Rebuild settings P/S/C + Store + Pay/Invoice in v0.7c. **Superseded.**
> - **v3 (2026-05-19 ~21:30 AEST — THIS VERSION):** founder push *"everything used should be migrated and REBUILD-IN-WEB-V2 \u2014 cleaner pattern longer term."* Audit-3 ran a full apps/web inventory (671 files, 83k LoC source). Found that the rebuild trajectory splits into 3 tiers by cost-benefit: Tier A (real v2-pattern rebuild — UI surfaces), Tier B (pure deletion — chat shell + voice + replaced routes), Tier C (zero-v2-benefit copy-port — server-only APIs + marketing + legal + crons). Locked Option C: phased rebuild across v0.7c + v0.7d + v0.7e. apps/web archived end of v0.7e (same end state as "rebuild everything now in v0.7c" but with 3 independently shippable + rollback-able slices instead of one mega-phase carrying cron-cutover risk).
>
> **Status:** v3 runbook drafted 2026-05-19 ~21:30 AEST after audit-3 lock. Phase 6 = Tier A + Tier B (this runbook). v0.7d + v0.7e get their own specs (skeleton in Section 11). No code changes shipped this session (per Path A — fourth audit-first pass in a row).
>
> **⚠️ UPDATE 2026-05-20 ~15:55 AEST (S.198 + Phase 6.5 LOCK):** Chat-flip (Session 6's apply step) is **BLOCKED on `spec/active/SPEC_V07C_PHASE_6_5_CHAT_PARITY.md`**. Phase 6.5 audit surfaced 18 parity gaps between apps/web's `/new` and web-v2's `/chat` — 4 P0s (24 tools not wired + no rate limit + `SessionUsage` not logged + `<ChatGate>` missing) + 8 P1s (full 5-system Intelligence moat absent + `postWriteRefresh` not wired + permission preset ignored + ...). Phase 6 Sessions 1-5.5d are SHIPPED + production-stable; PR #88 routes Pay/Settings/Store/Internal-API to web-v2 successfully. Chat stays on apps/web until Phase 6.5 closes. See S.198 in `audric-build-tracker.md` for the full audit; the Phase 6.5 SPEC for the locked 14-item / 5-PR / ~4-5 day sprint.

---

## Section 0 — TL;DR

1. **End state (locked): apps/web fully archived end of v0.7e.** 3 independently shippable phases.
2. **v0.7c Phase 6 scope (this runbook): Tier A rebuild + Tier B delete.** Tier A = UI surfaces with real v2-pattern benefit (settings P/S/C + Store + Pay/Invoice). Tier B = pure deletion (chat shell + voice + `/api/engine/*`).
3. **v0.7d scope (its own spec): MemWal Memory wiring + lib/engine decouple + HITL native + structured-output classifier migration.** Memory settings UI rebuilt against MemWal data model in v0.7d (NOT in this Phase 6).
4. **v0.7e scope (its own spec): Tier C copy-port sweep + final apps/web archive.** Marketing landing + legal pages + litepaper + admin + ALL server-only APIs + crons. Pure copy-port (zero v2-pattern benefit; the migration mechanism is `git mv` + update imports + redeploy).
5. **Cutover URL is `/new`, NOT `/`.** Marketing landing at `audric.ai/` stays in apps/web through v0.7d; migrates to web-v2 in v0.7e.
6. **Phase 6 (v0.7c) is now multi-session**: Sessions 2-4 (rebuilds) → Session 5 (cleanups) → Session 6 (founder ops) → Session 7+ (post-soak deletion). ~7-9 agent days + founder ops + 7d soak.
7. **3-phase trajectory totals: ~25-36 agent days** across v0.7c (7-9d) + v0.7d (8-12d) + v0.7e (10-15d). Same end state as "rebuild all in v0.7c" (17-25d) but with lower-risk slicing.
8. **Rollback is per-path** (each rewrite block is independent). Partial rollback supported (roll back only `/settings/*` without touching chat, etc.).
9. **`/new` IS the deletion target**, not a blocker. Chat shell + voice + `/api/engine/*` + dashboard timeline all delete together post-soak.

---

## Section 1 — Scope Reality (audit-2 dispositions)

### 1.1 Per-surface disposition table — locked 2026-05-19 ~18:00 AEST

| Surface | LoC | Has chat-shell deps? | Disposition | Why |
|---|---|---|---|---|
| **CHAT MIGRATION (already done through Phase 5.5)** | | | | |
| `audric.ai/` marketing landing | 55 + ~10 landing components | None | **KEEP-IN-WEB** | Marketing page; redirects authed users to `/new`. No v2 patterns needed for a static landing. |
| `audric.ai/new` chat dashboard (legacy) | 2941 + 651 timeline | Heavy (`useEngine`, `executeToolAction`, `UnifiedTimeline`) | **DELETE post-cutover** | THE legacy chat shell. Replaced by web-v2's `/` via rewrite. Becomes redundant once rewrite goes live. |
| `audric.ai/chat/[id]` legacy session view | 30 LoC page + uses `useEngine` | Heavy | **DELETE post-cutover** | Same — replaced by web-v2's `/chat/[id]` via rewrite. |
| web-v2's `/`, `/chat/[id]`, `/api/audric-chat` | 211 files total (web-v2) | NEW patterns (useChat + streamText + Experimental_Agent) | **LIVE on web-v2** | Phase 1-5.5 of v0.7c built this. Already feature-complete on chat-shell concerns. |
| **REBUILDS BEFORE CUTOVER (this Phase 6 cycle)** | | | | |
| `/settings` shell (4-pane layout) | 186 | None | **REBUILD in web-v2** | Small wrapper; needs `<AuthGuard>` + sub-nav + section switching. ~½ day. |
| Settings: Passport sub-section | ~150 | None | **REBUILD in web-v2** | Wallet address + sign-in + network info. Trivial. ~½ day. |
| Settings: Safety sub-section | ~250 | None | **REBUILD in web-v2** — load-bearing | Permission preset toggle (conservative/balanced/aggressive) feeds chat's `permissionConfig`. Must co-locate with chat surface. ~1 day. |
| Settings: Memory sub-section | ~250 | None | **DEFER to v0.7d** | MemWal-aware redesign in v0.7d post-2026-05-29 stability. Don't port legacy `UserMemory` CRUD. Keep apps/web version running unchanged until v0.7d. |
| Settings: Contacts sub-section + `/settings/contacts` page | ~200 + 61 | None | **REBUILD in web-v2** | Web-v2 already has `/api/contacts/save`. Add CRUD UI. ~½ day. |
| `/[username]` Audric Store profile | 403 | One card (`PortfolioCardV2`, already in web-v2) | **REBUILD in web-v2 BEFORE cutover** | Public-facing Store surface. SuiNS lookup + portfolio panel + QR. Web-v2 already has PortfolioCardV2. ~1 day. |
| `/pay/[slug]` payment link landing | 63 | None | **REBUILD in web-v2** | Public payment landing. ~½ day. |
| `/invoice/[slug]` redirect | 10 | None | **REBUILD in web-v2** | 10-LoC `redirect()`. Trivial. ~5 min. |
| `/api/payments/*` (3 routes) | ~100 | None | **REBUILD in web-v2** | Backing API for /pay landing. ~½ day. |
| **KEEP-IN-WEB (no migration)** | | | | |
| `/api/identity/*` (4 routes) | ~? | None | **KEEP-IN-WEB** | Username CRUD; doesn't change often; not chat-adjacent. |
| `/api/analytics/*` (7 routes) | ~? | None | **KEEP-IN-WEB** | Data plumbing; consumed by canvas templates (which fetch via the analytics API). |
| `/api/internal/*` (10 routes) | ~? | Light (cache injection in some) | **KEEP-IN-WEB** | Server-only; cron internals. |
| Crons (4 routes — `financial-context-snapshot`, `profile-inference`, `chain-memory`, `user-memory-retention`) | ~? | None directly | **KEEP-IN-WEB** | Critical for daily `<financial_context>` snapshot; can't pause. |
| `/api/user/*` (8 routes — financial-profile, memories, preferences, wallets, watch-addresses, status, tos-accept) | ~? | None | **KEEP-IN-WEB** | Standalone APIs; consumed by settings (which will call back into apps/web for the deferred Memory section + KEEP-IN-WEB-only data). |
| `/api/voice/*` (3 routes) | ~? | None | **KEEP-IN-WEB or DEFER-DECISION** | Voice mode UI may be paused / unused. If founder confirms unused, can `DELETE` instead. TBD. |
| Legal pages (`/disclaimer`, `/privacy`, `/security`, `/terms`) | small | None | **KEEP-IN-WEB** | Standard legal pages. |
| `/litepaper` | ~? | None | **KEEP-IN-WEB** | Marketing-adjacent. |
| `(internal)/admin/scaling` | ~? | None | **KEEP-IN-WEB** | Internal-only. |
| `/auth/callback` | small | None | **REBUILD in web-v2** (already done — see `apps/web-v2/app/auth/callback/page.tsx`) | zkLogin OAuth callback. Web-v2 already has its own at the same path. The rewrite layer routes the callback to whichever app initiated the sign-in flow. |
| **6 TENDRILS RECAP** | | | | |
| Tendril 1: `/new/dashboard-content.tsx` | 2941 | The chat shell itself | **DELETE post-cutover** | Replaced by web-v2's `/` via rewrite. |
| Tendril 2: `/[username]/page.tsx` | 403 | 1 card import | **DELETE post-cutover** (rebuilt in web-v2) | Per Store rebuild. |
| Tendril 3: `UnifiedTimeline.tsx` | 651 | Heavy | **DELETE with tendril 1** | Only consumed by tendril 1. |
| Tendril 4: `instrumentation.ts` | ~75 | Cache injection | **KEEP-IN-WEB** | Env gate + cache injection + unhandled-rejection handlers. Not chat-coupled. |
| Tendril 5: `lib/proactive-marker.ts` | 26 | None | **DELETE NOW** (dead code) | 1-minute surgical delete. |
| Tendril 6: `lib/engine/{strip-llm-directives, init-engine-stores, harness-metrics}.ts` | ~10,295 | Engine library | **KEEP-IN-WEB initially**; decouple in v0.7d | Engine helpers used by chat AND non-chat (crons, instrumentation). Cleanup is v0.7d work. |

### 1.1.1 Audit-3 surfaces locked

Voice + pay_api dispositions (audit-3 specifics):

| Surface | LoC | Disposition | Notes |
|---|---|---|---|
| Voice (`/api/voice/*` + `lib/voice/` + `hooks/useVoice*`) | ~700 | **DELETE WITH CHAT SHELL (post-soak)** | Verified consumed ONLY by chat-shell internals (`ChatMessage`, `dashboard-content`, `BlockRouter`). Web-v2 chat has no voice mode. If voice becomes a future feature, it gets built fresh in v2. |
| MPP `pay_api` (`/api/services/*` + `lib/engine/mpp-services-tool.ts` + `GenericMppReceipt.tsx` + related canvases) | ~500 | **DELETE WITH APPS/WEB ARCHIVE (S.245 — V07E_D_QUESTION_AUDITS D-2 reframe)** | 2026-05-22: engine-side `pay_api` + `mpp_services` tools deleted (S.245). The legacy MPP gateway capability returns as a clean-slate Commerce primitive in the upcoming Audric Store SPEC. The web-side `/api/services/*` routes, `GenericMppReceipt.tsx`, canvases, and `mpp-services-tool.ts` are now permanently unreachable from web-v2 (it filters them out of `writeToolsForWebV2`). They die en-bloc with apps/web in v0.7e Phase 5. |

### 1.2 Estimated LoC delta after Phase 6 + post-soak deletion

| Phase | New LoC in web-v2 | Deleted LoC in apps/web | Net |
|---|---|---|---|
| Settings rebuild (Passport+Safety+Contacts) | ~+1,000 (clean v2 patterns) | 0 (apps/web settings stays live during soak) | +1,000 |
| Store rebuild | ~+600 | 0 (apps/web Store stays live during soak) | +600 |
| Pay/Invoice rebuild | ~+400 | 0 (apps/web Pay/Invoice stays live during soak) | +400 |
| Cutover (rewrites + smoke + flip) | 0 | 0 | 0 |
| 7d soak | 0 | 0 | 0 |
| Post-soak deletion sweep | 0 | ~-24,700 to -33,700 (chat-shell) + ~-1,800 (apps/web settings/store/pay/invoice + their backing APIs) | -26,500 to -35,500 |
| **NET** | **~+2,000 in web-v2** | **~-26,500 to -35,500 in apps/web** | **~-24,500 to -33,500 overall** |

Apps/web stays alive POST-v0.7c for: crons (4), internal API (10), analytics (7), identity (4), user (8 — minus Memory which keeps using legacy), legal (4), litepaper, admin, marketing landing, canonical lib (~8k LoC). **Apps/web becomes a backend + marketing app post-v0.7c, NOT archived yet.** Voice + pay_api delete with chat shell (pay_api engine tool already deleted S.245 — only the apps/web routes remain as zombie code). Per audit-3 lock + S.245 reframe: **apps/web fully archived end of v0.7e** (Tier C copy-port sweep + cron migration + final archive — see Section 11 below).

### 1.3 Why this is the right shape

- **Memory deferred to v0.7d** because MemWal redesigns the data model. Rebuilding the legacy CRUD is double-work.
- **Settings rebuild includes Safety** because the permission preset feeds into every chat turn's `permissionConfig`. Co-locating with chat surface is meaningful.
- **Store rebuild before cutover** because Audric Store will evolve as a product (per `AUDRIC_AGENTIC_COMMERCE_SPEC_DRAFT.md`). Foundational rebuild now means future Store features land in web-v2 natively.
- **Pay/Invoice rebuild** to land all public-facing Audric surfaces in web-v2. Payment links + invoices are revenue-adjacent — worth the clean v2 patterns.
- **Server-only stuff stays in apps/web** because it has no UI and no v2-pattern benefit. The crons especially MUST keep running uninterrupted.

---

## Section 2 — Routing Correction + Final Rewrite Config

### 2.1 The correction

**v1 of this runbook said: rewrite `audric.ai/` → web-v2.** THAT WAS WRONG. `audric.ai/` is the marketing landing page; rewriting it would break anonymous landing + every marketing OG link.

**Correct routing**: marketing stays at `/`; chat surfaces live at `/new` + `/chat/[id]`; settings/store/pay/invoice migrate to their own paths.

### 2.2 Final rewrite config

After all rebuilds land (sessions 2-4 below), the cutover commit adds these rewrites to `apps/web/next.config.ts`:

```typescript
async rewrites() {
  const webV2 = 'https://audric-web-v2.vercel.app'; // founder-confirmed prod URL
  return [
    // CHAT (v0.7c migration target — RETARGETED in S.197a + RENAMED in S.197b)
    //
    // S.197a (audit + Path A lock): the original v3 runbook routed /new
    // → web-v2/ which would have landed users on the template's (chat)
    // group + ChatShell + TEMPLATE backend (`/api/chat` with weather/
    // document/etc. template tools). The audit caught the architectural
    // ambiguity: the production-verified working Audric chat (S.195
    // happy path) lived at web-v2/audric-chat, NOT web-v2/. Path A
    // retargets the rewrite to that surface.
    //
    // S.197b (page + API rename, founder request 2026-05-20 ~14:17 AEST):
    // `/audric-chat` was template-debris naming — added in Phase 2 to
    // dodge the pre-existing template `/chat/[id]` route. With Path A
    // making the template chat routes dead-code, S.197b deleted the
    // template `(chat)/chat/` + `(chat)/api/chat/` folders + git-mv'd
    // `app/audric-chat/` → `app/chat/` AND `app/(chat)/api/audric-chat/`
    // → `app/api/chat/`. The natural `/chat` + `/api/chat` URLs now
    // serve Audric's production chat. ~350 LoC of template chat-route
    // deletes pulled forward from Session 9a → S.197b.
    //
    // The remaining template `(chat)` route group (page.tsx + layout.tsx
    // + actions.ts + 7 unused API routes: document/files/history/
    // messages/models/suggestions/vote) continues to die wholesale in
    // Session 9a per §9.2.A.
    { source: '/new',                     destination: `${webV2}/chat` },
    { source: '/api/chat',                destination: `${webV2}/api/chat` },
    { source: '/api/transactions/:path*', destination: `${webV2}/api/transactions/:path*` },
    // NOTE: `/new/:path*` and `/chat/:path*` removed — audric-chat (now
    // at `/chat`) is a SINGLE-CONVERSATION surface (no chat-history
    // routing). MemWal memory recall in v0.7d supersedes chat history
    // as the cross-session continuity primitive (CLAUDE.md §Audric
    // Intelligence + S.197).

    // SETTINGS (rebuilt in Session 2; Memory section excluded — stays on apps/web)
    { source: '/settings',                destination: `${webV2}/settings` },
    { source: '/settings/passport',       destination: `${webV2}/settings/passport` },
    { source: '/settings/safety',         destination: `${webV2}/settings/safety` },
    { source: '/settings/contacts',       destination: `${webV2}/settings/contacts` },
    // NOTE: `/settings/memory` IS rewritten to web-v2 — web-v2 renders a v0.7d deferral signpost card (S.188 refinement). Legacy `/api/user/memories` GET/DELETE on apps/web stay operational for direct calls.

    // AUDRIC STORE (rebuilt in Session 3)
    { source: '/:username((?!api|_next|new|chat|settings|pay|invoice|disclaimer|privacy|security|terms|litepaper|auth).*)', destination: `${webV2}/:username` },
    // Regex negative-lookahead: don't rewrite if path matches any reserved top-level route.

    // PAY + INVOICE (rebuilt in Session 4)
    { source: '/pay/:path*',              destination: `${webV2}/pay/:path*` },
    { source: '/invoice/:path*',          destination: `${webV2}/invoice/:path*` },
    { source: '/api/payments/:path*',     destination: `${webV2}/api/payments/:path*` },

    // Everything else stays on apps/web (default — no rewrite needed):
    //   /, /litepaper, /disclaimer, /privacy, /security, /terms,
    //   /(internal)/admin, /api/cron/*, /api/internal/*, /api/analytics/*,
    //   /api/identity/*, /api/user/*, /api/voice/*, /api/portfolio, /api/positions,
    //   /api/prices, /api/rates, /api/quote, /api/swap/*, /api/suins/*, etc.
  ];
},
```

### 2.3 Rollback granularity

Each rewrite block is per-path → **partial rollback is possible**. If smoke surfaces a regression specific to settings, comment out the `/settings/*` rewrites and redeploy — chat keeps working on web-v2; settings falls back to apps/web. This per-path isolation is a meaningful upgrade over a single `/`-level rewrite.

---

## Section 3 — Multi-Session Sequence

Phase 6 is no longer a single session. Eight agent sessions (5 already shipped + Sessions 5–7 ahead) + founder ops + 7d soak. Each session has its own audit-first cadence ("what v2 patterns? what components? what shape?"). Sessions 1–4 ✅ shipped 2026-05-19; Session 4.5 (internal-API sweep) ✅ shipped 2026-05-20 — atomic port of all 6 routes engine tools call (`/api/internal/payments` + `/api/portfolio` + 4 `/api/analytics/*`) + canonical SSOT `lib/portfolio.ts` (LEAN — Upstash adapter layer deferred); single `AUDRIC_INTERNAL_API_URL` env flip + 6 Vercel rewrites slot into Session 5; invoice product deprecation DEFERRED to own mini-SPEC after Phase 6.

### Session 1 — Audit + revised runbook ✅ SHIPPED 2026-05-19 ~18:30 AEST

You're reading the output.

### Session 2 — Settings rebuild (Passport + Safety + Contacts) ✅ SHIPPED 2026-05-19 ~22:30 AEST

**Scope**: rebuild `/settings` shell + 3 sub-sections in web-v2 using clean v2 patterns. Memory sub-section deferred.

**Files to create in web-v2**:
- `apps/web-v2/app/settings/layout.tsx` — shared header + sub-nav
- `apps/web-v2/app/settings/page.tsx` — index (redirects to /settings/passport)
- `apps/web-v2/app/settings/passport/page.tsx` — Passport section
- `apps/web-v2/app/settings/safety/page.tsx` — Safety section
- `apps/web-v2/app/settings/contacts/page.tsx` — Contacts section
- Or alternatively keep the single-page accordion pattern from apps/web — founder UX call

**v2 patterns to adopt**:
- shadcn `<Tabs>` for sub-nav (audric tokens applied)
- `useSWR` for `/api/user/preferences` + `/api/contacts/*` reads
- `<Form>` + react-hook-form for Safety preset + contacts edit
- Server-side `<AuthGuard>` wrapper (web-v2 equivalent of apps/web's pattern)
- Same `/api/user/preferences` endpoint on apps/web (KEEP-IN-WEB) — web-v2 calls it via `authFetch`

**APIs to wire** (no new backend; reuses apps/web's existing routes via cross-app fetch):
- `GET/POST /api/user/preferences` (permission preset, daily limit) — apps/web
- `GET/POST/DELETE /api/contacts/*` — web-v2 already has `/api/contacts/save`; add `/api/contacts` GET + DELETE
- `GET /api/user/status` — apps/web (account age, tos-accepted, etc.)

**Out of scope**:
- Memory section (DEFER to v0.7d per D-11 lock)
- Account-age gating UI (assume web-v2's existing AuthGuard handles this)

**Estimated effort**: ~2-3 days

**Acceptance**:
- typecheck + lint + build green on web-v2
- All 3 settings sub-sections render against real production data on the web-v2 preview URL
- Permission preset changes propagate to chat (verify via a chat turn after toggling preset)
- Contacts CRUD round-trips successfully
- Memory section IS in web-v2 nav (REVISED S.188) but `/settings/memory` page renders a v0.7d deferral signpost card (not a Memory CRUD UI). Legacy `/api/user/memories` on apps/web stays operational for direct calls.

### Session 3 — Audric Store rebuild (`/[username]`) ✅ SHIPPED 2026-05-19 ~23:30 AEST

**Scope**: rebuild the public profile page at `/[username]` in web-v2.

**Files to create in web-v2**:
- `apps/web-v2/app/[username]/page.tsx` — server component (SuiNS lookup + portfolio fetch + render)
- `apps/web-v2/app/[username]/AddressCopyButton.tsx`
- `apps/web-v2/app/[username]/SendToHandleButton.tsx`
- `apps/web-v2/app/[username]/opengraph-image.tsx` (port from apps/web)

**v2 patterns to adopt**:
- Server-side SuiNS resolution via `resolveSuinsCached` (reuse `@t2000/engine`)
- Web-v2's existing `PortfolioCardV2` (already at `apps/web-v2/components/audric/cards/PortfolioCardV2.tsx`)
- shadcn primitives for QR + copy button + send modal
- Audric tokens applied to the profile chrome

**Cross-app APIs reused** (via authFetch to apps/web):
- `GET /api/portfolio?address=…` — apps/web (KEEP-IN-WEB)
- `GET /api/suins/resolve?…` — apps/web (KEEP-IN-WEB)

**Out of scope**:
- Store catalog (no item listings yet — that's `AUDRIC_AGENTIC_COMMERCE_SPEC` Phase 1)
- Send-to-handle full flow (mirror apps/web's `SendToHandleButton` — desktop ConnectModal + amount input + USDC transfer)
- Reserved-username validation (reuse `lib/identity/reserved-usernames` from apps/web)

**Estimated effort**: ~1 day

**Acceptance**:
- typecheck + lint + build green
- `<web-v2>/funkii` renders portfolio panel + QR + buttons
- 404 on reserved/invalid usernames
- OG metadata renders correctly (test with Twitter card validator)

### Session 4 — Pay rebuild (public `/pay/[slug]` + 2 public APIs) ✅ SHIPPED 2026-05-20 ~00:30 AEST

**Original scope (from runbook v3):** rebuild `/pay/[slug]`, `/invoice/[slug]` (redirect), and `/api/payments/*` in web-v2.

**Locked-and-shipped scope (after Session 4 audit, 2026-05-19 PM):**
- Port **`/pay/[slug]` page + 2 public API routes** (`GET /api/payments/[slug]` + `POST /api/payments/[slug]/verify`) — the visitor-facing surface.
- **DROP** 4 user-facing payment routes (`POST + GET /api/payments` + `PATCH + DELETE /api/payments/[slug]`) — only legacy `components/panels/PayPanel.tsx` calls them, which dies with `/new` in v0.7e Tier B sweep. ~870 LoC of code+helpers (auth.ts, slug.ts) spared.
- **DROP** legacy `/invoice/[slug]` 10-line redirect file — handle via Vercel rewrite in Session 5 (`{ source: '/invoice/:slug', destination: '/pay/:slug' }`).
- **DEFER** all 6 `/api/internal/*` endpoints to dedicated **Session 4.5** (single-env-flip atomic migration; see next section).
- **DEFER** invoice product deprecation to own mini-SPEC after Phase 6.

**Files shipped in web-v2 (9 new + 2 modified — 2,193 LoC):**
- `apps/web-v2/app/pay/[slug]/page.tsx` — server component using Next 16 Cache Components `<Suspense>` pattern (sync outer `PayPage` → `<Suspense fallback={<PaySkeleton/>}><PayContent/></Suspense>`).
- `apps/web-v2/components/pay/pay-client.tsx` (532 LoC) — main payment receipt UI with polling-verify + manual digest fallback.
- `apps/web-v2/components/pay/pay-button.tsx` (124 LoC) — wallet-connect + Sui Payment Kit transaction signing.
- `apps/web-v2/components/pay/digest-form.tsx` (107 LoC) — manual tx-digest verification path.
- `apps/web-v2/components/pay/invoice-header.tsx` (147 LoC) — invoice line-items display (stable composite-key per row).
- `apps/web-v2/components/pay/sui-pay-qr.tsx` — REPLACED Session-3 stub (open-receive only) with dual-mode QR rendering.
- `apps/web-v2/app/api/payments/[slug]/route.ts` (74 LoC) — GET-only public payment fetch; PATCH+DELETE intentionally not ported.
- `apps/web-v2/app/api/payments/[slug]/verify/route.ts` (380 LoC) — POST verify with 10/min/slug rate limit.
- `apps/web-v2/lib/rate-limit.ts` (76 LoC) — verbatim port of in-memory sliding-window limiter.
- `apps/web-v2/lib/sui-pay-uri.ts` — REWRITTEN with `@mysten/payment-kit`'s `createPaymentTransactionUri` amount-mode branch (Session 3 had open-receive only).
- `apps/web-v2/package.json` (+`@mysten/payment-kit@^0.1.6`).

**Next 16 Cache Components compliance gotchas (resolved):**
- `export const runtime = "nodejs"` REMOVED from both API routes — Cache Components mode rejects it (nodejs is the default; the legacy export pattern is now disallowed).
- Page adopts the Session-3 `<Suspense>` pattern (same template as `app/audric-chat/page.tsx` and `app/[username]/page.tsx`).

**Quality gates:** typecheck (5.4s) + lint (1 retry after `noArrayIndexKey` fix + 1 stale `noUselessFragments` biome-ignore removal — 0 errors final) + build (17.3s, 28 routes incl. `◐ /pay/[slug]` PPR + `ƒ /api/payments/[slug]` + `ƒ /api/payments/[slug]/verify`).

**Acceptance (verified):**
- ✅ typecheck + lint + build green
- ✅ Payment link landing route compiles + renders for a real slug (PPR mode)
- ⏸ USDC transfer round-trip via desktop wallet sign — deferred to founder live smoke (same zkLogin OAuth localhost constraint that's gated every Session since 1)
- ✅ Invoice legacy redirect handled via Session 5 Vercel rewrite (not a porting step)

**Tracker entry:** S.190.

### Session 4.5 — Internal-API sweep ✅ SHIPPED 2026-05-20 ~01:45 AEST

**Founder framing during Session 4:** "I thought we were to migrate everything we needed to v2 and not leave anything legacy was that not the plan the goal was to delete apps/web right?" — correct. Six endpoints share the `AUDRIC_INTERNAL_API_URL` env var and are consumed by 11 engine tools. Migrating one-at-a-time would force split env vars (one for `payments`, one for the other 5) — that intermediate state pays back exactly when all 6 endpoints land. Atomic Session 4.5 = better.

**AUDIT-FIRST CORRECTION (shipped during this session):** The original Session 4 runbook claim that "all 6 are under `/api/internal/*`" was wrong by 5 routes. Reality (verified via `grep AUDRIC_INTERNAL_API_URL packages/engine/src/tools/`):

| Engine tool | Route in apps/web | Auth pattern |
|---|---|---|
| `receive.ts` (6 fetch sites) | `/api/internal/payments` (POST/GET/PATCH) | x-internal-key (pure) |
| `portfolio-analysis.ts` 1st leg + `balance.ts` fallback | **`/api/portfolio`** (NOT under `/internal/`) | DUAL: x-internal-key OR JWT+ownership |
| `portfolio-analysis.ts` 2nd leg | `/api/analytics/portfolio-history` | DUAL |
| `yield-summary.ts` | `/api/analytics/yield-summary` | DUAL |
| `activity-summary.ts` | `/api/analytics/activity-summary` | DUAL |
| `spending.ts` | `/api/analytics/spending` | DUAL |

The "`/api/internal/balance`" route called out in the original runbook does NOT exist. The engine's `balance_check` tool consumes `/api/portfolio` (the canonical SSOT) as a DeFi-data fallback.

**Locked scope (founder questions before code):**

| Lock | Choice | Why |
|---|---|---|
| `s45-scope` | **B (LEAN)** — port all 6 routes + canonical `portfolio.ts` WITHOUT Upstash adapter layer | Per-instance in-memory cache acceptable at 165-user scale. Chat SSOT unaffected (chat path wires Upstash via separate route). ~770 LoC of premature infra spared; cross-instance coherency becomes a pure infra follow-up if scale forces it. |
| `s45-auth-strategy` | **Extend `lib/audric-auth.ts` in place** | The Phase 2 module already has JWT verify + Enoki derivation + `VerifiedJwt` + `AuthError` (307 LoC). The 4 missing helpers (`authenticateRequest`, `assertOwns`, `assertOwnsOrWatched`, `authErrorResponse`) added at the bottom with rationale header. One auth module per app — surgical-changes principle. |
| `s45-legacy-helpers` | **SKIP `decodeJwt` / `validateJwt` / `isJwtEmailVerified` / `validateAmount`** (~110 LoC) | None of the 6 routes touch them. Port-as-needed if a future web-v2 route requires them. |

**Files shipped (8 new libs + 6 new routes + 1 extension — 2,309 LoC):**

| Category | Files | LoC |
|---|---|---|
| Auth helpers | `lib/internal-auth.ts` (132) + `lib/slug.ts` (7) + `lib/log-sanitize.ts` (54) + `lib/audric-auth.ts` extension (+149) | 342 |
| Portfolio canonical SSOT | `lib/portfolio.ts` (400 LEAN) + `lib/portfolio-data.ts` (167) + `lib/protocol-registry.ts` (50) | 617 |
| Activity rollup | `lib/activity-data.ts` (322) | 322 |
| Routes | `/api/internal/payments` (338, POST + GET + PATCH) + `/api/portfolio` (87) + `/api/analytics/portfolio-history` (146) + `/api/analytics/yield-summary` (160) + `/api/analytics/activity-summary` (50) + `/api/analytics/spending` (247) | 1,028 |
| **TOTAL** | | **~2,309 LoC** |

**Key engineering decisions:**
1. **Dropped `init-engine-stores` side-effect import** in web-v2's `portfolio.ts`. apps/web's version opens with `import './engine/init-engine-stores'` to wire 5 Upstash adapters (~770 LoC) into the engine for THIS process. web-v2 deliberately drops this; documented inline as a future infra-only follow-up if scale forces cross-instance cache coherency.
2. **`T2000_INTERNAL_KEY` defensive nullable in web-v2.** apps/web's `validateInternalKey` requires env-at-boot. web-v2's `env.ts` types it as `optionalString` (preview deploys may not yet have it set). `validateInternalKey` rejects every caller if env is unset — same fail-closed posture; once Session 5's env flip populates the var, the gate works identically to apps/web.
3. **Type assertion for `SUI_NETWORK` boundary cast** in `protocol-registry.ts`. web-v2's `env.ts` types `NEXT_PUBLIC_SUI_NETWORK` as `requiredString`; apps/web uses `z.enum(['mainnet', 'testnet'])`. Surgical 1-line cast at the consumer rather than touching env.ts in this session (env-schema canonicalization deferred to its own cleanup pass).

**Quality gates green:**

```
pnpm --filter @audric/web-v2 typecheck  →  0 errors (2.0s after one fix)
pnpm --filter @audric/web-v2 lint       →  0 errors (23 → 7 auto-fix → 0 after 3 manual fixes)
pnpm --filter @audric/web-v2 build      →  37 routes incl. all 6 new endpoints as ƒ Dynamic
```

**Acceptance verified:**
- typecheck + lint + build green ✓
- All 6 routes render dynamic route handlers ✓ (verified in build's Route table)
- `lib/internal-auth.ts` rejects requests without `x-internal-key` header + accepts the correct key (encoded in route handlers; testable post-deploy via `curl -H 'x-internal-key: ...' https://audric-web-v2.vercel.app/api/internal/payments`)
- Engine-smoke against a real wallet → deferred to Session 5 post-env-flip (engine `AUDRIC_INTERNAL_API_URL` still points to apps/web today; cannot smoke without env flip)

**Tracker entry:** S.191.

### Invoice product deprecation — DEFERRED to own mini-SPEC after Phase 6

**Founder framing during Session 4 audit:** "I rather simplify and remove complexity and drop invoices entirely even from db, rather take the risk and remove it and simplify into one product feature pay whats your thoughts?" — directionally correct. Invoice and payment-link overlap ~95% in the codebase; the only product differentiator is `dueDate` (which the product takes no action on). The conservative call was to defer the deprecation from Session 4 because it touches:
- `@t2000/engine` tool deletions: `create_invoice`, `list_invoices`, `cancel_invoice` (3 tools + tests + system-prompt references)
- `@t2000/engine` `InvoiceCard` renderer (or the engine's renderer absorption equivalent)
- `apps/web` Prisma schema: `Payment.type` enum (`payment_link | invoice`) — need migration plan for live DB rows
- `apps/web` API surface: `/api/internal/payments` POST branch handling `type: 'invoice'` (also lives in Session 4.5)
- `audric/system_prompts/`: any system-prompt mentions of invoice as a product feature
- `audric-roadmap.md` + `PRODUCT_FACTS.md` + `CLAUDE.md`: marketing taxonomy
- Live DB rows with `type='invoice'` — migration plan (convert to `payment_link` + preserve historical `dueDate` as ledger note, or delete, or freeze)

**Mini-SPEC scope (~3-5d):**
1. Schema migration plan (live row count audit → conversion or freeze decision)
2. Engine tool deletion + `InvoiceCard` removal + system-prompt scrub
3. audric-side API + UI cleanup (remove `type === 'invoice'` branches from `pay-client.tsx` + `invoice-header.tsx` — `invoice-header.tsx` becomes deletable in web-v2)
4. Marketing + docs (PRODUCT_FACTS / CLAUDE / roadmap update)
5. Rollout: ship tool deletion + schema migration in same release; back-out plan = restore engine tool + roll back migration

**Reactivation:** when Phase 6 closes (post-Session 4.5 + Sessions 5–7 + 7d soak). Founder picks SPEC number at promotion.

### Session 4.6 — Path A structural fixes (audit-driven P0/P1 cleanup) ⏳ PENDING

**Why this exists:** Post-Session 4.5 audit (~9k LoC reviewed across Sessions 2/3/4/4.5) surfaced 5 structural issues. Path B-prime locks Session 4.6 as the P0+P1 quick-fix pass before the deeper rebuild work in 4.7. Estimated ~1.5h.

**Scope (5 surgical fixes):**

1. **Move cross-app identity helpers** — `apps/web/lib/identity/{reserved-usernames,canonicalize}.ts` → `web-v2/lib/identity/*`. Fix the 9 cross-app relative imports across 6 files:
 - `web-v2/app/api/payments/[slug]/verify/route.ts`
 - `web-v2/app/[username]/page.tsx`
 - `web-v2/app/[username]/opengraph-image.tsx`
 - `web-v2/components/settings/{username-change-modal,username-claim-modal,username-picker}.tsx`
 - `web-v2/app/(chat)/api/audric-chat/route.ts`
 - `web-v2/app/api/contacts/save/route.ts`

 Removes the implicit filesystem dependency that would break v0.7e archiving.

2. **Rewrite `lib/profile-portfolio.ts`** to call local `getPortfolio()` directly instead of HTTP-hopping. Delete the `audricWebUrl` cross-app branch + `T2000_INTERNAL_KEY` auth header (now redundant — endpoint is local since Session 4.5). Saves 200-500ms RTT per Store profile page render.

3. **Extract `PERMISSION_PRESETS` to client-safe engine submodule** — create `@t2000/engine/presets` (pure-data ESM exports, no Node deps). Delete the inline `PERMISSION_PRESETS_DISPLAY` duplicate in `safety-section.tsx` (45 LoC). Removes drift risk between engine and UI.

4. **Replace raw RPC in `verify/route.ts`** — swap `fetch(SUI_RPC, { jsonrpc: '2.0', ... })` for `SuiJsonRpcClient.queryEvents()` + `.getTransactionBlock()`. Aligns with the rest of web-v2 + gives proper TypeScript types on the response.

5. **Fix `InputJsonValue` 6-dir cross-app type import** — `verify/route.ts` reaches into `../../../../../../web/lib/generated/prisma/internal/prismaNamespace`. Replace with local `Prisma.InputJsonValue` from web-v2's own Prisma module.

**Quality gates:** typecheck + lint + build green. Same wallet → Store profile page render: latency drops noticeably (no HTTP hop). No new tests required — these are mechanical refactors of already-tested behavior.

**Why no test scaffolding:** all 5 changes preserve identical observable behavior. The audit's P0s are structural drift, not correctness bugs.

### Session 4.7 — Settings UI rebuild + onboarding gate + GlobalUsernameSearch + Splash-B ⏳ PENDING

**Why this exists:** Session 2 was scoped as a port and largely shipped legacy UI patterns instead of rebuilding with modern shadcn/react-hook-form/SWR primitives. Session 4.7 closes that gap, wires the onboarding gate, rebuilds GlobalUsernameSearch as a `<Command>` palette, and rebuilds the chat splash/empty state with the chip-system architectural correction (see §"Chip system rebuild" below). Estimated ~2.5 days.

**Scope (locked 2026-05-19):**

#### A. SWR standardization
- Migrate `hooks/use-user-status.ts`: `@tanstack/react-query` → `useSWR`
- Migrate `hooks/use-contacts.ts`: raw `useState/useRef/useEffect` → `useSWR` with built-in deduplication
- Migrate `safety-section.tsx`: raw `useState/useEffect` → `useSWR` with optimistic mutation
- **Outcome:** one data-fetching pattern across all web-v2 user-written code. `@tanstack/react-query` remains only as plumbing for `@mysten/dapp-kit`'s internal state.

#### B. Username modals rebuild on shadcn primitives
- `username-change-modal.tsx` (611 LoC) → rebuild on `<Dialog>` + `react-hook-form` + zod resolver (~250 LoC target)
- `username-claim-modal.tsx` (102 LoC) → same pattern (~80 LoC)
- `username-claim-success.tsx` (135 LoC) → rebuild as `<Dialog>` content slot
- `username-claim-gate.tsx` (200 LoC) → rebuild on `<Dialog open={isUnclaimed} modal>` blocking pattern
- `username-picker.tsx` (625 LoC) → rebuild on `react-hook-form` + zod + debounced SWR availability check (~300 LoC target)

**LoC delta:** ~1,673 LoC → ~730 LoC (-56%). Pattern alignment cost is the same once for all 5 modals.

#### C. Onboarding gate wiring
- Mount `<UsernameClaimGate>` in `web-v2/app/(chat)/layout.tsx` (above `<ChatShell>`)
- Blocking pattern: when authenticated user has no claimed handle, modal is `open={true}` non-dismissable until claim succeeds
- Mirrors apps/web `dashboard-content.tsx` behavior (which web-v2 currently bypasses — a P0 onboarding gap)

#### D. GlobalUsernameSearch rebuild as `<Command>` palette
- Replace the legacy port with shadcn `<Command>` + `<CommandDialog>` (the chatbot template ships this primitive)
- Wired to `/` slash command in the chat composer (matches the chatbot template's command-palette convention)
- Debounced username search via SWR
- Selected result → injects `@username` reference into composer (no navigation)

#### E. Splash-B — pre-auth + loading + post-auth empty state rebuild

**Pre-auth CTA** — mirror the marketing hero lockup verbatim:
- Headline: `"Your money, "` + `<em italic>"handled."</em>` (serif, large)
- Sub-line: `"Sign in with Google. Chat with your money. Earn yield, send USDC, borrow — all by conversation. No seed phrase."`
- Primary CTA: `"Continue with Google →"` (matches marketing button styling)
- **Removes the canary-quality `"Phase 3 canary — save_deposit via AI SDK HITL"` header that's been shipping in dev/preview since Day 2b.**

**Loading / redirecting states:**
- Centered `audric.` wordmark + small spinner
- No "Loading…" plain text on bare gray

**Post-auth empty state** (replaces template's `<Greeting>` with `"What can I help with?"` ChatGPT clone copy):
- `<BalanceHero>` ported from apps/web (~40 LoC) — net worth + available + earning
- Greeting: `"Good {timeOfDay}, {firstName}"` with `"earning $X/day · X.X% APY"` eyebrow when `dailyYield > 0`
- Composer below greeting (existing `multimodal-input.tsx`)
- **7 injection-only chips** below composer (see "Chip system rebuild" below)

#### F. Chip system rebuild — injection-only architecture (CHIP_REVIEW_3)

**Architectural correction locked 2026-05-19:** delete the dual-mode chip system. apps/web ships chips with two competing modes:
- **Prompt mode** — chip taps inject canonical sentences into the composer (the agent handles everything via natural language)
- **Flow mode** — chip taps open custom non-LLM UI steppers (asset picker → amount → confirm modal flow)

Flow mode competes with the agent: we built 14 guards + 12 preflights + USD-aware permissions + the 5-system Intelligence stack so the agent can handle `"save 10 USDC"` reliably — and then we built a non-LLM tap-through path for the same operation. The bypass-the-agent path no longer earns its complexity.

**v0.7c chip behavior** — injection-only:
- 7 horizontal pill chips visible at all times below composer: **Save · Send · Swap · Credit · Receive · Harvest · Charts**
- Tap chip → fill composer with canonical prompt + focus input → user can edit or hit Enter
- NO drawers, NO sub-actions, NO `flow:'save'` custom UI

**Files deleted (web-v2 will never have):**
- `components/dashboard/ChipExpand.tsx` (77 LoC)
- `components/dashboard/SaveDrawer.tsx` (95 LoC)
- `hooks/useChipExpand.ts` (28 LoC)
- All flow-stepper modals (`<SaveFlowModal>`, `<SendFlowModal>`, `<SwapFlowModal>`, `<BorrowFlowModal>`, `<RepayFlowModal>`, etc. — 1,500+ LoC across apps/web)
- `lib/chip-configs.ts` `actions` array (167 of 169 LoC) — keep only the canonical 1 prompt per chip

**Files ported (simplified):**
- `components/ui/BalanceHero.tsx` (~40 LoC)
- `components/chat/chip-bar.tsx` (~30 LoC — no drawer/expanded state)
- `lib/chip-configs.ts` (~30 LoC — just `id/label/prompt` per chip)
- `components/chat/empty-state.tsx` (~60 LoC — equivalent of `NewConversationView`)

**LoC delta:** ~1,936 LoC → ~160 LoC (-92%). Result is more brand-aligned (chat-first, not form-first).

**Tracker entry to add:** `audric-build-tracker.md` "CHIP_REVIEW_3 / 2026-05-19" — document the chip-flow deletion decision so future agents don't re-port the flow steppers thinking they're missing UX.

**Quality gates:** typecheck + lint + build green; manual smoke of (a) sign-out flow lands on pre-auth splash with brand lockup, (b) post-auth empty state renders BalanceHero + greeting + chips, (c) chip tap injects prompt into composer + focuses input, (d) `<UsernameClaimGate>` blocks chat for unclaimed users, (e) `/` slash command opens GlobalUsernameSearch palette.

**Total Session 4.7 estimate:** ~2.5 days (settings rebuild ~1d + claim gate wiring ~2h + GlobalUsernameSearch ~3h + Splash-B ~3-4h, chip simplification cancels itself out vs naive port).

### Session 5 — Trivial cleanups + Vercel rewrites flip + env flips + founder ops prep

**Scope (post-Sessions 2/3/4/4.5 ship)**:
- Delete `apps/web/lib/proactive-marker.ts` (26 LoC dead code) — 1 minute.
- Audit `/api/voice/*` (3 routes) — if unused in production, delete; if still in use, document.
- **Vercel rewrites** (one batch into `apps/web/next.config.ts` rewrites array — orchestrate carefully because each rewrite shifts a domain from apps/web → web-v2):
  - **Session 4 (Pay)**: `{source: '/pay/:slug', destination: 'https://audric-web-v2.vercel.app/pay/:slug'}` + `{source: '/api/payments/:slug', destination: '...'}` + `{source: '/api/payments/:slug/verify', destination: '...'}` + **legacy** `{source: '/invoice/:slug', destination: 'https://audric-web-v2.vercel.app/pay/:slug'}` (the deferred 10-LoC redirect file from Session 4 lives here now)
  - **Session 3 (Store)**: `{source: '/:username((?!api|new|chat|settings|pay|invoice|_next|...).*)', destination: 'https://audric-web-v2.vercel.app/:username'}` (broad catch-all; needs negative lookahead to exclude all other top-level paths)
  - **Session 2 (Settings)**: `{source: '/settings/:path*', destination: 'https://audric-web-v2.vercel.app/settings/:path*'}` (5 paths total)
  - **Session 4.5 (Internal-API)**: `{source: '/api/internal/payments', destination: 'https://audric-web-v2.vercel.app/api/internal/payments'}` + `{source: '/api/portfolio', destination: '...'}` + `{source: '/api/analytics/portfolio-history', destination: '...'}` + `{source: '/api/analytics/yield-summary', destination: '...'}` + `{source: '/api/analytics/activity-summary', destination: '...'}` + `{source: '/api/analytics/spending', destination: '...'}` (6 rewrites)
- **Env flip (Session 4.5)**: change `AUDRIC_INTERNAL_API_URL` in Vercel project settings from `https://audric.ai` (apps/web) to `https://audric-web-v2.vercel.app` (web-v2). Single env var, atomic flip — all 11 engine tools that hit internal APIs route to web-v2 across the board.
- **Smoke against production**: after rewrites land, hit `audric.ai/pay/<existing-slug>`, `audric.ai/<existing-username>`, `audric.ai/settings`, `audric.ai/api/internal/payments` (with `x-internal-key`), and `audric.ai/api/portfolio?address=0x...` (with JWT) → verify each returns the web-v2 response shape (route handler logs in Vercel function tab; same byte-for-byte response).
- **Engine-smoke against a real wallet** (deferred from Session 4.5): trigger a chat turn calling `portfolio_analysis` against a real wallet; verify Vercel function logs show the request hit web-v2's `/api/portfolio` route handler (not apps/web's).
- Run quality gates one more time across web-v2 to confirm clean baseline.
- Pre-cutover checklist run-through (Section 5 below).

**Estimated effort**: ~½-1 day (rewrites orchestration + env flip + production smoke)

### Session 6 — Founder ops (rewrites + smoke + flip + 7d soak)

**Founder-owned.** Sections 5-8 below cover the operational mechanics.

### Session 7+ — Post-soak deletion sweep

After 7d soak passes, agent deletion sweep — Section 9 below.

---

## Section 4 — Memory Deferral Rationale (the v0.7d signpost)

**You asked: "Is settings memory a feature needed now since we have memwal?"**

**Answer: defer to v0.7d. Don't port the legacy CRUD.**

### Current state (apps/web today)

| Layer | What it does | Files |
|---|---|---|
| Extraction | Daily cron: Claude inference reads chat transcripts, extracts memories (FACT/GOAL/PATTERN/PREFERENCE), writes `UserMemory` rows | `apps/web/app/api/internal/memory-extraction/route.ts` |
| Retention | Daily cron: expire old memories | `apps/web/app/api/cron/user-memory-retention/route.ts` |
| Read API | `GET /api/user/memories?address=…` returns active memories for display | `apps/web/app/api/user/memories/route.ts` |
| Delete API | `DELETE /api/user/memories/[id]` lets user delete a single memory | `apps/web/app/api/user/memories/[id]/route.ts` |
| Settings UI | `MemorySection.tsx` displays cards with tag tones (FACT=neutral, GOAL=green, etc.) + per-row delete + clear-all | `apps/web/components/settings/MemorySection.tsx` |
| Engine consumption | `buildMemoryContext()` reads `UserMemory` + injects into system prompt | Legacy in `@t2000/engine`, mostly drained in v0.7a |

### v0.7d trajectory (per `spec/active/BENEFITS_SPEC_v07c.md` D-11 lock + CLAUDE.md L138-145)

| Layer | New shape |
|---|---|
| Storage | `MemWalMemoryStore` — write-ahead-log design (instead of CRUD `UserMemory` rows) |
| Read API | `MemoryStore.recall(query, k)` — top-K semantic recall (instead of "fetch all active") |
| Engine consumption | `EngineConfig.memoryStore` interface, per-turn 5-layer prompt assembly via `prepareStep` |
| Settings UI | TBD — recall-oriented, not list-oriented. Probably: "your agent currently knows X about you" + "explain why it remembered Y" rather than per-row CRUD. |
| MemWal stability | Post-2026-05-29 (10 days from now per CLAUDE.md L141) |

**Conclusion**: any v2-pattern rebuild of `MemorySection.tsx` today is double work — v0.7d redesigns the data model + UI shape. The right move:

1. **Keep apps/web's memory pipeline live unchanged** through Phase 6 cutover (extraction + retention crons; `/api/user/memories` GET + DELETE; engine `buildMemoryContext()`).
2. Web-v2 OWNS `/settings/memory` URL but renders a deferral signpost (NOT a Memory CRUD UI).
3. The `/settings/memory` rewrite IS added (rewrites all `/settings/*` to web-v2 uniformly).
4. v0.7d ships MemWal + redesigned Memory settings UI in web-v2 → THEN the legacy `MemorySection` + APIs + extraction cron get redesigned/replaced.

### Concrete signpost in web-v2 settings (REVISED IN SESSION 2 — S.188)

**Web-v2 ships the full settings nav: Passport / Safety / Contacts / Memory.** The Memory link goes to `/settings/memory` which is OWNED by web-v2 and renders a deferral signpost card:

> "Memory is being rebuilt to work with MemWal — your agent's improved memory layer ships in v0.7d. Your existing memories are preserved. For now, ask the agent in chat if you'd like to inspect or clear what it remembers."

**This is a CHANGE from runbook v3's "rewrite all settings/* except memory" approach.** Reasons:
- Cleaner Vercel rewrite config (single `/settings/:path*` block instead of per-path exclusions).
- In-product disclosure beats silent fallthrough — users see exactly what's happening.
- Apps/web's `/api/user/memories` GET/DELETE remain operational for users who land on the legacy URL directly (and the agent itself can still call them via chat-side tooling if added).

**Rewrite config (post Session 2):**

```js
// apps/web-v2/next.config.ts
rewrites: [
  // Settings — all 5 routes own in web-v2 (Passport, Safety, Contacts, Memory signpost, root /settings)
  { source: '/settings', destination: '/settings' },
  { source: '/settings/:path*', destination: '/settings/:path*' },
  // ... other rewrites ...
]
```

No "memory exclusion" needed.

---

## Section 5 — Pre-cutover checklist

Block on every row before proceeding to Section 6 smoke.

### 5.1 Web-v2 production deploy readiness

- ☐ Web-v2 has a Vercel project deployed to production (NOT preview). URL recorded: `__________________`
- ☐ Web-v2's prod `.env.production` has all env vars set + non-empty per `lib/env.ts` Zod schema (DATABASE_URL, BLOCKVISION_API_KEY, AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY, ENOKI_*, NEXT_PUBLIC_GOOGLE_CLIENT_ID, JWT_SECRET, etc.)
- ☐ Web-v2's prod build is green on the latest commit (with sessions 2-4 settings/store/pay rebuilds merged)
- ☐ Web-v2's instrumentation hook fires at boot without throwing

### 5.2 zkLogin OAuth + Google Cloud Console

- ☐ Google OAuth Client (Production) has these redirect URIs whitelisted:
  - `https://audric.ai/auth/callback` (legacy — already there)
  - `https://<web-v2-prod-url>/auth/callback` (NEW — needed for web-v2 to handle OAuth callbacks when routed via rewrite)
- ☐ A test sign-in on the web-v2 prod URL succeeds end-to-end (founder must do this once; localhost can't)
- ☐ A test sign-in on `audric.ai/new` (via the rewrite in a preview deploy) succeeds

### 5.3 Database

- ☐ Both apps point at the SAME `DATABASE_URL` (production Postgres)
- ☐ Prisma schema is in sync (one shared schema)
- ☐ TurnMetrics rows from both apps write to the same table without collision
- ☐ The cross-app Prisma client import (web-v2 → apps/web's `lib/generated/prisma/client`) still resolves on the prod build

### 5.4 Rewrite dry-run

- ☐ Test the rewrites in a preview branch of apps/web FIRST:
  1. Create branch `cutover/v07c-phase-6-rewrites`
  2. Add the rewrite block from Section 2.2 to `next.config.ts`
  3. Open a Vercel preview deployment of that branch
  4. Visit preview-url/new — confirm web-v2 chat renders
  5. Visit preview-url/settings/safety — confirm web-v2 settings renders
  6. Visit preview-url/funkii — confirm web-v2 Store renders
  7. Visit preview-url/pay/<test-slug> — confirm web-v2 payment landing renders
  8. Visit preview-url/ — confirm apps/web marketing renders (NOT rewritten)
  9. Visit preview-url/settings/memory — confirm web-v2 v0.7d deferral signpost card renders (REVISED S.188 — was: apps/web legacy)
  10. Visit preview-url/litepaper — confirm apps/web renders (NOT rewritten)
- ☐ Time the rewrite cycle. Target: <10 minutes from "add rewrite + push" → "preview shows rewritten paths working"
- ☐ Rollback dry-run: revert the rewrite block → confirm all paths fall back to apps/web

### 5.5 Communications

- ☐ Founder posts internal Discord/Slack thread announcing cutover window
- ☐ Status page / Twitter draft posts written (success / rollback-success / rollback-emergency)
- ☐ Beta-tester recruitment for Section 6 smoke (5 users + audric staff)

---

## Section 6 — Smoke Test Plan (~30 critical-path behaviors)

Same gating set as v1 of this runbook, adjusted for the new routing model. Walk in order; mark ✅/❌/note. Full 159-row catalogue at `audric/apps/web/__tests__/v0.7c-behavior-catalogue.md`.

### Section A — Sign-in (5 rows)

| # | Behavior | Pass criteria | Result |
|---|---|---|---|
| S1 | Visit `audric.ai/` | Marketing landing renders (apps/web, unchanged) | |
| S2 | Click "Sign in with Google" on marketing CTA | Google OAuth flow opens; correct redirect URI | |
| S3 | Complete OAuth → lands on `audric.ai/new` | Web-v2 chat renders via rewrite; wallet address visible; no console errors | |
| S4 | Refresh `audric.ai/new` after sign-in | Stays signed in (session cookie shared at `audric.ai`) | |
| S5 | Sign out + sign back in with different Google account | New wallet derived; no session mixing | |

### Section B — Chat flows + HITL (10 rows)

| # | Behavior | Pass criteria | Result |
|---|---|---|---|
| C1 | `save` chip → L2 amount chips → confirm → execute | Receipt card with tx digest | |
| C2 | `swap` chip → quote → confirm → execute | SwapQuoteCardV2 + PermissionCard + receipt | |
| C3 | `borrow` chip → confirm always fires (autoBelow=0) | PermissionCard regardless of amount | |
| C4 | `send` chip → known contact OR raw address | Send PermissionCard + tx | |
| C5 | `receive` chip → payment link creation | Payment-link generation flow (verify whether this hits web-v2 or apps/web; depends on whether `/api/payments` was rebuilt in Session 4) | |
| C6 | `charts` chip → canvas selector → render | Canvas modal opens, canvas template renders | |
| C7 | Single-write HITL deny path | Deny narration ("okay, I won't save") | |
| C8 | Multi-write Payment Intent (e.g. "swap USDC→SUI then send the SUI to alice") | BundlePermissionCard; single approve fires both | |
| C9 | Send tap with amount > $200 → permission tier "explicit" | UI explicitly tells user it's manual-only | |
| C10 | "What's my balance?" → `balance_check` returns | BalanceCardV2 renders | |

### Section C — Settings (5 rows — NEW in v2)

| # | Behavior | Pass criteria | Result |
|---|---|---|---|
| ST1 | Navigate to `audric.ai/settings` | Web-v2 settings shell renders | |
| ST2 | `/settings/passport` shows wallet info | Address + sign-in info + network correct | |
| ST3 | `/settings/safety` toggle conservative → balanced | Permission preset updates; next chat turn uses new preset (verify by attempting a sub-threshold write — should auto-execute on `balanced` but confirm on `conservative`) | |
| ST4 | `/settings/contacts` add a contact + use in send flow | Contact saved; appears in send recipient picker on next chat turn | |
| ST5 | `/settings/memory` renders v0.7d deferral signpost (REVISED S.188) | Web-v2 deferral card renders; legacy `/api/user/memories` still callable from chat if needed | |

### Section D — Store + Pay + Invoice (5 rows — NEW in v2)

| # | Behavior | Pass criteria | Result |
|---|---|---|---|
| SP1 | Navigate to `audric.ai/funkii` (or any registered username) | Web-v2 Store profile renders; portfolio panel visible; QR + copy + send buttons | |
| SP2 | Navigate to `audric.ai/nonexistent-username` | 404 page | |
| SP3 | Create a payment link from chat (`receive` chip) → visit the link in incognito | Web-v2 PayClient renders; amount + recipient correct | |
| SP4 | Complete a USDC payment via the link (desktop wallet sign) | Tx settles; receipt shows | |
| SP5 | `audric.ai/invoice/<slug>` → redirects to `/pay/<slug>` | 302 redirect to web-v2 PayClient | |

### Section E — Logs + guards + observability (5 rows)

| # | Behavior | Pass criteria | Result |
|---|---|---|---|
| L1 | Open Vercel logs for web-v2 during a chat turn | `[audric-chat] sessionId=<redacted>` line visible | |
| L2 | `[audric-llm] generate/stream start ...` observability lines per LLM call | Visible; PII-scrubbed | |
| L3 | Search web-v2 logs for raw `0x[64-hex]` — no user wallet addresses leaked | At most tx digests; no addresses | |
| L4 | Trigger an error (send to invalid address) | Error log shows redacted address `0xabcd...wxyz` | |
| L5 | Large transfer (>$50) → `guardLargeTransfer` warning in PermissionCard | Warning surfaced in PermissionCard chrome | |

**Total: 30 rows.** Block cutover if any fail.

---

## Section 7 — Cutover Execution Sequence

### 7.1 Pre-flight gate (T-30 min)

- ☐ Open Vercel dashboard for apps/web + apps/web-v2 in two tabs
- ☐ Confirm latest commits on both: web-v2 post-Session-4 (settings + store + pay rebuilds); apps/web at HEAD with the cutover branch ready
- ☐ Run Section 6 smoke against web-v2 production URL DIRECTLY (not via rewrites yet). All 30 rows pass. BLOCK if any fail.
- ☐ Record current `audric.ai` latency baseline (p50 + p95 for a chat turn) — for post-cutover comparison

### 7.2 Apply the rewrites (T-0)

```bash
cd /Users/funkii/dev/audric/apps/web
git checkout main && git pull
git checkout -b cutover/v07c-phase-6-rewrites
# Edit next.config.ts per Section 2.2 (POST-S.197 RETARGETED VERSION)
# CRITICAL: chat rewrite target is web-v2/audric-chat (NOT web-v2/).
# /new/:path* and /chat/:path* rewrites are intentionally REMOVED
# (audric-chat is single-conversation; MemWal supersedes chat history
# in v0.7d). See §2.2 + S.197 for the full Path A rationale.
git diff  # sanity-check the rewrite block
git commit -am "🚀 chore(web): cutover chat + settings + store + pay to web-v2 (v0.7c Phase 6)"
git push origin cutover/v07c-phase-6-rewrites
# Open PR → review → merge → Vercel auto-deploys ~2min
```

### 7.3 Post-flip verification (T+5 min)

- ☐ Incognito → `audric.ai/` → marketing renders (apps/web)
- ☐ Sign in → lands on `audric.ai/new` → web-v2 chat renders at internal URL `web-v2/chat` (S.197b renamed `/audric-chat` → `/chat`; Path A target — AudricChatClient at `web-v2/chat`, NOT template ChatShell). Document `view-source:` shows `<title>Audric` (NOT "Next.js Chatbot Template").
- ☐ Run 3 chip flows (save, swap, send) — all land via `/api/chat` backend (S.197b renamed from `/api/audric-chat`); verify in Vercel function logs
- ☐ Visit `audric.ai/settings/safety` → web-v2 settings renders; toggle preset; verify chat uses new preset
- ☐ Visit `audric.ai/funkii` → web-v2 Store profile renders
- ☐ Visit `audric.ai/litepaper` → apps/web renders (NOT rewritten)
- ☐ Visit `audric.ai/settings/memory` → web-v2 v0.7d deferral signpost renders (REVISED S.188 — was: apps/web legacy)
- ☐ Open Vercel logs for web-v2 — confirm chat traffic + settings traffic + Store traffic flowing
- ☐ Compare latency to baseline; if p95 > 1.5× baseline, investigate (but don't auto-rollback)
- ☐ Confirm pre-cutover zkLogin sessions still work
- ☐ Network tab: no requests to `cdn.jsdelivr.net/pyodide/*` (S.197 deleted the template's Pyodide CDN load)
- ☐ User dropdown: NO theme toggle item (S.197 — settings owns theme as SSOT); ONE item visible (Sign out)

### 7.4 Communications

- ☐ Post "✅ v0.7c cutover live" internally
- ☐ Outward-facing announcement if planned

### 7.5 Soak window

7 days. During soak:
- Daily Vercel log review (chat + settings + store + pay paths)
- Daily TurnMetrics dashboard
- ANY P0 → run Section 8 rollback

---

## Section 8 — Rollback Runbook

### 8.1 Trigger conditions

Same severity table as v1 runbook, with new per-path granularity:

| Severity | Trigger | Action |
|---|---|---|
| P0 | Chat turns failing >5% on web-v2 paths | IMMEDIATE rollback of chat rewrites (`/new`, `/chat/:path*`, `/api/audric-chat`, `/api/transactions/*`) |
| P0 | zkLogin sign-in broken | IMMEDIATE rollback of ALL rewrites |
| P0 | Sponsored tx flow broken | IMMEDIATE rollback of `/api/transactions/*` |
| P0 | Settings preset toggle breaks chat behavior | IMMEDIATE rollback of `/settings/*` rewrites; chat keeps working |
| P0 | Audric Store profile breaks | IMMEDIATE rollback of `/[username]` rewrite; rest stays |
| P1 | Pay/Invoice landing broken | Rollback `/pay/*` + `/invoice/*` + `/api/payments/*`; chat + settings + store keep working |
| P1 | TurnMetrics writes failing | Investigate; rollback if no fix in 30 min |
| P1 | Latency p95 sustained 2× baseline on a specific path | Investigate that path; rollback that path's rewrite only |
| P2 | Visual regression in one component | Note in catalogue; do NOT roll back |

### 8.2 Rollback steps (partial)

```bash
cd /Users/funkii/dev/audric/apps/web
git checkout main && git pull
# Option A: Full rollback
git revert <cutover-commit-sha>
# Option B: Partial rollback (e.g. settings only)
# Edit next.config.ts; comment out the /settings/* rewrites; keep the rest
git commit -am "🔄 chore(web): partial rollback /settings/* — falling back to apps/web (reason: <issue>)"
git push origin main
# Vercel auto-redeploys ~2min
```

### 8.3 Post-rollback verification

- ☐ Visit affected paths — confirm fall back to apps/web
- ☐ Run smoke subset for the rolled-back paths against apps/web
- ☐ Post status update internally
- ☐ File post-mortem template

### 8.4 Post-mortem template

```
🔄 audric Phase 6 cutover — partial/full rollback

Affected paths: <list>
What happened: <one sentence>
Time-to-detect: <X minutes after cutover>
Time-to-recover: <Y minutes after detect>
User impact: <none / minor / moderate>
Root cause: <one paragraph>
Re-attempt plan: <date + condition>
```

---

## Section 9 — Post-Soak Deletion Sweep (Session 7+)

After 7d soak passes with zero P0/P1, agent deletion sweep. NOT Phase 6 ops — it's a separate session.

### 9.1 Pre-conditions

- ☐ 7d soak passed with zero P0/P1 regressions
- ☐ Founder explicit go-ahead
- ☐ Engine v3.0.0-candidate work has begun (Phase 7 deletion sweep of engine `bridge/` etc. — see BENEFITS_SPEC G12)

### 9.2 Deletion order (with verification gates)

> **S.197 addendum (2026-05-20):** Path A retargets chat to
> `web-v2/audric-chat`, so the WEB-V2 template `(chat)` group + the
> 30+ template chat-shell files become dead-code post-cutover. Their
> deletion lives in this 9a phase too. See §9.2.A below for the
> additional web-v2 template-debris delete list.

```bash
# Phase 9a — Chat shell deletion (delete /new + /chat/[id] + all chat-shell modules)
rm -rf apps/web/app/new apps/web/app/chat
rm -rf apps/web/app/api/engine apps/web/app/api/transactions
rm -rf apps/web/components/engine
rm -rf apps/web/components/dashboard/UnifiedTimeline.tsx
rm apps/web/hooks/{useEngine,executeToolAction,useAgent,useChipFlow,useEngineReplyAwaiter}.ts
# DO NOT delete lib/engine/* yet — tendril 6 still has non-chat consumers (crons, instrumentation)
# Run: pnpm --filter @audric/web typecheck (should pass — non-chat surfaces stay clean)
# Run: pnpm --filter @audric/web build
# Run apps/web smoke against the non-chat surfaces (settings/memory, marketing, store, etc.)

# Phase 9b — Settings (Passport + Safety + Contacts) deletion
rm -rf apps/web/app/settings/page.tsx apps/web/app/settings/contacts
rm apps/web/components/settings/{PassportSection,SafetySection,ContactsSection}.tsx
# KEEP: apps/web/components/settings/MemorySection.tsx (Memory stays in apps/web until v0.7d)
# KEEP: apps/web/app/settings/page.tsx for /settings/memory routing only — need a thin /settings/memory route
# (May need to restructure: extract a /settings/memory route file that only mounts MemorySection)

# Phase 9c — Store deletion
rm -rf apps/web/app/\[username\]
# Decouple PortfolioCardV2: it's still used by /api/internal/* maybe? Verify with rg

# Phase 9d — Pay/Invoice + payments-API deletion
rm -rf apps/web/app/pay apps/web/app/invoice
rm -rf apps/web/app/api/payments

# Phase 9e — Tendril 5 (lib/proactive-marker.ts — 26 LoC dead code)
rm apps/web/lib/proactive-marker.ts

# Phase 9f — Engine library cleanup (tendril 6 — DEFER to v0.7d)
# /api/internal/* and crons still use lib/engine/*. Don't delete yet.

# After each phase: typecheck + lint + build + smoke + commit + deploy + verify
```

### 9.2.A — Web-v2 template-debris deletion (S.197 Path A addendum)

Path A retargeted Session 6 chat-rewrite to `web-v2/audric-chat` (S.197), so the template's `(chat)` route group + its 30+ chat-shell component/hook/lib files become dead code post-cutover. Delete them in this same phase:

```bash
cd /Users/funkii/dev/audric

# [S.197b 2026-05-20] ALREADY DONE pre-Session-9a — done at S.197b time:
#   rm -rf apps/web-v2/app/\(chat\)/chat           # template /chat/[id]
#   rm -rf apps/web-v2/app/\(chat\)/api/chat       # template /api/chat backend
#   git mv apps/web-v2/app/audric-chat apps/web-v2/app/chat
#   git mv apps/web-v2/app/\(chat\)/api/audric-chat apps/web-v2/app/api/chat
# All consumers updated to /chat + /api/chat. Skip these lines if doing
# Session 9a fresh — they're already gone.

# Template chat route group remaining files (page + layout + 7 API routes)
rm -rf apps/web-v2/app/\(chat\)/page.tsx        # template root chat page
rm -rf apps/web-v2/app/\(chat\)/layout.tsx      # template chat layout (already Pyodide-pruned in S.197)
rm -rf apps/web-v2/app/\(chat\)/actions.ts
rm -rf apps/web-v2/app/\(chat\)/api/document
rm -rf apps/web-v2/app/\(chat\)/api/files
rm -rf apps/web-v2/app/\(chat\)/api/history
rm -rf apps/web-v2/app/\(chat\)/api/messages
rm -rf apps/web-v2/app/\(chat\)/api/models
rm -rf apps/web-v2/app/\(chat\)/api/suggestions
rm -rf apps/web-v2/app/\(chat\)/api/vote
# The (chat) folder itself will be empty after these deletes — rmdir if so.

# Template chat shell components (~30 files; brand-leaking chrome)
rm apps/web-v2/components/chat/{app-sidebar,sidebar-history,sidebar-history-item,sidebar-user-nav,sidebar-toggle,chat-gate,chat-header,messages,message,message-actions,message-editor,message-reasoning,multimodal-input,preview,preview-attachment,suggested-actions,suggestion,slash-commands,submit-button,toast,toolbar,visibility-selector,shell}.tsx
# KEEP: chip-bar.tsx + username-palette-root.tsx + username-search-palette.tsx + empty-state.tsx
#       (Audric-rebuilt in S.192; may be referenced by audric-chat-client.tsx)

# Template artifact streaming (code/text/sheet/image editors)
rm apps/web-v2/components/chat/{artifact,artifact-actions,artifact-close-button,artifact-messages,code-editor,console,create-artifact,data-stream-handler,data-stream-provider,diffview,document,document-preview,document-skeleton,image-editor,sheet-editor,text-editor,weather}.tsx
rm -rf apps/web-v2/artifacts                    # 4 subfolders: code/text/sheet/image
rm apps/web-v2/lib/artifacts/server.ts
rm -rf apps/web-v2/lib/artifacts

# Template icons (1050 LoC — includes VercelIcon)
rm apps/web-v2/components/chat/icons.tsx

# Template AI elements not used by audric-chat-client
rm apps/web-v2/components/ai-elements/{model-selector,prompt-input,code-block,suggestion}.tsx
# KEEP: conversation.tsx + message.tsx + reasoning.tsx + shimmer.tsx + tool.tsx
#       (used by audric-chat-client.tsx — verified S.197 audit)

# Template AI provider + tools layer
rm apps/web-v2/lib/ai/{models,models.mock,prompts,providers,entitlements}.ts
rm -rf apps/web-v2/lib/ai/tools                 # 5 template tool defs

# Template Drizzle ORM (replace with Prisma callsites in audric-chat route)
rm -rf apps/web-v2/lib/db                       # queries.ts + schema.ts + migrations

# Template hooks
rm apps/web-v2/hooks/{use-active-chat,use-artifact,use-auto-resume,use-chat-visibility,use-messages,use-scroll-to-bottom}.tsx

# Template error class (rename or delete — see S.197 follow-up note)
# If any caller survives the deletes above, rename to AudricError;
# otherwise delete entirely:
# rm apps/web-v2/lib/errors.ts
# rm apps/web-v2/lib/ratelimit.ts            # only used by template /api/chat
# Surgical edit apps/web-v2/lib/utils.ts to remove fetchWithErrorHandlers
# if no surviving caller imports it.

# Verification gates:
pnpm --filter @audric/web-v2 typecheck         # must pass 0 errors
pnpm --filter @audric/web-v2 lint              # must pass 0 errors
pnpm --filter @audric/web-v2 smoke:b1-b1a      # must pass 16/16
# Visual: open preview-deploy /, /audric-chat, /settings, /[username],
# /pay/<slug> — all should render without route 404s.
```

**S.197 follow-up note — `ChatbotError` rename:** Deferred from Session 5.5 to here. After the 9.2.A deletes land, grep for any surviving `ChatbotError` import. If the class is fully orphaned → delete `lib/errors.ts`. If a few helpers (lib/utils.ts `fetchWithErrorHandlers` or lib/ratelimit.ts) still need it, rename to `AudricError` (single-symbol rename, ~5 min). Settles the brand-leak surface S.197 deferred (logs + Sentry stack traces).

### 9.3 Estimated cleanup LoC

- Phase 9a (apps/web chat shell): ~24,700 LoC
- **Phase 9.2.A — web-v2 template-debris (S.197a addendum, S.197b reduction): ~9,650 LoC** (was ~10,000 pre-S.197b; ~350 LoC pulled forward to S.197b for the audric-chat → chat rename — template `(chat)/chat/` + `(chat)/api/chat/` already deleted)
- Phase 9b (settings P+S+C, not Memory): ~600 LoC
- Phase 9c (store): ~403 LoC
- Phase 9d (pay/invoice): ~175 LoC
- Phase 9e (proactive-marker): ~26 LoC
- **Total Phase 9 deletion**: ~35,550 LoC (was ~35,900 pre-S.197b)

(Phase 9f deferred to v0.7d: ~10,300 LoC engine library)

---

## Section 10 — References + Cross-references

- **Companion catalogue**: `audric/apps/web/__tests__/v0.7c-behavior-catalogue.md` (159 behaviors, full Phase 6 acceptance walk)
- **Master SPEC**: `spec/active/BENEFITS_SPEC_v07c.md`
- **Tracker**: `audric-build-tracker.md` (S.185 entry + S.186 update for the v2 runbook)
- **Engine release**: `@t2000/engine@2.11.0` (no engine bump required for Phase 6 cutover)
- **MemWal trajectory**: CLAUDE.md L138-145 + `BENEFITS_SPEC_v07c.md` D-11 lock (line 297)
- **Phase 5.5 audit precedent**: the audit-first reframe pattern that compounded across 5c → 5d → 5e → 5.5 → 6
- **Agentic Commerce spec**: `spec/active/AUDRIC_AGENTIC_COMMERCE_SPEC_DRAFT.md` v0.1 (informs Store rebuild scope)

### Why v2 of this runbook supersedes v1

v1 made two structural errors:

1. **Wrong cutover URL**: assumed `audric.ai/` was the chat dashboard. It's marketing. Chat is at `/new`.
2. **Lazy scope discipline**: assumed "keep everything in apps/web" by default. For evolving surfaces (settings, store, pay), v2-pattern rebuild is the right play; rebuild-don't-port is the discipline.

v2 corrects both via audit-2 + per-surface disposition table + multi-session rebuild sequence.

### Why this isn't endless scope-creep

Hard limit on what gets rebuilt: **public-facing surfaces that evolve**. Marketing, legal, admin, server-only APIs, crons, internal data plumbing — ALL stay in apps/web. The v0.7c scope is "chat shell fork"; v0.7d adopts MemWal + redesigns Memory; v0.8+ may eventually retire apps/web entirely. Each step is independently shipable.

### Future agents

If you're picking Phase 6 up cold:
1. Don't re-read v1 or v2 of this runbook (v1 wrong on routing; v2 wrong on archive trajectory — both superseded by v3).
2. Start with Section 1 (disposition table) and Section 3 (multi-session sequence).
3. Pick the session that's next-in-line (check `audric-build-tracker.md` S.NNN for status).
4. Apply audit-first cadence to each session: WHAT v2 patterns? WHAT components already exist in web-v2? WHAT's the minimum LoC to ship?
5. Phase 6 ENDS at the post-soak deletion sweep (Session 9). Anything beyond that (MemWal, lib decouple, server-only API migration, marketing landing migration, final apps/web archive) is v0.7d / v0.7e \u2014 see Section 11.

---

## Section 11 — v0.7d + v0.7e Roadmap (NOT Phase 6 scope — locked here for sequencing context)

The audit-3 lock (2026-05-19 ~21:30 AEST) bound apps/web's full archive trajectory across 3 phases. Phase 6 (v0.7c, this runbook) is phase 1 of 3. The other two phases get their own specs when activated; the skeletons below are sequencing context only.

### 11.1 v0.7d — Memory + Engine library decoupling + HITL native

**Trigger:** post-2026-05-29 MemWal stability (per CLAUDE.md L141) + Phase 6 7d soak passes. Approximate timeline: 2-3 weeks after Phase 6 cutover lands.

**Scope:**
| Workstream | LoC delta | Effort |
|---|---|---|
| MemWal memory wiring per D-11 lock | host: minimal (inject `MemWalMemoryStore` into engine config); engine: already supports `EngineConfig.memoryStore` interface | ½ day |
| Settings Memory section rebuild in web-v2 (against MemWal data model, NOT legacy `UserMemory` CRUD) | ~+400 | 1-2 days |
| Delete legacy memory pipeline in apps/web (`/api/internal/memory-extraction` cron + `/api/user/memories` + `/api/user/memories/[id]` + `MemorySection.tsx` + `/api/cron/user-memory-retention`) | ~-1,500 | 1 day |
| Delete `buildMemoryContext()` and other legacy memory-injection paths in engine | ~-500 | ½ day |
| `lib/engine/{strip-llm-directives,init-engine-stores,harness-metrics}.ts` decouple in apps/web (tendril 6) — extract shared bits to a neutral location; chat-only bits delete with v0.7c sweep already done | ~-10,000 (chat-only) + +500 (extracted shared) | 2-3 days |
| HITL `needsApproval` SDK-native migration per SPEC 40 batch 3 (replace bespoke `pending_action` event with AI SDK's native `tool-approval-request`) | host: medium (refactor `audric-chat` route's HITL slice); engine: medium (deprecate `pending_action` event shape, keep `attemptId`/`approvalId` mirror per Spec §Item 3a) | 2-3 days |
| Structured-output classifier migration per D-16 (replace ad-hoc prompt-engineered classifiers with `generateObject` calls + Zod schemas) | host: minor (call-site updates); engine: minor (new classifier helpers) | 1-2 days |

**v0.7d totals: ~8-12 agent days; net LoC delta -10,300 to -11,500.**

**v0.7d unlocks v0.7e** by decoupling the engine library and removing chat-only deps from apps/web's `lib/engine/*`. After v0.7d, apps/web's lib has clean separation between chat-coupled (deleted) and standalone (Tier C surfaces still depend on these).

### 11.2 v0.7e — Tier C copy-port sweep + final apps/web archive

**Trigger:** v0.7d ships + 7d soak passes. Approximate timeline: 1-2 months after Phase 6 cutover lands.

**Scope:** the Tier C surfaces from audit-3 (zero v2-
pattern benefit; pure migration mechanics). The work is mostly `git mv` + update imports + redeploy.

**Surfaces to migrate:**

| Surface | LoC | Migration mechanic | Effort |
|---|---|---|---|
| Marketing landing (`app/page.tsx` + `components/landing/*`) | ~1,800 | Copy 10 section components + verify auth redirect logic + OG metadata + replace apps/web reference in `audric.ai/` rewrite | 1-2 days |
| Legal pages (`(legal)/disclaimer`, `privacy`, `security`, `terms`) | 4 small pages + layout | Copy MDX/HTML; verify routing | ½ day |
| Litepaper (`/litepaper`) | small | Copy as-is | ¼ day |
| Admin internal (`(internal)/admin/scaling`) | small | Copy as-is + auth check | ¼ day |
| Analytics APIs (`/api/analytics/*` — 7 routes) | ~? | Move route files + their lib deps (`lib/portfolio.ts`, `lib/rates.ts`, `lib/transaction-history.ts`) | 1-2 days |
| Identity APIs (`/api/identity/*` — 4 routes) | ~? | Move route files | 1 day |
| Internal APIs (`/api/internal/*` — 10 routes) | ~? | Move route files; rewire cron-secret auth + Prisma client | 2-3 days |
| User APIs (`/api/user/*` — 8 routes, sans memories which delete in v0.7d) | ~? | Move route files | 1-2 days |
| Canonical fetchers (`/api/portfolio`, `/api/positions`, `/api/prices`, `/api/quote`, `/api/rates`, `/api/stats`, `/api/suins/resolve`, `/api/build-id`, `/api/history`, `/api/activity`) | ~? | Move route files + canonical fetcher modules from `lib/` | 1-2 days |
| Crons migration (cutover-sensitive — move 4 schedules from root `vercel.json` to `apps/web-v2/vercel.json`) | server-only | Move schedules + handler files; verify schedules fire at correct times | 1 day + careful cutover window |
| `lib/*` decoupling (rest — `lib/auth.ts`, `lib/auth-fetch.ts`, `lib/env.ts`, `lib/identity/`, `lib/icons/`, `lib/redis/`, `lib/scroll/`, `lib/chain-memory/`, `lib/contacts/`, etc.) | ~8,000 | Copy modules (some already exist in web-v2); update imports across migrated routes | 2-3 days |
| **Final apps/web archive** (rename to `apps/web-legacy`, freeze in git history, delete from Vercel project) | -83,000 (all that remains) | git rename + Vercel project deletion + DNS verification | ½ day |

**v0.7e totals: ~10-15 agent days; net LoC delta -83,000 (apps/web entirely retired); +~2,000 in web-v2 (migrated routes).**

### 11.3 Cron cutover risk (v0.7e-specific gotcha)

`/Users/funkii/dev/audric/vercel.json` at the monorepo root currently configures 4 cron schedules pointing at `/api/cron/*` on apps/web:

```json
{
  "crons": [
    { "path": "/api/cron/turn-metrics-cleanup",       "schedule": "0 3 * * *"  },
    { "path": "/api/cron/turn-metrics-pending-sweep", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/conversation-log-retention", "schedule": "30 3 * * *" },
    { "path": "/api/cron/user-memory-retention",      "schedule": "45 3 * * *" }
  ]
}
```

**Migration mechanic for crons:**
1. Add cron handlers to `apps/web-v2` at the same paths
2. Create `apps/web-v2/vercel.json` with the same 4 schedules
3. Verify cron-secret auth still works (same env var; shared schema)
4. Deploy web-v2 with new crons live
5. Remove cron schedules from root `vercel.json` (or move to `apps/web-legacy/vercel.json` and disable that project's crons)

**Critical risk:** the `*/5 * * * *` `turn-metrics-pending-sweep` runs every 5 minutes. If apps/web's cron stops before web-v2's starts (or vice versa), there's a window where pending-actions don't get swept. The mitigation: deploy web-v2's crons first, let both run for 10 minutes (idempotent operations — the sweeper is safe to double-fire), then remove apps/web's. Monitor TurnMetrics dashboard for any stuck rows during the dual-run window.

Also note: `/api/cron/user-memory-retention` already deletes in v0.7d (legacy memory pipeline removal). So by v0.7e there are only 3 crons left to migrate.

### 11.4 Why phase split matters

If we did "rebuild everything in v0.7c":
- 17-25 agent days in one Phase 6 — opposite of the slice discipline that compressed Phases 5-5.5
- Cron cutover concurrent with chat traffic flip — concentrated P0 risk
- Marketing/legal migration concurrent with engine/lib decoupling — context-switching cost
- Single rollback boundary — partial rollback impossible

Option C's phased approach:
- 3 independently shippable slices, each <15 days
- Each slice has its own 7d soak window — cumulative observability before next slice ships
- Cron cutover isolated to v0.7e with its own dedicated window
- 3 rollback boundaries — granular safety net

**End state is identical** (apps/web archived, web-v2 owns everything) but the path has 3 lower-risk hops instead of one mega-leap. This matches the audit-first compound that compressed Phases 5-5.5 by 80-99%.
