# Audric Build Tracker

> Companion to `audric-roadmap.md` — tracks execution status only. The roadmap has all implementation detail.

**Rules:**
- Work phases in order. Do not start Phase N+1 until Phase N is complete.
- Within a phase, work sections in numbered order (they are dependency-ordered).
- Update status after each commit/deploy.
- Status values: `not started` · `in progress` · `done` · `blocked`

---

## Pre-work (Days 1–4) — ✅ COMPLETE

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 0.1 | Conversation logging | ~2h | done | — | audric | — |
| 0.2 | Strip multi-asset save/borrow (USDC-only) | ~3h | done | — | both | SDK `assertAllowedAsset`, engine tool descriptions, LLM system prompt, UI flows |
| 0.3 | Add User table to Prisma | ~2h | done | — | audric | — |
| 0.4 | Email capture + verification | ~4h | done | 0.3 | audric | Resend integration live |
| 0.5 | Asset architecture (token-registry.ts) | ~3h | done | — | both | GOLD decimals fixed (9 not 6) |
| 0.6 | Fix savings APY display | ~1h | done | — | audric | — |
| 0.7 | Swap fee (Cetus Overlay Fee) | ~30m | done | — | both | 0.1% overlay fee live in SDK + Audric |
| 0.8 | Allowance top-up flow | ~2h | blocked | allowance.move | audric | Deferred to Phase 1 |
| 0.9 | Settings page architecture (scaffold) | ~3h | done | — | audric | — |
| 0.10 | Error boundaries + route loading states | ~1h | done | — | audric | — |
| — | Swap chip flow (Save replaced Pay) | ~1d | done | — | both | Asset picker → amount → quote → confirm |
| — | Dust filtering v2 | ~2h | done | — | both | `<=` threshold, USD-based filter, `Math.floor` everywhere |
| — | Financial amount safety (flooring) | ~2h | done | — | both | Dynamic precision, floor not round, unified `heldAmount()`/`heldUsd()` |
| — | Test coverage + CI integration | ~1d | done | — | t2000 | Unit, API integration, mainnet smoke tests |
| — | Cursor rules | ~1h | done | — | both | `savings-usdc-only.mdc`, `financial-amounts.mdc`, `usdc-only-saves.mdc` |

**Execution order:**
- **Phase A (t2000 repo first):** 0.5 → 0.2 → 0.7 → tests → docs → npm release — **DONE (v0.26.0)**
- **Patch (t2000):** Dust filtering + stablecoin cleanup — **DONE (v0.26.1)**
- **Phase C (t2000):** USDC-only engine fixes, GOLD decimals, balance tool `saveableUsdc`, system prompt, flooring — **DONE (v0.26.2, SDK 0.23.0, Engine 0.7.6)**
- **Phase B (audric repo after each release):** pnpm update → chip flows → dust filtering v2 → financial amount safety → Cursor rules — **DONE**

**Status:** Pre-work 10/10 complete (0.8 blocked on `allowance.move` — deferred to Phase 1). t2000 v0.26.2 released (SDK 0.23.0, Engine 0.7.6). Audric deployed with USDC-only enforcement, Swap chip, dust filtering, financial amount safety, and Cursor rules.

---

## Phase 1 — Daily habit loop (Weeks 1–2)

**Testing rule:** Tests ship with each task, not as a separate phase. CI pipeline from pre-work runs unit + integration + smoke tests on every PR.

### Week 1 — Infrastructure + free features (no allowance needed)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| — | **Deploy `allowance.move` contract** | 1d | done | — | t2000 | ✅ Fresh deploy with scoped allowance on mainnet (`0xd775…968ad`). Config + treasury migrated. SDK allowance methods + `getFinancialSummary()` built (24 tests). Server + indexer redeployed |
| — | **Spec 2 — Session authorization** | 0.5d | done | allowance.move | t2000 | ✅ ScopedIntent type + `buildScopedIntent()`/`verifyScopedIntent()` in SDK. IntentLog table in NeonDB. `executeWithIntent()` wrapper in server. `ADMIN_PRIVATE_KEY` in AWS Secrets Manager. Cron task def updated with DATABASE_URL + admin key. 10 tests. Gates all autonomous deductions. |
| 1.1 | Notification infrastructure | 3d | done | 0.3, 0.4 | both | ✅ ECS cron (hourly EventBridge → Fargate), Resend emails, SDK `getFinancialSummary()`, real-time HF hook in indexer, audric internal API (notification-users, notification-log, hf-alert), NotificationPrefs + NotificationLog tables, settings UI toggles, `T2000_INTERNAL_KEY` in Vercel |
| 1.2 | Health factor alerts (free) | 2d | done | 1.1 | both | ✅ Shipped with 1.1 — indexer HF hook (critical, 30min dedup, Resend via audric internal API), cron batch (warn, 4h dedup, direct Resend from ECS). Email templates for both levels. Deep link to `/action?type=repay`. Settings UI toggle |
| 1.6 | Unified activity feed + filter navigation | 3d | done | — | audric | ✅ DashboardTabs (Chat/Activity), FilterChips, ActivityCard, ActivityFeed. AppEvent NeonDB table. GET /api/activity: two-layer chain classifier (NAVI/Suilend/Cetus protocol regex + balance heuristics), MPP treasury detection for pay labeling, Sui RPC v2 `transactions` field fix, cursor pagination, dedup. useActivityFeed hook (useInfiniteQuery, date grouping, red dot). Event writers in services/complete for standard MPP + deliver-first |
| — | CostTracker instrumentation | 0.5d | done | — | audric | ✅ SessionUsage table (per-invocation: full token breakdown + cache + costUsd + toolNames + model). Dropped unused LlmUsage. logSessionUsage fires on both chat + resume routes. Demo sessions logged as 'anonymous'. GET /api/stats: public cached endpoint (users, sessions, tokens, cost, cache savings, transactions, top tools) |

