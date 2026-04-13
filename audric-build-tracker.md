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
| — | Cursor rules | ~1h | done | — | both | `.cursor/rules/savings-usdc-only.mdc`, `.cursor/rules/financial-amounts.mdc` |

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
| 1.1 | Notification infrastructure | 3d | done | 0.3, 0.4 | both | ✅ ECS cron (hourly EventBridge → Fargate), Resend emails, SDK `getFinancialSummary()`, real-time HF hook in indexer, audric internal API (notification-users, notification-log, hf-alert), NotificationPrefs + NotificationLog tables, settings UI toggles, `AUDRIC_INTERNAL_KEY` in Vercel |
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
| — | Grace period for empty allowance | 1d | done | session charge | both | ✅ **Shipped in Audric 2.0 Phase A (A.5).** 5 free sessions, `GracePeriodBanner`, 402 limit enforcement |

**Week 2 total: ~12 days effort.** All tasks complete. Onboarding wizard ✅, 1.3 + 1.3.1 ✅, 1.4 + 1.4.1 ✅, 1.5 ✅, session charge ✅. Grace period deferred (triggered by first prod insufficient balance).

**Critical path:** allowance.move ✅, Spec 2 (session auth) ✅, digest replay protection ✅, 1.1 ✅ + 1.2 ✅ (Week 1 infra complete), onboarding wizard ✅ (paid features unblocked), 1.6 activity feed ✅, CostTracker ✅, 1.3 morning briefing ✅ + 1.3.1 deep links ✅, 1.5 onboarding + ToS ✅, 1.4 savings goals ✅, 1.4.1 feedback loop ✅, session charge ✅. **Phase 1 complete.** Next: Phase 2 (Receive + payments) + landing pages (parallel).

---

## Phase 2 — Receive + payments (Weeks 3–5) — ✅ COMPLETE

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 2.1 | Payment links + QR codes (all 5 page states) | 4d | done | 1.1 | audric | ✅ PaymentLink Prisma model, CRUD API (`/api/payment-links`, `/api/payment-links/[slug]`), `/pay/[slug]` page (5 states: active/paid/expired/cancelled/not_found), QR code (client-side), `generateSlug` utility. Auth guards + state validation on PATCH. |
| 2.2 | Invoices | 3d | done | 2.1 | audric | ✅ Invoice Prisma model, CRUD API (`/api/invoices`, `/api/invoices/[slug]`), `/invoice/[slug]` page (6 states), line items, overdue detection. |
| ~~2.3~~ | ~~AlchemyPay fiat on/off-ramp~~ | — | skipped | — | — | Deferred post-Store. Not on the critical path. Can add later as a config change |
| 2.4 | Send UX improvements (memo) | 1d | done | — | both | ✅ `memo` param added to `send_transfer` engine tool + SDK `send()`. Shown in TransactionReceiptCard. PermissionCard displays memo in confirmation. |
| ~~2.5~~ | ~~Mini-storefront (sync products)~~ | — | skipped | — | — | Skipped — building the real storefront in Phase 5 avoids rebuilding twice |

| RC-0 | Shared card primitives (`CardShell`, `MiniBar`, `Gauge`, `TrendIndicator`, `MonoLabel`) | 0.5d | done | — | audric | ✅ `components/engine/cards/primitives.tsx`. Gauge has `colorMode` prop (`health_factor` / `usage`). Also: `SuiscanLink`, format utils (`fmtUsd`, `fmtPct`, `fmtAmt`, `fmtRelativeTime`). |
| RC-1 | `HealthCard` — gauge bar, status badge, supplied/borrowed/maxBorrow | 0.5d | done | RC-0 | audric | ✅ HF gauge colour-coded, breakpoints aligned with engine (`<1.2` critical, `<1.5` danger, `<2.0` warning). |
| RC-2 | `TransactionHistoryCard` — date-grouped list, action icons, Suiscan links | 0.5d | done | RC-0 | audric | ✅ Date-grouped, action icons, Suiscan deep links. |
| RC-3 | `SwapQuoteCard` — rate, impact warning, route | 0.25d | done | RC-0 | audric | ✅ Rate display, impact amber >1% / red >3%, divide-by-zero guard. |
| RC-9 | Enhanced `TransactionReceiptCard` — per-tool hero lines, service-specific rendering | 0.5d | done | RC-0 | audric | ✅ `getHeroLines()` dispatches per write tool. Displays memo if present. |
| RC-reg | Register all new cards in `CARD_RENDERERS` | 0.25d | done | RC-1, RC-2, RC-3 | audric | ✅ `ToolResultCard.tsx` refactored to thin registry. All cards wired. |
| AC-1 | `allowance_status` engine tool + `AllowanceCard` | 0.5d | done | RC-0 | both | ✅ Read tool (auto). `try/catch` around fetch. `AllowanceCard` uses `colorMode="usage"` on Gauge. |
| PL-1 | `create_payment_link`, `list_payment_links` engine tools + `PaymentLinkCard` | 0.5d | done | 2.1 | both | ✅ Engine tools call internal Audric API. `PaymentLinkCard` renders created/list views with slug display + copy feedback. |
| PL-2 | `cancel_payment_link` engine tool + PATCH `/api/internal/payment-links` | 0.25d | done | PL-1 | both | ✅ Confirmation-first cancellation flow enforced in system prompt. |
| PL-3 | On-chain payment detection for payment links | 0.5d | done | 2.1 | audric | ✅ `POST /api/payment-links/[slug]/verify` queries Sui RPC for USDC transfers. Client-side polling every 8s with "Checking for payment..." indicator. |
| INV-1 | `create_invoice`, `list_invoices` engine tools + `InvoiceCard` | 0.5d | done | 2.2 | both | ✅ Engine tools call internal Audric API. `InvoiceCard` renders created/list views with slug + memo display. |
| INV-2 | `cancel_invoice` engine tool + PATCH `/api/internal/invoices` | 0.25d | done | INV-1 | both | ✅ Confirmation-first, ambiguity-safe cancellation enforced in system prompt. |
| INV-3 | On-chain payment detection for invoices | 0.5d | done | 2.2 | audric | ✅ `POST /api/invoices/[slug]/verify` queries Sui RPC for USDC transfers. Client-side polling every 8s with "Checking for payment..." indicator. |

**Critical path:** 2.1 → 2.2. 2.4 is independent. RC-0 unblocks all cards. Engine read tools: 26 total. **Phase 2 complete ✅**

---

## Phase 2.5 — Engine foundation (parallel with Phase 2)

