# audric — Financial Feedback Loop & Memory Architecture

*Addendum to `audric-roadmap.md` and `audric-security-specs.md`*

*Version 1.2 · April 2026 · Confidential*

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| 1.0 | Apr 2026 | Initial spec |
| 1.1 | Apr 2026 | Fix: regex classifier → structured engine events. Fix: goal progress uses deposit ledger not total balance. Fix: anomaly detection moved to daily cadence. Fix: notification fatigue cap added. Fix: ActionRecord merged into AppEvent. Fix: engine context injection added. Fix: multiple advice records per turn, 500-char limit. |
| 1.2 | Apr 2026 | Fix: `outcomeStatus` state machine — `completed` now reachable for goals that hit target and save advice that was acted on. Fix: `abandoned` now reachable for goals with passed deadlines and advice with no action after 2× follow-up window. Fix: emission mechanism clarified — `record_advice` tool (permission: auto) replaces custom event type, uses existing tool-call mechanism for structured validated input. Outcome checker query updated to re-evaluate `off_track` records and skip `completed`/`abandoned`. |

---

## Overview

This spec defines the financial feedback loop: the system by which Audric remembers what it has advised, verifies whether that advice led to real outcomes, and proactively closes the loop with the user. It is the architectural foundation for Audric's core moat — a financial AI that can prove its advice worked, with onchain receipts.

The loop has three layers:

1. **Memory** — structured long-term storage of advice, actions, and goals (Postgres), injected back into the engine's context window so Audric can reference its own prior recommendations in conversation
2. **Outcome measurement** — verified against Sui onchain state, not just inferred
3. **Proactive follow-up** — context-aware re-engagement, triggered by schedule or anomaly, with per-user daily caps to prevent fatigue

This is distinct from the existing notification infrastructure (Phase 1.1). Notifications are event-triggered (briefing, HF alert, yield change). The feedback loop is *outcome-triggered* — it fires when something Audric advised either happened or didn't. These systems share delivery infrastructure (Resend, ECS cron) but serve different purposes.

---

## Architecture context

### What already exists (do not duplicate)

| Component | Location | Role |
|---|---|---|
| Redis sessions | `audric/apps/web` | Conversation state, active intent |
| Postgres (NeonDB) | `audric/apps/web` | User records, goals, briefings, activity |
| `ConversationLog` table | Phase 0.1 | Per-turn message + tool call logging |
| `DailyBriefing` table | Phase 1.3 | Morning briefing store + dismiss state |
| `NotificationLog` table | Phase 1.1 | Notification send history + dedup |
| `AppEvent` table | Phase 1.6 | Onchain activity feed — **extended in this spec** |
| `SavingsGoal` table | Phase 1.4 | User-set goals with target + deadline |
| `SessionUsage` table | Phase 0.1 / CostTracker | Per-invocation token + cost tracking |
| ECS cron (hourly) | Phase 1.1 | EventBridge → Fargate batch processor |
| Sui RPC | `packages/sdk` | Onchain balance, tx, NAVI position queries |

### What this spec adds

| Component | Purpose |
|---|---|
| `AdviceLog` table | Records every piece of advice Audric gives, with follow-up trigger |
| `SavingsGoalDeposit` table | Tracks USDC deposits attributed to a specific goal (separate from total balance) |
| `AppEvent` extensions | Adds `adviceLogId`, `goalId`, `suiTxVerified`, `source` to existing table — replaces a separate ActionRecord |
| `OutcomeCheck` table | Stores outcome measurements from Sui verification |
| `FollowUpQueue` table | Pending follow-ups with per-user daily cap enforcement |
| `advice_given` engine event | Structured engine output replacing post-hoc regex classification |
| Engine context injection | Past advice injected into system prompt each turn so Audric can reference its own history |
| Outcome checker (ECS daily) | Daily batch comparing Postgres state to Sui state |
| Follow-up generator | Produces contextual re-engagement messages |

**Key design principles:**

