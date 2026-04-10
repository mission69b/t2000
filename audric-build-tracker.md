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
| — | Grace period for empty allowance | 1d | not started | session charge | both | When balance=0: allow 5 free sessions then hard wall + top-up CTA. Needs: distinct `insufficient_allowance` error from charge endpoint, synchronous charge, grace counter in `UserPreferences.limits`, reset on success, banner + wall UI. Briefings just stop. **Trigger: first real "insufficient balance" in prod logs** |

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
| 2.5.1 | Extract `engine-context.ts` — create file, move `buildAdviceContext` from `engine-factory.ts`, export it | 0.5d | not started | — | audric | `buildAdviceContext` is currently a non-exported local function in `engine-factory.ts`. Must be in `engine-context.ts` before intelligence layer can wire `buildFullDynamicContext()` |
| 2.5.2 | Restructure `buildSystemPrompt` — split static (cacheable) vs dynamic (per-session) blocks | 1d | not started | 2.5.1 | audric | Currently a 200-line string-concat monolith. Split matches `spec/REASONING_ENGINE.md` caching strategy. Static block: tool descriptions, safety rules, response rules. Dynamic block: balances, contacts, goals, advice, state |
| 2.5.3 | `maxTokens: 2048 → 8192` (configurable) | 0.5h | done | — | audric | ✅ `engine-factory.ts` authenticated engine: 2048 → 8192. Unauth engine stays at 1536. |
| 2.5.4 | `toolChoice: 'any' → 'auto'` with thinking guard | 0.5h | done | — | audric | ✅ `engine-factory.ts` authenticated engine: `'any'` → `'auto'`. Full thinking guard wires in with RE-1.1. |
| 2.5.5 | Settings > Memory page scaffold + nav entry | 0.5d | not started | — | audric | No `app/settings/` directory exists. Create scaffold with sidebar nav. Empty memory page (populated when F3 ships). Also surface F1 profile data: "Audric thinks you prefer brief responses, intermediate literacy" with correction affordance |
| 2.5.6 | Optional onboarding profile prompt | 0.5d | not started | 2.5.5 | audric | Add one optional step to `/setup` wizard: "Tell us about your financial goals" — 3 radio buttons (conservative/balanced/growth) + text field. Seeds `UserFinancialProfile` immediately instead of waiting 10 sessions. Not required for launch but accelerates F1 value |

| RC-4 | `ServiceCatalogCard` — grouped by category, prices per request | 0.5d | not started | RC-0 | audric | P1. For `mpp_services` tool. Tapping service pre-fills prompt. Spec: `spec/audric-rich-ux-spec.md` §RC-4 |
| RC-5 | `SearchResultsCard` — title, URL, snippet, expandable | 0.25d | not started | RC-0 | audric | P1. For `web_search` tool. Max 3 shown. Spec: §RC-5 |
| AC-2 | `toggle_allowance` engine tool — pause/resume agent (set daily_limit to 0/restore) | 0.5d | not started | AC-1 | both | Write tool (confirm). Spec: §AC-2 |
| AC-3 | `update_daily_limit` engine tool — change spending cap via chat | 0.25d | not started | AC-1 | both | Write tool (confirm). Spec: §AC-3 |
| AC-4 | `update_permissions` engine tool — enable/disable feature categories via chat | 0.25d | not started | AC-1 | both | Write tool (confirm). Uses allowance.move `permitted_features`. Spec: §AC-4 |
| CA-0 | Canvas infrastructure — `canvas` EngineEvent type, `CanvasCard.tsx`, `CanvasModal.tsx`, wire into `ToolResultCard` registry | 1.5d | not started | RC-0 | audric | No external deps. Spec: Canvas plan §CA-0 |
| CA-1 | `render_canvas` engine tool — template enum, params schema, data fetcher, canvas event emission | 1d | not started | CA-0 | both | Register alongside read tools. Spec: Canvas plan §CA-1 |

**Estimated effort:** ~3 days (engine) + ~1.75 days (rich UX) + ~2.5 days (canvas infra). No external dependencies. Can be done during Phase 2 downtime.

---