**Week 1 total: ~10 days effort.** allowance.move done. Spec 2 (session auth) done. 1.1 done. 1.2 done (shipped with 1.1). 1.6 done ✅. CostTracker done ✅. Week 1 complete.

### Week 2 — Paid features + onboarding (needs allowance deployed)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| — | Allowance onboarding wizard (`/setup`) | 1d | done | allowance.move | audric | ✅ 4-step wizard, two-tx flow (create→deposit), `useAllowanceStatus` hook, /new→/setup redirect, Settings budget card, top-up mode, zero-balance UX. SDK 0.23.0 published |
| 1.3 | Morning briefing (email + in-app card) | 3d | done | 1.1, allowance.move | both | ✅ ECS cron `runBriefings()`: getFinancialSummary → content → allowance deduct ($0.005) → Resend email → store via internal API. 3 variants (savings/idle/debt_warning), context-dependent CTAs, idempotency guard. DailyBriefing table, BriefingCard pinned on chat+activity, useOvernightBriefing hook. 18 unit tests |
| 1.3.1 | Deep link action system | 1d | done | — | audric | ✅ /action page (save/repay/briefing/topup routing), ?prefill in /new auto-sends to engine, ?section in /settings. notification-users now returns allowanceId from UserPreferences |
| 1.4 | Savings goals (chat + management UI) | 3d | done | 0.3 | audric | ✅ SavingsGoal Prisma model + CRUD API, 4 engine tools (create/list/update/delete), Goals section in settings (GoalCard + GoalEditor), useGoals hook, progress bars in BriefingCard, cron milestone detection (25/50/75/100%) with celebration emails + AppEvents |
| 1.4.1 | Feedback loop data layer | 2d | done | 1.4 | both | ✅ `AdviceLog` + `SavingsGoalDeposit` tables, `AppEvent` +4 fields (adviceLogId, goalId, suiTxVerified, source). `record_advice` engine tool (auto permission), `handleAdviceResults()` in chat route, `buildAdviceContext()` memory injection (last 5 advice, 30d). Outcome checker + follow-up queue deferred to Phase 3.3 |
| 1.5 | New user onboarding + ToS | 1.5d | done | 0.6 | both | ✅ **ToS:** 2 new sections (Fees + Allowance), `tosAcceptedAt` on User, consent checkbox in `/setup`, catch-up banner for existing users. **Onboarding:** WelcomeCard (Passport + Save/Swap/Send/Ask), `onboardedAt` first-run detection, `useUserStatus` hook, 24h follow-up cron job (3 email variants). Migration backfills existing users |
| — | AI session charge ($0.01/session) | 0.5d | done | allowance.move | both | ✅ `POST /api/internal/charge` on t2000 server (Hono, x-internal-key auth). Audric chat route calls on new sessions via `chargeSession()`. Fire-and-forget, graceful degradation. Uses `ALLOWANCE_FEATURES.SESSION` (4) |

**Week 2 total: ~12 days effort.** Onboarding wizard done ✅ (unblocks paid features). 1.3 + 1.3.1 done ✅ (first paid feature live). 1.4 → 1.4.1 → 1.5 are the remaining sequence.

**Critical path:** allowance.move ✅, Spec 2 (session auth) ✅, digest replay protection ✅, 1.1 ✅ + 1.2 ✅ (Week 1 infra complete), onboarding wizard ✅ (paid features unblocked), 1.6 activity feed ✅, CostTracker ✅, 1.3 morning briefing ✅ + 1.3.1 deep links ✅, 1.5 onboarding + ToS ✅, 1.4 savings goals ✅, 1.4.1 feedback loop ✅, session charge ✅. **Phase 1 complete.** Next: Phase 2 (Receive + payments) + landing pages (parallel).

