# Audric Finance Simplification Spec — v1.4

*Version 1.4 — Partially superseded by Day 1 audit decisions · April 2026 · Internal*

*Supersedes v1.3, v1.2, v1.1, v1.0. Changes in v1.4 marked inline with [v1.4].*

> **⚠️ READ FIRST: `spec/day1-audit-findings.md`.** Day 1 of execution surfaced three radical-simplification decisions that supersede portions of this spec:
>
> 1. **No refund flow.** No `/refund` page, no script, no `AllowanceRefund` table. Contract stays dormant; users ping for refunds on demand.
> 2. **Single destructive `DROP TABLE ... CASCADE` migration.** Replaces the 5-step ordered sequence below. SQL provided in `day1-audit-findings.md`.
> 3. **No v1.5 spec rewrite.** `day1-audit-findings.md` is the binding amendment. Where it conflicts with this doc, it wins.
>
> Schema deltas (6 missing User columns, 1 missing index, `PublicReport` keep, `currentMilestone` field name correction) are folded into the migration SQL in the audit doc. The "Tables to keep" / "Tables to delete" / "Tables to simplify" sections below remain conceptually correct; only the *execution mechanism* changed.
>
> Day 2 collapses to ~1 hour outreach prep. Day 5 collapses to ~0.5 day. Total timeline: 15 days → **~13-14 days**.

---

## Executive summary

Audric has drifted from its core thesis — a conversational agent for money — into a notification-heavy fintech app with autonomous features that can't be autonomous under zkLogin. This spec removes everything that doesn't serve the three-product model (Audric Finance, Audric Pay, Audric Store) and restores the chat as the primary surface.

Scope: code deletion, schema cleanup, UI reduction, billing model change, allowance contract wind-down, **multi-repo alignment sweep** [v1.4]. No new features. No new engine tools. The next spec (Audric Pay v1) adds onramp.money; this one only subtracts.

Expected outcome: ~35% reduction in app code, ~30% reduction in schema, chat-first dashboard matching Claude/ChatGPT shape, four background cron jobs (all silent infrastructure), daily-free billing model, every external surface (READMEs, websites, skills, MCP descriptions, briefings) aligned with what the chat actually does.

---

## Rationale

1. **Autonomy theatre.** Scheduled actions, Copilot suggestions, and auto-compound were built around a signing capability zkLogin doesn't provide. What shipped is reminders dressed as autonomy — worse than either honest reminders or real autonomy.
2. **Notification fatigue.** Briefings, milestones, idle-USDC nudges, copilot cards, rate alerts, HF warnings all compete with the chat for attention. Chat is the differentiator; everything else is generic neobank surface.
3. **Complexity without validation.** ~50 engine tools, 8 canvas templates, 15+ Prisma models, 4 Copilot journeys at 100 users. Solo-builder complexity-to-validation ratio is too high.

Fix: subtraction. Build less, validate the core chat product, add features only when usage justifies.

---

## Mental model — silent infrastructure vs user-facing surfaces

The core principle that drives every decision in this spec:

**Silent infrastructure** (keep) — code that makes the chat smarter without ever showing its work. Memory extraction, financial profile inference, pattern classifiers, chain memory, portfolio snapshots, `AdviceLog`, conversation logs. These run, populate context, get injected into the system prompt, and disappear. The user never sees "we detected a pattern" — they just feel Audric knows them.

**User-facing surfaces** (delete) — code that demands attention outside the chat. Morning briefings, copilot suggestion cards, scheduled action reminders, rate alerts, milestone celebrations, insight banners. Every one of these competes with the chat input for real estate and cognitive load.

When in doubt during execution: does this feature surface itself to the user, or does it make the chat answer better? Surface = delete. Silent infrastructure = keep.

> **This is the highest-leverage test in the spec.** Refer back to it any time during execution when tempted to keep something "just in case." If you're not sure whether to delete something, ask: does the user see it, or does it make the chat smarter? Surface dies. Silent stays.

---

## What this spec does NOT touch

Keep intact:
- `@t2000/engine` core (QueryEngine, AnthropicProvider, tool system, streaming, sessions, CostTracker, context compaction, reasoning engine — thinking, guards, recipes, memory)
- `@t2000/sdk` (adapters, gas manager, safeguards)
- `@t2000/cli`, `@t2000/mcp`, `@suimpp/mpp`
- MPP gateway at `mpp.t2000.ai` (40 services, 88 endpoints)
- Public wallet report at `audric.ai/report/[address]` (acquisition funnel, low maintenance)
- Canvas rendering (inline canvas cards in chat, all 8 templates, `render_canvas` engine tool)
- Chain memory classifiers + `UserMemory` table (silent infrastructure that makes chat smarter)
- Financial profile (F1) inference + `UserFinancialProfile` table (used silently by the agent)
- Pattern detectors (used for chat context injection only — no proposals)
- zkLogin, Enoki gas sponsorship, Sui Payment Kit
- Enoki gas sponsorship is independent of the allowance contract — they were always orthogonal systems. Transaction sponsorship for save/send/swap/borrow/repay continues unchanged.
- Payment links + invoices (stored as `Payment` model rows, distinguished by `type` field — `Payment` has no FK to any deleted table)
- `WatchAddress` model — Phase E public wallet report watch list, no coupling to deleted features
- `LinkedWallet` model — Phase E multi-wallet linking, no coupling to deleted features
- Contacts (stored as `UserPreferences.contacts Json`), savings goals as silent trackers
- `AdviceLog` table + `record_advice` engine tool + `buildAdviceContext()` injection — chat-native silent memory for past decisions
- `ConversationLog` table + `logConversationTurn()` in chat/route.ts — preserves fine-tuning dataset for future self-hosted model migration
- `ServicePurchase` table — only consumer is `spending_analytics` engine tool which stays

---

## What this spec removes

### Feature removals (delete entirely)