> Refactoring work that prepares the engine for the Reasoning Engine + Intelligence Layer. Zero feature risk — these are internal structural changes. Can be done in parallel with Phase 2. **Must complete before Phase 3.5.**

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 2.5.1 | Extract `engine-context.ts` — create file, move `buildAdviceContext` from `engine-factory.ts`, export it | 0.5d | done | — | audric | ✅ `lib/engine/engine-context.ts` created. `buildAdviceContext` moved + exported. Shared types (`WalletBalanceSummary`, `Contact`, `GoalSummary`) extracted. Stubs for all Phase 3.5 functions (F1–F5 + `buildFullDynamicContext`) scaffolded with TODOs. |
| 2.5.2 | Restructure `buildSystemPrompt` — split static (cacheable) vs dynamic (per-session) blocks | 1d | done | 2.5.1 | audric | ✅ `STATIC_SYSTEM_PROMPT` (constant, no interpolation, cache-ready for RE-1.3) + `buildDynamicBlock()` (wallet, balances, write tools, contacts, goals, advice) both in `engine-context.ts`. `buildSystemPrompt()` in `engine-factory.ts` is now a 3-line wrapper. Zero behaviour change. |
| 2.5.3 | `maxTokens: 2048 → 8192` (configurable) | 0.5h | done | — | audric | ✅ `engine-factory.ts` authenticated engine: 2048 → 8192. Unauth engine stays at 1536. |
| 2.5.4 | `toolChoice: 'any' → 'auto'` with thinking guard | 0.5h | done | — | audric | ✅ `engine-factory.ts` authenticated engine: `'any'` → `'auto'`. Full thinking guard wires in with RE-1.1. |
| 2.5.5 | Settings > Memory page scaffold + nav entry | 0.5d | done | — | audric | ✅ `memory` section added to `app/settings/page.tsx` sidebar nav. Shows: user-provided financial profile (if set via 2.5.6), agent-inferred profile placeholder (F1 stub — "Building profile…"), episodic memories empty state (F3 stub), disabled "Clear All Memory" button. Fetches `UserPreferences.limits.financialProfile` on section mount. |
| 2.5.6 | Optional onboarding profile prompt | 0.5d | done | 2.5.5 | audric | ✅ Step 4 inserted into `/setup` wizard (first-time setup only; topup flow unchanged). 3 radio options (conservative / balanced / growth) + optional notes textarea. Skip button prominent. Saves to `UserPreferences.limits.financialProfile` via new `POST /api/user/financial-profile` (merge-safe, preserves existing limits). Success moves to step 5. `ProgressBar` updated to 5-step total for non-topup flows. |

| RC-4 | `ServiceCatalogCard` — grouped by category, prices per request | 0.5d | done | RC-0 | audric | ✅ `ServiceCatalogCard.tsx` — categories collapsible, endpoint rows show service·name·price. Wired in `ToolResultCard.tsx` for `mpp_services`. **Production-tested ✅** |
| RC-5 | `SearchResultsCard` — title, URL, snippet, expandable | 0.25d | done | RC-0 | audric | ✅ `SearchResultsCard.tsx` — max 3 shown, "Show N more" expander, clickable titles, domain display. Wired for `web_search`. **Production-tested ✅** |
| AC-2 | `toggle_allowance` engine tool — pause/resume agent | 0.5d | done | AC-1 | both | ✅ Read tool (isReadOnly: true). PATCH `/api/allowance/[address]` with `{ action: 'toggle', enabled }`. Returns updated AllowanceCard. System prompt confirms before call. **Production-tested ✅** |
| AC-3 | `update_daily_limit` engine tool — change spending cap via chat | 0.25d | done | AC-1 | both | ✅ Read tool. PATCH with `{ action: 'setLimit', dailyLimitUsdc }`. Validates 0–10000 range. **Production-tested ✅** |
| AC-4 | `update_permissions` engine tool — enable/disable feature categories via chat | 0.25d | done | AC-1 | both | ✅ Read tool. PATCH with `{ action: 'setPermissions', permissions }`. Valid: savings, send, pay, credit, swap, stake. **Production-tested ✅** Post-release fixes: default permissions expanded to all 6, gauge 80% label removed, reset time formatted, duplicate card dedup in `ChatMessage.tsx`. |
| CA-0 | Canvas infrastructure — `canvas` EngineEvent type, `CanvasCard.tsx`, `CanvasModal.tsx`, wire into `ToolResultCard` registry | 1.5d | done | RC-0 | audric | ✅ `canvas` variant added to `EngineEvent` + `SSEEvent`. `CanvasCard.tsx` (inline, expandable to modal), `CanvasModal.tsx` (fullscreen, Escape closes), `CanvasTemplateRenderer.tsx` (switch registry), `onSendMessage` prop wired: `UnifiedTimeline → ChatMessage → CanvasCard`. `render_canvas` suppressed in `ToolResultCard` (no card rendered — canvas only). `render_canvas` icon/label added to `AgentStep`. |
| CA-1 | `render_canvas` engine tool — template enum, params schema, data fetcher, canvas event emission | 1d | done | CA-0 | both | ✅ `tools/canvas.ts`: 8 templates (3 live: yield_projector, health_simulator, dca_planner — seeded with live serverPositions; 5 stubs: activity_heatmap, portfolio_timeline, spending_breakdown, watch_address, full_portfolio). Engine emits `canvas` event after `tool_result` when `__canvas: true`. Exported from `@t2000/engine` index. Bump to `0.28.8`. |

**Estimated effort:** ~3 days (engine) + ~1.75 days (rich UX) + ~2.5 days (canvas infra). No external dependencies. Can be done during Phase 2 downtime.

**Completed so far:** All Phase 2.5 tasks ✅. Engine at `@t2000/engine@0.28.9`.
**Phase AC:** ✅ COMPLETE. All 8 canvas templates live (CA-0 through CA-8). FA-4 (portfolio snapshots) + FA-2 (spending analytics) built as prerequisites. `spending_analytics` + `render_canvas` engine tools. `WatchAddress` Prisma model + CRUD APIs. `PortfolioSnapshot` Prisma model + daily cron job.

---