---

## Phase 2 — Receive + payments (Weeks 3–5)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 2.1 | Payment links + QR codes (all 5 page states) | 4d | not started | 1.1 | audric | Receive chip already shows deposit address + QR. Store hard dependency |
| 2.2 | Invoices | 3d | not started | 2.1 | audric | — |
| ~~2.3~~ | ~~AlchemyPay fiat on/off-ramp~~ | — | skipped | — | — | Deferred post-Store. Not on the critical path. Can add later as a config change |
| 2.4 | Send UX improvements (memo) | 1d | not started | — | both | — |
| ~~2.5~~ | ~~Mini-storefront (sync products)~~ | — | skipped | — | — | Skipped — building the real storefront in Phase 5 avoids rebuilding twice |

**Critical path:** 2.1 → 2.2. 2.4 is independent. ~4 days saved by skipping 2.3 + 2.5.

---

## Phase 3 — Proactive agent + MPP discovery (Weeks 6–8)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 3.1 | Auto-compound rewards | 3d | not started | 0.7 | both | — |
| 3.2 | USDC rate monitoring alerts | 1d | not started | 1.1 | both | Settings UI already built. Backend cron job + Resend template only |
| 3.3 | Scheduled actions (DCA) + trust ladder UI | 5d | not started | 1.1 | both | Includes 0.1% swap fee disclosure |
| 3.3.1 | Feedback loop processing layer | 3d | not started | 1.4.1, 3.3 | both | `OutcomeCheck` + `FollowUpQueue` tables, `runOutcomeChecks()` + `detectAnomalies()` + `deliverFollowUps()` in daily ECS cron, `canSendFollowUp()` fatigue cap (2/day non-urgent), follow-up card (reuses BriefingCard), `follow_up` activity feed chip. Spec: `audric-feedback-loop-spec.md` |
| 3.4 | MPP consumer discovery | 3d | not started | — | audric | Pre-Store: users discover AI services (Suno, ElevenLabs) via Audric Pay |
| 3.4.1 | MPP reputation layer (Spec 3) | 2d | not started | 3.4 | t2000 | `computeScore()`, `scoreToTier()`, tiered rate limits (new→trusted→established→premium). Data already in ProtocolFeeLedger. Spec: `spec/audric-security-specs.md` |
| ~~3.5~~ | ~~Gifting reminders~~ | — | skipped | — | — | Deferred post-Store. Low priority |
| 3.6 | Credit UX improvements | 1d | not started | — | audric | — |

**Critical path:** 3.3 → 3.3.1 is the longest chain. 3.2 reduced to 1d (UI done). 3.4 primes users for Store. 3 days saved by skipping 3.5.

---

## Phase 4 — Async job queue (Weeks 9–10)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 4.1 | Infrastructure (SQS + ECS worker) | 4d | not started | — | t2000 | — |
| 4.2 | Async services (ElevenLabs, Suno, Runway, Heygen) | 2d each | not started | 4.1 | both | — |

**Note:** Phase 4 infra is independent — can be built alongside Phase 3 if capacity allows.

---

## Phase 5 — Creator marketplace (Weeks 11–13)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 5.1 | User storefront (audric.ai/username) | — | not started | 2.1 | audric | — |
| 5.2 | Song generation + listing flow | — | not started | 4.1 | both | — |
| 5.3 | Merch bundles (Printful) | — | not started | 5.1 | audric | — |
| 5.4 | File storage (Walrus + Seal) | 3d | not started | — | both | — |
| 5.5 | Data model additions | — | not started | 5.1 | audric | — |
| 5.6 | Revenue and spin-out path | — | not started | 5.1 | — | — |
| 5.7 | Storefront content catalogue | — | not started | 5.1 | audric | — |
| 5.8 | In-chat marketplace recommendations | — | not started | 5.1 | both | — |

| 5.9 | Goals v2 — life goals (wealth, investment, earning) | 2d | not started | 3.3 or 5.1 | both | Extend `SavingsGoal` with `goalType` + `trackingMetric` columns. Types: savings (live), wealth (total portfolio), investment (specific assets), earning (Store revenue), compound (cumulative yield). Weekly/monthly check-ins instead of daily. Refactor when Store or DCA ships. Spec: `audric-roadmap.md` §1.4 |

**Critical path:** 5.1 unblocks nearly everything. 5.4 (Walrus + Seal) is independent. 5.9 triggers on first of DCA (3.3) or Store (5.1).

---

## One-time actions (not phase-gated)