| Feature | What gets deleted | Why |
|---|---|---|
| Copilot suggestions | Phase H — `CopilotSuggestion` table, all 4 journeys (DCA / Compound / Idle / Recurring Income), HF widget, dashboard `CopilotSuggestionsRow`, `/copilot/confirm/[id]` route, digest cron, in-chat surfacing, onboarding modal | Can't autonomously execute under zkLogin; tapping a suggestion is slower than typing in chat |
| Morning briefing | Cron job, email template, `DailyBriefing` table, `BriefingCard` component, `useOvernightBriefing` hook, briefing deep links | Competes with chat for attention |
| Weekly briefing | `runWeeklyBriefing()` cron, weekly summary API, email template | Same rationale |
| USDC rate alerts | `runRateAlerts()` cron, email template, `rate_alert` notification pref, settings toggle | Proactive nudge without clear user-requested outcome |
| Auto-compound | `runAutoCompound()` cron, `compoundRewards()` SDK method, `auto_compound` pref, settings toggle, detection-time allowance charge | Execution still requires user tap; the "auto" is misleading |
| Scheduled actions (DCA) | `ScheduledAction` + `ScheduledExecution` tables, `runScheduledActions()` + `runScheduledReminders()` crons, trust ladder logic, `create_schedule` / `list_schedules` / `cancel_schedule` engine tools, Settings > Schedules, `dcaSchedules` JSON field on `UserPreferences` | Can't execute without user online to sign |
| HF alerts (proactive) | Warn-level cron batch, `hf_alert` notification pref, settings toggle. KEEP: critical email at HF < 1.2 via existing indexer hook | Only safety-critical threshold justifies a notification |
| Savings goal milestones | Milestone detection cron (25/50/75/100%), celebration emails, `AppEvent` milestone rows | Goals stay as silent trackers |
| Onboarding follow-up | 24h follow-up cron, 3 email variants | Re-engagement surface nobody asked for |
| Outcome checks + follow-up queue | `OutcomeCheck` + `FollowUpQueue` tables, all related crons and routes, `follow_up` activity feed chip. **AdviceLog and `record_advice` are NOT deleted** — they stay as silent chat memory. | Outcome-check surface was proactive nudge; the underlying advice memory is chat-native and stays |
| Allowance model (user-facing) | `/setup` wizard, Settings > Features, allowance deduct calls, top-up UI, `useAllowanceStatus` hook, `allowanceId` field on `UserPreferences`. Contract stays on-chain; refund script empties balances | Funded features are all being deleted |
| Scoped intent / IntentLog | `IntentLog` table, `ScopedIntent` type + helpers, `executeWithIntent()` wrapper, `ADMIN_PRIVATE_KEY` for allowance deducts | Only consumer was allowance deducts |
| Session charge endpoint | `POST /api/internal/charge`, `chargeSession()` in chat route (plus the entire `hasAllowance` branching block at chat/route.ts:96-122) | Replaced by daily-free billing tracked via `SessionUsage` |
| Grace period UX | `GracePeriodBanner`, 5-session grace tracking, 402 limit enforcement | Replaced by daily-free billing |
| Pattern detection as proposals | `runPatternDetector()` cron, `/api/internal/pattern-detection` route, Stage 0 proposal creation, `pause_pattern` + `pattern_status` engine tools | Classifiers stay as pure functions; surfacing logic goes |
| Dashboard proactive surfaces | "AUDRIC NOTICED" cards, idle USDC insight (FI-1), HF warning insight (FI-2), contextual chips, suggested actions | Dashboard becomes chat-only |
| Notification infrastructure | `NotificationPrefs` + `NotificationLog` tables, settings UI toggles for all notifications | Only consumers were the deleted notification crons |

### Dashboard reduction — Option A locked

Before: briefing card + copilot suggestions row + HF widget + idle USDC insight + milestone celebrations + contextual chips + balance header + greeting + chat input + chip bar.

After:
- Balance in header (`$111.66 / available $80 / earning $31`)
- Greeting (`Good morning, funkiirabu`) — visible only on empty chat, slides out on first message
- Chat input
- Chip bar (`Save / Send / Swap / Credit / Receive / Charts`)

Nothing else. No activity preview, no cards, no banners, no canvas chips.

HF widget appears inline in header **only** when user has debt AND HF < 2.0. Passive indicator, not a notification.

### Settings reorg

Before (10+ sections): Passport, Safety, Features, Memory, Wallets, Copilot, Goals, Contacts, Sessions, Schedules, plus deprecated sub-pages.

After (5 sections):
- **Passport** — email, timezone, wallet address, sign-in session, sign-out
- **Safety** — transaction limits (maxPerTx, daily send)
- **Memory** — financial profile, remembered context, clear memory
- **Goals** — silent goal tracker (create, edit, delete; no notifications)
- **Contacts** — saved addresses

### Billing model change

**Current:** $0.01/session via on-chain allowance deduct + 5 free grace-period sessions.

**New:** Rolling-24h **distinct-session** limit enforced via existing `SessionUsage` table.

| User state | Sessions per rolling 24h |
|---|---|
| Unverified email | 5 |
| Verified email | 20 |

**Critical billing math:** `SessionUsage` logs *every turn*, not every session, and uses `address` (not `userId`). Enforcement must count **distinct `sessionId`** rows within the 24h window, matching the grace-period pattern already in `chat/route.ts:110-113`.

Correct Prisma query:
```typescript
const recentSessions = await prisma.sessionUsage.groupBy({
  by: ['sessionId'],
  where: {
    address,
    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  },
});
const sessionCount = recentSessions.length;
const limit = user.emailVerified ? 20 : 5;
if (sessionCount >= limit) {
  return new Response(JSON.stringify({ error: 'SESSION_LIMIT' }), { status: 429 });
}
```

When the unverified user hits 5:
```
You've used 5 of 5 sessions today. Verify your email to unlock 20 sessions every 24 hours — it's free.
[Verify email →]
```

When the verified user hits 20:
```
You've used 20 sessions in the last 24 hours. More sessions unlock as the 24h window rolls forward.
```

No top-up UI yet. No paywall yet. Revisit when (a) >20% of users hit the daily cap, or (b) monthly Anthropic spend exceeds $500.

### Allowance contract wind-down

Contract stays deployed on mainnet (`0xd775…968ad`). No new deposits. One-time script returns all existing balances to user wallets. Contract sits dormant.

**Task 0 (verified):** `treasury.move` has no `use t2000::allowance` and no reference to the `Allowance` type. Wind-down is safe to proceed.

**Refund script (`scripts/refund-allowances.ts`) — idempotency requirements:**
- Query on-chain for all `Allowance` objects with `balance > 0`
- **Before attempting withdraw, check `AllowanceRefund` table for existing `allowanceObjId`** — skip if already processed (unique constraint enforces this at DB level)
- Write to `AllowanceRefund` **before** calling on-chain `withdraw()` — prevents double-processing if crash occurs between on-chain success and DB insert
- For each: call `withdraw()` via admin key — contract permits, returns USDC to the wallet that deposited it
- Skip zero-balance allowances
- Retry failed calls up to 3 times with exponential backoff
- Email affected users via direct Resend call: "We've simplified Audric. Your features budget of $X.XX has been returned to your wallet at 0x…"

**Semantics note:** this is not a refund from your treasury. It's a return of user funds that were always theirs, sitting in their own on-chain escrow. You're just triggering the withdrawal on their behalf so they don't have to.