## Phase 3 — Proactive agent + MPP discovery (Weeks 6–8)

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| 3.1 | Auto-compound rewards | 3d | not started | 0.7 | both | — |
| 3.2 | USDC rate monitoring alerts | 1d | not started | 1.1 | both | Settings UI already built. Backend cron job + Resend template only |
| 3.3 | Scheduled actions (DCA) + trust ladder UI | 5d | not started | 1.1 | both | Includes 0.1% swap fee disclosure |
| 3.3.1 | Feedback loop processing layer | 3d | not started | 1.4.1, 3.3 | both | `OutcomeCheck` + `FollowUpQueue` tables, `runOutcomeChecks()` + `detectAnomalies()` + `deliverFollowUps()` in daily ECS cron, `canSendFollowUp()` fatigue cap (2/day non-urgent), follow-up card (reuses BriefingCard), `follow_up` activity feed chip, `SavingsGoalDeposit` write (thread goalId through pending_action→resume pipeline). Spec: `audric-feedback-loop-spec.md` |
| 3.4 | MPP consumer discovery | 3d | not started | — | audric | Pre-Store: users discover AI services (Suno, ElevenLabs) via Audric Pay |
| 3.4.1 | MPP reputation layer (Spec 3) | 2d | not started | 3.4 | t2000 | `computeScore()`, `scoreToTier()`, tiered rate limits (new→trusted→established→premium). Data already in ProtocolFeeLedger. Spec: `spec/audric-security-specs.md` |
| ~~3.5~~ | ~~Gifting reminders~~ | — | skipped | — | — | Deferred post-Store. Low priority |
| 3.6 | Credit UX improvements | 1d | not started | — | audric | — |
| FA-4 | Portfolio history snapshots — `PortfolioSnapshot` Prisma model, daily cron, internal route, `GET /api/analytics/portfolio-history` | 1.5d | not started | — | both | Backend infra. Cron in `t2000/apps/server/src/cron/jobs/`, calls `POST /api/internal/portfolio-snapshot` on Audric. Unlocks week-over-week changes + sparklines. Spec: `spec/audric-rich-ux-spec.md` §FA-4 |
| FA-2 | Spending analytics — `GET /api/analytics/spending`, `spending_analytics` engine tool, `SpendingCard` | 1d | not started | RC-0 | both | Aggregates `AppEvent` by service/category. MiniBar chart. Spec: §FA-2 |
| FA-3 | Yield summary — `yield_summary` engine tool, `YieldEarningsCard` with sparkline | 1d | not started | RC-0, FA-4 | both | Today/week/month/all-time breakdown. Sparkline from portfolio snapshots. Spec: §FA-3 |
| FA-5 | Activity summary — `GET /api/analytics/activity-summary`, `activity_summary` engine tool, `ActivitySummaryCard` | 1d | not started | RC-0 | both | Categorised breakdown (saves/sends/borrows/pays). MiniBar chart. Spec: §FA-5 |
| FA-1 | Enhanced `PortfolioCard` — week-over-week change, allocation bar, inline APY + HF | 0.5d | not started | RC-0, FA-4 | audric | Enhances existing card. Spec: §FA-1 |
| FI-1 | Idle USDC insight card — proactive alert when USDC sitting in wallet | 0.25d | not started | RC-0 | audric | Prompt-driven. Renders when `balance_check` shows idle USDC + APY >3%. CTA: "Save it". Spec: §FI-1 |
| FI-2 | HF warning insight card — alert when health factor < 2.0 | 0.25d | not started | RC-0 | audric | Renders when `health_check` shows HF < 2.0. CTA: "Repay". Spec: §FI-2 |
| FI-3 | Weekly summary briefing variant — new `BriefingCard` template with net worth change, yield, tx count | 0.5d | not started | FA-4 | both | Extends existing briefing cron with weekly variant. Reuses `BriefingCard`. Spec: §FI-3 |

**Critical path:** 3.3 → 3.3.1 is the longest chain. 3.2 reduced to 1d (UI done). 3.4 primes users for Store. FA-4 (portfolio snapshots) unblocks FA-1, FA-3, FI-3. 3 days saved by skipping 3.5.

---

## Phase AC — Audric Canvas (parallel with Phase 3)

