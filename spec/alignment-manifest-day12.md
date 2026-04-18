# Alignment Manifest — Day 12 snapshot

> Phase A → Phase B handoff. Re-run of the Day 1 grep manifest after S.3 → S.11 deletions land. This is the working baseline for Phase B (Days 13–15).
>
> **Generated:** S.12 (2026-04-18) at the close of Phase A.
> **Companion:** `spec/alignment-manifest.md` (Day 1 baseline — 14 sections of triage rows).
> **Closes into:** `spec/alignment-manifest-final.md` (Day 15 — diff snapshot showing zero stale refs).
>
> Source spec: `AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md` § Day 12 + § Phase B.

---

## Headline numbers

| Metric | Day 1 baseline | Day 12 (this snapshot) | Δ |
|---|---|---|---|
| t2000 files matching grep | ~70 | **32** | −38 (−54%) |
| audric files matching grep | ~100 | **38** | −62 (−62%) |
| Combined files | ~170 | **70** | −100 (−59%) |
| Engine tools (read + write) | 49 | **40** (29 reads + 11 writes) | −9 |
| Cron jobs | 21 | **4** (memoryExtraction, profileInference, chainMemory, portfolioSnapshot) | −17 |
| Prisma models (audric) | 25 | **15** | −10 (−40%) |
| t2000 src LOC (engine + sdk + cli + mcp + server) | ~39.8k | **33.1k** | −6,687 (−17%) |
| audric src LOC (apps/web/{app,components,lib,hooks,scripts}) | ~66.1k | **34.9k** | −31,143 (−47%) |
| **Combined src LOC removed** | — | — | **−37,830 (−36% net)** |

Targets from spec § Phase A success criteria: app code LOC reduced **>35%** ✅, Prisma table count reduced **>30%** ✅, **4 cron jobs remaining** ✅.

---

## Phase A success criteria — final tally

| Criterion | Source | Status | Evidence |
|---|---|---|---|
| Dashboard: 4 elements above fold (balance / greeting / chat input / chip bar) | spec § A | ✅ | S.11 — `Topbar` (balance + HF chip) + `NewConversationView` (greeting w/ slide-out) + chat input + chip bar. No banners, no canvas chips, no proactive cards. |
| Zero user-facing proactive notifications except critical HF email at HF < 1.2 | spec § A | ✅ | All 17 user-facing crons deleted (S.5/S.6 fold). Critical HF protection runs on indexer hook (`apps/server/src/indexer/hfHook.ts`) → `/api/internal/hf-alert` → Resend (always fires, no opt-out). No digest, no morning briefing, no rate alerts, no copilot suggestions. |
| App code LOC reduced > 35% | spec § A | ✅ | audric src **−47%**, t2000 src **−17%**, combined **−36%** net (above target). |
| Prisma table count reduced > 30% | spec § A | ✅ | 25 → 15 models (**−40%**). 10 tables dropped via `20260413120000_simplification_drop_dead_features` migration. |
| 4 cron jobs remaining: memoryExtraction, profileInference, chainMemory, portfolioSnapshot | spec § A | ✅ | `apps/server/src/cron/index.ts` runs exactly these 4 in the `daily-intel` group. `hourly` + `daily-chain` groups are no-ops with explicit "nothing to do (simplification)" log lines. |
| Daily-free billing live with distinct-session counting; CostTracker green | spec § A | ✅ | S.4 `lib/billing.ts` single source of truth (5 unverified / 20 verified, rolling 24h via `groupBy: ['sessionId']`). 429 with structured error body. CostTracker untouched. |
| Allowance refund flow + zero on-chain allowances with non-zero balance | spec § A | ⚠️ **revised** | **REVISED per Day 1 audit Decision 1:** refund flow SKIPPED. Move package stays deployed (dormant); 10 allowance objects with $4.35 total locked stay on-chain, owner-recoverable via direct `Allowance::withdraw()` call. Manual refund on demand only. Comms email (Day 15) tells users their balance is dormant + ping for return. **AllowanceRefund table never created.** |
| AdviceLog + ConversationLog populated and feeding chat as silent memory | spec § A | ✅ | `record_advice` (audric `lib/engine/advice-tool.ts`) writes AdviceLog; `engine-context.ts` hydrates last 30d of advice on every turn. ConversationLog still written by chat route (fine-tuning dataset). Both tables retained from S.5 schema review. |