## Phase 3 — Proactive agent + MPP discovery (Weeks 6–8)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 3.1 | Auto-compound rewards | 3d | done | 0.7 | both | ✅ SDK `compoundRewards()` (multi-step: claim→swap via Cetus→NAVI deposit, min $0.10 threshold). `getPendingRewards` exported from SDK. `runAutoCompound()` cron (detect rewards→charge allowance→store `compound_available` AppEvent). `auto_compound` notification pref + Settings toggle |
| 3.2 | USDC rate monitoring alerts | 1d | done | 1.1 | both | ✅ `runRateAlerts()` cron: fetch NAVI USDC rate via `getFinancialSummary()`, compare to stored `lastNotifiedRate`, email on ±1% change, 24h dedup. Rate state stored in `UserPreferences.limits` via `POST /api/internal/rate-alert-state`. Resend email template (rate up/down + idle USDC nudge + deep link). `AppEvent(type: rate_alert)` logged |
| 3.3 | Scheduled actions (DCA) + trust ladder UI | 5d | done | 1.1 | both | ✅ `ScheduledAction` Prisma model (trust ladder: 5 confirmations→autonomous). CRUD APIs + internal due endpoint. Engine tools: `create_schedule`/`list_schedules`/`cancel_schedule`. Cron: `runScheduledActions()` + `runScheduledReminders()`. Settings > Schedules section with trust progress bar |
| 3.3.1 | Feedback loop processing layer | 3d | done | 1.4.1, 3.3 | both | ✅ `OutcomeCheck` + `FollowUpQueue` Prisma models. `runOutcomeChecks()` (status machine + shouldAbandon). `detectAnomaliesJob()` (idle USDC, HF, goals). `deliverFollowUps()`. `canSendFollowUp()` (2/day non-urgent cap). 6 internal API routes. `follow_up` + `schedule` activity feed chips |
| 3.4 | MPP consumer discovery → conversational | 3d | done | — | audric | ✅ **Refactored:** removed `/discover` page (raw API catalog adds no user value). Capabilities surface naturally through conversation — the engine knows available services and suggests them contextually. Spend tracker moved to Settings > Safety alongside daily API budget. "What can you help me with?" contextual chip triggers agent explanation in chat. |
| 3.4.1 | MPP reputation layer (Spec 3) | 2d | done | 3.4 | t2000 | ✅ `ReputationCache` Prisma model + migration. `computeScore()` + `scoreToTier()` (new/trusted/established/premium: 10/60/300/1000 req/min). `getOrComputeReputation()` (1h cache). Next.js middleware rate limiting. `GET /api/reputation/[walletAddress]` |
| ~~3.5~~ | ~~Gifting reminders~~ | — | skipped | — | — | Deferred post-Store. Low priority |
| 3.6 | Credit UX improvements | 1d | done | — | audric | ✅ System prompt additions: HF explainer (plain-English liquidation buffer %), first-borrow liquidation education, borrow APR annualization rule, proactive idle USDC insight (FI-1), HF warning insight (FI-2) |
| FA-4 | Portfolio history snapshots — `PortfolioSnapshot` Prisma model, daily cron, internal route, `GET /api/analytics/portfolio-history` | 1.5d | done | — | both | ✅ Built as Phase AC prerequisite. `PortfolioSnapshot` Prisma model (userId, date, wallet/savings/debt/netWorth/yield/HF/allocations). Cron job `runPortfolioSnapshots()` in `t2000/apps/server/src/cron/jobs/`. `POST /api/internal/portfolio-snapshot` fetches NAVI positions + Sui balances for all active users. `GET /api/analytics/portfolio-history?userId=&days=` with period change calculation. |
| FA-2 | Spending analytics — `GET /api/analytics/spending`, `spending_analytics` engine tool, `SpendingCard` | 1d | done | RC-0 | both | ✅ Built as Phase AC prerequisite. `GET /api/analytics/spending?address=&period=` aggregates `ServicePurchase` + `AppEvent(type:pay)` by service/category. `spending_analytics` engine tool in `@t2000/engine`. Categories: AI Images, Audio, Mail, Search, Utilities, Video, Other. SpendingCard deferred (canvas handles visualization via SpendingBreakdownCanvas). |
| FA-3 | Yield summary — `yield_summary` engine tool, `YieldEarningsCard` with sparkline | 1d | done | RC-0, FA-4 | both | ✅ `yield_summary` engine tool (auto). `GET /api/analytics/yield-summary` (auth via x-sui-address). `YieldEarningsCard` with SVG sparkline, period breakdown, APY + projections. Monthly sparkline from `PortfolioSnapshot.yieldEarnedUsd` |
| FA-5 | Activity summary — `GET /api/analytics/activity-summary`, `activity_summary` engine tool, `ActivitySummaryCard` | 1d | done | RC-0 | both | ✅ `activity_summary` engine tool (auto). `GET /api/analytics/activity-summary` aggregates `AppEvent` by action type. `ActivitySummaryCard` with `MiniBar`, action breakdown, totals. Normalizes 9 action types |
| FA-1 | Enhanced `PortfolioCard` — week-over-week change, allocation bar, inline APY + HF | 0.5d | done | RC-0, FA-4 | audric | ✅ `PortfolioCard` enhanced: `TrendIndicator` for week change, `MiniBar` allocation bar, inline savings APY + daily earning, HF `Gauge` + `StatusBadge`. `portfolio_analysis` tool now fetches `weekChange` from portfolio-history API |
| FI-1 | Idle USDC insight card — proactive alert when USDC sitting in wallet | 0.25d | done | RC-0 | audric | ✅ Prompt-driven in `STATIC_SYSTEM_PROMPT`. Triggers when balance_check shows idle USDC > $5 and APY > 3%. CTA: "Save it" |
| FI-2 | HF warning insight card — alert when health factor < 2.0 | 0.25d | done | RC-0 | audric | ✅ Prompt-driven in `STATIC_SYSTEM_PROMPT`. Triggers when health_check shows HF < 2.0. Escalates to warning at HF < 1.5 |
| FI-3 | Weekly summary briefing variant — new `BriefingCard` template with net worth change, yield, tx count | 0.5d | done | FA-4 | both | ✅ `runWeeklyBriefing()` cron (Sundays UTC 13:00). `GET /api/analytics/weekly-summary` aggregates snapshots + events + purchases. Resend email template. Allowance charge ($0.005 via ALLOWANCE_FEATURES.BRIEFING). Stored as `DailyBriefing` with `weekly-` date prefix |