- **Advice and actions are separate records.** Audric sometimes advises but does not act (user declines). It sometimes acts without explicit prior advice (automated rule execution). Tracking them independently enables accurate outcome attribution.
- **AppEvent is the single audit trail.** There is no separate ActionRecord table. AppEvent is extended with advisory context fields so the same row serves both the activity feed and the feedback loop. Two parallel audit trails for the same transactions would drift.
- **The engine is the source of truth for advice classification.** Post-hoc regex on assistant output is replaced by structured `advice_given` events emitted by the engine itself. The LLM knows when it's recommending an action vs answering a question — let it signal that explicitly.

---

## Data model

### 1. AdviceLog — every recommendation Audric makes

```prisma
model AdviceLog {
  id              String       @id @default(cuid())
  userId          String
  sessionId       String       // links to ConversationLog session
  adviceText      String       // plain English summary, max 500 chars
  adviceType      String       // save | send | borrow | repay | swap | goal | rate | general
  targetAmount    Float?       // USDC amount referenced, if applicable
  goalId          String?      // links to SavingsGoal if advice is goal-related
  actionTaken     Boolean      @default(false)
  appEventId      String?      // links to AppEvent if action followed
  followUpDue     DateTime?
  followUpSent    Boolean      @default(false)
  outcomeStatus   String       @default("pending") // pending | on_track | off_track | completed | abandoned
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  user            User         @relation(fields: [userId], references: [id])
  goal            SavingsGoal? @relation(fields: [goalId], references: [id])

  @@index([userId])
  @@index([outcomeStatus])
  @@index([followUpDue])
  @@index([createdAt])
}
```

**When to write:** The engine emits one or more `advice_given` events per turn (see Engine Integration section). Each event item maps to one `AdviceLog` row. Multiple advice records per turn are supported — a turn that suggests both saving idle USDC and repaying debt writes two rows.

**`followUpDue` values by advice type:**

| Advice type | Default follow-up window |
|---|---|
| Save (one-time) | 48 hours |
| Save (recurring / goal) | 7 days |
| Repay debt | 24 hours |
| Yield optimisation | 7 days |
| General financial | 14 days |

---

### 2. SavingsGoalDeposit — goal progress ledger

Goal progress must be tracked independently from total savings balance. A user with $500 in savings and a $200 "vacation fund" goal would show 250% complete if progress used total balance. This table records USDC deposits explicitly attributed to a specific goal.

```prisma
model SavingsGoalDeposit {
  id          String      @id @default(cuid())
  goalId      String
  userId      String
  amountUsdc  Float
  appEventId  String?     // links to AppEvent tx that funded this deposit
  createdAt   DateTime    @default(now())

  goal        SavingsGoal @relation(fields: [goalId], references: [id])
  user        User        @relation(fields: [userId], references: [id])

  @@index([goalId])
  @@index([userId])
}
```

**Goal progress calculation:**

```typescript
// Correct — uses deposit ledger, not total balance
const deposits = await db.savingsGoalDeposit.aggregate({
  where: { goalId: goal.id },
  _sum: { amountUsdc: true },
});
const progress = (deposits._sum.amountUsdc ?? 0) / goal.targetAmount;
```

**When to write:** When a user saves USDC and a `goalId` is present in the engine event context (because the save was goal-directed), write a `SavingsGoalDeposit` row alongside the `AppEvent` row. The `goalId` comes from the `advice_given` event or from the user explicitly naming a goal in their message.

---

### 3. AppEvent extensions — single audit trail

The existing `AppEvent` table (Phase 1.6) is extended with four fields to support the feedback loop. There is no separate `ActionRecord` table.

```prisma
// Addition to existing AppEvent model in schema.prisma
model AppEvent {
  // ... existing fields unchanged ...

  // New fields for feedback loop (all nullable or defaulted — no backfill required)
  adviceLogId   String?   // links to AdviceLog if this action followed advice
  goalId        String?   // links to SavingsGoal if goal-related
  suiTxVerified Boolean   @default(false)
  source        String    @default("chat") // chat | chip | scheduled | auto_compound | dca

  @@index([adviceLogId])  // add to existing indexes
  @@index([goalId])
}
```

**Append-only rule:** AppEvent rows are never deleted. `suiTxVerified` is the only field updated after the initial write, set to `true` once the outcome checker confirms the tx onchain.

---

### 4. OutcomeCheck — verified outcome measurements