After script completes: remove `allowance.move` from contracts source directory, remove SDK allowance methods (`buildCreateAllowanceTx`, `addDepositAllowanceTx`, `getAllowance`), remove `ALLOWANCE_FEATURES` constants, publish a final SDK release documenting removal. Do not redeploy the Move package — the module remains on-chain but is gone from source of truth.

---

## Schema migrations

### Tables to delete entirely

```prisma
model CopilotSuggestion { ... }
model DailyBriefing { ... }
model ScheduledAction { ... }
model ScheduledExecution { ... }
model OutcomeCheck { ... }
model FollowUpQueue { ... }
model SavingsGoalDeposit { ... }
model IntentLog { ... }
model NotificationPrefs { ... }
model NotificationLog { ... }
```

### Tables to keep explicitly (silent infrastructure)

```prisma
model UserMemory { ... }              // silent chat memory
model UserFinancialProfile { ... }    // silent financial profile
model AdviceLog { ... }               // silent chat memory for past decisions (columns cleaned — see below)
model ConversationLog { ... }         // fine-tuning dataset for future self-hosted
model ServicePurchase { ... }         // consumed by spending_analytics tool
model PortfolioSnapshot { ... }       // canvas + silent analytics
model AppEvent { ... }                // chain history, canvas data
model SessionUsage { ... }            // billing enforcement + cost tracking
model SavingsGoal { ... }             // silent goal tracker (columns cleaned — see below)
model Payment { ... }                 // payment links + invoices (unified model, type field distinguishes)
model WatchAddress { ... }            // Phase E public wallet report watch list
model LinkedWallet { ... }            // Phase E multi-wallet linking
model User { ... }                    // simplified, see below
model UserPreferences { ... }         // simplified, see below
```

### Tables to simplify

```prisma
model User {
  // REMOVE: copilotConfirmedCount, lastDashboardVisitAt, emailDeliverable, onboardedAt
  // REMOVE relation fields — scheduledActions[], copilotSuggestions[], dailyBriefings[],
  //   outcomeChecks[], followUpQueue[], savingsGoalDeposits[], notificationPrefs[],
  //   notificationLog[], intentLogs[]
  // KEEP: id, suiAddress, email, emailVerified, emailVerifyToken, emailVerifyExpiry,
  //       displayName, timezoneOffset, tosAcceptedAt, createdAt, updatedAt
}

model UserPreferences {
  // REMOVE: notification pref fields (hf_alert, briefing, rate_alert, auto_compound)
  // REMOVE: allowanceId (dead field after session charge removal)
  // REMOVE: dcaSchedules JSON field (orphaned legacy cache)
  // KEEP: transaction limits, timezone, financial profile, memory toggles, contacts JSON
}

model SavingsGoal {
  // REMOVE relation: deposits SavingsGoalDeposit[]
  // REMOVE: milestone tracking fields (milestone25At, milestone50At, etc.)
  // KEEP: name, targetAmount, deadline, emoji, createdAt
}

model AdviceLog {
  // REMOVE relation: outcomeChecks OutcomeCheck[]
  // REMOVE dead columns: actionTaken, followUpDue, followUpSent, outcomeStatus
  // REMOVE dead indexes: @@index([outcomeStatus]), @@index([followUpDue])
  // KEEP columns: id, userId, sessionId, adviceText, adviceType, targetAmount,
  //   goalId, appEventId, createdAt, updatedAt
  // KEEP relation: goal SavingsGoal?  (both endpoints stay)
}

model AppEvent {
  // KEEP schema
  // DELETE rows where type IN (
  //   'copilot_suggestion_created', 'copilot_suggestion_confirmed',
  //   'copilot_suggestion_skipped', 'copilot_suggestion_expired',
  //   'copilot_suggestion_tx_failed', 'briefing', 'rate_alert',
  //   'follow_up', 'compound_available', 'schedule', 'goal_milestone'
  // )
}
```

### New table

```prisma
model AllowanceRefund {
  id             String   @id @default(cuid())
  userAddress    String
  allowanceObjId String   @unique  // unique for idempotency
  amountUsdc     Float
  txDigest       String
  refundedAt     DateTime @default(now())
  @@index([userAddress])
}
```

### Migration ordering — single file, single transaction

Prisma will reject the migration if you drop parent tables before removing relation fields. **Must be a single Prisma migration file with ordered raw SQL** — single transaction means atomic success or atomic rollback. Five separate migration files would leave the DB in an inconsistent state on partial failure.

> **This is non-negotiable. If anyone (including future-you in a hurry) suggests splitting the migration "to make it less risky" or "isolate concerns," push back. The opposite is true. Single file = single transaction = clean rollback. Splitting a 13-table migration is how you end up with a half-migrated DB at 2am with no recovery path.**

Strict order inside the single migration transaction:

1. **Step 1 — Remove relation fields:**
   - `User`: `scheduledActions[]`, `copilotSuggestions[]`, `dailyBriefings[]`, `outcomeChecks[]`, `followUpQueue[]`, `savingsGoalDeposits[]`, `notificationPrefs[]`, `notificationLog[]`, `intentLogs[]`
   - `AdviceLog`: `outcomeChecks OutcomeCheck[]`
   - `SavingsGoal`: `deposits SavingsGoalDeposit[]`
2. **Step 2** — Delete rows from `AppEvent` by type filter (raw SQL).
3. **Step 3** — Drop child tables first, in dependency order:
   - `ScheduledExecution` (child of `ScheduledAction`)
   - `FollowUpQueue`, `OutcomeCheck` — children of `AdviceLog` (which is kept). Must drop these tables before `AdviceLog`'s `outcomeChecks` relation field is removed in Step 1, otherwise Prisma will see an orphaned relation pointer.
   - `SavingsGoalDeposit` (child of `SavingsGoal`)
4. **Step 4** — Drop parent tables:
   - `ScheduledAction`, `CopilotSuggestion`, `DailyBriefing`, `IntentLog`, `NotificationPrefs`, `NotificationLog`
5. **Step 5:**
   - Alter `User` to drop columns (`copilotConfirmedCount`, `lastDashboardVisitAt`, `emailDeliverable`, `onboardedAt`)
   - Alter `UserPreferences` to drop columns (`allowanceId`, `dcaSchedules`, notification pref fields)
   - Alter `SavingsGoal` to drop milestone columns
   - Alter `AdviceLog` to drop dead columns (`actionTaken`, `followUpDue`, `followUpSent`, `outcomeStatus`) and dead indexes (`@@index([outcomeStatus])`, `@@index([followUpDue])`)
   - Create `AllowanceRefund` table