**Critical path:** 3.3 → 3.3.1 is the longest chain. 3.2 reduced to 1d (UI done). 3.4 primes users for Store. FA-4 (portfolio snapshots) unblocks FA-1, FA-3, FI-3. 3 days saved by skipping 3.5.
**Phase 3 testing (v0.31.0):** All unit tests pass — SDK (372), engine (197), audric web (273). Reputation scorer verified: new=0pts, active=666pts (established), power=898pts (premium), failure penalty applied correctly, tier thresholds descending. Engine schedule tools: correct permissions (list=auto, create/cancel=confirm), bad schedule throws helpful error, missing env returns "not available". Live endpoints: `/api/scheduled-actions` returns 401 without JWT, all internal routes return 401 without key, `/api/reputation/invalid` returns 400. cron-parser v5 migration verified (CronExpressionParser.parse + tz:'UTC'). CI: npm publish pipeline operational, all 4 packages aligned at 0.31.0. `/discover` page removed — capabilities surface conversationally, spend tracker in Settings > Safety. **Phase 3 production-tested ✅**

---

## Phase AC — Audric Canvas (parallel with Phase 3)

> Interactive on-chain financial intelligence. Users generate visualizations and strategy simulators through natural language — the crypto-native equivalent of Perplexity Computer. No account linking required; the wallet IS the data. Visualize → act in the same conversation.
>
> **Canvas plan spec:** `.cursor/plans/audric_canvas_feature_cfe76b5b.plan.md`
>
> **Parallel track:** CA-0 + CA-1 ship in Phase 2.5 (no deps). CA-2/CA-4/CA-6 start immediately after. CA-3/CA-5 gate on FA-4/FA-2. CA-7 (the "Perplexity moment") is the capstone once all data templates are ready.

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| CA-2 | Activity Heatmap — `GET /api/analytics/activity-heatmap` + `ActivityHeatmapCanvas.tsx` (GitHub-style grid, hover tooltip, click-to-chat) | 2d | done | CA-0, CA-1 | audric | ✅ API endpoint aggregates AppEvent + chain txns into daily buckets. Canvas: 53-week GitHub-style grid, intensity-coded cells, hover tooltips, click-to-chat ("Show me what happened on…"). Engine: removed from PHASE_3_TEMPLATES, emits `available: true` with wallet address. |
| CA-4 | Strategy simulators — `YieldProjectorCanvas`, `HealthSimulatorCanvas`, `DCAPlanner` — interactive sliders, no API needed | 1.5d | done | CA-0 | audric | ✅ All three shipped in CA-1. Client-side compound yield simulator, health factor simulator with scenario analysis, DCA planner with savings curve. All seeded with live position data. |
| CA-6 | Multi-wallet watch list — `WatchAddress` Prisma model, CRUD APIs, `render_canvas(watch_address)`, `WatchAddressCanvas` template | 2d | done | CA-1 | both | ✅ `WatchAddress` Prisma model (max 10 per user), CRUD API (`POST/GET/DELETE /api/user/watch-addresses`). `WatchAddressCanvas` fetches balances from `/api/balances`. Engine `watch_address` handler validates address, emits `available: true`. Action buttons: Activity → and Send →. |
| CA-3 | Portfolio Timeline canvas — `PortfolioTimelineCanvas.tsx`, stacked line chart (wallet/savings/debt) | 1d | done | CA-0, FA-4 | audric | ✅ Multi-line SVG chart (wallet/savings/debt), 4 period tabs (7D/30D/90D/1Y), net worth header with change %, breakdown table. Fetches from `GET /api/analytics/portfolio-history`. Graceful empty state until snapshots accumulate. |
| CA-5 | Spending Breakdown canvas — `SpendingBreakdownCanvas.tsx`, donut chart + time period tabs | 0.5d | done | CA-0, FA-2 | audric | ✅ SVG donut chart with category segments, 4 period tabs (Week/Month/Year/All), color-coded legend, service breakdown list, avg cost per request. Fetches from `GET /api/analytics/spending`. |
| CA-7 | Full Portfolio canvas — `FullPortfolioCanvas.tsx`, 4-panel multi-view (savings+yield, health, activity, spending), miniaturized panels that expand | 2d | done | CA-2, CA-3, CA-5 | audric | ✅ The "Perplexity moment". 4-panel grid: Savings (APY), Health (HF + debt), Activity (30d count), Spending (total + requests). Each panel clickable → opens dedicated canvas. Net worth header, quick breakdown, Full Report action. Fetches heatmap + spending APIs in parallel. |
| CA-8 | Contextual canvas suggestions — Charts chip in ChipBar, canvas follow-ups in suggested-actions, contextual chips for yield/health | 0.5d | done | 2.5.2, CA-1 | audric | ✅ "Charts" chip added to ChipBar (sends "Show me my activity heatmap and a yield projector"). `render_canvas` follow-ups in suggested-actions. Canvas contextual chips (yield-chart, health-sim) with priority 30/27. Post-agent `render_canvas` suggestion in contextual-chips. |

**Critical path:** CA-0 → CA-1 → CA-2 + CA-4 + CA-6 (parallel) → FA-4 + FA-2 (analytics prereqs) → CA-3 + CA-5 → CA-7 (capstone) + CA-8 (suggestions). **All complete.**
**Actual effort:** ~9 days. All 8 canvas templates live. FA-4 (portfolio snapshots) + FA-2 (spending analytics) built as prerequisites. `spending_analytics` engine tool added.
**Post-deploy review fixes (v0.29.0):** normalizeSavingsRate helper (consistent 4.5% fallback), FullPortfolio wallet fetched from /api/balances (was $0), auth added to watch-addresses + portfolio-history (x-sui-address header), spending dedup (ServicePurchase takes priority), portfolio-history try/catch, address validation ≥40 chars. Heatmap auto-scrolls to rightmost (recent) cells. Canvas chip priority lowered to 15/14 to avoid bumping status chips. **All 8 canvases production-tested ✅.**

---

## Phase 3.5 — Intelligence Layer (after 3.3.1, ~3 weeks)

> Reasoning Engine + Intelligence features ship here. Depends on Phase 2.5 (engine foundation) being complete and Phase 3 features (DCA, auto-compound, feedback processing) being stable. The full tool set must be built before wrapping intelligence around it.
>
> **Specs:** `spec/REASONING_ENGINE.md`, `spec/archive/audric-intelligence-spec.md` (archived)