```prisma
model OutcomeCheck {
  id            String    @id @default(cuid())
  userId        String
  adviceLogId   String
  checkType     String    // savings_delta | goal_progress | debt_change | rate_change
  expectedValue Float?
  actualValue   Float?
  deltaUsdc     Float?
  onTrack       Boolean?  // null = inconclusive
  suiQueryAt    DateTime
  createdAt     DateTime  @default(now())

  user          User      @relation(fields: [userId], references: [id])
  advice        AdviceLog @relation(fields: [adviceLogId], references: [id])

  @@index([userId])
  @@index([adviceLogId])
}
```

---

### 5. FollowUpQueue — pending proactive messages

```prisma
model FollowUpQueue {
  id              String    @id @default(cuid())
  userId          String
  triggerType     String    // scheduled | anomaly | goal_milestone | off_track
  adviceLogId     String?
  outcomeCheckId  String?
  message         String
  ctaType         String?   // save | repay | goal_deposit | rate_switch | none
  ctaAmount       Float?
  priority        String    @default("normal") // urgent | normal | low
  scheduledFor    DateTime
  sentAt          DateTime?
  deliveryMethod  String    @default("in_app") // in_app | email | both
  createdAt       DateTime  @default(now())

  user            User      @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([scheduledFor])
  @@index([sentAt])
}
```

**Notification fatigue cap:** Before inserting any non-urgent `FollowUpQueue` row, check how many non-urgent items have been sent to this user today. Cap is 2 per day. Urgent items (HF drop, liquidation risk) bypass the cap entirely. The cap is enforced at write time — items that exceed it are not queued at all, not silently dropped at delivery.

```typescript
async function canSendFollowUp(userId: string, priority: string): Promise<boolean> {
  if (priority === 'urgent') return true;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const sentToday = await db.followUpQueue.count({
    where: {
      userId,
      priority: { not: 'urgent' },
      sentAt: { gte: todayStart },
    },
  });

  return sentToday < 2;
}
```

---

## Engine integration

### The advice_given engine event

The v1.0 spec used post-hoc regex on the assistant's text output to classify advice. This approach was removed after review for three reasons:

- `earn.*APY` matches factual answers ("Your USDC is earning 5.2% APY") not just recommendations, creating false `AdviceLog` records that later get marked `off_track` for advice the user was never given
- A user who explicitly declines a save suggestion still gets an `AdviceLog` record because the pattern already fired on Audric's prior message
- A `break` after the first match means "save your idle USDC and also repay some debt" only logs the save — multi-recommendation turns are common in financial conversation

**The fix:** The engine exposes a `record_advice` tool — a read-only, `permission: 'auto'` tool that the LLM calls when it gives advice. This follows the same pattern as existing read tools (`balance_check`, `rates_info`): the LLM decides when to call it, the engine executes without user confirmation, and the result is emitted as a `tool_result` event that the chat route handler picks up.

This is more reliable than parsing custom event types from the LLM output because it uses the existing tool-call mechanism that Claude is already trained to use correctly. The tool call is structured JSON with validated fields, not free-form text that needs classification.

**Emission mechanism:** `record_advice` tool (new, in `packages/engine/src/tools/`)

```typescript
// packages/engine/src/tools/record-advice.ts

import { z } from 'zod';
import { buildTool } from '../tool.js';

const AdviceItemSchema = z.object({
  adviceType: z.enum(['save', 'repay', 'borrow', 'swap', 'goal', 'rate', 'general']),
  adviceText: z.string().max(500),
  targetAmount: z.number().optional(),
  goalId: z.string().optional(),
  followUpDays: z.number().int().min(1).max(30).optional(),
});

const InputSchema = z.object({
  advice: z.array(AdviceItemSchema).min(1).max(5),
});

export const recordAdvice = buildTool({
  name: 'record_advice',
  description: [
    'Call this tool ONLY when your response contains a financial recommendation',
    'the user could act on — a genuine suggestion to do something with their money.',
    '',
    'DO call: "I\'d suggest saving that $44 idle USDC", "Repay $50 to improve your HF"',
    'DO NOT call: "Your balance is $312", "The APY is 5.0%", "You repaid $50 yesterday"',
    '',
    'Include all distinct pieces of advice from a single turn as separate items.',
  ].join('\n'),
  inputSchema: InputSchema,
  jsonSchema: {
    type: 'object',
    required: ['advice'],
    properties: {
      advice: {
        type: 'array',
        items: {
          type: 'object',
          required: ['adviceType', 'adviceText'],
          properties: {
            adviceType: { type: 'string', enum: ['save', 'repay', 'borrow', 'swap', 'goal', 'rate', 'general'] },
            adviceText: { type: 'string', maxLength: 500 },
            targetAmount: { type: 'number' },
            goalId: { type: 'string' },
            followUpDays: { type: 'integer', minimum: 1, maximum: 30 },
          },
        },
      },
    },
  },
  isReadOnly: true, // permission: 'auto' — no user confirmation needed
  call: async (input) => {
    // Echo the advice array back in the result so the chat route handler
    // can read it from event.result (tool_result has no input field).
    return {
      data: { recorded: input.advice.length, advice: input.advice },
      text: `Recorded ${input.advice.length} advice item(s).`,
    };
  },
});
```