**All criteria met or revised per Day 1 audit. Phase A is complete.**

---

## Internal smoke test (S.12)

Code-level trace verifying every flow listed in spec § Day 12. Live execution deferred to operator (zkLogin gas-sponsored txs need browser).

| Flow | Tool / Route | Status | Notes |
|---|---|---|---|
| chat | `POST /api/engine/chat` (audric) → `engineFactory` → `runTools` | ✅ | Streaming SSE + tool dispatch wired. Daily-free billing branch enforced before stream starts. |
| save | `save_deposit` (engine) → SDK `buildDepositTx` → `/api/transactions/prepare` → sign → `/api/transactions/execute` | ✅ | Tool description still pins USDC-only + forbids auto-chain swap+deposit. |
| send | `send_transfer` (engine) → SDK `buildSendTx` → sponsored tx flow | ✅ | Address validation, contact lookup, balance check intact. |
| swap | `swap_execute` (engine) → SDK `buildSwapTx` (Cetus aggregator) → sponsored tx flow | ✅ | Multi-DEX routing across 20+ DEXs. |
| borrow | `borrow` (engine) → SDK NAVI borrow → sponsored tx flow | ✅ | USDC-only borrow tied to savings collateral. |
| repay | `repay_debt` (engine) → SDK NAVI repay → sponsored tx flow | ✅ | Balance-check-first guidance preserved in tool description. |
| activity | `GET /api/activity` → AppEvent Prisma model → `ActivityFeed` | ✅ | Allowance-package-prefix filter still hides dormant-contract calls. |
| AdviceLog | `record_advice` (audric `lib/engine/advice-tool.ts`) → AdviceLog table; `engine-context` reads last 30d on every turn | ✅ | Silent memory loop intact. |
| goals | `/api/user/goals/route.ts` + `[id]/route.ts` → SavingsGoal table | ✅ | CRUD endpoints present. Milestones removed in S.5. |
| settings | `/settings/page.tsx` → 5 sections (Passport, Safety, Memory, Goals, Contacts) | ✅ | S.10 reorg confirmed. Wallets + Sessions removed. |

**Build / typecheck / test smoke (machine-verifiable):**
- t2000 — `pnpm turbo typecheck test build` across sdk + engine + cli + mcp + server → **15/15 tasks pass** (lint deferred — pre-existing eslint v9 / config-format mismatch in sdk + cli + mcp; not introduced by Phase A).
- audric — `pnpm --filter @audric/web typecheck test build` → typecheck ✅, **265/265 tests pass**, build ✅ (no `/copilot/*`, `/automations/*`, `/reports/*`, `/setup/*` routes in manifest).

---

## Files still matching the Day-1 grep — categorized by Phase B owner

The Day 1 grep pattern is `scheduled action|morning briefing|copilot|auto-?compound|allowance|rate alert|features budget|trust ladder|pattern detect`.

### t2000 — 32 files

**Section A — Documentation (Phase B Day 13 — internal docs):** 11 files
- `README.md`, `CLAUDE.md`, `PRODUCT_FACTS.md`, `ARCHITECTURE.md`, `audric-roadmap.md`, `audric-build-tracker.md`, `t2000-skills/README.md`
- `packages/engine/README.md` — tool list still mentions deleted tools in the simplification-day-7 callout (intentional historical context, but the tool tables above need a final-count refresh)
- `spec/PRODUCT_SPEC.md` — feature list mentions DCA / scheduled actions
- `AUDRIC_2_SPEC.md`, `AUDRIC_UI_SPEC.md` — to be moved to `spec/archive/` with historical header (Day 13)
- `AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md` — WAIVE (spec itself; references deleted features by design)

**Section B — Marketing site (Phase B Day 14):** 3 files
- `apps/web/app/page.tsx` (t2000.ai homepage)
- `audric-reference-v2.html` — historical UI ref, WAIVE
- `article-trust-layer.md` — Mysten Labs briefing, Day 15