### RE Phase 1: Extended Thinking + Intelligence F2, F4, F5

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| RE-1.1 | Wire adaptive thinking to `AnthropicProvider` — `thinking: { type: 'adaptive' }` + `output_config: { effort }` as separate top-level fields | 1d | done | 2.5.3, 2.5.4 | t2000 | ✅ `ThinkingConfig` (disabled/adaptive/enabled), `OutputConfig` (effort), `ContentBlock` +thinking/redacted_thinking. Provider: `thinking_delta`/`signature_delta`/`redacted_thinking` stream events, auto-omit temperature, thinking blocks preserved in `assistantBlocks`. Engine: `thinking`/`outputConfig` on `EngineConfig`/`ChatParams`, force `toolChoice: 'auto'` when thinking enabled. SSE: `thinking_delta`/`thinking_done` events |
| RE-1.2 | Complexity classifier — `classifyEffort()` routes `low`/`medium`/`high`/`max` per turn | 0.5d | done | RE-1.1 | t2000 | ✅ `classify-effort.ts`: heuristic routing based on model, message content, matched recipe, session write count. `max` only on Opus 4.6. Exported from `@t2000/engine` |
| RE-1.3 | Prompt caching — split static/dynamic system prompt, add `cache_control` breakpoints | 1d | done | 2.5.2 | both | ✅ Engine: `SystemBlock` type + `SystemPrompt = string | SystemBlock[]` (backward compat). `buildCachedSystemPrompt()` helper. `toAnthropicSystem()` in provider. Audric: `engine-factory.ts` uses `buildCachedSystemPrompt([STATIC_SYSTEM_PROMPT], dynamicBlock)` when `ENABLE_THINKING=true`, plain string concat otherwise |
| RE-1.4 | Thinking display — `ReasoningAccordion` UI component, `thinking_delta` event streaming | 1d | done | RE-1.1 | audric | ✅ `ReasoningAccordion` component (collapsible, monospace, "How I evaluated this"). `useEngine.ts`: handles `thinking_delta`/`thinking_done` SSE events, accumulates `thinking` on message. `ChatMessage.tsx`: shows `ThinkingState` during reasoning, `ReasoningAccordion` after. `engine-types.ts`: `thinking`/`isThinking` fields. Session reconstruction: extracts thinking from stored blocks |
| F2 | Proactive Awareness — `buildProactivenessInstructions()` in dynamic block | 0.5d | done | 2.5.1 | both | ✅ Engine: `intelligence.ts` pure function. Audric: wired into `buildFullDynamicContext()` in `engine-context.ts`, injected into every session's dynamic block |
| F4 | Conversation State Machine — types, Redis manager, context injection, transitions in chat + resume + hf-alert routes | 2d | done | 2.5.1 | both | ✅ Engine: `ConversationState` (6 states), `ConversationStateStore` interface, `buildStateContext()`. Audric: `UpstashConversationStateStore` (Redis), `getConversationState`/`setConversationState` helpers, chat route reads state + transitions (awaiting_confirmation/post_error/idle), resume route resets to idle, state context injected via `buildFullDynamicContext()` |
| F5 | Post-Action Self-Evaluation — `buildSelfEvaluationInstruction()` in dynamic block | 0.5d | done | 2.5.1 | both | ✅ Engine: `intelligence.ts` 4-point checklist. Audric: wired into `buildFullDynamicContext()` in `engine-context.ts`, injected into every session's dynamic block |

**Estimated effort:** 3–4 days (RE) + 3 days (F2+F4+F5) = ~6–7 days
**RE Phase 1 complete (both repos).** Engine: RE-1.1 ✅, RE-1.2 ✅, RE-1.3 ✅, F2 ✅, F4 ✅, F5 ✅. 197/197 tests pass, typecheck clean. Audric: RE-1.3 wiring ✅, RE-1.4 UI ✅, F2 wiring ✅, F4 full wiring ✅ (Upstash store + state transitions), F5 wiring ✅, unified context assembly ✅. **Feature-flagged behind `ENABLE_THINKING=true`.**

### RE Phase 2: Step Guards + Intelligence F1

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| RE-2.1 | Tool flags — `ToolFlags` type, tag all ~30 tools with `mutating`, `requiresBalance`, `costAware`, etc. | 1d | done | RE-1.1 | t2000 | ✅ `ToolFlags` interface on `Tool` (7 flags: mutating, requiresBalance, affectsHealth, irreversible, producesArtifact, costAware, maxRetries). `TOOL_FLAGS` central registry in `tool-flags.ts`. `applyToolFlags()` + `getToolFlags()`. All write tools tagged inline via `buildTool({ flags })` |
| RE-2.2 | Guard runner — priority tiers (Safety > Financial > UX), `GuardEvent` type | 2d | done | RE-2.1 | t2000 | ✅ `guards.ts`: 7 pre-execution guards (retry, irreversibility, balance, health factor, large transfer, slippage, cost) + 2 post-execution (artifact preview, stale data). `BalanceTracker` + `RetryTracker`. `runGuards()` with tiered priority. `GuardConfig` (10 gates). Integrated into `QueryEngine.agentLoop`. `PendingAction.guardInjections` for UI warnings |
| RE-2.3 | Preflight validation — `preflight()` on tools with `Input Validation Gate` | 1d | done | RE-2.1 | t2000 | ✅ `PreflightResult` type + `preflight` on `Tool`. Guard runner calls preflight first (Tier 0). Added to: `send_transfer` (Sui address), `swap_execute` (from≠to), `pay_api` (MPP URL + JSON + Lob country), `borrow` (USDC only), `save_deposit` (USDC only) |
| F1 | User Financial Profile — engine types + `buildProfileContext()` | 0.5d | done | RE-2.2 | t2000 | ✅ `UserFinancialProfile` updated (riskAppetite, financialLiteracy, currencyFraming, primaryGoals, knownPatterns, confidence scores). `buildProfileContext()` pure function with confidence gating. Exported from `@t2000/engine` |
| F1-audric | User Financial Profile — Prisma migration, internal route, cron job, audric wiring | 1.5d | done | F1 | both | ✅ `UserFinancialProfile` Prisma model, `/api/internal/profile-inference` (Claude inference), `runProfileInference()` cron, wired into `engine-factory.ts` |

**Estimated effort:** 4–5 days (RE) + 2 days (F1) = ~6–7 days
**RE Phase 2 complete (both repos).** Published `@t2000/engine@0.32.0`. Engine: RE-2.1 ✅, RE-2.2 ✅, RE-2.3 ✅, F1 engine types ✅. Audric: `DEFAULT_GUARD_CONFIG` wired to `createEngine()`, `applyToolFlags()` on all tools, `guardInjections` displayed on `PermissionCard`, `buildProfileContext()` wired into `buildFullDynamicContext()`. Typecheck clean. F1-audric ✅ (Prisma migration + cron + inference route shipped with Phase 3.5).