Add `recordAdvice` to the default tools list in `getDefaultTools()`.

**Why a tool, not a custom event type:**

- Claude is trained to call tools with structured JSON — this produces validated, typed data with no parsing ambiguity
- The tool-call mechanism already handles multiple calls per turn (multi-advice naturally works)
- `tool_result` events are already collected by the chat route — no new event plumbing needed in the engine
- `permission: 'auto'` means it fires silently, same as `balance_check`
- The tool description serves as the classification instruction (replaces the system prompt addition)

**Chat route handler** (reads `tool_result` events for `record_advice`):

```typescript
// audric/apps/web/app/api/chat/route.ts

async function handleAdviceResults(
  userId: string,
  sessionId: string,
  events: EngineEvent[],
): Promise<void> {
  const adviceResults = events.filter(
    (e): e is Extract<EngineEvent, { type: 'tool_result' }> =>
      e.type === 'tool_result' && e.toolName === 'record_advice' && !e.isError
  );

  for (const event of adviceResults) {
    // Read from event.result — tool_result has no input field.
    // The tool echoes the advice array back in its result data.
    const result = event.result as { advice: Array<{
      adviceType: string; adviceText: string;
      targetAmount?: number; goalId?: string; followUpDays?: number;
    }> };
    if (!result?.advice) continue;

    for (const advice of result.advice) {
      const followUpDays = advice.followUpDays ?? defaultFollowUpDays(advice.adviceType);

      await db.adviceLog.create({
        data: {
          userId,
          sessionId,
          adviceText: advice.adviceText.slice(0, 500),
          adviceType: advice.adviceType,
          targetAmount: advice.targetAmount ?? null,
          goalId: advice.goalId ?? null,
          followUpDue: new Date(Date.now() + followUpDays * 86_400_000),
        },
      });
    }
  }
}

function defaultFollowUpDays(type: string): number {
  const map: Record<string, number> = {
    save: 2, repay: 1, borrow: 7, swap: 7, goal: 7, rate: 7, general: 14,
  };
  return map[type] ?? 7;
}
```

**Note:** The `tool_result` engine event has `result` but no `input` field (only `tool_start` carries `input`). The tool echoes the advice array back in its return value so `handleAdviceResults` can read it from `event.result`. This handler runs after the SSE response stream completes, not in the hot path.

---

### Engine context injection — Audric's memory

Without injecting past advice into the context window, Audric has no way to answer "what did you suggest last week?" and follow-up cards feel disconnected from conversation rather than coming from Audric remembering. This is the memory part of the memory architecture.

On each chat turn, query the last 5 active `AdviceLog` records for the user and include them in the dynamic section of the system prompt:

```typescript
// audric/apps/web/lib/engine-context.ts

export async function buildAdviceContext(userId: string): Promise<string> {
  const recentAdvice = await db.adviceLog.findMany({
    where: {
      userId,
      outcomeStatus: { in: ['pending', 'on_track', 'off_track'] },
      createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, // last 30 days
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { goal: true },
  });

  if (recentAdvice.length === 0) return '';

  const lines = recentAdvice.map(a => {
    const daysAgo = Math.round((Date.now() - a.createdAt.getTime()) / 86_400_000);
    const acted = a.actionTaken ? 'acted on' : 'not yet acted on';
    const goalNote = a.goal ? ` (toward ${a.goal.name})` : '';
    return `- ${daysAgo}d ago: ${a.adviceText}${goalNote} — ${acted}`;
  });

  return [
    'Your recent advice to this user:',
    ...lines,
    'Reference this context naturally when relevant. If the user asks what you suggested, draw from this list.',
  ].join('\n');
}
```