| Task | Status | Notes |
|------|--------|-------|
| Move Audric repo to BSL 1.1 licence | not started | Change Date: April 2030 |
| Add Suno commercial licence ($12/mo) | not started | Required before Phase 5 |
| Allowance Move contract (allowance.move) | done | Fresh deploy — scoped allowance with `permitted_features`, `expires_at`, `daily_limit`. 23 Move tests + 24 SDK tests. Package `0xd775…968ad` on mainnet |
| **MPP digest replay protection** | done | DigestStore interface + InMemoryDigestStore in `@suimpp/mpp` v0.5.0 → v0.6.0 (removed deprecated registryUrl/serverUrl/digestTtlMs per Mysten feedback). UpstashDigestStore (Upstash Redis, 24h TTL, atomic SET NX) in gateway. logPayment now logs errors + passes sender. 6 new tests |
| Confirm MPP gateway margin (10–20%) | not started | Revenue validation |
| Allowance onboarding wizard (app/setup) | done | ✅ 4-step wizard live at audric.ai/setup. SDK 0.23.0 published with `buildCreateAllowanceTx`, `addDepositAllowanceTx`, `getAllowance`. Race condition + zero-balance UX fixed post-deploy |
| Terms of Service page | not started | **Merged into 1.5.** ToS page exists (`/terms`, 13 sections) — needs fee disclosure sections + `tosAcceptedAt` consent gate. See 1.5 spec |
| **audric.ai landing page** | not started | **Ship parallel to Phase 1 Week 2.** 9 sections: Hero + live demo → How it works → Products → Passport → Copilot → Store → Audric Pay → Stats → CTA. Wireframes + spec done in brand plan + `marketing/wireframes.html` |
| **t2000.ai white UI refresh** | not started | **Ship parallel to Phase 1 Week 2.** 7 sections: Hero → Three products → What you get → Five packages → Architecture → Gateway → Get started. Wireframes + spec done in brand plan + `marketing/wireframes.html` |
| **docs.t2000.ai** | not started | After landing pages. GitBook or Mintlify. Content from CLAUDE.md, ARCHITECTURE.md, audric-roadmap.md, audric-security-specs.md, package READMEs |
| **Stats API for landing pages** | done | ✅ GET /api/stats (public, 60s cache). Aggregates: totalUsers, totalSessions, totalTurns, totalTokens, totalCostUsd, avgCostPerSession, cacheSavingsPercent, totalTransactions, topTools. Piggybacks on SessionUsage table from CostTracker |
| **Brand naming locked** | done | Audric Passport (identity), Audric Store / "the agent store" (marketplace). Dual-naming for payment: "Audric Pay" on consumer surfaces (audric.ai), "Gateway" on t2000.ai, "suimpp" for open protocol (suimpp.dev), `@suimpp/mpp` npm package. "Audric Wallet" and "Sui Pay" not used. See `marketing/landing-page-spec.md` |

---

## Dependency graph

```
Pre-work: 0.1  0.2  0.3 ──→ 0.4  0.5  0.6  0.7  0.8  0.9  0.10  [swap chip]  [dust v2]  [flooring]
                  │                      │
                  ▼                      ▼
Phase 1 Week 1:   allowance.move ✅ ── Spec 2 ✅ ──────────┐
(no allowance)    1.1 ✅ ──→ 1.2 ✅ (free HF alerts)     │
                  1.6 ✅ (activity feed)                   │
                  CostTracker ✅ + Stats API ✅             │
                                                           ▼
Phase 1 Week 2:   onboarding wizard ✅ ──→ 1.3 ✅ (paid briefing) → 1.3.1 ✅
(needs allowance)                         session charge ($0.01)
                  1.4 (savings goals) → 1.4.1 (feedback data layer)
                  1.5 (new user $0.25 — validates feedback pipeline)
                  ToS page
                                                           ║
                  ═══ PARALLEL TRACK ═══                   ║
                  audric.ai landing page                   ║
                  t2000.ai white UI refresh                ║
                                                           ║
                   │                                       ║
                   ▼                                       ║
Phase 2:  2.1 ──→ 2.2    2.4                              ║
           │       (skip 2.3 AlchemyPay, skip 2.5 mini-store)
           ▼
Phase 3:  3.1  3.2  3.3 → 3.3.1 (feedback processing)  3.4  3.6
                          (skip 3.5 gifting)
                                          Phase 4: 4.1 → 4.2
           │                                │
           ▼                                ▼
Phase 5:  5.1 ──→ 5.2, 5.3, 5.5–5.8      5.4
          ═══ THE KILLER FEATURE ═══
```

---

*Last updated: April 9 2026. Revised plan: skip 2.3 (AlchemyPay), 2.5 (mini-storefront), 3.5 (gifting) — ~7 days saved. Landing pages moved parallel to Phase 1 Week 2 (specs + wireframes done). 3.2 reduced to 1d (settings UI already built). Store (Phase 5) is the destination — all preceding phases build the banking infra it needs.*
*Source of truth for specs: `audric-roadmap.md`, `audric-feedback-loop-spec.md`*