### RE Phase 3: Skill Recipes + Intelligence F3

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| RE-3.1 | Recipe format — YAML loader, `Recipe` + `RecipeStep` types, trigger matching (longest match wins) | 1.5d | done | RE-2.2 | t2000 | ✅ `RecipeStep`/`Recipe` types, Zod loader, `RecipeRegistry` (longest-trigger-match-wins), `toPromptContext()`, engine integration. 7 YAML recipes in `t2000-skills/recipes/` |
| RE-3.2 | Financial recipes — `swap-and-save.yaml`, `safe-borrow.yaml`, `send-to-contact.yaml`, `portfolio-rebalance.yaml`, `emergency-withdraw.yaml` | 1d | done | RE-3.1 | t2000 | ✅ All 7 recipes with `on_error` branches, gate prompts, step requirements. Embedded in Audric via `getRecipeRegistry()` |
| RE-3.3 | Context compaction — summarise old turns at 85% context capacity | 1d | done | RE-1.1 | t2000 | ✅ `ContextBudget` class (200k limit, 85% compact, 70% warn), async `compactMessages()` with LLM summarizer + truncation fallback, wired into `agentLoop` |
| F3 | Episodic Memory — Prisma migration, internal route, cron job, `buildMemoryContext()`, Settings > Memory page | 2.5d | done | 2.5.5, RE-3.1 | both | ✅ `UserMemory` Prisma model, `/api/internal/memory-extraction` (Claude extraction, Jaccard dedup, 50-memory cap), `runMemoryExtraction()` cron, `buildMemoryContext()` (8 memories + age), Settings page live memory management |
| — | Unified context assembly — `buildFullDynamicContext()`, wire to chat route | 0.5d | done | F2, F4, F5 | audric | ✅ `buildFullDynamicContext()` in `engine-context.ts`: composes `buildDynamicBlock` + `buildStateContext` (F4) + `buildProactivenessInstructions` (F2) + `buildSelfEvaluationInstruction` (F5). Engine factory calls it instead of `buildDynamicBlock` directly. F1/F3 slots ready for future phases |
| RC-6 | `StakingCard` — APY, exchange rate, total staked | 0.25d | done | RC-0 | audric | ✅ Hero APY, exchange rate, total staked/vSUI. Registered for `volo_stats` |
| RC-7 | `ProtocolCard` — safety score bar, TVL, risk factors | 0.5d | done | RC-0 | audric | ✅ Safety score bar, TVL, trend indicators, fees/revenue, risk factors, audit count. Registered for `protocol_deep_dive` |
| RC-8 | `PriceCard` — token list with trend indicators | 0.25d | done | RC-0 | audric | ✅ Token price list + single-token price change hero. Registered for `defillama_token_prices` + `defillama_price_change` |

**Estimated effort:** 3–4 days (RE) + 3 days (F3 + unified) + 1 day (remaining cards) = ~7–8 days
**RE Phase 3 complete (both repos).** Published `@t2000/engine@0.33.0` + `0.33.1`. Recipes: 7 YAML with `on_error` branches + `RecipeRegistry` (longest-trigger-match-wins). Context compaction: `ContextBudget` (200k limit, 85% compact) + LLM summarizer fallback. F3 episodic memory: `UserMemory` Prisma model + Claude extraction + Jaccard dedup + 50-memory cap + Settings UI. F1-audric: `UserFinancialProfile` Prisma model + inference cron. RC-6/7/8 all registered. **Production-tested ✅**

**Post-deploy fixes (Phase 3.5 stabilization):**
- `send_transfer` burn address preflight validation (zero address `0x000…` now blocked)
- `SavingsCard` renders when earnings exist but positions below $0.01 dust threshold
- Prisma migration for `UserFinancialProfile` + `UserMemory` tables (was missing in prod → `P2021` error on settings page)
- Portfolio timeline: replaced SELF_URL HTTP calls (fail silently on Vercel serverless) with direct `getClient()`/`getRegistry()` calls
- Yield summary: live positions + APY from registry when snapshot data is zero
- **Unified Financial Data Layer** — `lib/portfolio-data.ts` + `lib/activity-data.ts`:
  - Single `getClient()` / `getRegistry()` singletons (was 5+ independent instances)
  - `fetchWalletBalances()`, `fetchPositions()`, `fetchPortfolio()` — throw on error, callers decide
  - `fetchActivityBuckets()`, `fetchActivitySummary()` — merges AppEvent + on-chain txs
  - 15 consumer files refactored to use shared modules
  - Aligned time windows (chain and app use same `since: Date`)
  - Normalized API auth to `x-sui-address` header across all analytics routes
  - Allocations precision: rounded consistently (no raw vs display mismatch)
  - `fmtYield()` simplified to single-arg (checks formatted output for sub-cent display)

**Phase 3.5 total: ~19–22 days across 3 sub-phases (includes 1d for low-priority rich cards). Ships alongside the full feature set from Phases 2–3.**

---

## Phase 4 — Async job queue — ⏸️ DEFERRED

> **Deferred in favour of Audric 2.0.** The async job queue and creator marketplace are deprioritised until Audric 2.0 Phases A–E ship. Resume when user volume justifies async content generation (500+ active users). Original spec preserved in `audric-roadmap.md`.

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 4.1 | Infrastructure (SQS + ECS worker) | 4d | deferred | — | t2000 | — |
| 4.2 | Async services (ElevenLabs, Suno, Runway, Heygen) | 2d each | deferred | 4.1 | both | — |

---

## Phase 5 — Creator marketplace — ⏸️ DEFERRED

> **Deferred in favour of Audric 2.0.** Resume at 500+ active users. See Phase 4 note.

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 5.1–5.9 | All tasks | — | deferred | — | both | — |

---

## Audric 2.0 — Autonomous Financial Agent

> **Spec:** `AUDRIC_2_SPEC.md`. Makes Audric proactive, autonomous, and memory-native. 7 initiatives across 7 phases (~28 days total).

### Phase A: Quick wins (Week 1-2, ~3.5 days) — ✅ COMPLETE

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| A.1 | Session pre-fetch (synthetic tool results) | 0.5d | done | — | audric | ✅ `buildSyntheticPrefetch()`: injects balance_check + savings_info as synthetic tool_result messages at turn 0. System prompt references prefetched data. Existing sessions load their own history unchanged |
| A.2 | Extended thinking on by default | 0.5d | done | — | both | ✅ Removed `ENABLE_THINKING` env flag. Thinking always on for Sonnet/Opus (adaptive mode). `buildCachedSystemPrompt` always used |
| A.3 | Model routing: Haiku for low effort | 0.5d | done | — | both | ✅ `classifyEffort` → `low` routes to `claude-haiku-4-5`. Thinking disabled for Haiku (`.includes('haiku')` guard). Unauth demo engine also uses Haiku. `MODEL_OVERRIDE` env respected as override |
| A.4 | Live stats on audric.ai | 0.5d | done | Stats API ✅ | audric | ✅ Stats strip: Users, On-chain txs, Tool calls, Tokens processed. All dynamic from DB. Added `totalToolExecutions` to `/api/stats` |
| A.5 | Grace period UX for empty allowance | 1d | done | session charge | both | ✅ Removed hard redirect to `/setup`. 5 free sessions tracked via SessionUsage count. `GracePeriodBanner` with amber urgent state. 402 response when limit exceeded. `useUserStatus` exposes `sessionsUsed` |
| A.6 | Session URL routing | 0.5d | done | — | audric | ✅ `app/chat/[sessionId]/page.tsx` for bookmarks/deep links. URL syncs via `window.history.replaceState` when sessionId changes. "New Conversation" resets to `/new`. Settings session load auto-updates URL |