Inject into the system prompt in the chat route before calling the engine:

```typescript
const adviceContext = await buildAdviceContext(userId);
const systemPrompt = [baseSystemPrompt, adviceContext].filter(Boolean).join('\n\n');
```

**Context window cost:** 5 records at ~50 tokens each = ~250 tokens per turn. Absorbed within the existing 2× session charge margin. Re-evaluate at 20+ records if needed.

**Routing note (self-hosted LLM):** Context injection is a read-heavy, low-complexity operation. When the hybrid routing model ships (Phase 3+), `buildAdviceContext()` runs before the routing decision — advice context is available regardless of which model handles the turn.

---

## Outcome checker — daily batch

The outcome checker runs **once daily** as part of the ECS cron, not hourly. HF alerts already have their own dedicated hourly job (Phase 1.2). Idle USDC and goal drift do not need hourly resolution — and at 5,000 users, hourly checks would generate ~120,000 Sui RPC calls/day against public rate limits.

**Cron schedule:** Run at UTC 13:00, after all timezone-localised briefings have fired.

```typescript
// packages/ecs/notification-worker/src/handlers/outcome-checker.ts

export async function runOutcomeChecks(): Promise<void> {
  const dueAdvice = await db.adviceLog.findMany({
    where: {
      outcomeStatus: { in: ['pending', 'off_track'] }, // skip completed + abandoned
      followUpDue: { lte: new Date() },
    },
    include: { user: true, goal: true },
    take: 100,
  });

  for (const advice of dueAdvice) {
    await checkAdviceOutcome(advice);
  }
}

async function checkAdviceOutcome(
  advice: AdviceLog & { user: User; goal: SavingsGoal | null }
): Promise<void> {
  const { user, goal } = advice;
  const summary = await sdk.getFinancialSummary(user.suiAddress);

  let onTrack: boolean | null = null;
  let actualValue: number | null = null;
  let message: string | null = null;
  let ctaType: string | null = null;
  let ctaAmount: number | null = null;

  switch (advice.adviceType) {

    case 'save': {
      const actionSince = await db.appEvent.findFirst({
        where: {
          userId: user.id,
          eventType: 'save',
          createdAt: { gte: advice.createdAt },
          suiTxVerified: true,
        },
      });
      onTrack = actionSince !== null;
      actualValue = summary.savingsUsdc;

      if (!onTrack) {
        message = `$${summary.checkingUsdc.toFixed(2)} USDC is still idle. ` +
          `Saving it earns ~${(summary.savingsApyRate * 100).toFixed(1)}% APY.`;
        ctaType = 'save';
        ctaAmount = advice.targetAmount ?? summary.checkingUsdc;
      }
      break;
    }

    case 'goal': {
      if (!goal) break;

      // Use deposit ledger — not total savings balance
      const deposits = await db.savingsGoalDeposit.aggregate({
        where: { goalId: goal.id },
        _sum: { amountUsdc: true },
      });
      const deposited = deposits._sum.amountUsdc ?? 0;
      actualValue = deposited;

      if (deposited >= goal.targetAmount) {
        onTrack = true;
        message = `${goal.name}: goal reached — $${goal.targetAmount} saved.`;
        ctaType = 'none';
      } else if (goal.deadline) {
        const daysRemaining = (new Date(goal.deadline).getTime() - Date.now()) / 86_400_000;
        const requiredRate = (goal.targetAmount - deposited) / daysRemaining;
        const currentDailyYield = summary.savingsUsdc * summary.savingsApyRate / 365;

        onTrack = requiredRate <= currentDailyYield * 5;
        if (!onTrack) {
          const weeklyNeeded = Math.round(requiredRate * 7);
          message = `${goal.name}: $${deposited.toFixed(0)} of $${goal.targetAmount} saved — ` +
            `a $${weeklyNeeded} weekly deposit would get you back on track.`;
          ctaType = 'goal_deposit';
          ctaAmount = weeklyNeeded;
        }
      }
      break;
    }

    case 'repay': {
      onTrack = summary.debtUsdc < (advice.targetAmount ?? summary.debtUsdc + 1);
      actualValue = summary.debtUsdc;

      if (!onTrack && summary.healthFactor && summary.healthFactor < 2.0) {
        message = `Health factor is ${summary.healthFactor.toFixed(2)}. ` +
          `Repaying $${advice.targetAmount ?? 50} USDC would improve it.`;
        ctaType = 'repay';
        ctaAmount = advice.targetAmount;
      }
      break;
    }
  }

  const check = await db.outcomeCheck.create({
    data: {
      userId: user.id,
      adviceLogId: advice.id,
      checkType: advice.adviceType === 'goal' ? 'goal_progress' : 'savings_delta',
      actualValue,
      onTrack,
      suiQueryAt: new Date(),
    },
  });

  // Determine final status — 'completed' is distinct from 'on_track'
  const isCompleted =
    (advice.adviceType === 'goal' && goal && actualValue !== null && actualValue >= goal.targetAmount) ||
    (advice.adviceType === 'save' && onTrack === true); // save advice acted on = completed
  const isAbandoned = shouldAbandon(advice, onTrack);

  const outcomeStatus = isCompleted ? 'completed'
    : isAbandoned ? 'abandoned'
    : onTrack === true ? 'on_track'
    : onTrack === false ? 'off_track'
    : 'pending';

  await db.adviceLog.update({
    where: { id: advice.id },
    data: {
      outcomeStatus,
      followUpSent: message !== null,
    },
  });

  if (message && outcomeStatus !== 'abandoned') {
    const canSend = await canSendFollowUp(user.id, 'normal');
    if (canSend) {
      await db.followUpQueue.create({
        data: {
          userId: user.id,
          triggerType: isCompleted ? 'goal_milestone' : 'off_track',
          adviceLogId: advice.id,
          outcomeCheckId: check.id,
          message,
          ctaType,
          ctaAmount,
          scheduledFor: new Date(),
          deliveryMethod: 'in_app',
        },
      });
    }
  }
}

/**
 * Advice is abandoned when:
 * 1. Goal with passed deadline — user didn't hit the target in time
 * 2. Follow-up already sent + 2x the original follow-up window elapsed with no action
 *    (e.g. save advice with 48h follow-up → abandoned after 96h total)
 *
 * Abandoned records are excluded from future outcome checks and follow-ups,
 * preventing stale advice from consuming RPC calls and notification quota indefinitely.
 * They remain in the table as negative signal for the fine-tuning dataset.
 */
function shouldAbandon(
  advice: AdviceLog & { goal: SavingsGoal | null },
  onTrack: boolean | null,
): boolean {
  // Goal with passed deadline and not completed
  if (advice.adviceType === 'goal' && advice.goal?.deadline) {
    if (new Date(advice.goal.deadline) < new Date() && onTrack !== true) {
      return true;
    }
  }

  // Follow-up sent but no action after 2x the follow-up window
  if (advice.followUpSent && advice.followUpDue && !advice.actionTaken) {
    const followUpWindowMs = advice.followUpDue.getTime() - advice.createdAt.getTime();
    const abandonAfter = advice.followUpDue.getTime() + followUpWindowMs; // 2x window
    if (Date.now() > abandonAfter) {
      return true;
    }
  }

  return false;
}
```

