# v0.7e Phase 0 — Baseline Measurement

> **Status:** CAPTURED 2026-05-21 ~19:50 AEST (post-G3 cutover, post-S.230 SPEC skeleton).
> **Purpose:** Concrete `wc -l` baseline of apps/web as it exists today (the pre-v0.7e baseline). Every Phase 1-5 ship updates the post-phase column to verify the SPEC estimates were accurate. Promotion criterion G4 closes when this doc lands. Companion to `BENEFITS_SPEC_v07e.md` §1.

## 1 — Top-level surface counts

| Surface | Files | LoC | v0.7e SPEC §1 estimate | Delta |
|---|---|---|---|---|
| `app/api/` routes | 48 (`route.ts`) | 14,871 | 41 | +7 |
| `app/` pages (excl `api/`) | 15 (`page.tsx`) | 6,448 | 12 | +3 |
| `lib/` source (excl tests) | (~370 files) | 48,842 | ~100 / 3.3M | source LoC ≈ 49k |
| `lib/` tests | (~50 files) | 20,822 | not in SPEC | new finding |
| `components/` | (~250 files) | 45,811 | "2.2M source" | source LoC ≈ 46k |
| `hooks/` | (~30 files) | 7,728 | not in SPEC | new finding |
| `__tests__/` (root) | 3 (.test.ts + .md) | 783 | not in SPEC | new finding |
| `scripts/` | (~40 files) | 3,562 | not in SPEC | new finding |
| **TOTAL source + tests** | | **148,867 LoC** | | (this is the v0.7e ship target) |

**Variance from SPEC:**
- Routes +7 vs SPEC estimate of 41. SPEC §1 was off because: (a) the `cron/*` group was undercounted as ~3, actually 5; (b) `user/*` was undercounted as ~4, actually 8; (c) `engine/sessions/[id]` and `payments/[slug]/verify` were missed as separate route files.
- Pages +3 vs SPEC estimate of 12. SPEC missed: `(internal)/admin/scaling`, `(legal)/security`, `litepaper`. (`security` was added 2026-05-XX during SPEC 30 incident response; SPEC §1 used a stale snapshot.)

**Verification gate G4 closure criterion:**
The SPEC §1 estimates were ~15% optimistic. v0.7e Phase 1-5 effort estimates compound this — adjust the SPEC budget upward by ~15% or set scope-bounded acceptance for "ship 90% of routes, accept 10% lingering pending audit-deletion."

## 2 — Phase 1 deletion targets (chat-shell + page directories)

### 2.1 Phase 1.1 — chat-shell routes (12 routes, 4,680 LoC)

| Route | LoC | Disposition |
|---|---|---|
| `engine/chat` | 1,705 | DELETE (web-v2 owns) |
| `engine/regen-append` | 231 | DELETE |
| `engine/regenerate` | 282 | DELETE |
| `engine/resume` | 797 | DELETE |
| `engine/resume-with-input` | 299 | DELETE |
| `engine/sessions` | 103 | DELETE |
| `engine/sessions/[id]` | 147 | DELETE |
| `history` | 70 | DELETE (web-v2 owns; relation-not-exist log path lives there) |
| `transactions/execute` | 169 | DELETE (web-v2 owns) |
| `transactions/prepare` | 773 | DELETE (web-v2 owns) |
| `swap/quote` | 91 | DELETE (web-v2 owns) |
| `quote` | 13 | DELETE (wrapper; web-v2 owns) |
| **Phase 1.1 subtotal** | **4,680** | **CHAT SHELL DELETE** |

**Risk:** these are all currently 2-hop apps/web-handled (per G3 finding: rewrites default to `afterFiles`, so local routes win). Each delete is a cutover, not a dead-route delete. Need pre+post smoke per route to verify the rewrite proxy activates. ~12 smoke commands per phase ship.

**Rewrite check needed:** Verify `next.config.ts` has rewrite entries for ALL 12 routes. If any are missing, the deletion will produce 404 (no rewrite to proxy). Audit-first before Phase 1.1 ship.