### Phase B: Harness upgrades (Week 2-4, ~8.5 days) — ✅ COMPLETE

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| B.3 | Microcompact tier | 0.5d | done | — | t2000 | ✅ `compact/microcompact.ts`: dedup identical tool calls (same name+input) with back-reference. Integrated into `compactMessages` (Phase -1) + `agentLoop` (every turn). 8 tests |
| B.2 | Tool result budgeting | 1.5d | done | — | t2000 | ✅ `budgetToolResult` in `orchestration.ts`: truncate with re-call hint. Limits: `transaction_history` 8k, `defillama_yield_pools` 6k, `mpp_services` 5k, `defillama_protocol_info` 4k, `web_search` 8k. Custom `summarizeOnTruncate` support. 6 tests |
| B.4 | Granular permission rules (USD-aware) | 1d | done | — | both | ✅ `permission-rules.ts`: `resolvePermissionTier` + `resolveUsdValue` + `toolNameToOperation`. 3 presets (conservative/balanced/aggressive). Engine permission gate uses USD resolution when `priceCache` + `permissionConfig` available. 19 tests |
| B.1 | Streaming tool execution | 5d | done | — | both | ✅ `EarlyToolDispatcher` class: dispatches `isReadOnly && isConcurrencySafe` tools mid-stream via `tryDispatch`. Results collected in dispatch order via `collectResults()` async generator. `abort()` for cancellation. Integrated into `agentLoop` + `handleProviderEvent`. 10 tests |

### Phase C: Chain-native memory (Week 4-6, ~3 days)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| C.1 | AppEvent + PortfolioSnapshot classifiers | 2d | not started | — | audric | Derive facts from on-chain data |
| C.2 | Memory pipeline cron | 1d | not started | C.1 | audric | Nightly classification job |

### Phase D: Autonomous action loop (Week 6-9, ~8 days)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| D.1 | Behavioral pattern detector | 2d | not started | C.1 | audric | Confidence-gated proposals |
| D.2 | Trust ladder (Stage 0-3) | 1d | not started | — | audric | User consent progression |
| D.3 | Trigger execution cron | 2d | not started | D.1, D.2 | audric | Server-side signing (allowance delegation) |
| D.4 | Notifications (Resend email) | 1d | not started | D.3 | audric | Templates + deep links |
| D.5 | Safety: idempotency + circuit breaker | 1d | not started | D.3 | audric | ScheduledExecution table |
| D.6 | Trust UI + explainability | 1d | not started | D.2 | audric | Settings page + "why" affordance |

### Phase E: Public wallet intelligence (Week 9-10, ~3 days)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| E.1 | Report generator + Sui adapter | 2d | not started | — | audric | `audric.ai/report/[address]` |
| E.2 | Report UI + sharing | 1d | not started | E.1 | audric | Public acquisition funnel |

### Phase F: Self-hosting roadmap (Week 10-11, ~1.5 days)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| F.1 | Model routing validation (Haiku) | 0.5d | not started | A.3 | both | Verify Haiku tool handling |
| F.2 | Fine-tune exploration + benchmarks | 1d | not started | — | — | Evaluate open models |

### Phase G: gRPC migration (Week 11-12, ~1 day)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| G.1 | Migrate ~38 JSON-RPC callsites to gRPC | 1d | not started | Sui gRPC GA | both | When Mysten ships gRPC |

### Cross-cutting: Testing (~2 days, distributed across phases)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| T.1 | Engine unit tests (streaming dispatch, truncation, microcompact, permission resolution) | 0.5d | not started | B.1–B.4 | t2000 | Phase B |
| T.2 | Classifier + cron integration tests | 0.25d | not started | C.1–C.2 | audric | Phase C |
| T.3 | Autonomous action tests (safety, idempotency, circuit breaker, trust ladder, E2E staging) | 0.75d | not started | D.1–D.6 | both | Phase D |
| T.4 | Report generation, rate limiting, OG image tests | 0.25d | not started | E.1–E.2 | audric | Phase E |
| T.5 | Regression pass (existing features still work after each phase) | 0.25d | not started | — | both | After each phase |

### Cross-cutting: Documentation (~1.5 days, after Phase E)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| DOC.1 | Update `audric/CLAUDE.md` (permissions, chain memory, autonomy, trust dashboard, report, session URLs, email templates, new tools) | 0.5d | not started | E.2 | audric | Single pass |
| DOC.2 | Update `audric/README.md` (autonomy loop, public report, feature list) | 0.25d | not started | E.2 | audric | Single pass |
| DOC.3 | Update `t2000/CLAUDE.md` + `packages/engine/README.md` (new exports, tool interface changes) | 0.25d | not started | E.2 | t2000 | Single pass |
| DOC.4 | Update `PRODUCT_FACTS.md`, `spec/REASONING_ENGINE.md` (tool count, streaming, budgeting, microcompact) | 0.25d | not started | E.2 | t2000 | Single pass |
| DOC.5 | Update `audric-build-tracker.md` + `audric-roadmap.md` (mark phases complete) | 0.25d | not started | E.2 | t2000 | Ongoing |

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
| Terms of Service page | done | ✅ Merged into 1.5 and shipped. ToS page live (`/terms`, 15 sections incl. Fees + Allowance), `tosAcceptedAt` consent gate active |
| **audric.ai landing page** | done | ✅ Live. 9-section landing (white UI), dark UI for app pages. `.light-theme` class scopes marketing pages (landing, product, legal) |
| **t2000.ai white UI refresh** | done | ✅ Live. White UI with Agentic Design System typography (Instrument Serif headings, Geist body, Geist Mono labels) |
| **docs.t2000.ai** | not started | After landing pages. GitBook or Mintlify. Content from CLAUDE.md, ARCHITECTURE.md, audric-roadmap.md, audric-security-specs.md, package READMEs |
| **Stats API for landing pages** | done | ✅ GET /api/stats (public, 60s cache). Aggregates: totalUsers, totalSessions, totalTurns, totalTokens, totalCostUsd, avgCostPerSession, cacheSavingsPercent, totalTransactions, topTools. Piggybacks on SessionUsage table from CostTracker |
| **suimpp.dev reskin** | done | ✅ Live. White theme + Agentic Design System typography across all 16 page components (serif headings, mono uppercase nav/buttons/labels) |
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
                  1.4 ✅ (savings goals) → 1.4.1 ✅ (feedback data layer)
                  1.5 ✅ (new user + ToS)
                                                           ║
                  ═══ PARALLEL TRACKS ═══                  ║
                  audric.ai landing page ✅                ║
                  t2000.ai white UI refresh ✅             ║
                  suimpp.dev reskin ✅                     ║
                                                           ║
                   │                                       ║
                   ▼                                       ║