Take NeonDB snapshot before running. Test the full sequence in staging end-to-end.

---

## Engine tool removals — split engine vs Audric-local

### Engine package tools (delete from `packages/engine/src/tools/`)

| Tool | Status |
|---|---|
| `create_schedule`, `list_schedules`, `cancel_schedule` | Delete |
| `pause_pattern`, `pattern_status` | Delete |
| `allowance_status`, `toggle_allowance`, `update_daily_limit`, `update_permissions` | Delete |
| All other tools | Keep |

### Audric-local tools (delete from `audric/apps/web/lib/engine/`)

`record_advice` is **kept** as part of the AdviceLog decision. The engine-factory.ts import chain stays intact for `ADVICE_TOOLS`.

### Final tool count

Engine: `READ_TOOLS (37) + WRITE_TOOLS (12) = 49` today. After removing 9 listed engine tools = **40 engine tools**. Plus Audric-local `ADVICE_TOOLS (1) + GOAL_TOOLS (N)` depending on your count.

Verify the exact final number on Day 7 after deletion and update `PRODUCT_FACTS.md` accordingly.

---

## Cron job removals

Delete from `t2000/apps/server/src/cron/jobs/`:
- `briefings.ts`, `weeklyBriefing.ts`
- `hfAlerts.ts` (keep only real-time indexer hook for critical HF < 1.2)
- `rateAlerts.ts`
- `autoCompound.ts`
- `scheduledActions.ts`, `scheduledReminders.ts`
- `patternDetection.ts`, `copilotDetectors.ts`, `copilotDigest.ts`, `copilotExpiry.ts`
- `outcomeChecks.ts`, `anomalyDetection.ts`, `followUpDelivery.ts`
- `onboardingFollowUp.ts`

**Keep:**
- `memoryExtraction.ts` — silent chat memory
- `profileInference.ts` — silent financial profile
- `chainMemory.ts` — silent chat memory from chain data
- `portfolioSnapshot.ts` — feeds canvas + analytics

After: 4 cron jobs. All silent infrastructure.

---

## Internal API route removals

Delete from `audric/apps/web/app/api/internal/`:
- `briefings/`, `hf-alert/warn/` (keep critical path), `rate-alert-state/`
- `pattern-detection/`, `copilot-*`
- `charge/`
- `send-autonomous-email/`
- `outcome-check/`, `follow-up/`, `anomaly/`

**Keep:**
- `profile-inference/`, `memory-extraction/`, `chain-memory/`, `portfolio-snapshot/`

---

## File-level deletion list

Any file matching these paths is deleted:

```
audric/apps/web/app/setup/**
audric/apps/web/app/copilot/**
audric/apps/web/app/settings/copilot/**
audric/apps/web/app/action/**
audric/apps/web/components/copilot/**
audric/apps/web/components/briefing/**
audric/apps/web/components/engine/cards/ProposalCard.tsx
audric/apps/web/components/engine/cards/AllowanceCard.tsx
audric/apps/web/components/dashboard/CopilotSuggestionsRow.tsx
audric/apps/web/components/dashboard/BriefingCard.tsx
audric/apps/web/components/dashboard/HfWidget.tsx
audric/apps/web/components/dashboard/InsightCard.tsx
audric/apps/web/components/dashboard/MilestoneCard.tsx
audric/apps/web/components/dashboard/ContextualChips.tsx
audric/apps/web/components/dashboard/GracePeriodBanner.tsx
audric/apps/web/hooks/useAllowanceStatus.ts
audric/apps/web/hooks/useOvernightBriefing.ts
audric/apps/web/hooks/useCopilot*.ts
audric/apps/web/lib/copilot/**
audric/apps/web/lib/allowance/**
audric/apps/web/lib/outcome-checks/**
packages/engine/src/tools/autonomy.ts
packages/engine/src/tools/copilot*.ts
packages/engine/src/tools/schedule.ts
t2000/apps/server/src/cron/jobs/[per deletion list above]
t2000/apps/server/src/intent/**
packages/sdk/src/allowance/**
packages/contracts/sources/allowance.move  (AFTER refund script runs)
```

**NOT deleted** (per AdviceLog decision):
- `audric/apps/web/lib/engine/advice-tool.ts`
- `audric/apps/web/lib/advice/**`
- Any `buildAdviceContext` or `record_advice` references

Expected diff: ~14,000 lines deleted, ~600 lines added.

---

## Execution sequence — 15 days [v1.4 — Phase B added]

**Phase A — Code & schema deletion (Days 1-12).** Removes the implementation.
**Phase B — Alignment sweep (Days 13-15)** [v1.4]. Aligns every external surface (READMEs, docs, websites, skills, MCP, briefings) with what the chat actually does.

The simplification isn't real until Phase B is done. Without it, you've shipped a simplified product behind documentation, marketing copy, and skill files that still claim Audric does scheduled actions, morning briefings, and copilot suggestions. Day 12's docs bullet in v1.3 was massively under-scoped — there are 3 repos, 5+ READMEs, ~10 skill files, MCP tool descriptions, two marketing websites, and the Mysten Labs briefing all needing review. **Phase B owns all of that.**

[v1.4] **Comms email moved from Day 12 to end of Day 15** — sending the honesty email before external surfaces match it would turn the email's strength into a credibility hit. Users would click through to audric.ai and read a homepage that still advertises scheduled actions.

Each day is a single PR that deploys independently unless marked atomic.

---

## Phase A — Code & schema deletion (Days 1-12)

### Day 1 — Audit + snapshot
- ✅ **Task 0 (already complete):** `treasury.move` independence verified.
- Tag current prod as `pre-simplification-v1` for rollback reference.
- Export baseline: user count, session count, active allowance object list, pending copilot suggestion count. Save to `spec/simplification-baseline.md`.
- CSV export of `AppEvent` for audit.
- Enumerate all User, AdviceLog, and SavingsGoal relation fields in current schema for Day 5 migration planning.
- [v1.4] **Generate Phase B alignment manifest** — run grep sweep across both repos for stale feature references. Save to `spec/alignment-manifest.md`. This becomes the working checklist for Days 13-15.

### Day 2 — Refund script
- Write `scripts/refund-allowances.ts` with idempotency checks:
  - Query on-chain allowances with `balance > 0`
  - Check `AllowanceRefund` table for existing `allowanceObjId` — skip if found
  - Insert `AllowanceRefund` row *before* calling on-chain `withdraw()`
  - Retry 3× with exponential backoff on failure