---

## Anomaly detection — daily batch

Runs daily immediately after `runOutcomeChecks()`. The fatigue cap applies — anomalies are non-urgent unless explicitly flagged. Goal drift uses the deposit ledger, not total balance.

```typescript
// packages/ecs/notification-worker/src/handlers/anomaly-detector.ts

export async function detectAnomalies(user: User): Promise<void> {
  const summary = await sdk.getFinancialSummary(user.suiAddress);
  const anomalies: Array<{
    message: string; ctaType: string; ctaAmount?: number; priority: string;
  }> = [];

  // 1. Large idle USDC (>$100 uninvested for >48h)
  if (summary.checkingUsdc > 100) {
    const lastSave = await db.appEvent.findFirst({
      where: { userId: user.id, eventType: 'save', suiTxVerified: true },
      orderBy: { createdAt: 'desc' },
    });
    const hoursSince = lastSave
      ? (Date.now() - lastSave.createdAt.getTime()) / 3_600_000
      : Infinity;

    if (hoursSince > 48) {
      anomalies.push({
        message: `$${summary.checkingUsdc.toFixed(2)} has been idle for over 2 days. ` +
          `Saving it earns ~$${(summary.checkingUsdc * summary.savingsApyRate / 365).toFixed(3)}/day.`,
        ctaType: 'save',
        ctaAmount: summary.checkingUsdc,
        priority: 'normal',
      });
    }
  }

  // 2. Health factor drop — urgent, bypasses daily cap
  // Note: Phase 1.2 has its own dedicated hourly HF alert job.
  // This catches cases that fall between the cracks of the hourly check.
  if (summary.healthFactor && summary.healthFactor < 1.5) {
    anomalies.push({
      message: `Health factor dropped to ${summary.healthFactor.toFixed(2)} — ` +
        `liquidation risk is increasing. Repaying debt would bring it back above 2.0.`,
      ctaType: 'repay',
      priority: 'urgent',
    });
  }

  // 3. Goal falling behind — uses deposit ledger, not total balance
  const goals = await db.savingsGoal.findMany({
    where: { userId: user.id, status: 'active' },
  });

  for (const goal of goals) {
    if (!goal.deadline) continue;

    const deposits = await db.savingsGoalDeposit.aggregate({
      where: { goalId: goal.id },
      _sum: { amountUsdc: true },
    });
    const deposited = deposits._sum.amountUsdc ?? 0;
    const daysRemaining = (new Date(goal.deadline).getTime() - Date.now()) / 86_400_000;
    if (daysRemaining <= 0) continue;

    const requiredDaily = (goal.targetAmount - deposited) / daysRemaining;
    const currentDailyYield = summary.savingsUsdc * summary.savingsApyRate / 365;

    if (requiredDaily > currentDailyYield * 5 && daysRemaining < 60) {
      anomalies.push({
        message: `${goal.name} is falling behind. ` +
          `A $${Math.round(requiredDaily * 7)} weekly deposit would get you back on track.`,
        ctaType: 'goal_deposit',
        ctaAmount: Math.round(requiredDaily * 7),
        priority: 'normal',
      });
    }
  }

  // Write anomalies — dedup by ctaType within 24h, enforce daily cap
  for (const anomaly of anomalies) {
    const existing = await db.followUpQueue.findFirst({
      where: {
        userId: user.id,
        ctaType: anomaly.ctaType,
        sentAt: null,
        scheduledFor: { gte: new Date(Date.now() - 86_400_000) },
      },
    });
    if (existing) continue;

    const canSend = await canSendFollowUp(user.id, anomaly.priority);
    if (!canSend) continue;

    await db.followUpQueue.create({
      data: {
        userId: user.id,
        triggerType: 'anomaly',
        message: anomaly.message,
        ctaType: anomaly.ctaType,
        ctaAmount: anomaly.ctaAmount,
        priority: anomaly.priority,
        scheduledFor: new Date(),
        deliveryMethod: anomaly.priority === 'urgent' ? 'both' : 'in_app',
      },
    });
  }
}
```