Phase 2:  2.1 ──→ 2.2    2.4                              ║
           │       (skip 2.3 AlchemyPay, skip 2.5 mini-store)
           │                                               ║
           ├── RICH UX (Phase 2 parallel): ════════════    ║
           │   RC-0 (card primitives)                      ║
           │     ├── RC-1 (HealthCard)                     ║
           │     ├── RC-2 (TransactionHistoryCard)         ║
           │     ├── RC-3 (SwapQuoteCard)                  ║
           │     ├── RC-9 (Enhanced receipts)              ║
           │     ├── RC-reg (wire CARD_RENDERERS)          ║
           │     └── AC-1 (AllowanceCard + tool)           ║
           │                                               ║
Phase 2.5: ════ ENGINE FOUNDATION (parallel with Phase 2) ═══
(parallel)  2.5.1 engine-context.ts extraction             ║
            2.5.2 buildSystemPrompt split (static/dynamic) ║
            2.5.3 maxTokens 2048 → 8192                   ║
            2.5.4 toolChoice 'any' → 'auto'               ║
            2.5.5 Settings > Memory page scaffold          ║
            2.5.6 Optional onboarding profile prompt       ║
            RC-4 (ServiceCatalogCard)                      ║
            RC-5 (SearchResultsCard)                       ║
            AC-2/3/4 (allowance control tools)             ║
            CA-0 (canvas infrastructure — no deps)         ║
            CA-1 (render_canvas engine tool)               ║
           │                                               ║
           ▼                                               ║
Phase 3:  3.1  3.2  3.3 → 3.3.1 (feedback processing)  3.4  3.6
                          (skip 3.5 gifting)
           │
           ├── ANALYTICS (Phase 3 parallel): ══════════
           │   FA-4 (portfolio snapshots — cron + API)
           │     ├── FA-1 (enhanced PortfolioCard)
           │     ├── FA-3 (yield summary + sparkline)
           │     └── FI-3 (weekly summary briefing)
           │   FA-2 (spending analytics)
           │   FA-5 (activity summary)
           │   FI-1 (idle USDC insight)
           │   FI-2 (HF warning insight)
           │
           ├── CANVAS (Phase AC — parallel with Phase 3): ═
           │   CA-2 (Activity Heatmap — no FA dep)
           │   CA-4 (Strategy simulators — client-side only)
           │   CA-6 (Watch list — any Sui address)
           │     └── CA-3 (Portfolio Timeline — needs FA-4)
           │     └── CA-5 (Spending Breakdown — needs FA-2)
           │         └── CA-7 (Full Portfolio canvas — capstone)
           │   CA-8 (contextual suggestions — needs 2.5.2)
           │
           ▼
Phase 3.5: ════ INTELLIGENCE LAYER ════════════════════════
           RE Phase 1: thinking + caching + F2, F4, F5
              │
              ▼
           RE Phase 2: guards + tool flags + F1 (profile)
              │
              ▼
           RE Phase 3: recipes + compaction + F3 (memory) + unified context
                       + RC-6 (StakingCard) + RC-7 (ProtocolCard) + RC-8 (PriceCard)
           ════════════════════════════════════════════════
           │
           ▼
Audric 2.0: ════ AUTONOMOUS FINANCIAL AGENT ════════════════
           Phase A (wk 1-2): quick wins (pre-fetch, thinking, Haiku, stats, grace period, URL routing)
              │
              ▼
           Phase B (wk 2-4): harness (streaming tools, result budgeting, microcompact, permissions)
              │
              ▼
           Phase C (wk 4-6): chain-native memory (AppEvent + PortfolioSnapshot classifiers)
              │
              ▼
           Phase D (wk 6-9): autonomous loop (patterns, trust ladder, cron, notifications, safety)
              │
              ├──→ Phase E (wk 9-10): public wallet intelligence report
              │
              └──→ Phase F (wk 10-11): self-hosting roadmap (model routing, fine-tune)
                      │
                      ▼
                   Phase G (wk 11-12): gRPC migration (when Mysten ships GA)
              │
              ▼
           Testing (T.1–T.5): distributed alongside B–E (~2d)
           Docs (DOC.1–DOC.5): single pass after Phase E (~1.5d)
           ═════════════════════════════════════════════════
           │
           ▼                                Phase 4: 4.1 → 4.2  (deferred)
           │                                   │
           ▼                                   ▼
Phase 5:  5.1 ──→ 5.2, 5.3, 5.5–5.8         5.4  (deferred)
```

---

*Last updated: April 13 2026. Phase 1 ✅ complete. Phase 2 ✅ complete. Phase 2.5 ✅ complete. Phase AC ✅ complete. Landing pages ✅ complete. Phase 3 ✅ complete. **Phase 3.5 COMPLETE** (all 3 sub-phases). Phase 4 + 5 deferred. **Audric 2.0 Phase A COMPLETE** (6/6 tasks). **Audric 2.0 Phase B COMPLETE** (4/4 tasks: microcompact, tool budgeting, granular permissions, streaming tool execution). Engine at `@t2000/engine@0.34.0`, 249 tests, typecheck clean. **Next: Phase C** (chain-native memory: AppEvent + PortfolioSnapshot classifiers, memory pipeline cron — ~3 days).*
*Source of truth for specs: `audric-roadmap.md`, `spec/REASONING_ENGINE.md`, `AUDRIC_2_SPEC.md`. Archived design specs (fully implemented): `spec/archive/audric-feedback-loop-spec.md`, `spec/archive/audric-intelligence-spec.md`, `spec/archive/audric-rich-ux-spec.md`.*