- Test against testnet deployment.
- Dry-run against mainnet (simulate, don't execute).
- Run live for ~10–20 users.
- Email affected users via **direct Resend call** — not via `notification-users` route (which is being deleted).

### Day 3 — Disable surfaces
- Single PR: remove all non-chat dashboard components from render tree (stop importing, don't delete files yet). Dashboard is now chat-only.
- **Replace `/copilot/confirm/[id]` route with friendly redirect** — returns a simple page: "We've simplified Audric. Your confirmation link is no longer needed. [Open Audric →]" Route still exists but returns 200 with degraded UI. Prevents 500s from in-flight email clicks.
- Disable all crons except the 4 keepers (comment out EventBridge rules; don't delete infra yet).
- Disable `/api/internal/charge` (returns 410 Gone).
- Disable all notification Resend sends (no-op wrapper).
- User-visible day. Ship early in local day for debugging headroom.

### Day 4 — Billing cutover
- Rewrite the allowance branching block at `chat/route.ts:96-122` (not just remove `chargeSession()` — the whole `hasAllowance` branch goes).
- Implement rolling-24h **distinct-session** count using the `groupBy` pattern from billing section.
- Enforcement tiers: 5 sessions unverified, 20 verified.
- 429 response with verification CTA for unverified users.
- Remove all code references to `allowanceId` field on `UserPreferences`. **Leave the column in the DB — do NOT edit `schema.prisma` until Day 5.** Prisma will continue to generate the field as dead weight on the type until the schema changes; that's expected and fine for one day.
- Remove `GracePeriodBanner` from render tree.
- Deploy.

### Day 5 — Schema migration
- Write a **single Prisma migration file** with ordered raw SQL per the 5-step sequence above. Single file = single transaction = atomic success or atomic rollback.
- NeonDB snapshot before running.
- Apply in staging first (dry-run the full sequence end-to-end).
- Apply to prod after hours.
- Smoke test: new session, send message, check balance, save $1, check activity feed, verify AdviceLog still writes, verify savings goal CRUD still works.

### Day 6 — Code deletion pass 1 (Audric)
- Delete all files in the Audric deletion list.
- `advice-tool.ts` and `lib/advice/**` are NOT deleted — they stay per AdviceLog decision.
- Delete unused imports, orphan utility functions, orphan types.
- `pnpm typecheck` + `pnpm lint` must pass. Unit tests must pass.
- Pure deletion — zero feature regressions.

### Day 7 — Code deletion pass 2 (engine) — atomic deploy
- **Atomic 2-repo coordinated deploy:**
  1. Publish new `@t2000/engine` version with removed tools (9 tools cut). Note the exact published version string (e.g. `0.37.0`).
  2. **Wait for npm registry propagation** — monitor the GitHub release notification, then verify with `npm view @t2000/engine version` before proceeding. Registry propagation takes 10–15 minutes; running `pnpm add` before propagation pulls the previous version and breaks the atomic guarantee.
  3. **Pin to the exact version, not @latest** — run `pnpm add @t2000/engine@0.37.0` (or whatever the exact version is) in Audric. Do NOT use `@latest` even after propagation — `@latest` introduces a race condition where a higher version published by anyone (including a CI cron) between your publish and your `pnpm add` would be pulled instead. Pin the exact version you just published.
  4. Update `engine-factory.ts` imports (if any changes needed).
  5. Deploy Audric.
- Minor version bump on engine. Document in changelog.
- **Do not split across multiple days** — a broken `main` between engine publish and Audric bump is unacceptable.

> **Pre-prepare the Audric branch before Day 7.** Have the `package.json` change with the exact pinned version ready in a branch, plus any `engine-factory.ts` import updates. When the engine publishes and propagation confirms, you only need to commit, push, and deploy. Day 7 is the most fragile day in the sequence — preparation eliminates the window where main is broken.

### Day 8 — Code deletion pass 3 (server + SDK)
- Delete cron job files from t2000 server.
- Delete internal API routes from Audric.
- Delete unused SDK methods (allowance, intent — not advice).
- Verify `@suimpp/mpp` digest reporting isn't tied to deprecated flows (expected: independent).
- Bump SDK version and publish.

### Day 9 — Contract cleanup
- Verify zero allowance objects with non-zero balance remain (on-chain query).
- Delete `allowance.move` from contracts source directory.
- **Do NOT redeploy the Move package.** The module remains on-chain but is gone from the source of truth.
- [v1.4] Doc updates moved to Phase B Day 13 — keep this day code-only.

### Day 10 — Settings reorg
- Reorganize into 5 sections (Passport, Safety, Memory, Goals, Contacts).
- Remove all deleted settings controls.
- Test every remaining setting end-to-end.
- Update ToS content: remove fee sections for briefings/alerts/sessions. Add daily-free billing section.
- **Do NOT clear `tosAcceptedAt`.** The ToS changes are housekeeping (simpler billing, fewer fees) — not material enough to force re-acceptance. The comms email on Day 15 [v1.4] serves as notice. If your lawyer disagrees after reviewing the new ToS, add a re-accept modal in a follow-up PR.

### Day 11 — Dashboard polish
- Implement chat-first dashboard (Option A) as the real thing — no stale code behind it.
- Greeting animation on empty state, slides out on first message.
- HF widget inline in header only when debt AND HF < 2.0.
- Balance pinned on scroll.
- Mobile responsiveness pass.

### Day 12 — Internal smoke test + Phase B kickoff [v1.4 — repurposed]
- Full end-to-end smoke test: chat works, save/send/swap/borrow/repay all execute, balance updates, activity feed populates, AdviceLog writes, savings goals CRUD, settings load.
- Verify Phase A success criteria (see below) hit before Phase B starts.
- Re-run the alignment manifest grep from Day 1 — note any new stale references introduced by Days 6-11 deletions.
- Commit `spec/alignment-manifest-day12.md` snapshot for Phase B baseline.
- Phase A complete. Phase B starts tomorrow.

---

## Phase B — Alignment sweep (Days 13-15) [v1.4]

### Why this phase exists

The first 12 days delete code, schema, and infra. They do not touch the **surface area of truth** — the dozens of files across repos that *describe* what Audric does. Without Phase B, you ship a simplified product behind documentation, READMEs, marketing copy, and skill files that still claim Audric does scheduled actions, morning briefings, and copilot suggestions. New users land on `audric.ai`, read a feature list that lies, sign up, and find nothing matches.

The cost of skipping this phase isn't technical debt — it's a credibility leak that contradicts the entire honesty thesis of the simplification. Phase B is what makes the simplification real on every surface a user, contributor, or partner ever sees.

### Day 13 — Internal documentation + READMEs

**t2000 repo (root + packages):**
- `README.md` — remove scheduled actions, copilot, briefings from feature list. Update tool counts.
- `CLAUDE.md` — remove "Built-in tools" lines for deleted tools; remove autonomy section if any
- `PRODUCT_FACTS.md` — exact tool count from Day 7, remove allowance section, remove scheduled action section, rewrite billing section
- `ARCHITECTURE.md` — remove copilot architecture diagrams, autonomous action loop, allowance flow, scheduled action flow. Keep silent infra (memory, profile, chain memory, portfolio snapshots).
- `audric-roadmap.md` — archive Phases 3-H, mark "Simplification" as current state
- `audric-build-tracker.md` — close out Phase H, mark Simplification phase complete (will already have entries from this spec — see `audric-build-tracker.md` Simplification section)
- `AUDRIC_2_SPEC.md` → move to `spec/archive/AUDRIC_2_SPEC.md` with header: "Historical document. Superseded by AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md."
- `packages/sdk/README.md` — remove allowance methods from method table
- `packages/cli/README.md` — remove `t2000 schedule`, `t2000 copilot` if they exist; remove allowance setup commands
- `packages/engine/README.md` — update tool count, remove deleted tools from list
- `packages/mcp/README.md` — remove deleted tool entries from the tool table
- `packages/contracts/README.md` — note allowance module is dormant; treasury independent

**audric repo:**
- `README.md` — feature list audit
- `CLAUDE.md` — remove copilot/autonomy/scheduled-action references; update Phase status
- `apps/web/README.md` — if it lists features, update
- `apps/web/app/(legal)/terms/page.tsx` — remove fee sections; add daily-free billing language
- `apps/web/app/(legal)/privacy/page.tsx` — remove references to notification preferences, autonomous actions
- `apps/web/app/(legal)/security/page.tsx` — remove allowance contract claims if present

**gateway/suimpp (sanity check only):**
- `apps/gateway/README.md` — verify no references to Audric features (gateway is independent infrastructure; expected: no changes needed)
- `@suimpp/mpp` README — same sanity check

**New doc to create:**
- `spec/SIMPLIFICATION_RATIONALE.md` — one-page explanation of what was deleted and why, written for future-you and future collaborators. This is the doc someone reads in 6 months when they ask "wait, why didn't we ever do scheduled actions?"

**Acceptance criterion for Day 13:** running the grep manifest from Day 1 returns zero matches in `**/*.md` files for any of the deleted feature keywords (excluding the rationale doc and the archived spec).

### Day 14 — External surfaces (websites + skills + MCP)

**t2000.ai marketing website (`apps/web` in t2000 repo):**
- Homepage / landing copy — feature list, hero sections, "what t2000 does" blocks
- Terminal demo (`TabbedTerminal.tsx` and any related demo components) — remove tabs/scenarios that show scheduled actions, copilot, briefings
- Pricing/billing page — rewrite for daily-free model
- Docs section — remove anything pointing to deleted features
- Footer + nav links — remove links to deleted product pages

**audric.ai consumer website (`apps/web` in audric repo, marketing pages):**
- Hero copy — "Audric is your conversational agent for money" — verify it doesn't promise autonomy
- Features grid — remove cards for scheduled actions, briefings, copilot, auto-compound
- "How it works" sections — rewrite around the chat-first thesis
- FAQ — remove questions about the features budget, allowance setup, scheduled actions
- Pricing page (if separate) — daily-free model
- Any blog posts / changelog entries that prominently advertise removed features — add deprecation note linking to changelog post

**Agent skills (`t2000-skills/skills/`):**
- Delete entire skill directories for removed tools:
  - `t2000-create-schedule/`, `t2000-list-schedules/`, `t2000-cancel-schedule/`
  - `t2000-allowance-status/`, `t2000-toggle-allowance/`, `t2000-update-daily-limit/`, `t2000-update-permissions/`
  - `t2000-pause-pattern/`, `t2000-pattern-status/`
- Update remaining skill files where they mention deleted tools as related/companion skills
- `t2000-mcp/SKILL.md` — full tool table refresh with new count

**MCP tool descriptions (`packages/mcp/src/tools/`):**
- Remove tool registrations for the 9 deleted engine tools
- Audit remaining tool descriptions for any text mentioning "schedule," "auto-compound," "morning briefing"
- Republish MCP package after Day 8 SDK release goes out

**Acceptance criterion for Day 14:** click through every public page on audric.ai and t2000.ai. Zero references to deleted features. Every feature mentioned is something you can actually do in the chat.

### Day 15 — External briefings + final cross-repo verification + comms send

**External briefings to update:**
- Mysten Labs briefing doc (`article-trust-layer.md` and any handoff docs) — rewrite sections that describe autonomous architecture, scheduled actions, copilot. Frame the simplification honestly: "we removed autonomy theatre because zkLogin can't sign without user presence."
- Any pitch decks, investor updates, partner one-pagers — flag for revision (out of scope for this PR but list them in `spec/external-comms-todo.md`)
- Discord / Telegram pinned messages — update if any mention removed features
- npm package descriptions on registry — `@t2000/cli`, `@t2000/sdk`, `@t2000/engine`, `@t2000/mcp` — rewrite if they advertise removed features

**Final cross-repo verification (the "anyone could find it" sweep):**

```bash
# Run in each repo (t2000, audric)
rg -i "scheduled action|morning briefing|copilot suggest|auto.?compound|allowance.{0,20}top.?up|rate alert" \
   --type-add 'docs:*.{md,mdx,txt}' --type docs

# Run in each repo for code that might have stale comments
rg -i "TODO.*schedule|FIXME.*copilot|HACK.*allowance" \
   --glob '!node_modules'

# Verify no orphaned imports of deleted tools
rg "create_schedule|allowance_status|pause_pattern|record_advice" \
   --type ts --glob '!*.test.ts'
```

Any matches found here = bug. Either an alignment miss from Day 13/14 or a code deletion miss from Days 6-8.

**Final tasks:**
- Take post-simplification grep snapshot and diff against pre-simplification snapshot (Day 1). Store in `spec/alignment-manifest-final.md`
- Update `audric-build-tracker.md` to mark Phase Simplification + Phase B both complete
- **Send the user comms email via direct Resend call** (template in Appendix A) — only after every external surface matches the message
- Post the changelog post

**Acceptance criterion for Day 15:** zero stale references in any repo, any markdown, any website page, any skill, any MCP tool description. The product description in every surface matches what the chat actually does. The comms email link-throughs all hit pages that confirm the email's claims.

---

Total: **15 days solo (12 days execution + 3 days alignment).**

> **The Day 15 comms email is your strongest user-facing artifact.** Don't water it down or make it more "professional" in the moment. The honesty in Appendix A is the differentiation — most fintechs would never tell users "we built reminders dressed up as agents and that wasn't honest." Ship it as-is, after every surface confirms it.

---

## Documentation updates summary

This section is now a top-level summary; per-file detail lives in Phase B Day 13.

| File | Repo | Day | Action |
|---|---|---|---|
| `audric-roadmap.md` | t2000 | 13 | Archive Phases 3-H, mark "Simplification" as current state |
| `audric-build-tracker.md` | t2000 | 13 (close) + 15 (mark Phase B done) | Update Simplification phase status |
| `AUDRIC_2_SPEC.md` | t2000 | 13 | Move to `spec/archive/`, add historical header |
| `PRODUCT_FACTS.md` | t2000 | 13 | Tool count, billing, allowance section |
| `ARCHITECTURE.md` | t2000 | 13 | Remove copilot/autonomy/allowance flows |
| `CLAUDE.md` (both repos) | both | 13 | Remove deleted-feature references |
| `README.md` (root + per-package) | both | 13 | Feature list audit |
| `spec/REASONING_ENGINE.md` | t2000 | — | Keep — engine layer untouched |
| `spec/SIMPLIFICATION_RATIONALE.md` | t2000 | 13 | NEW — created in this phase |
| `spec/alignment-manifest.md` | t2000 | 1 | NEW — created Day 1, used Days 13-15 |
| `spec/alignment-manifest-final.md` | t2000 | 15 | NEW — diff snapshot |
| `t2000.ai` website | t2000 | 14 | Marketing copy + terminal demo |
| `audric.ai` website | audric | 14 | Marketing copy + features grid + FAQ |
| `t2000-skills/skills/*` | t2000 | 14 | Delete obsolete skills + refresh tool table |
| `packages/mcp/src/tools/*` | t2000 | 14 | Remove deleted tool registrations |
| `article-trust-layer.md` + Mysten briefings | t2000 | 15 | Rewrite to reflect honest scope |
| Legal pages (`/terms`, `/privacy`, `/security`) | audric | 13 | Remove fee sections, add daily-free language |

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Treasury contract couples to allowance | ✅ Verified independent |
| User with large allowance balance slips through refund | Script logs every call with idempotency; `AllowanceRefund` table as audit trail; unique constraint prevents double-processing; manual support recovery path |
| User asks where their morning briefing went | Proactive comms email Day 15 [v1.4 — moved from Day 12] |
| Regression in chat flow from over-aggressive deletion | Unit tests + smoke test Day 5 + full E2E Day 12 |
| In-flight copilot email clicks after Day 3 cutover | `/copilot/confirm/[id]` returns friendly redirect page, not 500 |
| Anthropic cost spike from removing paywall | **Three layers of defense:** (1) existing IP rate limit at 20 req/min bounds adversarial single-source abuse; (2) CostTracker projection alert when monthly spend trends >$500 triggers manual review; (3) global kill-switch env var `AUDRIC_PAUSE_CHAT=true` returns 503 "Audric is temporarily unavailable" — flip manually if cost runs away |
| Prisma migration data loss | NeonDB snapshot before migration; staging dry-run; single-file transaction migration (atomic rollback on failure) |
| Refund script crash mid-run causes double-processing | Idempotency: unique constraint on `allowanceObjId`; insert `AllowanceRefund` row *before* on-chain withdraw; startup check against existing rows |
| Broken main between engine publish and Audric bump | Day 7 is atomic coordinated deploy with explicit npm propagation wait + exact version pin (not `@latest`) |
| Day 4 typecheck confusion re: `allowanceId` | Expected behavior — Prisma generates the field as dead weight until Day 5 schema edit. Don't touch `schema.prisma` on Day 4. |
| [v1.4] Stale marketing copy contradicts the honesty email | Phase B (Days 13-15) explicitly aligns all external surfaces before email send; comms email moved to end of Day 15 |
| [v1.4] Skill files / MCP descriptions advertise deleted tools | Day 14 skill + MCP audit; Day 15 grep manifest as gate |
| [v1.4] Future contributors find inconsistent docs and revert deletions | `spec/SIMPLIFICATION_RATIONALE.md` is the canonical "why" doc, created Day 13 |

---

## Success criteria

**Phase A (Days 1-12) complete when:**
- Dashboard has 4 elements above the fold (balance, greeting, chat input, chip bar)
- Zero user-facing proactive notifications except critical HF email at HF < 1.2
- App code LOC reduced >35%
- Prisma schema table count reduced >30%
- 4 cron jobs remaining (memory extraction, profile inference, chain memory, portfolio snapshot)
- Daily-free billing live with correct distinct-session counting, CostTracker green
- `AllowanceRefund` table populated; zero allowance objects with non-zero balance on-chain
- `AdviceLog` and `ConversationLog` populated and feeding chat context as silent memory

**Phase B (Days 13-15) complete when:** [v1.4]
- `PRODUCT_FACTS.md` tool count reflects actual final count (verified Day 7, written Day 13)
- Final grep sweep across both repos returns zero stale feature references in `*.md`, `*.mdx`, skill files, MCP tool descriptions, or marketing pages (excluding archived/rationale docs)
- audric.ai homepage feature list matches what the chat actually does
- t2000.ai homepage feature list matches deployed engine tool count
- 9 obsolete skill directories deleted from `t2000-skills/skills/`
- MCP tool table re-published reflecting 40 engine tools
- `spec/SIMPLIFICATION_RATIONALE.md` exists and explains the delete decisions
- Mysten Labs briefing doc (`article-trust-layer.md`) reflects honest scope
- User comms email sent and link-through pages confirm the email's claims

---

## Appendix A — User comms email template (sent end of Day 15)

**Subject:** `We made Audric simpler.`

```
Hey —

We've made Audric simpler.

What's still here: the chat. Save, send, swap, borrow, repay, check
your balance, understand your wallet — all by asking.

What's gone: morning briefings, scheduled actions, copilot
suggestions, rate alerts, auto-compound, and the features budget.
They looked like autonomy, but under the hood Audric can't sign
transactions on your behalf — so what shipped was reminders dressed
up as agents. That wasn't honest, so we removed it.

What this means for you:
- Your wallet, savings, and on-chain funds are unchanged. Nothing
  moved except your features budget, which we returned to your
  wallet. You'll see USDC back at 0x{address}.
- Your goals are still here, tracked silently.
- Audric still knows you — financial profile, conversation memory,
  and your past decisions are intact. Just no more emails.
- If you had debt with a low health factor, you'll still get one
  email if it drops below 1.2. That's the only notification we send.

What's next: better onramp flow (buy USDC with a card), then
cross-chain USDC. The chat keeps getting better. That's the
product.

Tap in any time.

— Funkii
```

Sent via direct Resend call. Do NOT route through `notification-users` API (deleted by Day 8).

---

## Appendix B — Kick-off command list (Day 1)

```bash
# Task 0 verification (already complete, re-run to confirm)
cd packages/contracts
grep -rn "use t2000::allowance" sources/
grep -rn "Allowance" sources/treasury.move
# Expected: zero matches

# Tag rollback point
git tag pre-simplification-v1
git push origin pre-simplification-v1

# Baseline export
cd audric
pnpm tsx scripts/export-baseline.ts > spec/simplification-baseline.md

# Enumerate relation fields for Day 5 planning
grep -B 1 "@relation" apps/web/prisma/schema.prisma | grep -E "model (User|AdviceLog|SavingsGoal)" -A 50

# [v1.4] Generate Phase B alignment manifest — grep across both repos
cd /Users/funkii/dev/t2000
rg -l "scheduled action|morning briefing|copilot|auto.?compound|allowance|rate alert|features budget" \
   --glob '!node_modules' --glob '!*.lock' --glob '!.git' \
   > spec/alignment-manifest-t2000.txt

cd /Users/funkii/dev/audric
rg -l "scheduled action|morning briefing|copilot|auto.?compound|allowance|rate alert|features budget" \
   --glob '!node_modules' --glob '!*.lock' --glob '!.git' \
   > /Users/funkii/dev/t2000/spec/alignment-manifest-audric.txt

# Combine into spec/alignment-manifest.md as Phase B working checklist
```

---

## Appendix C — Refund script pseudocode

```typescript
// scripts/refund-allowances.ts

import { PrismaClient } from '@prisma/client';
import { SuiClient } from '@mysten/sui/client';

async function refundAll() {
  const allowances = await queryAllAllowancesOnChain();  // balance > 0

  for (const allowance of allowances) {
    // Idempotency check (unique constraint is the real gate, this is early-exit)
    const existing = await prisma.allowanceRefund.findUnique({
      where: { allowanceObjId: allowance.objId },
    });
    if (existing) {
      console.log(`Skipping ${allowance.objId} — already refunded`);
      continue;
    }

    // Insert refund row BEFORE on-chain call
    const refundRow = await prisma.allowanceRefund.create({
      data: {
        userAddress: allowance.owner,
        allowanceObjId: allowance.objId,
        amountUsdc: allowance.balance,
        txDigest: 'pending',
        refundedAt: new Date(),
      },
    });

    // On-chain withdraw with retry
    try {
      const digest = await withdrawAllowanceWithRetry(allowance, 3);
      await prisma.allowanceRefund.update({
        where: { id: refundRow.id },
        data: { txDigest: digest },
      });

      // Email user via direct Resend
      await sendRefundEmail(allowance.owner, allowance.balance);
    } catch (err) {
      // Leave the DB row with txDigest='pending' for manual review
      console.error(`Failed ${allowance.objId}:`, err);
    }
  }
}
```

---

## Decisions log (for future reference)

| Decision | Choice | Rationale |
|---|---|---|
| Dashboard shape | Option A (chat-first, 4 elements above fold) | Matches Claude/ChatGPT; self-enforcing against future accretion |
| Billing model | Daily-free (5 unverified, 20 verified) per rolling 24h, distinct sessions | Cliff-free, uses existing SessionUsage table, no custody questions |
| Email verification gate | Yes — gates 5→20 session tier | Reduces abuse, doubles as verification funnel |
| Existing user state | Delete entirely (goals, copilot, schedules) | Simpler than migration at 10–20 users |
| Morning briefing | Delete entirely | Simplification is the point |
| Canvas system | Keep inline rendering | Genuine differentiator, conversational insights |
| Allowance contract | Refund script returns all balances, contract dormant | Clean break, preserves non-custodial story |
| Execution pace | Straight 12-day march, no observation window | Focused cutover, then alignment sweep |
| AdviceLog + record_advice | Keep — silent chat memory, not telemetry | Preserves "remember our last conversation" capability; deletes only outcome-check surfaces |
| ConversationLog | Keep — fine-tuning dataset for self-hosted | Cheap to keep, expensive to restart collection |
| ToS re-acceptance | Skip — no material change | Comms email is sufficient notice |
| Cost backstop | 3 layers: existing IP rate limit (20/min) + CostTracker alert + global kill-switch | Adversarial single-user abuse bounded by IP limit; no per-user layer needed |
| [v1.4] Phase B alignment sweep | 3-day phase covering all external surfaces | Without it, simplified product ships behind documentation that lies; honesty thesis is undermined |
| [v1.4] Comms email timing | Send end of Day 15, not Day 12 | Email's strength is honesty; surfaces it links to must match before send |

---

## v1.4 changelog

Patches applied after v1.3 review:

1. **Phase B added (Days 13-15)** — full alignment sweep across t2000, audric, gateway repos covering READMEs, docs, websites, skills, MCP descriptions, legal pages, external briefings. Closes the credibility gap between deleted code and stale documentation.
2. **Day 12 repurposed** — was "docs + comms" (under-scoped), now "internal smoke test + Phase B kickoff + alignment manifest snapshot."
3. **Day 9 narrowed** — removed doc updates from Day 9 (moved to Phase B Day 13). Day 9 is code-only contract cleanup.
4. **Comms email moved Day 12 → Day 15** — sending the honesty email before external surfaces match it would create a credibility hit. Email now ships only after audric.ai, skills, and MCP all reflect the simplified product.
5. **Day 1 expanded** — generates `spec/alignment-manifest.md` baseline using grep sweep across both repos. Becomes the working checklist for Phase B.
6. **New docs added to outputs** — `spec/SIMPLIFICATION_RATIONALE.md` (created Day 13, the "why" doc for future contributors), `spec/alignment-manifest.md` (created Day 1, the working checklist), `spec/alignment-manifest-final.md` (created Day 15, diff snapshot proving zero stale references).
7. **Documentation updates table consolidated** — single summary table at top level, per-file detail lives in Phase B Day 13. Includes new website + skill + MCP rows.
8. **Risk table extended** — three new rows for Phase B-class risks (stale marketing contradicts email, skill/MCP descriptions advertise deleted tools, future contributors revert deletions).
9. **Success criteria split** — Phase A criteria vs Phase B criteria. Phase B criteria are concrete (zero grep matches, X skill dirs deleted, MCP tool table refreshed, comms email sent).
10. **Decisions log extended** — Phase B decision documented with rationale; comms email timing decision documented.

---

*Spec locked at v1.4. Execution-ready (final). Total 15 days solo. Next workstream: Audric Pay v1 — onramp.money integration, receive polish, CCTP research spike.*