**Section C — Code with stale comments / historical markers (Phase B Day 13 scrub):** 9 files
- `packages/engine/src/tools/index.ts` — `[SIMPLIFICATION DAY 7]` deletion-log comment block (intentional; can stay or be trimmed)
- `packages/engine/src/tool-flags.ts` — line-37 comment listing removed flags (intentional)
- `packages/engine/src/tools/{activity-summary,portfolio-analysis,spending,receive,yield-summary}.ts` — text scrubs (descriptions/system-prompt strings may mention `allowance`)
- `packages/mcp/src/tools/read.ts`, `packages/mcp/src/prompts.ts` — Day 14 task (drop deleted-tool registrations, refresh prompts)
- `apps/server/src/cron/index.ts`, `apps/server/src/cron/types.ts` — historical block-comment + type union mentioning deleted job names (intentional)

**Section D — Infra / config (Phase B Day 13):** 3 files
- `infra/cron-task-definition.json`, `infra/setup-cron.sh` — env vars + EventBridge rules for deleted crons (Day 13)
- `apps/server/src/services/sui-executor.ts` — VERIFY per Day 1 manifest; mixed-concerns refactor candidate

**Section E — Tests (Phase B Day 13):** 1 file
- `apps/server/src/indexer/hfHook.test.ts` — verify only critical-HF tests remain; remove warn-level if any survived

**Section F — Source-of-truth code (KEEP):** 2 files
- `packages/sdk/src/token-registry.ts` — references "allowance" tier metadata (verify; likely fine)
- `packages/contracts/sources/errors.move` — header comment marking codes 12–17 as reserved (intentional ledger; the on-chain `Allowance` type still references them, do not reuse)