---

## Follow-up delivery

Follow-ups surface as a pinned card in the Audric dashboard — reusing `BriefingCard` (Phase 1.3), requiring no new UI component. A `follow_up` filter chip is added to the activity feed (Phase 1.6). CTAs route through the deep link system (Phase 1.3.1) and require user confirmation before executing.

```typescript
// packages/ecs/notification-worker/src/handlers/follow-up-delivery.ts

export async function deliverFollowUps(): Promise<void> {
  const pending = await db.followUpQueue.findMany({
    where: { scheduledFor: { lte: new Date() }, sentAt: null },
    include: { user: true },
    orderBy: { priority: 'desc' },
    take: 50,
  });

  for (const item of pending) {
    await db.appEvent.create({
      data: {
        userId: item.userId,
        eventType: 'follow_up',
        title: item.message,
        metadata: JSON.stringify({
          ctaType: item.ctaType,
          ctaAmount: item.ctaAmount,
          adviceLogId: item.adviceLogId,
        }),
      },
    });

    await db.followUpQueue.update({
      where: { id: item.id },
      data: { sentAt: new Date() },
    });
  }
}
```

---

## Security

**Append-only tables.** `AdviceLog` and `AppEvent` rows are never deleted. `OutcomeCheck` only writes new rows. `AdviceLog.outcomeStatus` and `AppEvent.suiTxVerified` are the only fields updated after creation. This preserves the integrity of the audit trail and the fine-tuning dataset.

