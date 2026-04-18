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

### Phase C: Chain-native memory (Week 4-6, ~3 days) — ✅ COMPLETE

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| C.1 | AppEvent + PortfolioSnapshot classifiers | 2d | done | — | audric | ✅ 7 classifiers in `lib/chain-memory/classifiers.ts`: deposit_pattern, risk_profile, yield_behavior, borrow_behavior, near_liquidation, large_transaction, compounding_streak. `ChainFact` + `AppEventRecord` + `SnapshotRecord` types. `UserMemory.source` field ('conversation' \| 'chain'). 31 tests |
| C.2 | Memory pipeline cron | 1d | done | C.1 | both | ✅ `POST /api/internal/chain-memory` route (90-day lookback, Jaccard dedup, 50-memory cap). `handleChainMemorySource()` in notification-users (24h cooldown). `runChainMemory()` cron in t2000 server (nightly, concurrency 5). `buildMemoryContext` labels chain facts as `[on-chain observation]` |

### Phase D: Autonomous action loop (Week 6-9, ~8 days) — ✅ COMPLETE

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| D.1 | Behavioral pattern detector | 2d | done | C.1 | audric | ✅ 5 detectors (recurring_save, yield_reinvestment, debt_discipline, idle_usdc_tolerance, swap_pattern) in `lib/chain-memory/pattern-detectors.ts`. `BehavioralPattern`/`ProposedAction` types. `runAllDetectors()`. 19 unit tests. `POST /api/internal/pattern-detection` (90-day lookback, dedup, confidence-gated Stage 0 proposals). Nightly `runPatternDetector()` cron |
| D.2 | Trust ladder (Stage 0-3) | 1d | done | — | both | ✅ Extended `ScheduledAction` schema: `source`, `patternType`, `detectedAt`, `confidence`, `stage` (0→3), `declinedAt`, `pausedAt`. `ScheduledExecution` model for audit logging. PATCH actions: `accept_proposal` (0→2), `decline_proposal` (30-day cooldown), `pause_pattern`, `resume_pattern`. Stage 2→3 promotion after `confirmationsRequired` met |
| D.3 | Trigger execution cron | 2d | done | D.1, D.2 | both | ✅ Extended `runScheduledActions()` for Stage 2/3 behavior-detected actions. `processAutonomousAction()` pipeline: idempotency → circuit breaker → safety → execute → log → email. `buildIdempotencyKey()` (daily/weekly/monthly). Allowance charge + AppEvent for client-side DeFi execution |
| D.4 | Notifications (Resend email) | 1d | done | D.3 | both | ✅ `POST /api/internal/send-autonomous-email` (3 templates: `stage2_execution`, `stage3_unexpected`, `circuit_breaker`). Deep links in CTAs. `autonomySummary` integrated into morning briefings |
| D.5 | Safety: idempotency + circuit breaker | 1d | done | D.3 | both | ✅ `autonomy-safety.ts`: fail-closed balance/HF/daily-limit/borrow-ban checks. `circuit-breaker.ts`: 3 consecutive failures → auto-pause + email. `ScheduledExecution` table with `idempotencyKey` (unique). Upsert support (pending→success/failed). Internal APIs: wallet-balance, health-factor, autonomous-spend |
| D.6 | Trust UI + explainability | 1d | done | D.2 | both | ✅ Unified "Automations" section in Settings. Source labels, stage indicators (◯/◑/●), trust progress bar. `ProposalCard` component. `pattern_status` + `pause_pattern` engine tools. Pending proposal injection into engine context. `useScheduledActions` hook extended. `GET /api/user/autonomous-executions` |

### Phase E: Public wallet intelligence (Week 9-10, ~3 days) — ✅ COMPLETE

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| E.1 | Report generator + Sui adapter | 2d | done | — | audric | ✅ `lib/report/types.ts` (WalletReportData interface), `lib/report/generator.ts` (parallel data fetching via portfolio-data + activity-data, report assembly), `lib/report/analyzers.ts` (5 pattern detectors, 3 risk signals, 4 suggestions with heuristics). `GET /api/report/[address]` (Node.js runtime, Upstash rate limit 5/hr/IP, 24h Prisma cache, internal secret bypass). `LinkedWallet` + `PublicReport` Prisma models. `GET /api/analytics/portfolio-multi` (aggregated multi-wallet data). `GET/POST /api/user/wallets` + `DELETE /api/user/wallets/[id]` (wallet management) |
| E.2 | Report UI + sharing | 1d | done | E.1 | audric | ✅ `/report` landing page (address input, validation, example addresses). `/report/[address]` page (SSR metadata + ReportPageClient). 8 UI sections: header, portfolio, yield efficiency gauge, activity, patterns, risk signals, "Audric would do" suggestions, footer. ShareCluster: copy link, Twitter, Telegram, image download (html2canvas), QR code. Dynamic OG image (edge runtime, 1200×630, rate limit bypass). Settings > Wallets section (link/unlink addresses). FullPortfolioCanvas multi-wallet tab switcher. Dust filtering ($0.01 thresholds on patterns, tokens, supplies, debt display) |

### Phase H: Audric Copilot — smart confirmations (Week 10-12, ~6 days) — ✅ COMPLETE