**WAIVE on this snapshot:** 4 files (the spec, the rationale, the Day-1 audit, this manifest's parent doc)

### audric — 38 files

**Section A — Documentation (Phase B Day 13):** 2 files
- `README.md`, `CLAUDE.md`

**Section B — Marketing / landing (Phase B Day 14):** 4 files
- `apps/web/app/page.tsx` (root landing), `apps/web/components/landing/LandingNav.tsx`
- `apps/web/components/dashboard/WelcomeCard.tsx` — VERIFY per Day 1 manifest
- `apps/web/app/savings/page.tsx` — meta description "auto-compounding via NAVI Protocol" (factually correct — NAVI auto-compounds at protocol level — but worth a copy review)

**Section C — Settings + verify pages (Phase B Day 13/14):** 2 files
- `apps/web/app/(legal)/terms/page.tsx` — already rewritten in S.10 but the word `allowance` may survive in historical phrasing; VERIFY
- `apps/web/app/verify/page.tsx` — scrub "unlock features" copy if present
- `apps/web/components/auth/EmailCaptureModal.tsx` — same scrub

**Section D — Code with historical `[SIMPLIFICATION DAY X]` deletion-marker comments (intentional, but noisy):** 11 files
- `apps/web/app/new/dashboard-content.tsx` (S.11)
- `apps/web/components/dashboard/{NewConversationView,UnifiedTimeline,ActivityFeed}.tsx` (S.3 / S.5 / S.11)
- `apps/web/components/shell/{Topbar,AppShell,AppSidebar}.tsx` (S.11)
- `apps/web/components/engine/ChatMessage.tsx` (S.7)
- `apps/web/components/panels/{PortfolioPanel,GoalsPanel,PayPanel,StorePanel}.tsx` (S.5)
- `apps/web/app/api/transactions/prepare/route.ts` (S.5/S.8)
- `apps/web/app/api/user/preferences/{route,route.test}.ts` (S.5)
- `apps/web/app/api/internal/notification-users/route.ts` (S.5)
- `apps/web/lib/engine/engine-factory.ts` — `ALLOWANCE_API_URL` env-var constant, may be unused now
- `apps/web/lib/billing.ts` — docstring comment about old allowance billing (historical context)

**Section E — Real follow-up bugs (worth fixing in Phase B Day 13):** 4 items
1. **`apps/web/middleware.ts` lines 18, 24** — old 301 redirect from `/settings/automations` → `/settings?section=copilot`. The `copilot` settings section was deleted in S.10. The redirect now lands on a non-existent section (falls through to `passport` via `SECTION_ALIASES`, so functionally OK — but the target URL is misleading). **Fix: redirect to `/settings` root or `/settings?section=passport`.**
2. **`apps/web/components/dashboard/ActivityFeed.tsx` line 26** — `EMPTY_STATE` map still has a `schedule` entry (`'No scheduled actions yet.'` + `'Create a schedule'` CTA). The `schedule` activity type was removed when ScheduledAction was dropped — empty state for that key is dead. **Fix: drop the `schedule` entry from the map.**
3. **`apps/web/lib/chain-memory/pattern-detectors.ts` line 131** — detector return type still has a `proposalText` field referencing "auto-compound for you?". Per Day 1 manifest this file is "KEEP detectors, REMOVE proposal-emit". The proposal-emit cron is gone (S.5) but the field still ships in the return type. **Fix: drop `proposalText` from `RewardRedepositDetection` and any sibling detection types.**
4. **`apps/web/lib/engine/engine-factory.ts` line 48** — `ALLOWANCE_API_URL` constant + line-328 use in agent context. After all allowance API routes were deleted (S.5), this URL targets nothing. Verify it's referenced nowhere else; if dead, drop it.

**Section F — Live code with intentional allowance refs (KEEP):** 2 files
- `apps/web/app/api/activity/route.ts` lines 12, 300 — `ALLOWANCE_PACKAGE_PREFIX` + filter to hide dormant-contract calls from the activity feed. Contract is dormant but still callable for user-initiated refunds. KEEP.
- `apps/web/lib/report/analyzers.ts` — public report analyzers; KEEP per Day 1 manifest. Likely scrub copilot/schedule pattern refs only.

**Section G — Migration history (WAIVE per Day 1 manifest):** 5 files
- `apps/web/prisma/migrations/{20260411080000_add_allowance_id_column, 20260413120000_simplification_drop_dead_features, 20260416100000_add_copilot_smart_confirmations, 20260416110000_add_copilot_digest_fields, 20260416120000_add_copilot_hf_widget_toggle, 20260416130000_add_copilot_email_nudge_shown_at}/migration.sql` — historical ledger. WAIVE.

**Section H — `.env.example`:** 1 file
- `apps/web/.env.example` — likely has stale `NEXT_PUBLIC_ALLOWANCE_*` or `COPILOT_*` env vars. **Day 13 scrub.**

---

## Day 15 orphaned-import grep (early read)

```bash
rg "create_schedule|allowance_status|pause_pattern|toggle_allowance|update_daily_limit|update_permissions|pattern_status|list_schedules|cancel_schedule" --type ts --glob '!*.test.ts'
```

| Repo | Matches in `.ts` (non-test) | Notes |
|---|---|---|
| audric | **0** | Clean. No orphan imports of deleted engine tools. ✅ |
| t2000 | 1 file | `packages/engine/src/tool-flags.ts` lines 37–38 — historical comment listing removed flag names (intentional). ✅ no live import refs. |

**Day 15 acceptance early-result: zero orphan imports.** ✅

---

## Phase B (Days 13–15) working set

Carrying forward into the alignment sweep:

| Day | Owner | Items | Files |
|---|---|---|---|
| **Day 13** | internal docs + READMEs + per-package docs + legal pages + code-comment scrubs + 4 follow-up bugs (Section E above) | t2000 root docs (7), package READMEs (5), audric README + CLAUDE, t2000 source comment scrubs (Section C), audric source bug fixes (Section E), .env.example (Section H), `AUDRIC_2_SPEC.md` + `AUDRIC_UI_SPEC.md` move to archive | ~25 files |
| **Day 14** | external surfaces (websites + skills + MCP) | t2000.ai (homepage, terminal demo, pricing, docs, footer/nav), audric.ai (hero, features grid, FAQ, blog/changelog), 9 skill dirs to delete, MCP tool registrations refresh + republish | ~15 files + 9 skill dirs + MCP republish |
| **Day 15** | external briefings + final 3-grep sweep + comms send | `article-trust-layer.md` honest rewrite, npm package descriptions (4 packages), Mysten/Discord/Telegram, final grep, `spec/alignment-manifest-final.md` snapshot, comms email via direct Resend, changelog post | ~6 surfaces + comms |

---

## Closure of this snapshot

When `spec/alignment-manifest-final.md` (Day 15) is committed showing zero matches in `**/*.md` + `**/*.ts` (excluding `spec/archive/`, `AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md`, `spec/SIMPLIFICATION_RATIONALE.md`, `spec/day1-audit-findings.md`, `spec/alignment-manifest*.md`, and the SIMPLIFICATION-DAY-X historical markers), this Day 12 snapshot is closed. Until then, this is the single source of truth for what Phase B owes.

---

*Generated: S.12 (2026-04-18). Phase A complete — Phase B starts S.13.*