### 2.2 Phase 1.2 — page directories (Store + Pay + Settings, est ~3-4 pages)

| Page | Disposition |
|---|---|
| `/[username]` | DELETE (Store rewrites to web-v2; line 162-165 of next.config.ts) |
| `/pay/[slug]` | DELETE (Pay rewrites to web-v2; line 117) |
| `/invoice/[slug]` | DELETE (legacy invoice; line 124 rewrites `/invoice/:slug → /pay/:slug`) |
| `/settings` + `/settings/contacts` | DELETE (Settings rewrites; lines 129-130) |
| `/chat/[sessionId]` | DELETE (chat shell — Phase 1.1 owns this) |
| `/new` | DELETE (chat shell — Phase 1.1 owns this) |

**Risk:** page directories are deeper than route.ts files — they carry their own layout.tsx, error.tsx, loading.tsx, components. Need recursive size tally before each delete. The /[username] catch-all has the most surface (Store landing page + canvas components).

### 2.3 Phase 1.3 — D-question-gated conditional deletes

| Surface | LoC | Gating decision | Disposition |
|---|---|---|---|
| `services/*` (3 routes) | 1,050 | D-2 audit (Vercel 30d logs) | DELETE if zero traffic; MIGRATE if active pay_api callers |
| `voice/*` (3 routes) | 337 | D-3 audit | DELETE per v0.7c audit-3 zero-usage finding |
| `payments/*` (3 routes) | TBD | D-4 audit (verify rewrite coverage) | DELETE if rewrite covers; MIGRATE if not |
| `user/memories` (if it still exists) | TBD | D-1 audit | DELETE (signpost flow owned by web-v2) |

## 3 — Phase 3 copy-port targets (Tier C migration, ~10-15 routes)