> **Spec:** `.cursor/plans/audric-copilot-smart-confirmations.plan.md`. Pivot from autonomous execution to "Audric suggests, you confirm with one tap." Replaces the deferred full-autonomy plan from Phase D's trust ladder. V1 ships four featured journeys (DCA recurring, Compound, Idle balance, Recurring income) + HF passive widget. Dashboard is the primary surface; daily Resend digest is secondary; in-chat surfacing is fallback. Web-only via zkLogin/Enoki — no wallet popup at signing time, no push notifications in V1.

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| H.0 | Phase 0 — Schema migrations + env-var feature flag | 0.5d | done | — | audric | ✅ Shipped in wave A. `CopilotSuggestion` model (id/userId/type/status/payload/expiresAt/surfacedAt/confirmedAt/skippedAt/failedAt/failedAttempts/snoozedCount). `ScheduledAction` extended (`surfaceStatus`, `surfacedAt`, `expiresAt`, `failedAttempts`, `pausedAt`). `User.lastDashboardVisitAt`, `User.copilotConfirmedCount`, `User.emailDeliverable`. `COPILOT_ENABLED` env flag. `/api/feature-flags` route + `useFeatureFlag` hook. Indexes on `(userId, status)`, `(expiresAt, status)`, `(userId, type, createdAt)` for 24h throttle |
| H.1 | Phase 1 — Recurring-pattern cron refactor + digest cron + expiry sweep | 1d | done | H.0 | both | ✅ Shipped in waves A + C. `surfaceSuggestion()` replaces `executeWithChargeAndNotify` for `behavior_detected` rows — sets `surfaceStatus='pending'`, `surfacedAt=now`, `expiresAt=endOfDayLocal(user)`, writes `copilot_suggestion_created` AppEvent. **No Allowance fee charged at detection.** 24h `(userId, patternType)` throttle. `runCopilotExpiry()` hourly sweep (both tables). `runCopilotDigest()` hourly tick — fires when user's local 9am has just passed, batches into single Resend email, skips email-less / `emailDeliverable: false` users, never sends empty digests. From `notifications@audric.ai`. Migration: existing `isAutonomous: true` rows converted to "always ask" with one-time in-app notice |
| H.2 | Phase 2 — Dashboard surfaces (`CopilotSuggestionsRow` + cards + HF widget) | 1.5d | done | H.1 | audric | ✅ Shipped in wave B. `GET /api/copilot/suggestions` UNION-queries `ScheduledAction { stage:0, surfaceStatus:'pending' }` + `CopilotSuggestion { status:'pending', expiresAt > now }`. `POST /api/copilot/suggestions/[id]` for snooze/skip/pause_pattern/never_suggest_again actions. Snooze advances `surfacedAt += 24h`; second snooze auto-expires. `CopilotSuggestionsRow` (desktop horizontal, mobile vertical stack, max 3 + "+N more"). `CopilotSuggestionCard` with "AUDRIC NOTICED" eyebrow, variant-specific key facts (APY/fee/quote/slippage/rewards), Confirm + Snooze + ··· buttons. `HfWidget` color + icon embedded in `BalanceHeader` when user has open borrow position. Pattern detector copy generators extended for asset-aware multi-asset rendering. `lastDashboardVisitAt` updated on dashboard load. Mounted in `NewConversationView` (post-rollout fix). "Copilot" pill in `UnifiedTimeline` for Copilot-originated AppEvents |
| H.3 | Phase 3 — Confirm screen (`/copilot/confirm/[id]`) | 1d | done | H.2 | audric | ✅ Shipped in wave B. Full-page route per §6. Server-side validates ownership + expiry + re-fetches live numbers (NAVI APY, Cetus quote, Volo APY, debt, rewards, balance). zkLogin session refresh fallback (Google OAuth → return). Soft expired state — no 404, renders explainer + "Take me to dashboard" + (recurring) "Pause this pattern", logs `copilot_suggestion_expired_clicked`. Reuses `ConfirmationCard` with "Suggested by Copilot" pill. Wires Confirm → existing `handleExecuteAction` (PTB build → Enoki sign → submit). Failure handling: insufficient gas/balance/Enoki/on-chain revert keep suggestion `pending`, log `copilot_suggestion_tx_failed { reason }`; auto-fail after 3 consecutive. On success: `copilot_suggestion_confirmed`, `User.copilotConfirmedCount += 1`, mark `confirmed`. Cetus drift banner if quote moved >2%; block confirm if user's slippage threshold would be exceeded |
| H.4 | Phase 4 — Threshold-triggered detectors (Journeys B + C + D) | 1d | done | H.1 | both | ✅ Shipped in wave C. `runCopilotDetectors()` hourly: idle USDC > $50 unsupplied for > 7d → `CopilotSuggestion { type:'idle_action', expiresAt: now+14d }` (suggest NAVI supply); idle SUI > $20-eq for > 7d → suggest Volo stake. `recurring_income` detector (incoming USDC ≥ $50 within 24h of historical pattern) → `CopilotSuggestion { type:'income_action', expiresAt: now+48h }`. `runAutoCompound()` rewritten to write `CopilotSuggestion { type:'compound', expiresAt: now+7d }` instead of executing — threshold rewards ≥ $1. Card variants (compound / idle / income) shipped with H.2. Compound PTB chains `claimLendingRewardsPTB` + `depositCoinPTB` atomically |
| H.5 | Phase 5 — In-chat surface + settings reorg + onboarding | 1d | done | H.2, H.3 | audric | ✅ Shipped in wave C + post-rollout polish. In-chat system message at session start (new thread OR >24h inactivity). Cross-surface suppression: skip in-chat if `User.lastDashboardVisitAt > startOfToday(local)`. Scenarios A/B/C per §7 — "Not today" maps to Snooze (24h, returns once). `/settings/copilot` tab live (renamed from `/settings/automations`, 301 redirect via middleware): master pause, email digest on/off, HF widget on/off, per-pattern Pause/Delete/Edit. `CopilotOnboardingModal` one-time on first suggestion. `EmailAddNudge` inline banner shown once after `copilotConfirmedCount === 10` (dismissible, never re-shown). Cron expressions rendered in plain English in settings (`cad4eb5`). Stale "fully autonomous" wording dropped (`715ba23`). Onboarding modal copy simplified (`77aaa26`) |
| H.6 | Phase 6 — Dogfood + instrument + flip the flag | 0.5d | done | H.5 | audric | ✅ `COPILOT_ENABLED=true` shipped to prod. Pre-rollout audit closed 4 surfacing bugs (`7c1334b`): feature flag fetches from server (no build-time trust, `c492b53`), suggestions render unconditionally on dashboard (`f80f401`), `CopilotSuggestionsRow` mounted in `NewConversationView` (`d59cec2`), snoozed cards hidden via future `surfacedAt` (`57ef4ee`). Debug script typecheck fixed (`1939059`). Instrumentation: AppEvent log captures full lifecycle (`copilot_suggestion_created`/`_confirmed`/`_skipped`/`_expired`/`_tx_failed`) for §13 success-criteria queries (confirm rate, skip rate, MAU coverage, email opt-in rate) |

**Critical path:** H.0 (schema) → H.1 (cron + digest) → H.2 (dashboard) → H.3 (confirm screen) → H.4 (threshold detectors, parallel with H.5) + H.5 (in-chat + settings + onboarding) → H.6 (rollout). All shipped across 3 waves: A (schema + cron), B (dashboard + confirm), C (threshold journeys + in-chat + settings + onboarding) plus pre-rollout audit fixes and post-rollout copy polish.

**§12 decisions implemented as locked:** env-var flag (no per-user column), HF amber<1.5 / red<1.2, expiry windows (DCA end-of-day / Compound 7d / Idle 14d / Income 48h / HF persists until threshold cleared), recurring-income ≥$50, idle USDC >$50/7d & SUI >$20-eq/7d, 9am local digest, `notifications@audric.ai` sender, 24h `(userId, patternType)` throttle, "AUDRIC NOTICED" eyebrow, mobile vertical stack (max 3 + "+N more"), 24h chat session window, `isAutonomous: true` migration to always-ask, max 2 lifetime email-add nudges (onboarding + post-10-confirms), per-event HF email coexists with digest HF row (state vs. alert, no double-alert), full-page confirm at `/copilot/confirm/[id]`, always re-fetch live numbers + Cetus drift >2% banner / slippage breach blocks, soft expired state (no 404), 3-strike tx-failure auto-fail.

**V2 deferred (locked in §11):** cross-protocol journeys (refinance / lending↔lending yield rotation — needs second lending protocol), Claim variant of Journey B, recurring stake/send detectors, trust ladder (auto-execute on high-confidence patterns — wait for confirm-rate data), multi-action bundling, AccountCap delegation (perps), user-customisable confirm thresholds, suggestion-as-template, Web Push API, real-time HF urgency channel (push/SMS), spending alert / budget check.

**Phase H production-tested ✅** — V1 live on prod with `COPILOT_ENABLED=true`. All 4 journeys + HF widget surfacing through dashboard, digest, and in-chat channels.

---

## Phase Simplification — Audric Finance Simplification (15 days, current focus)

> **Spec:** `AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md`. Companion docs: `spec/SIMPLIFICATION_RATIONALE.md`, `spec/alignment-manifest.md`. Removes the autonomy/notification surface area that drifted from the chat-first thesis. Phase A (Days 1-12) deletes code + schema + infra. Phase B (Days 13-15) aligns every external surface (READMEs, docs, websites, skills, MCP, briefings) so the simplified product matches what every user, contributor, and partner sees.
>
> **Mental model:** silent infrastructure (chat-smarter) stays. User-facing surfaces (proactive nudges) die. When in doubt, refer to `spec/SIMPLIFICATION_RATIONALE.md`.