**Read-only Sui queries.** The outcome checker and anomaly detector call `sdk.getFinancialSummary()` — the same read path used by the briefing cron. No signing keys required. No funds can be moved by the checker.

**No autonomous execution.** Follow-up CTAs route through `/action?type=...` deep links. The user sees a confirmation card before any transaction executes. This is consistent with the agent budget safety model in Settings > Safety and the 5-confirmation trust ladder for DCA (Phase 3.3).

**Notification fatigue cap.** Maximum 2 non-urgent follow-ups per user per day. Urgent items bypass the cap. Enforced at write time — items exceeding the cap are not queued at all.

**Context injection size.** Advice context is capped at 5 records from the last 30 days. This bounds token cost and prevents stale context from overwhelming current conversation state.

---

## Where this fits in the roadmap

### Phase 1.4 (current — savings goals)

Ship alongside savings goals since `SavingsGoal` is a dependency for goal-type outcome checks.

**Ship with Phase 1.4:**
- `AdviceLog` + `SavingsGoalDeposit` Prisma migration
- `AppEvent` migration (add `adviceLogId`, `goalId`, `suiTxVerified`, `source` columns)
- `advice_given` engine event type + system prompt addition
- `handleAdviceEvents()` in chat route
- `buildAdviceContext()` + system prompt injection in chat route
- `SavingsGoalDeposit` write in save transaction handler (when `goalId` present)

### Phase 1.5 (new user onboarding)

The `$0.25 welcome → save path` is the first real advice→action loop. The onboarding message suggests saving and emits an `advice_given` event. When the user acts, `AppEvent` is written with `adviceLogId` linked. This validates the full pipeline with live data before Phase 3.

### Phase 3.3 (with scheduled actions / DCA)

The outcome checker and anomaly detector are added to the ECS daily cron at Phase 3, not before. Data collection starts in Phase 1.4 so by Phase 3 there is already a meaningful backlog of advice records to evaluate.

**Ship with Phase 3.3:**
- `OutcomeCheck` + `FollowUpQueue` Prisma migration
- `runOutcomeChecks()` wired into daily ECS cron (UTC 13:00)
- `detectAnomalies()` wired into daily ECS cron
- `deliverFollowUps()` wired into daily ECS cron
- `canSendFollowUp()` fatigue cap utility
- Follow-up card UI (reuses `BriefingCard`)
- `follow_up` filter chip in activity feed (Phase 1.6)

### Self-hosted LLM (Phase 3+)

`AdviceLog.outcomeStatus` and `OutcomeCheck.onTrack` become fine-tuning signal labels once data volume justifies it (target: 3,000–5,000 users). Advice that led to `completed` goals is positive signal. Advice marked `off_track` or `abandoned` is negative. This dataset makes a fine-tuned Audric model meaningfully better than a generic base model at financial advice and intent classification.

---

## Summary — what this unlocks

| Capability | Available from |
|---|---|
| Audric references its own prior advice in conversation | Phase 1.4 |
| Advice history queryable per user | Phase 1.4 |
| Goal progress tracked by deposits, not total balance | Phase 1.4 |
| Single onchain audit trail (AppEvent, no duplication) | Phase 1.4 |
| Verified action history with Sui tx hash | Phase 1.4 |
| Proactive off-track nudges | Phase 3 |
| Anomaly detection (idle USDC, HF drop, goal drift) | Phase 3 |
| "Has Audric's advice helped me?" answerable with data | Phase 3 |
| Fine-tuning signal from real financial outcomes | Phase 3+ |
| Advice accountability as user-facing product feature | Phase 4+ |

---

*audric.ai | t2000.ai | mpp.t2000.ai | April 2026 | Confidential*