**user/* (8 routes, 868 LoC):**
- `user/financial-profile` (78), `user/preferences` (220), `user/preferences/contacts/backfill` (128), `user/status` (100), `user/tos-accept` (52), `user/wallets` (122), `user/wallets/[id]` (53), `user/watch-addresses` (115)

**analytics/* (3 remaining routes after S.228+S.229+G3):**
- `analytics/activity-heatmap`, `analytics/portfolio-multi`, `analytics/weekly-summary`

**identity/* (4 routes):**
- `identity/change`, `identity/check`, `identity/reserve`, `identity/search`

**Standalone (8 routes):**
- `activity`, `build-id`, `positions`, `prices`, `rates`, `stats`, `suins/resolve`

**Phase 3 total estimate: ~23 routes × avg ~150 LoC = ~3,500 LoC to copy-port to web-v2.**

## 4 — Phase 4 cron cutover (5 schedules, 246 LoC)

| Cron route | LoC | Vercel cron status |
|---|---|---|
| `cron/conversation-log-retention` | 46 | (audit needed: Vercel cron list) |
| `cron/financial-context-snapshot` | 51 | LIVE (v0.7d Block B; daily 02:00 UTC) |
| `cron/portfolio-snapshot` | 39 | (audit needed) |
| `cron/turn-metrics-cleanup` | 48 | LIVE (v0.7d Block B; daily 03:00 UTC) |
| `cron/turn-metrics-pending-sweep` | 62 | LIVE (v0.7d Block B; every 5 min — HIGHEST RISK per L-3) |
| **Phase 4 subtotal** | **246** | — |

**Phase 4 risk surface:**
- L-3 calls out `turn-metrics-pending-sweep` as `*/5 * * * *` — highest risk.
- Cutover plan: deploy web-v2 cron routes → verify both apps/web + web-v2 fire in same minute (idempotent double-fire is safe; both call same `prisma.turnMetrics.findMany` and updates are key-stable) → delete apps/web cron route → 24h observation window before declaring Phase 4 closed.

## 5 — Phase 5 keep-only (everything left in apps/web after Phases 1-4)

After Phases 1-4 (delete 12 chat-shell + 6 pages + 9-10 conditional + 5 crons + 23 copy-port), apps/web should retain ONLY:

**Routes (~8 keep-and-archive):** marketing-only + admin
- `/build-id` (Phase 3 copy-port confirms keep or delete)
- `/(internal)/admin/scaling` (admin route — D-7 decision)

**Pages (~6 marketing keepers):**
- `/(legal)/disclaimer`, `/(legal)/privacy`, `/(legal)/security`, `/(legal)/terms`
- `/litepaper`
- `/auth/callback` (sign-in callback — intentionally NOT rewritten per L-5 carve-out)

**Phase 5 final ritual (L-5):**
1. Rename `apps/web` → `apps/web-legacy`
2. Delete Vercel project for apps/web (or repoint to web-v2)
3. DNS verify `audric.ai` resolves to web-v2 directly
4. Delete rewrite layer from `apps/web/next.config.ts`
5. Per D-7: delete `apps/web-legacy/` directory entirely (git history is SSOT)

## 6 — Combined Phase 1-5 LoC math (post-v0.7e end state)

| Category | Pre-v0.7e LoC | Post-v0.7e LoC | Delta |
|---|---|---|---|
| `app/api/` routes | 14,871 | ~1,500 (admin + marketing keepers) | -13,371 (-90%) |
| `app/` pages | 6,448 | ~2,500 (legal + marketing + auth callback) | -3,948 (-61%) |
| `lib/` source | 48,842 | ~5,000 (legal/marketing helpers) | -43,842 (-90%) |
| `lib/` tests | 20,822 | ~500 (marketing + legal smoke) | -20,322 (-98%) |
| `components/` | 45,811 | ~10,000 (marketing + legal UI) | -35,811 (-78%) |
| `hooks/` | 7,728 | ~500 (marketing-only hooks) | -7,228 (-94%) |
| `__tests__/` (root) | 783 | ~200 | -583 |
| `scripts/` | 3,562 | ~500 (marketing CI helpers only) | -3,062 |
| **TOTAL apps/web LoC** | **148,867** | **~20,200** | **-128,667 (-86%)** |

**Reality check:** ~86% LoC reduction in apps/web. If the Phase 5 final ritual ALSO archives `apps/web-legacy` to git history, the working-tree apps/web disappears entirely — closer to -100%. Web-v2 doesn't grow by 128k LoC because: (a) much of it is chat-shell that web-v2 already owns; (b) ~50k LoC is legacy chat shell + transactions + sponsored-tx code already factored in web-v2 since Session 4.5.

**Conservative estimate of net monorepo LoC delta:** -75k LoC (delete 148k → web-v2 absorbs ~50k of unique new surface area in Phase 2 + Phase 3).

## 7 — Verification gates (close G4 when ALL checked)

- [x] `wc -l` baseline captured for all 7 surface categories
- [x] Phase 1.1 chat-shell deletion targets enumerated with per-route LoC
- [x] Phase 4 cron risk surface flagged (`turn-metrics-pending-sweep` `*/5` schedule)
- [x] Phase 3 copy-port surface enumerated (~23 routes, ~3.5k LoC)
- [x] Phase 5 post-v0.7e end state defined (~20k apps/web LoC keep-and-archive)
- [x] Per-phase reality check against v0.7e SPEC §1 estimates (~15% variance flagged)

**G4 CLOSED 2026-05-21 ~19:55 AEST** (post-G3, ready for Phase 1 founder lock once D-1..D-7 answered).

## 8 — Snapshot reproducibility

Re-run this baseline anytime:

```bash
cd /Users/funkii/dev/audric/apps/web
# Route count
find app/api -name "route.ts" | wc -l
# Route paths
find app/api -name "route.ts" | sed 's|/route.ts||' | sed 's|app/api/||' | sort
# LoC per category
find app/api -name "*.ts" -exec cat {} + | wc -l   # routes
find app -name "*.tsx" -not -path "*/api/*" -exec cat {} + | wc -l   # pages
find lib -name "*.ts" -not -name "*.test.ts" -exec cat {} + | wc -l   # lib source
find components -name "*.tsx" -exec cat {} + | wc -l   # components
```

Stamp re-run results in this doc's §1 table to track v0.7e progress per phase ship.