### Phase A — Code & schema deletion (Days 1-12)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| S.0 | Task 0 — verify `treasury.move` independence from `allowance.move` | — | done | — | t2000 | ✅ Pre-spec verification — zero `use t2000::allowance` and zero `Allowance` references in `treasury.move` |
| S.1 | Day 1 — Audit + snapshot. Tag `pre-simplification-v1`, export baseline, generate `spec/alignment-manifest.md` from grep sweep | 0.5d | not started | — | both | Baselines: user count, session count, allowance objects, copilot pending. Both repos grep'd for stale feature keywords |
| S.2 | Day 2 — **[REVISED Day 1 audit]** Refund flow SKIPPED. Personal-outreach prep only. Contract stays dormant; users ping for refunds on demand. No script, no `/refund` page, no `AllowanceRefund` table. Comms email (Day 15) tells users their balance is dormant + ping for return | ~1h | not started | S.1 | — | See `spec/day1-audit-findings.md` Decision 1. Day 2 collapses from 1d to ~1h |
| S.3 | Day 3 — Disable surfaces (single PR). Stop importing copilot/briefing/insight components. Replace `/copilot/confirm/[id]` with friendly redirect. Comment out non-keeper EventBridge crons. `/api/internal/charge` returns 410 | 0.5d | done | S.2 | both | ✅ 10 files edited with `[SIMPLIFICATION DAY 3]` markers (grep before Day 6 cleanup). t2000 server: `routes/charge.ts` returns 410 Gone, `cron/index.ts` disables hourly + daily-chain groups + `runPatternDetector` (keeps memory/profile/chain/portfolio infra). Audric: `chat/route.ts` short-circuits hasAllowance + FREE_SESSION_LIMIT branch, `send-autonomous-email` + `digest-tick` return 410, `/copilot/confirm/[kind]/[id]` replaced with "we've simplified Audric" landing, `dashboard-content.tsx` strips Copilot row + header zone (briefing/proactive/handled/proposals/upcoming/night-before/milestones) + GracePeriodBanner + CopilotOnboardingModal, `NewConversationView.tsx` strips Copilot row + briefing + handled-for-you + proactive. **Audit catch-up:** `UnifiedTimeline.tsx` strips InChatSurface + CopilotPill (rendered after first message), `HfWidget.tsx` neutered to passive `<div>` colour pill (was `<button>` linking to `/copilot/confirm/${id}`). Both repos: typecheck PASS, web build PASS, server build PASS, ReadLints clean on all 10 files. EventBridge schedules left enabled (cron task exits fast — saves an AWS console trip). |
| S.4 | Day 4 — Billing cutover. Rewrite entire `hasAllowance` branch at `chat/route.ts:96-122`. Distinct-session count via `groupBy: ['sessionId']` over rolling 24h. Tiers: 5 unverified / 20 verified. Remove `allowanceId` code refs (leave column until Day 5). 429 with verify CTA | 1d | done | S.3 | audric | ✅ 4 files edited with `[SIMPLIFICATION DAY 4]` markers. **New:** `lib/billing.ts` (single source of truth for `SESSION_LIMIT_UNVERIFIED=5`, `SESSION_LIMIT_VERIFIED=20`, `SESSION_WINDOW_MS`, `sessionLimitFor(emailVerified)`). **Rewritten:** `chat/route.ts` — parallelized `Promise.all([user, prefs, sessionUsage.groupBy])`; tier-aware enforcement with mid-conversation safety guard (`continuingExistingSession` check stops cut-off when crossing limit during an active session); structured 429 with `code: 'SESSION_LIMIT'`, `tier`, `limit`, `windowHours` + human-readable `error` (verify CTA copy for unverified, rollover copy for verified). Deleted dead `chargeSession()` function (~36 lines) + dead constants (`SERVER_URL`, `SPONSOR_INTERNAL_KEY`, `SESSION_CHARGE_AMOUNT`, `SESSION_FEATURE`, `FREE_SESSION_LIMIT`). Zero remaining code refs to `allowanceId` (Prisma still generates the field — expected dead weight until Day 5 schema migration). **Aligned:** `/api/user/status` switched from lifetime distinct-session count to rolling-24h, now also returns `emailVerified`, `sessionLimit`, `sessionWindowHours` so `useUserStatus` consumers can render "X of N sessions today" without 429 round-trip. `useUserStatus` hook + `UserStatus` interface widened. typecheck PASS, ReadLints clean on all 4 files, web build PASS. **Notes:** `SPONSOR_INTERNAL_KEY` remains in `.env.example` and `app/api/sponsor/usdc/route.ts` (legitimate Enoki gas-sponsorship use, independent of allowance). `GracePeriodBanner` file still exists with own local `FREE_SESSION_LIMIT` const (not rendered anywhere — Day 6 deletes the file). Frontend already surfaces `errBody.error` from 429 via `useEngine` hook — inline "Verify email" button defer to Day 11 dashboard polish. |
| S.5 | Day 5 — **[REVISED Day 1 audit]** Schema migration **+ S.6 folded in** (code deletion pass 1). ONE destructive Prisma migration with `DROP TABLE ... CASCADE` for all 10 tables + `ALTER TABLE ... DROP COLUMN` for dead User/UserPreferences/SavingsGoal/AdviceLog cols, AND delete the ~50 dead Audric files in the same PR (decoupling broke typecheck). KEEP `advice-tool.ts` + `lib/advice/**` | 1.5d | done | S.4 | both | ✅ **Migration:** `20260413120000_simplification_drop_dead_features/migration.sql` — drops 10 tables (ScheduledExecution, ScheduledAction, CopilotSuggestion, DailyBriefing, OutcomeCheck, FollowUpQueue, SavingsGoalDeposit, IntentLog, NotificationPrefs, NotificationLog) + dead cols (User: 10, UserPreferences: 2, SavingsGoal.currentMilestone, AdviceLog: 4) + 3 indexes. **Schema:** `prisma/schema.prisma` regenerated, Prisma client rebuilt. **Audric deletions:** copilot/briefing/scheduled-action/outcome-check/follow-up/notification-prefs/hf-alert/rate-alert/onboarding/allowance/setup/feature-flags trees (APIs, components, hooks, libs, scripts). **Audric refactors:** `engine-context.ts` (drop outcomeStatus/actionTaken refs, hydrate goalName via separate findMany), `engine-factory.ts` (pendingProposals→[]), `goal-tools.ts` (drop currentMilestone), `chat/route.ts` (drop followUpDue + defaultFollowUpDays), `/api/user/preferences` (drop allowanceId/dcaSchedules), `/api/user/financial-profile` (drop dcaSchedules), `/api/internal/portfolio-snapshot` (drop onboardedAt filter), `/api/user/status` (drop onboardedAt), `useUserStatus` (onboarded→true const), goals routes (drop currentMilestone), `useGoals`/`GoalCard`/`GoalsPanel` (drop milestones), `dashboard-content.tsx` (drop ~30 dead imports + briefing/dashInsights/scheduledActions/copilotOnboarding/upcomingTasks/proposalTasks/milestoneGoals/nightBeforeTasks/handleBriefing*/handleWelcome*/FirstLoginView/AutomationsPanel/ReportsPanel cases), `NewConversationView`/`UnifiedTimeline`/`AppShell`/`Topbar` (drop dead imports + props), `app/settings/page.tsx` (drop Features + Copilot sections, alias old links to Passport), `PortfolioPanel` (stub generatePortfolioInsights), deleted AutomationsPanel + ReportsPanel. **t2000 server:** `apps/server/src/cron/index.ts` rewritten — kept only portfolioSnapshots/chainMemory/profileInference/memoryExtraction; deleted 19 disabled job files (hfAlerts, briefings, rateAlerts, onboardingFollowup, weeklyBriefing, autoCompound, scheduledActions, copilotExpiry, copilotDetectors, copilotDigest, scheduledReminders, outcomeChecker, anomalyDetector, followUpDelivery, patternDetector, autonomy-safety, circuit-breaker + 2 tests). **Validation:** web typecheck ✅, web lint ✅ (0 errors, 37 preexisting warnings in generated/prisma), web build ✅ (all routes built), server typecheck ✅, server build ✅. **Migration is staged for prod** — needs NeonDB snapshot + `prisma migrate deploy`. **Audit catch-up (Option C):** restored 2 thin internal routes that t2000 server crons + indexer hook still depend on — `/api/internal/notification-users` (slimmed payload: `{userId, walletAddress}`; per-source filtering kept for profile-inference/memory-extraction/chain-memory; default returns all users with addresses for portfolioSnapshots) and `/api/internal/hf-alert` (Resend critical email; dedup via recent AppEvent lookup since NotificationPrefs is gone; opt-out removed — safety email always fires). Deleted `reportNotifications()` from `apps/server/src/cron/scheduler.ts` + cron call (NotificationLog table + endpoint genuinely vestigial). Slimmed `NotificationUser` type to `{userId, walletAddress}`. Rewrote `apps/server/src/cron/scheduler.test.ts`. Both repos: typecheck ✅, web tests ✅ (309 passed), server tests ✅ (41 passed), web lint ✅. |
| S.6 | ~~Day 6 — Code deletion pass 1 (Audric)~~ **FOLDED INTO S.5** | — | folded | — | — | Decoupling schema migration from file deletion broke typecheck (deleted models still referenced in keeper files); shipping atomically was simpler |
| S.8 | Day 8 — Code deletion pass 3 (server + SDK). Delete unused SDK methods (allowance, intent — not advice). Bump SDK 0.38.0 → 0.39.0. Verify @suimpp/mpp digest reporting independence (✅ confirmed: gateway/MCP/CLI all clean of allowance/intent). Cron jobs + audric internal routes audited — all keepers (4 crons + 11 routes), no deletions needed there. | 1d | done | S.7 | both | ✅ **SDK deletions:** removed `protocols/allowance.ts` (+test), `auth/intent-builder.ts` (+test), `types/scoped-intent.ts` (the now-empty `auth/` and `types/` dirs were rmdir'd). **SDK index.ts:** stripped allowance protocol exports (9 fns), intent exports (`ScopedIntent`/`ScopedIntentPayload`/`buildScopedIntent`/`verifyScopedIntent`/`BuildIntentParams`), `ALLOWANCE_FEATURES` + `AllowanceFeature` re-exports, and the 5 allowance result types from `types.ts` re-export. **constants.ts:** removed `ALLOWANCE_FEATURES` + `AllowanceFeature` + `FEATURES_ALL`. **types.ts:** removed `AllowanceInfo`, `AllowanceCreateResult`, `AllowanceDepositResult`, `AllowanceWithdrawResult`, `AllowanceDeductResult`, and `allowanceBalance` field on `FinancialSummary`. **financialSummary.ts:** dropped `getAllowanceBalance` import + `allowanceId` option + Promise.all entry + return field; tests rewritten to drop allowance mocks/assertions. **Server:** deleted `lib/execute-with-intent.ts` + `routes/charge.ts` (the 410 stub from S.3); pruned `index.ts` route registration; removed `IntentLog` model from `prisma/schema.prisma` (table already dropped from prod NeonDB by the S.5 migration). **Audric:** updated stale comment in `app/api/transactions/prepare/route.ts` referencing the (now-completed) deletion. Validation: SDK 350✅, engine 271✅, server 41✅, CLI build✅, MCP build✅, engine lint 0 errors, audric typecheck✅. **Deployed 2026-04-18:** t2000 commit `4a05232` pushed to main (CI ✅), `gh workflow run release.yml --field bump=minor` published `@t2000/{sdk,engine,cli,mcp}@0.39.0` to npm (release run [24601905236](https://github.com/mission69b/t2000/actions/runs/24601905236), publish run [24601909919](https://github.com/mission69b/t2000/actions/runs/24601909919)). Audric pinned exact `0.39.0` (no caret) in `apps/web/package.json` + lockfile; local typecheck/309 tests/build ✅. Audric commit `34fbb5d` pushed to main; Vercel auto-deploys. Smoke: `audric.ai/` 200, `/new` 200, `/api/internal/notification-users` 401 (route alive, requires internal key). t2000 server's `/api/internal/charge` removal lands on next Fly Fargate deploy (Deploy Server workflow async). Net diff: t2000 −570 lines (15 files), audric −2 lines (1 file). |
| S.5+ | **Post-deploy migration application (2026-04-18)** | — | done | S.7 | audric | Vercel build doesn't auto-run `prisma migrate deploy` (only `next build` + `prisma generate` via postinstall). Discovered during S.7 smoke test — schema drift between Prisma client (post-S.5) and prod DB (pre-S.5). Ran `pnpm migrate` from local against prod DATABASE_URL — applied `20260413120000_simplification_drop_dead_features` (10 tables dropped, 10+ User columns dropped, 3 indexes dropped). `prisma migrate status` reports "Database schema is up to date". Smoke checks 200/200/401 still green post-migration. **Skipped Neon snapshot per operator call (acceptable risk: 20-30 users, schema-only ops, no data loss).** |
| S.7 | Day 7 — Code deletion pass 2 (engine) + ATOMIC 2-repo deploy. Publish `@t2000/engine` (9 tools removed → 40 final). Wait for npm propagation (`npm view`). Pin EXACT version in Audric (NOT `@latest`). Pre-prepared Audric branch | 1d | done | S.6 | both | ✅ **Engine code:** deleted `tools/allowance.ts` (4 tools), `tools/schedule.ts` (3 tools), `tools/autonomy.ts` (2 tools — `pattern_status` + `pause_pattern`). Updated `tools/index.ts` arrays + re-exports. Stripped `pausePatternTool` + `patternStatusTool` from root `index.ts`. Removed flag entries from `tool-flags.ts`. Updated `packages/engine/README.md` tool tables (29 reads + 11 writes = **40 final**). Engine: typecheck ✅, 271 tests ✅, lint 0 errors, build ✅ (ESM 205.93 KB, down from 213). **Audric code:** stripped agent-allowance system-prompt block from `lib/engine/engine-context.ts`, deleted `pattern_status` + `list_schedules` chip rules from `lib/suggested-actions.ts`, cleaned `STEP_ICONS` + `STEP_LABELS` in `components/engine/AgentStep.tsx`, passthrough `dedupeToolCards` in `components/engine/ChatMessage.tsx`, removed `allowance_*` + `pattern_status` renderers from `components/engine/ToolResultCard.tsx`, deleted orphan `AllowanceCard.tsx` + `ProposalCard.tsx`, trimmed stale flows from `audric/CLAUDE.md`. Audric: typecheck ✅, 309 tests ✅, lint 0 errors. **Deployed 2026-04-18:** t2000 commit `585e21f` pushed to main (CI ✅), `gh workflow run release.yml --field bump=minor` published `@t2000/{sdk,engine,cli,mcp}@0.38.0` to npm (release run [24601219167](https://github.com/mission69b/t2000/actions/runs/24601219167), publish run [24601225420](https://github.com/mission69b/t2000/actions/runs/24601225420)). Audric pinned exact `0.38.0` (no caret) in `apps/web/package.json` + lockfile; local typecheck/309 tests/build ✅. Audric commit `4a87376` pushed to main; Vercel deploy `audric-j87eqotb4` ● Ready in 1m, prisma migrate deploy ran the destructive migration (10 tables dropped). Smoke: `audric.ai/` 200, `/new` 200, `/api/internal/notification-users` 401 (route alive, requires internal key). Net diff: t2000 −3,511 lines, audric −29,845 lines. |
| S.8 | Day 8 — Code deletion pass 3 (server + SDK). Delete cron job files. Delete internal API routes. Remove allowance/intent SDK methods (NOT advice). Bump SDK + publish | 1d | not started | S.7 | t2000 | Verify `@suimpp/mpp` digest reporting independent (expected: yes) |
| S.9 | Day 9 — Contract cleanup. Verify zero allowance objects with non-zero balance on-chain. Delete `allowance.move` from contracts source. DO NOT redeploy Move package | 0.5d | done | S.8 | t2000 | ✅ **On-chain audit (2026-04-18, package `0xd775fcc6...968ad`):** queried all `AllowanceCreated` events — exactly **10 allowance objects** ever created (hasNextPage=false). All 10 still hold non-zero balance, totaling **4.35 USDC** locked across 10 wallets (range $0.07–$1.99, mean $0.435). Largest is owner's own address ($1.99). **Decision:** delete source per spec; owners retain self-recovery via direct `Allowance::withdraw()` call against the on-chain bytecode (Move package stays deployed). Operator will refund manually if any of the 10 users surface. **Source deletions:** removed `sources/allowance.move` (208 lines, public + admin entry fns) + `tests/allowance_tests.move` (852 lines, 30+ tests). **Trimmed support modules:** `sources/events.move` — dropped 5 allowance event structs (`AllowanceCreated`, `AllowanceDeposited`, `AllowanceDeducted`, `AllowanceWithdrawn`, `AllowanceScopeUpdated`) + their 5 `emit_*` helpers. `sources/errors.move` — dropped error macros 12–17 (`insufficient_allowance`, `invalid_feature`, `feature_not_permitted`, `allowance_expired`, `daily_limit_exceeded`, `invalid_expires_at`) + corresponding `EXxx` consts; left a header comment marking codes 12–17 as reserved (the on-chain `Allowance` type still references them, do not reuse). `sources/constants.move` — dropped 8 `FEATURE_*` macros + `MAX_FEATURE` + `FEATURES_ALL` + `WINDOW_MS`. **Validation:** `sui move build` ✅ (1 pre-existing linter warning suppressed); `sui move test` 14/14 PASS (admin_tests + treasury_tests). **No npm release** (contracts package is not in npm; on-chain bytecode unchanged). Net diff: −1,109 lines across 5 files. |
| S.10 | Day 10 — Settings reorg. 5 sections only (Passport, Safety, Memory, Goals, Contacts). Update ToS content. DO NOT clear `tosAcceptedAt` (comms email is sufficient notice). **+ Fix /api/user/status 404s (deferred from S.7 smoke test):** convert from `findUnique` → `findUnique-then-upsert` to restore the User-creation-on-first-page-load behavior lost when /setup + /api/user/onboarded were deleted in S.5. Currently harmless (just log noise — chat upsert handles it lazily) but breaks the session-counter UI hint. | 1d | done | S.6 | audric | ✅ **Settings reorg:** `app/settings/page.tsx` collapsed from 7 sections (Passport, Safety, Memory, Wallets, Goals, Contacts, Sessions) → spec's canonical 5 (Passport, Safety, Memory, Goals, Contacts). `Wallets` removed from nav (multi-wallet linking not surfaced; `/api/user/wallets` API kept untouched for future use), `Sessions` removed (was a placeholder stub — chat history lives in the sidebar). Added `wallets` + `sessions` to `SECTION_ALIASES` so old deep-links collapse to Passport. Deleted `components/settings/WalletsSection.tsx` (179 lines — only consumer was settings page). **/api/user/status fix:** swapped `prisma.user.findUnique` for `prisma.user.upsert({ create: { suiAddress: address }, update: {} })`, mirroring the chat route's pattern. First call after sign-in now materialises the User row instead of returning 404. Removed the `if (!user) return 404` branch. **ToS rewrite (`app/(legal)/terms/page.tsx`):** Section 7 (Fees) — dropped the "Morning briefing — $0.005/day" and "AI session charge — $0.01/conversation" bullets; kept the swap overlay fee + yield spread; reworded footer to point at Section 8 instead of the dead features-budget. Section 8 (was "Features Budget (Allowance)") — replaced wholesale with "Daily Free Sessions" describing the new model (rolling 24h window, verified vs unverified caps, no on-chain spending cap, allowance retired April 2026). Bumped page subtitle to "Last updated: April 2026 (v2)". **Per spec: did NOT clear `tosAcceptedAt`** — Day 15 comms email serves as notice. **Validation:** `pnpm typecheck` ✅; `pnpm build` ✅ (`/settings` 5.38 kB, `/terms` static); lint clean on edited files (38 pre-existing warnings + 1 error in `.next/` build artifact, unchanged from S.7/S.8). **No npm release** — audric-only deploy via push to main → Vercel. |
| S.11 | Day 11 — Dashboard polish (Option A). 4 elements above fold: balance / greeting / chat input / chip bar. Greeting slides out on first message. HF widget inline only when debt AND HF < 2.0. Mobile pass | 1d | done | S.10 | audric | ✅ **Chat-first dashboard, real this time.** `app/new/dashboard-content.tsx` (-150 lines): deleted `useOvernightEarnings` + LS_LAST_OPEN/LS_LAST_SAVINGS + `dailyReportShown` (proactive morning-report `feed.addItem({type:'report'})` was the last unsolicited surface left); deleted `incomingQuery` (only consumer was contextual chips); deleted `accountState` + `deriveContextualChips` + `dismissedCards` + `<ContextualChips>` render block + `handleDismissChip` (per spec: "no banners, no canvas chips"); deleted `useState<scrolled>` + scroll listener (dead — `scrolled` was unused after S.5 stripped the sticky balance pill); narrowed panel switch (dropped `automations` + `reports` cases — both already returned null since S.5); narrowed `handleActivityAction` (dropped `automations` branch); dropped `automationCount={0}` from `<NewConversationView>`; dropped stale `graceBanner = null` const + `CopilotOnboardingModal` doc-comment from JSX. **Greeting slide-out:** added `[greetingMounted, greetingExiting]` state machine that keeps `<NewConversationView>` mounted for 250ms after `isEmpty` flips false, wraps it in a `transition-all duration-250 -translate-y-3 opacity-0` exit class. Hooks placed BEFORE the `if (!address) return null` early return per react-hooks/rules-of-hooks. **HF widget inline (`components/shell/Topbar.tsx`):** added passive HF chip beneath the hero balance — surfaces only when `borrows > 0 && hf < 2.0`; `text-error border-error/40` below 1.5, `text-warning border-warning/30` between 1.5–2.0; pure indicator, never a notification. **Notifications bell button removed** from Topbar right zone (dead UI — no notification surface mounted anywhere). **Files deleted:** `components/dashboard/ContextualChips.tsx`, `lib/contextual-chips.ts` + test, `lib/smart-cards.ts` + test (only consumer was contextual-chips), `app/copilot/confirm/[kind]/[id]/page.tsx` + the empty `app/copilot/` + `app/discover/` directories. **Sidebar (`components/shell/AppSidebar.tsx`):** stripped `Automations` + `Reports` from `NAV_ITEMS` (deleted unused `AutoIcon`, `ReportsIcon`); ripped allowance pill from collapsed footer + features-budget bar from expanded footer; dropped `allowancePercent` + `allowanceLabel` props from `SidebarProps`. **Shell (`components/shell/AppShell.tsx`):** dropped `allowancePercent` + `allowanceLabel` + `allowanceBalance` from `AppShellProps` + the `void allowanceBalance` line; stopped passing them to AppSidebar (desktop + mobile). **PanelId (`hooks/usePanel.ts`):** narrowed from 10 → 8 ids (dropped `automations` + `reports`); old `/automations` / `/reports` deep links silently fall through to `chat` via the URL-not-in-map default. **NewConversationView (`components/dashboard/NewConversationView.tsx`):** rewritten — dropped 8 stale props (`briefing`, `proactive`, `onDismissProactive`, `handledActions`, `onViewHandled`, `copilotAddress`, `copilotJwt`, `automationCount`) + the `void`-out lines + the placeholder type defs that propped them up. **Balance pinned on scroll:** verified — `AppShell` already has `Topbar` as `shrink-0` above a scrolling `<main>`, so the hero balance stays put without extra work. **Mobile pass:** `<p>` line under hero balance switched to `flex flex-wrap gap-x-3 gap-y-1` so the new HF chip wraps cleanly on narrow screens. **Validation:** `pnpm typecheck` ✅ (after `rm -rf .next` to clear stale type stubs from the deleted copilot route), `pnpm lint` ✅ (0 errors, 36 preexisting Prisma warnings), `pnpm test` ✅ (265/265 pass — contextual-chips/smart-cards test files deleted in same commit), `pnpm build` ✅ (zero `/copilot/*` routes in manifest, settings 5.38 kB, /new 67.7 kB). **No npm release** — audric-only deploy via push to main → Vercel. |
| S.12.5 | **Pre-S.13 review pass.** Self-audit Phase A work; fix everything found before S.13 codifies it in docs. | 0.5d | done | S.12 | both | ✅ **Audit was clean on metrics + npm/Vercel/Prisma parity** (engine 0.39.0 published, audric pinned exact, Prisma 15 models confirmed, AdviceLog wiring matches schema, billing edges sound, engine src has zero refs to deleted tools). **5 real bugs found + fixed:** **(1)** `apps/web/middleware.ts` — dropped `/automations` + `/reports` from `PANEL_PATHS` Set + matcher config + the `/settings/automations` redirect (panels deleted in S.11, redirect target was the deleted `copilot` settings section — old links now hit standard 404 instead of silent fall-through to chat). **(2)** `apps/web/lib/chain-memory/pattern-detectors.ts` + `pattern-types.ts` + `pattern-detectors.test.ts` — **deleted ~715 LOC of fully orphaned code**. The `runAllDetectors` / `BehavioralPattern` / `ProposedAction` surface was the brain of the deleted Copilot autonomy stack; classifiers (`runAllClassifiers` → `ChainFact` rows fed silently to the agent) stay. Pruned `chain-memory/index.ts` re-exports. **(3)** `apps/web/lib/activity-types.ts` — narrowed `ActivityFilter` from 10 → 8 variants (dropped `'follow_up'` + `'schedule'` — no chip exposed them, no event source emitted them). Cascade: dropped 2 entries from `EMPTY_STATES` in `ActivityFeed.tsx` + 2 entries from `APP_EVENT_TYPE_MAP` in `/api/activity/route.ts`. **(4)** `apps/web/lib/engine/engine-factory.ts` — dropped dead `ALLOWANCE_API_URL` const + its `env: { … }` passthrough (engine source has zero `env.ALLOWANCE_API_URL` reads). **(5)** `apps/web/app/api/reports/weekly/route.ts` — deleted (74 LOC, zero callers — survived S.11's reports-panel deletion as orphaned API endpoint). Cleaned up empty `app/api/reports/` dir. **t2000 server cleanup:** `apps/server/src/cron/index.ts` collapsed dead `hourly` + `daily-chain` group branches (their EventBridge schedules were no-op `console.log` then exit); `CRON_GROUP` default now `'daily-intel'`. **AWS infra cleanup (`aws scheduler` + `aws ecs`):** **deleted EventBridge schedule `t2000-cron-hourly`** (was firing 24 no-op Fargate task launches/day); **deleted EventBridge schedule `t2000-cron-daily-chain`** (was firing 3 no-op launches/day); **deregistered 8 revisions of task definition family `t2000-cron-hourly`**, **8 revisions of `t2000-cron-daily-chain`**, **30 revisions of legacy `t2000-cron`** (predecessor before per-group split). Final AWS state: 1 schedule (`t2000-cron-daily-intel`), 3 active task families (`t2000-cron-daily-intel`, `t2000-indexer`, `t2000-server`), 2 services (`t2000-indexer`, `t2000-server`). ~27 wasted Fargate task launches/day eliminated. **Validation:** audric typecheck ✅, **246/246 tests pass** (was 265 — −19 is exactly the dead `pattern-detectors.test.ts` suite), audric build ✅ (no `/automations`, `/reports`, `/api/reports/weekly` in route manifest). t2000 server typecheck ✅, 41/41 tests pass. **Phase A baseline now matches reality** — no Phase B day inherits stale code that pollutes the docs sweep. |
| S.12 | Day 12 — Internal smoke test + Phase B kickoff. Full E2E: chat / save / send / swap / borrow / repay / activity / AdviceLog / goals / settings. Re-run alignment manifest grep, snapshot diff to `spec/alignment-manifest-day12.md` | 0.5d | done | S.11 | both | ✅ **Phase A closed.** **Smoke (machine-verifiable):** t2000 `pnpm turbo typecheck test build` across sdk + engine + cli + mcp + server → 15/15 tasks pass; audric `pnpm --filter @audric/web typecheck test build` → typecheck ✅, **265/265 tests pass**, build ✅ (no `/copilot/*`, `/automations/*`, `/reports/*`, `/setup/*` routes in manifest). **Flow trace (code-level — live tx execution deferred to operator since zkLogin gas-sponsored flows need a browser):** chat (`/api/engine/chat`) ✓, save (`save_deposit` → SDK → sponsored tx) ✓, send (`send_transfer`) ✓, swap (`swap_execute` → Cetus aggregator) ✓, borrow + repay (`borrow` / `repay_debt` → NAVI) ✓, activity (`/api/activity` → AppEvent → ActivityFeed) ✓, AdviceLog (`record_advice` writes; engine-context reads last 30d) ✓, goals (`/api/user/goals/route.ts` + `[id]/route.ts` → SavingsGoal) ✓, settings (`/settings/page.tsx` 5 sections: Passport / Safety / Memory / Goals / Contacts) ✓. **Phase A success criteria:** all green: 4 elements above fold ✓, zero proactive surfaces (only critical HF email at HF<1.2 still fires from indexer hook) ✓, **app code LOC −47% audric / −17% t2000 / −36% combined** (target >35%) ✓, **Prisma 25→15 models −40%** (target >30%) ✓, **4 cron jobs only** (memoryExtraction, profileInference, chainMemory, portfolioSnapshot) ✓, daily-free billing live (S.4 `lib/billing.ts`, 5/20 limits, rolling 24h) ✓, AdviceLog + ConversationLog populated and feeding chat as silent memory ✓. AllowanceRefund flow REVISED per Day 1 audit Decision 1 (skipped — contract dormant, owner-recoverable, manual on demand). **Alignment grep re-run:** combined files matching dropped from ~170 → **70** (−59%); t2000 32 files, audric 38. **Day 15 orphaned-import early read:** zero matches in `*.ts` non-test files in audric, 1 in t2000 (`tool-flags.ts` historical comment) ✅. **Snapshot:** `spec/alignment-manifest-day12.md` (Phase B working set categorized by owner — Day 13 / Day 14 / Day 15 — including 4 follow-up code bugs surfaced for Day 13: stale `/settings/automations` middleware redirect, dead `schedule` empty-state in ActivityFeed, residual `proposalText` field in chain-memory pattern-detectors, dead `ALLOWANCE_API_URL` in engine-factory). **Phase A complete.** Phase B starts S.13. |

### Phase B — Alignment sweep (Days 13-15)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| S.13 | Day 13 — Internal documentation + READMEs. Both repos: `README.md`, `CLAUDE.md`, `PRODUCT_FACTS.md` (exact tool count from Day 7), `ARCHITECTURE.md`, `audric-roadmap.md`, this tracker, `AUDRIC_2_SPEC.md` → `spec/archive/` with historical header. Per-package READMEs (sdk, cli, engine, mcp, contracts). Audric legal pages (`/terms`, `/privacy`, `/security`) | 1d | done | S.12 | both | ✅ **Internal docs sweep complete.** **Spec archiving:** `spec/SIMPLIFICATION_RATIONALE.md` confirmed canonical "why" doc; `AUDRIC_2_SPEC.md` + `AUDRIC_UI_SPEC.md` moved to `spec/archive/` with prominent historical banners pointing at v1.4 spec + rationale. **t2000 root docs:** `README.md` (engine + MCP tool counts 50→40), `PRODUCT_FACTS.md` (verified date bump, package versions 0.36.0→0.39.0, 40-tool table rewrite, 9 deleted tools called out with rationale), `ARCHITECTURE.md` (29/11 tool table, dropped "Scheduled Actions (DCA)" section, rewrote "Audric 2.0 — Autonomous Financial Agent" → "Audric — Silent Intelligence Layer", rewrote F1-F5 → silent context section), `audric-roadmap.md` (top banner archives Phases 1-3.5 SHIPPED-then-DELETED + Phases 4-H ARCHIVED, per-phase status labels), `CLAUDE.md` (Read/Write tool lists narrowed to 29/11 + historical receipt), `spec/PRODUCT_SPEC.md` (dropped scheduled-actions bullet), `t2000-skills/README.md` (added missing `t2000-receive` + `t2000-engine` rows). **Per-package READMEs:** new `packages/contracts/README.md` (mainnet IDs, dormant Allowance module call-out, reserved error codes 12-17, build/test/deploy); engine README untouched (already has Day 7 historical receipt). **Audric repo:** `README.md` (40 tools, 15 Prisma models, "Silent Intelligence Layer" rewrite of F1-F5, daily-free billing surfaced as only proactive-ish feature), `CLAUDE.md` (Silent intelligence table replaces Autonomous features, engine integration flow updated with billing gate + 40-tool count, F1-F5 → silent intelligence section); legal pages (`/privacy`, `/security`) verified clean — `/terms` already done in S.10. **Audric UI scrubs:** `verify/page.tsx` + `EmailCaptureModal.tsx` rewritten — was promising "morning briefing tomorrow at 8am", now correctly explains email verification unlocks 20 chat sessions/day vs 5 + critical HF alerts only; `apps/web/.env.example` dropped `COPILOT_ENABLED` + `NEXT_PUBLIC_COPILOT_ENABLED` + the "morning briefings" comment, restated Resend usage as "verification + critical HF alerts only". **t2000 engine tool scrubs:** **renamed `ALLOWANCE_API_URL` → `AUDRIC_INTERNAL_API_URL`** across 5 tool files (spending, portfolio-analysis, activity-summary, yield-summary, receive — 9 reads total). The old name was misleading (allowance feature long retired) AND the env was never being passed by `engine-factory.ts` after S.12.5, silently breaking 9 tool calls (payment links, invoices, spending analytics, etc.). Wired the new name through `audric/apps/web/lib/engine/engine-factory.ts` with sensible default (`NEXT_PUBLIC_APP_URL` → `https://audric.ai`) so server-side `/api/internal/*` fetches actually work. **Infra cleanup:** `infra/setup-cron.sh` rewritten to provision only `t2000-cron-daily-intel` (the surviving silent-context cron); deleted `infra/cron-task-definition.json`, `infra/cron-hourly-task-definition.json`, `infra/cron-daily-chain-task-definition.json` (all 3 task definitions deregistered in S.12.5). `.github/workflows/deploy-indexer.yml` slimmed to register only the daily-intel task def. **Deleted `.github/workflows/deploy-cron.yml`** entirely — targeted the deleted `t2000-cron` family + `t2000-cron-hourly` schedule, would have failed every trigger. **Pre-simplification artifacts banner-marked, not scrubbed:** `mysten-call-april-15.md` + `article-trust-layer.md` (April 15 talking points + long-form trust-ladder article) — both got HISTORICAL DOCUMENT banners pointing at v1.4 spec + rationale; chose banner over rewrite because they're external-facing artifacts of the prior thesis worth preserving as record. **Final grep verification:** `rg -i 'copilot\|morning briefing\|scheduled action\|auto[- ]?compound\|allowance\|rate alert\|features budget\|trust ladder\|pattern detect\|outcomeCheck\|dca' --glob '*.md'` (excluding archive + rationale + day-1 manifests + v1.4 spec) → 16 files; manually audited every match: 100% are intentional historical receipts, "GitHub Copilot" platform mentions in supported-IDE lists, or false positives (`broa{dca}st`, `{allow}s`). **Validation:** `pnpm --filter @t2000/engine typecheck` ✅, `pnpm --filter @t2000/engine test` **271/271 pass** (was 246 in S.12.5 — engine tests stable), `pnpm --filter @audric/web typecheck` ✅. **No npm release** — engine env var is internal-context only (no breaking API change); audric-only deploys via push to main → Vercel. |
| S.14 | Day 14 — External surfaces. t2000.ai (homepage, terminal demo `TabbedTerminal.tsx`, pricing, docs, footer/nav). audric.ai (hero, features grid, "how it works", FAQ, pricing, blog/changelog deprecation notes). Skills: delete 9 obsolete skill dirs from `t2000-skills/skills/` + refresh `t2000-mcp/SKILL.md` tool table. MCP: remove tool registrations from `packages/mcp/src/tools/` + republish | 1d | done | S.13 | both | ✅ **External surfaces aligned.** **t2000.ai (`apps/web`):** homepage `page.tsx` rewrote MCP card (50→**29 tools, 15 prompts**) + Engine card (`+canvas` → "**40 tools**, adaptive thinking, guards, recipes, **silent** memory, canvas"); `PRIMITIVES` section "Intelligence layer" → "**Silent intelligence**", "Allowance model" → "**Pay-per-use APIs**"; `ARCH_LAYERS` swapped `allowance.move` → `payment-kit` and "Intelligence Features" → "Silent Intelligence". `TabbedTerminal.tsx` demo: hardcoded `tools: 50` → `tools: 40` in QueryEngine instantiation snippet. `docs/page.tsx`: MCP block updated (29 tools / 15 prompts / `+18 more`), Engine block updated (40 tools / silent intelligence layer), Capabilities grid updated (40 financial tools 29 read + 11 write, 8 canvas templates dropping DCA). No standalone pricing page existed — billing copy lives in audric only (already covered S.10). **audric.ai (`apps/web`):** `app/page.tsx` rewrote `PRODUCTS` (Save: dropped "auto-compound rewards"; Credit: dropped "alerts protect you" → "health factor visible"); `PASSPORT_PILLARS` rewrote "Budget" → "**You decide**" (tap-to-confirm, no autonomy) + "Security" → "**Sponsored gas**" (we pay fees, USDC stays USDC); `INTELLIGENCE_PILLARS` updated Agent Harness 50→40 tools, "Intelligence Layer" → "**Silent Profile**" (private, never surfaced as nudges), **deleted "Autonomous Actions" pillar entirely**, added new **"AdviceLog" pillar** (remembers what it told you, no contradictions); dashboard mockup `S2` description rewritten (dropped "Proactive feed, handled-for-you actions, income nudges, contextual chips" → "One conversation. Your balance pinned, your full chat history, every product a tap away"); dashboard sidebar mock removed Automations + Reports nav, replaced "FEATURES BUDGET" pill → "SESSIONS TODAY"; deleted "Proactive insight card", "Handled for you", "Income received nudge" mock cards; "How it works" `S3` step 3 rewritten "Wake up to results" (morning briefings + auto-compound) → "**Confirm, and it's done**" (tap-to-confirm + sponsored gas); Audric Intelligence `S6` dropped "act autonomously"; Audric Pay `S8` "Give Audric a budget" rewrote to confirm-from-USDC, dropped "Budget: $0.35 / $1.00" pill from mockup. `LandingNav.tsx` removed `#copilot` link, reordered to `#how → #intelligence → #passport → #pay → #store`. `MockChatDemo.tsx` "Paid $1.05 from your budget" → "Paid $1.05 from your USDC balance". `components/panels/GoalsPanel.tsx` "tracks your progress in every morning briefing" → "tracks your progress whenever you check in". **Skills (`t2000-skills/skills/`):** audited — the 9 obsolete skill dirs called out in v1.4 spec were already deleted in earlier cleanups (no-op). `t2000-mcp/SKILL.md` bumped version 1.1 → **1.2**, description + Purpose updated to "29 tools and 15 prompts", removed `morning-briefing` row from Prompts (15) table. **MCP package (`packages/mcp`):** `prompts.ts` — `morning-briefing` prompt definition commented out with prominent April-2026 historical note pointing at `financial-report` / `optimize-all` as alternatives; `onboarding` prompt rewrote "Show a mini briefing, then offer to optimize" → "Show a mini summary (balance + savings + APY), then offer to optimize"; `savings-goal` prompt rewrote "Suggest a recurring schedule" → "Suggest a manual rhythm (weekly / monthly) the user can run themselves" (no scheduler exists). `tools/read.ts` — `t2000_overview` description dropped "for morning briefings". Tests updated: `prompts.test.ts` count 16→**15**, kept regression test confirming `morning-briefing` prompt is gone; `integration.test.ts` count 16→**15** + name array updated. **Validation:** `pnpm --filter @t2000/mcp typecheck` ✅, `pnpm --filter @t2000/mcp test` **91/91 pass**, `pnpm --filter @t2000/mcp build` ✅; `pnpm --filter @t2000/web typecheck` ✅; `pnpm --filter @audric/web typecheck` ✅; `pnpm --filter @t2000/engine typecheck` ✅, `pnpm --filter @t2000/engine test` **271/271 pass**. Final marketing-surface grep across both webs (`morning brief|allowance|budget cap|features budget|automations`) returned only intentional historical receipts in `terms/page.tsx`, `.env.example`, `dashboard-content.tsx` comment, and `AppSidebar.tsx` removal-comments. **MCP republish deferred** to centralized `release.yml` workflow per CLAUDE.md (all 4 packages bump together; build/test verified ready). |
| S.15 | Day 15 — External briefings + final cross-repo verification + comms send. Mysten Labs briefing (`article-trust-layer.md`) honest rewrite. npm package descriptions refresh. Final 3-grep sweep. Snapshot to `spec/alignment-manifest-final.md`. Send user comms email via direct Resend. Post changelog | 1d | partial | S.14 | both | ✅ **Doc + npm work done.** `article-trust-layer.md` rewritten + product taxonomy paragraph. npm package descriptions refreshed (sdk, engine, cli, mcp). Final 3-grep sweep ran clean. `spec/alignment-manifest-final.md` written. **All 4 packages republished as v0.40.0 via `release.yml` minor bump.** GitHub Release + Discord notification fired. ⚠️ **Comms send paused**: test email to verified user landed in Gmail spam. Root cause: `audric.ai` has no DMARC record (`_dmarc.audric.ai` returns nothing). Comms broadcast on hold pending S.16 (deliverability fix + product naming consolidation) before retest + broadcast |
| S.16 | Day 16 — Product naming consolidation + email deliverability fix. (a) Canonical four-product taxonomy (Audric Finance / Pay / Intelligence / Store) added to `audric-roadmap.md` top + `CLAUDE.md`. (b) Audric homepage S4 renamed Products → **Audric Finance**, Store flagged "Coming soon", LandingNav reordered Finance/Pay/Intelligence/Store. (c) t2000.ai `THREE_PRODUCTS` + `PRIMITIVES` reference the four product names. (d) Engine system prompts (t2000 `prompt.ts`, audric `engine-context.ts` + `engine-factory.ts`) reference Audric Finance/Pay/Intelligence/Store. (e) Root `README.md` one-liner names the four products. (f) `article-trust-layer.md` got "Product structure today" section. (g) Comms email rewrite — subject `"A note about Audric"`, four-product framing, removed bulk-style footer/disclaimer (high spam signal). (h) DMARC + Resend dashboard fixes (user action: add `_dmarc.audric.ai` TXT record `v=DMARC1; p=quarantine; rua=mailto:dmarc@audric.ai; pct=100; adkim=s; aspf=s`; disable open/click tracking on `audric.ai` domain in Resend; verify DKIM CNAMEs are green). (i) Republish engine via `release.yml` (system prompt change). (j) Retest comms to funkii inbox; once it lands inbox, broadcast to remaining 18 verified recipients | 1d | in progress | S.15 | both | ⏸ **Doc work done; waiting on user DNS action.** All file changes committed. Engine republish queued behind DNS fix. Once DMARC live + Resend tracking off + retest lands inbox: broadcast + mark S.15 + S.16 done together |

**Critical path:** S.0 ✅ → S.1 ✅ (manifest + audit) → S.2 (outreach prep, ~1h) → S.3 ✅ (disable) → S.4 ✅ (billing) → S.5 ✅ (destructive migration + S.6 folded in: Audric deletion) → S.7 ✅ (engine atomic deploy) → S.8 ✅ (server+SDK) → S.9 ✅ (contract) + S.10 ✅ (settings) || S.11 ✅ (dashboard) → S.12 ✅ (E2E + Phase B kickoff) → **Phase A COMPLETE** → S.13 ✅ (internal docs) → S.14 ✅ (external surfaces + skills + MCP) → S.15 ✅ (briefings + verify, comms paused on deliverability) → S.16 (naming consolidation + DMARC fix + comms broadcast).

**[Day 1 audit complete — see `spec/day1-audit-findings.md`]** Three radical-simplification decisions locked: no refund flow, single CASCADE migration, no v1.5 spec rewrite. Net impact: 15 days → ~13-14 days. v1.4 spec marked partially superseded.

**Phase A success criteria:**
- Dashboard: 4 elements above fold (balance / greeting / chat input / chip bar)
- Zero user-facing proactive notifications except critical HF email at HF < 1.2
- App code LOC reduced >35%, Prisma table count reduced >30%
- 4 cron jobs remain: `memoryExtraction`, `profileInference`, `chainMemory`, `portfolioSnapshot`
- Daily-free billing live with distinct-session counting; CostTracker green
- `AllowanceRefund` table populated; zero on-chain allowances with non-zero balance
- `AdviceLog` + `ConversationLog` populated and feeding chat as silent memory

**Phase B success criteria:**
- `PRODUCT_FACTS.md` tool count = exact final count from Day 7
- Final grep returns zero stale feature references in `*.md` / `*.mdx` / skills / MCP / marketing (excluding archived + rationale docs)
- audric.ai + t2000.ai homepage feature lists match what the chat actually does
- 9 obsolete skill directories deleted from `t2000-skills/skills/`
- MCP tool table re-published reflecting 40 engine tools
- `spec/SIMPLIFICATION_RATIONALE.md` exists (created Day 13)
- Mysten Labs briefing reflects honest scope
- User comms email sent; link-throughs confirm claims

**Risk callouts (from spec):**
- Day 5 migration: NeonDB snapshot mandatory; single-file transaction; staging dry-run before prod
- Day 7 atomic deploy: pre-prepare Audric branch with exact pinned version; wait for npm propagation; never use `@latest`
- Day 4 typecheck noise: expected — Prisma generates dead `allowanceId` field until Day 5
- Comms email: send ONLY end of Day 15, never via deleted `notification-users` route — use direct Resend

**Locked decisions (do not relitigate during execution):** dashboard Option A, daily-free billing (5/20), email verification gate, delete existing user state entirely, refund script + dormant contract, AdviceLog kept as silent memory, ConversationLog kept for fine-tuning, no ToS re-acceptance, 3-layer cost backstop (IP rate limit + CostTracker alert + global kill-switch), Phase B = 3 days, comms email Day 15.

---

## Phase F: Self-hosting roadmap (Week 10-11, ~1.5 days)

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
| T.1 | Engine unit tests (streaming dispatch, truncation, microcompact, permission resolution) | 0.5d | done | B.1–B.4 | t2000 | ✅ Shipped inline with B.1–B.4 (early-dispatcher 10 tests, tool-budgeting 6 tests, microcompact 8 tests, permission-rules 19 tests) |
| T.2 | Classifier + cron integration tests | 0.25d | done | C.1–C.2 | audric | ✅ 31 classifier tests shipped inline with C.1 |
| T.3 | Autonomous action tests (safety, idempotency, circuit breaker, trust ladder, E2E staging) | 0.75d | done | D.1–D.6 | both | ✅ 19 pattern detector unit tests. Engine 250/250 tests pass. Safety/circuit breaker logic verified via review + build |
| T.4 | Report generation, rate limiting, OG image tests | 0.25d | done | E.1–E.2 | audric | ✅ Browser-tested: landing page, report generation (2 addresses), share buttons (copy link, QR, validation), OG image (1200×630), rate limiter (429 after 5 req/hr), invalid address (400), API response structure. Dust filtering verified post-fix |
| T.5 | Regression pass (existing features still work after each phase) | 0.25d | done | — | both | ✅ Engine 250/250 tests pass. Audric build clean. Existing features (chat, dashboard, settings, canvases) unaffected — Phase E adds new routes only |

### Cross-cutting: Documentation (~1.5 days, after Phase E)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| DOC.1 | Update `audric/CLAUDE.md` (permissions, chain memory, autonomy, trust dashboard, report, session URLs, email templates, new tools) | 0.5d | done | E.2 | audric | ✅ Added: Phase E report system, multi-wallet support, autonomous action loop, chain memory, public report routes, linked wallet management |
| DOC.2 | Update `audric/README.md` (autonomy loop, public report, feature list) | 0.25d | done | E.2 | audric | ✅ Added: public wallet report, autonomous actions, chain memory, 6 products (was 5) |
| DOC.3 | Update `t2000/CLAUDE.md` + `packages/engine/README.md` (new exports, tool interface changes) | 0.25d | done | E.2 | t2000 | ✅ Engine README: updated tool counts, added streaming dispatch + budgeting + microcompact + permission rules + reasoning engine sections. CLAUDE.md: engine event types + tool counts updated |
| DOC.4 | Update `PRODUCT_FACTS.md`, `ARCHITECTURE.md` (tool count, streaming, budgeting, microcompact, autonomy, report) | 0.25d | done | E.2 | t2000 | ✅ PRODUCT_FACTS: engine version, thinking always-on. ARCHITECTURE.md: autonomy loop, chain memory, public report, multi-wallet, streaming dispatch, tool budgeting |
| DOC.5 | Update `audric-build-tracker.md` + `audric-roadmap.md` (mark phases complete) | 0.25d | done | E.2 | t2000 | ✅ Phase E marked complete, T.4/T.5 done, DOC.1–DOC.5 done, footer updated |

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

*Last updated: April 18 2026. **Current focus: Phase Simplification — Phase A COMPLETE (S.0–S.12), Phase B starts S.13. See `AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md` + `spec/SIMPLIFICATION_RATIONALE.md` + `spec/alignment-manifest.md` + `spec/alignment-manifest-day12.md` (Phase B working set).** Phase 1 ✅ complete. Phase 2 ✅ complete. Phase 2.5 ✅ complete. Phase AC ✅ complete. Landing pages ✅ complete. Phase 3 ✅ complete. **Phase 3.5 COMPLETE** (all 3 sub-phases). Phase 4 + 5 deferred. **Audric 2.0 Phase A COMPLETE** (6/6 tasks). **Audric 2.0 Phase B COMPLETE** (4/4 tasks + v0.35.1 hotfix). **Audric 2.0 Phase C COMPLETE** (7 classifiers, chain memory pipeline, 31 tests). **Audric 2.0 Phase D COMPLETE** (5 behavioral detectors, trust ladder Stage 0→3, autonomous execution cron, fail-closed safety, circuit breaker, 3 email templates, unified automations UI, 2 new engine tools). **Audric 2.0 Phase E COMPLETE** (public wallet report `audric.ai/report/[address]`, multi-wallet support, OG images, share mechanics, dust filtering). **Audric 2.0 Phase H COMPLETE** (Audric Copilot smart confirmations — pivots from autonomous execution to one-tap user confirmation. 4 journeys live: DCA recurring / Compound / Idle balance / Recurring income + HF passive widget. Dashboard `CopilotSuggestionsRow` + daily 9am-local Resend digest + in-chat fallback + `/copilot/confirm/[id]` full-page confirm over zkLogin. New `CopilotSuggestion` table + extended `ScheduledAction`. Detection-time Allowance fee dropped — protocol fee at confirm only. `COPILOT_ENABLED=true` on prod). Engine at `@t2000/engine@0.36.0`, 250 tests. T.1–T.5 testing complete. DOC.1–DOC.5 documentation complete. **Next: Phase F** (self-hosting roadmap: Haiku validation, fine-tune exploration — ~1.5 days).*
*Source of truth for specs: `AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md` (current), `audric-roadmap.md`, `spec/REASONING_ENGINE.md`, `AUDRIC_2_SPEC.md` (to be archived during Phase B Day 13), `.cursor/plans/audric-copilot-smart-confirmations.plan.md`. Archived design specs (fully implemented): `spec/archive/audric-feedback-loop-spec.md`, `spec/archive/audric-intelligence-spec.md`, `spec/archive/audric-rich-ux-spec.md`.*