> Interactive on-chain financial intelligence. Users generate visualizations and strategy simulators through natural language — the crypto-native equivalent of Perplexity Computer. No account linking required; the wallet IS the data. Visualize → act in the same conversation.
>
> **Canvas plan spec:** `.cursor/plans/audric_canvas_feature_cfe76b5b.plan.md`
>
> **Parallel track:** CA-0 + CA-1 ship in Phase 2.5 (no deps). CA-2/CA-4/CA-6 start immediately after. CA-3/CA-5 gate on FA-4/FA-2. CA-7 (the "Perplexity moment") is the capstone once all data templates are ready.

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| CA-2 | Activity Heatmap — `GET /api/analytics/activity-heatmap` + `ActivityHeatmapCanvas.tsx` (GitHub-style grid, hover tooltip, click-to-chat) | 2d | not started | CA-0, CA-1 | audric | AppEvent table exists. Canvas plan §CA-2 |
| CA-4 | Strategy simulators — `YieldProjectorCanvas`, `HealthSimulatorCanvas`, `DCAPlanner` — interactive sliders, no API needed | 1.5d | not started | CA-0 | audric | Client-side only (uses existing `/api/positions`). Canvas plan §CA-4 |
| CA-6 | Multi-wallet watch list — `WatchAddress` Prisma model, CRUD APIs, `analyze_address` engine tool, `WatchAddressCanvas` template, settings page | 2d | not started | CA-1 | both | Any public Sui address. Canvas plan §CA-6 |
| CA-3 | Portfolio Timeline canvas — `PortfolioTimelineCanvas.tsx`, stacked line chart (wallet/savings/debt) | 1d | not started | CA-0, FA-4 | audric | Canvas plan §CA-3 |
| CA-5 | Spending Breakdown canvas — `SpendingBreakdownCanvas.tsx`, donut chart + time period tabs | 0.5d | not started | CA-0, FA-2 | audric | Canvas plan §CA-5 |
| CA-7 | Full Portfolio canvas — `FullPortfolioCanvas.tsx`, 4-panel multi-view (heatmap, timeline, yield, HF), miniaturized panels that expand | 2d | not started | CA-2, CA-3, CA-5 | audric | The "Perplexity moment". Canvas plan §CA-7 |
| CA-8 | Contextual canvas suggestions — update dynamic prompt block to suggest canvas after tool results, add Charts chip to chip bar | 0.5d | not started | 2.5.2, CA-1 | audric | Prompt layer only. Canvas plan §CA-8 |

**Critical path:** CA-0 (Phase 2.5) → CA-1 (Phase 2.5) → CA-2 + CA-4 + CA-6 (parallel, start Phase AC) → CA-7 (capstone). CA-3 + CA-5 gate on FA-4 + FA-2 from Phase 3. CA-8 gates on 2.5.2.
**Estimated effort:** ~9.5 days. First interactive canvas (CA-2 heatmap) ships before Phase 3.5. CA-7 ships as Phase 3 analytics complete.

---

## Phase 3.5 — Intelligence Layer (after 3.3.1, ~3 weeks)

> Reasoning Engine + Intelligence features ship here. Depends on Phase 2.5 (engine foundation) being complete and Phase 3 features (DCA, auto-compound, feedback processing) being stable. The full tool set must be built before wrapping intelligence around it.
>
> **Specs:** `spec/REASONING_ENGINE.md`, `spec/audric-intelligence-spec.md`

### RE Phase 1: Extended Thinking + Intelligence F2, F4, F5

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| RE-1.1 | Wire adaptive thinking to `AnthropicProvider` — `thinking: { type: 'adaptive' }` + `output_config: { effort }` as separate top-level fields | 1d | not started | 2.5.3, 2.5.4 | t2000 | `packages/engine/src/providers/anthropic.ts`, `types.ts`. Add `ThinkingConfig`, `OutputConfig`, `ContentBlock` (thinking + redacted_thinking). Spec: `REASONING_ENGINE.md` §Layer 1 |
| RE-1.2 | Complexity classifier — `classifyEffort()` routes `low`/`medium`/`high`/`max` per turn | 0.5d | not started | RE-1.1 | t2000 | `packages/engine/src/context.ts`. Spec: `REASONING_ENGINE.md` §Complexity classifier |
| RE-1.3 | Prompt caching — split static/dynamic system prompt, add `cache_control` breakpoints | 1d | not started | 2.5.2 | both | Static block cached, dynamic block per-session. Spec: `REASONING_ENGINE.md` §Prompt Caching |
| RE-1.4 | Thinking display — `ReasoningAccordion` UI component, `thinking_delta` event streaming | 1d | not started | RE-1.1 | both | Show summarised thinking for financial decisions, omit for service calls. Spec: `REASONING_ENGINE.md` §Thinking Display |
| F2 | Proactive Awareness — `buildProactivenessInstructions()` in dynamic block | 0.5d | not started | 2.5.1 | audric | Prompt addition only. Spec: `audric-intelligence-spec.md` §F2 |
| F4 | Conversation State Machine — types, Redis manager, context injection, transitions in chat + resume + hf-alert routes | 2d | not started | 2.5.1 | both | `ConversationStateManager` (Upstash), `buildStateContext()`, state transitions in 3 routes. Spec: `audric-intelligence-spec.md` §F4 |
| F5 | Post-Action Self-Evaluation — `buildSelfEvaluationInstruction()` in dynamic block | 0.5d | not started | 2.5.1 | audric | Prompt addition only. Spec: `audric-intelligence-spec.md` §F5 |

**Estimated effort:** 3–4 days (RE) + 3 days (F2+F4+F5) = ~6–7 days

### RE Phase 2: Step Guards + Intelligence F1

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| RE-2.1 | Tool flags — `ToolFlags` type, tag all ~30 tools with `mutating`, `requiresBalance`, `costAware`, etc. | 1d | not started | RE-1.1 | t2000 | Spec: `REASONING_ENGINE.md` §Layer 2 |
| RE-2.2 | Guard runner — priority tiers (Safety > Financial > UX), `GuardEvent` Prisma model | 2d | not started | RE-2.1 | both | 10 guard types. Spec: `REASONING_ENGINE.md` §Guard Runner |
| RE-2.3 | Preflight validation — `preflight()` on tools with `Input Validation Gate` | 1d | not started | RE-2.1 | t2000 | Country code, address, amount validation before tool execution |
| F1 | User Financial Profile — Prisma migration, internal route, cron job, `buildProfileContext()` | 2d | not started | RE-2.2 | both | Profile inference after guards are running — guards + profile together shape agent behaviour. Spec: `audric-intelligence-spec.md` §F1 |

**Estimated effort:** 4–5 days (RE) + 2 days (F1) = ~6–7 days

### RE Phase 3: Skill Recipes + Intelligence F3

| # | Task | Effort | Status | Blocked by | Repo | Ref |
|---|------|--------|--------|------------|------|-----|
| RE-3.1 | Recipe format — YAML loader, `Recipe` + `RecipeStep` types, trigger matching (longest match wins) | 1.5d | not started | RE-2.2 | t2000 | Spec: `REASONING_ENGINE.md` §Layer 3 |
| RE-3.2 | Financial recipes — `swap-and-save.yaml`, `safe-borrow.yaml`, `send-to-contact.yaml`, `portfolio-rebalance.yaml`, `emergency-withdraw.yaml` | 1d | not started | RE-3.1 | t2000 | Declarative multi-step workflows with `on_error` branches |
| RE-3.3 | Context compaction — summarise old turns at 85% context capacity | 1d | not started | RE-1.1 | t2000 | `ContextBudget` tracker, compaction call. Spec: `REASONING_ENGINE.md` §Context Window |
| F3 | Episodic Memory — Prisma migration, internal route, cron job, `buildMemoryContext()`, Settings > Memory page | 2.5d | not started | 2.5.5, RE-3.1 | both | Memory extraction benefits from recipes being active (richer session data). Spec: `audric-intelligence-spec.md` §F3 |
| — | Unified context assembly — `buildFullDynamicContext()`, wire to chat route | 0.5d | not started | F1, F2, F3, F4, F5 | audric | Replaces current inline context building. Spec: `audric-intelligence-spec.md` §Unified context assembly |
| RC-6 | `StakingCard` — APY, exchange rate, total staked | 0.25d | not started | RC-0 | audric | P2. For `volo_stats` tool. Spec: `spec/audric-rich-ux-spec.md` §RC-6 |
| RC-7 | `ProtocolCard` — safety score bar, TVL, risk factors | 0.5d | not started | RC-0 | audric | P2. For `protocol_deep_dive` tool. Spec: §RC-7 |
| RC-8 | `PriceCard` — token list with trend indicators | 0.25d | not started | RC-0 | audric | P2. For `defillama_token_prices` + `defillama_price_change`. Spec: §RC-8 |

**Estimated effort:** 3–4 days (RE) + 3 days (F3 + unified) + 1 day (remaining cards) = ~7–8 days

**Phase 3.5 total: ~19–22 days across 3 sub-phases (includes 1d for low-priority rich cards). Ships alongside the full feature set from Phases 2–3.**

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
           ▼                                Phase 4: 4.1 → 4.2
           │                                   │
           ▼                                   ▼
Phase 5:  5.1 ──→ 5.2, 5.3, 5.5–5.8         5.4
          ═══ THE KILLER FEATURE ═══
```

---

*Last updated: April 10 2026. Phase 1 ✅ complete. Phase 2 ✅ complete (payment links, invoices, memo send, P0 rich cards RC-0–RC-3/RC-9/RC-reg, AC-1 allowance tool, SDK/CLI/MCP receive feature). Landing pages ✅ complete. Next: Phase 2.5 (engine foundation + P1 cards + AC-2/3/4 allowance tools + CA-0/CA-1 canvas infra — all parallel, no blocking deps). Phase 3 includes proactive agent + financial analytics (FA-2, FA-4, FA-5). Phase AC (Audric Canvas — ~9.5 days) runs parallel to Phase 3. Phase 3.5 (Intelligence Layer) is the capstone before Phase 5 Store.*
*Source of truth for specs: `audric-roadmap.md`, `audric-feedback-loop-spec.md`, `spec/REASONING_ENGINE.md`, `spec/audric-intelligence-spec.md`, `spec/audric-rich-ux-spec.md`, `.cursor/plans/audric_canvas_feature_cfe76b5b.plan.md`*
