> **⚠️ HISTORICAL DOCUMENT — ARCHIVED APRIL 2026**
>
> This spec is superseded by [`AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md`](../../AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md).
>
> The "Autonomous Agent" thesis described below was retired in the April 2026 simplification: Copilot, scheduled actions, morning briefings, rate alerts, auto-compound, allowance / features budget, and the proactive-suggestions surface were all deleted. zkLogin cannot sign without user presence, so the "autonomous" framing was honest only as reminders dressed up as agency. See [`spec/SIMPLIFICATION_RATIONALE.md`](../SIMPLIFICATION_RATIONALE.md) for the full reasoning.
>
> **Read this only as historical context.** Do not implement anything from this doc without re-validating against the current spec. The chat-first, daily-free product shipped in S.1–S.15 is the canonical Audric.

---

# Audric 2.0 — Full Specification
> Making Audric 100x more powerful: Claude-like for DeFi + Autonomous Agent
> Last updated: April 13, 2026 | Status: Draft for review (**archived — see banner above**)

---

## Context and philosophy

You're a solo builder with ~100 early users and a proven architecture. The goal is not to build more features — it's to make every conversation Audric has feel like talking to a financial expert who has been watching your wallet for years, never forgets anything, and increasingly acts *for* you without being asked.

Three articles shaped this spec:
- Claude Code's architecture: the model is commodity, the environment determines outcomes
- The 2026 AI engineer roadmap: harness + infrastructure is where products live or die
- The boring billion: vertical AI wins on domain data accumulation, outcome-based pricing, and deep workflow embedding

The two "Claude-like for DeFi" features are deeply interdependent:
- **Financial memory** — Audric knows who you are because it read your on-chain history
- **Autonomous agent** — Audric acts for you because it knows you well enough to be trusted

They are not two separate features. They are one product: an agent that accumulates context, earns trust incrementally, and acts with increasing autonomy as that trust compounds.

**On crypto tax accounting:** Descoped for now. At ~100 users, essentially nobody has enough on-chain history to make it valuable. The correctness bar is unusually high (cross-year FIFO lots, cross-wallet transfer detection, yield accrual income, jurisdiction handling), and a wrong tax report is worse than no tax report. Revisit when you have 1,000+ active users with 6+ months of Audric transaction history and users are asking for it unprompted. The `LinkedWallet` model and `ChainAdapter` abstraction from the growth & tax spec are worth keeping as foundations — they unblock the public wallet report (Phase E) and make the eventual tax engine cheaper to build. The full tax spec lives in `audric-growth-tax-spec.md` and is ready to execute when timing is right.

This spec covers seven initiatives:

1. **Harness upgrades** — close the gap between Audric and Claude Code's agent loop
2. **Chain-native memory** — financial memory built from on-chain data, not conversation
3. **Granular permission rules** — dollar-threshold autonomy, not binary approve/deny
4. **Autonomous action loop** — the connective tissue that ties memory, permissions, and trust into one experience
5. **Public wallet intelligence report** — acquisition funnel, no signup required
6. **Self-hosting roadmap** — cost, privacy, and domain fine-tuning
7. **Sequencing** — solo-founder order of operations

---

## Initiative 1: Harness upgrades

### 1a. Streaming tool execution

**Current state:** The engine already streams — `AnthropicProvider` uses `stream: true` and `QueryEngine` in `packages/engine/src/engine.ts` consumes it with `for await`. The issue is not the absence of streaming but that `handleProviderEvent` accumulates all tool blocks in an `acc` object and only calls `runTools()` after the stream loop exits. Tools that could run in parallel wait until the model finishes generating.

**What to build:**

In `packages/engine/src/engine.ts`, modify the agent loop to dispatch read-only tools mid-stream the moment their `input` JSON is complete (signalled by `tool_use_done` events from the provider), rather than accumulating all tool calls and dispatching in batch after the stream closes.

```typescript
// Current pattern (in engine.ts agentLoop):
// accumulates all tool blocks in acc.toolUses[], then after stream exits:
const toolResults = await runTools(acc.toolUses, tools, toolContext);

// Target pattern:
const earlyDispatcher = new EarlyToolDispatcher(tools, toolContext);
for await (const event of provider.stream(messages, params)) {
  yield event; // still stream to UI immediately
  if (event.type === 'tool_use_done' && isReadOnly(event.tool)) {
    earlyDispatcher.dispatch(event); // fire immediately, don't wait
  }
}
// After stream: run any write tools + collect all results (early + late)
const toolResults = await earlyDispatcher.awaitAll(remainingWriteTools);
```

**Key implementation details:**

- `EarlyToolDispatcher` dispatches read-only tools immediately on `tool_use_done`
- Write tools still queue and run serially after the full stream via `TxMutex` — same as today
- Tool results yield to the UI as they arrive, in original call order even if tool 2 finishes before tool 1
- If the stream fails after some tools already dispatched: generate synthetic error results for in-flight tools and continue — don't leave the engine in a half-finished state
- The provider's `AbortSignal` must propagate to in-flight tool calls — if the user cancels, both the stream and any running tools abort
- Add tests for: stream fails mid-dispatch, write tool queued while read tool in-flight, abort mid-stream with tool running

**Expected impact:** 2-4 second latency reduction on every multi-tool turn. For "what's my balance and health factor and savings rate" — the most common first message — all three tools run in parallel while the model is still generating its summary text.

**Effort:** ~5 days (not 3). The core loop change is ~2 days; thorough testing of failure modes, abort propagation, and result ordering is another ~3 days. This touches the engine's most critical path and must not regress existing behaviour.

---

### 1b. Tool result budgeting

**Problem:** `defillama_yield_pools` can return hundreds of pools. `transaction_history` over 6 months is thousands of records. `mpp_services` lists 40+ services with endpoint details. All of this passes raw into context, degrading quality on power users before `ContextBudget` ever triggers.

**What to build:**

Add `maxResultSizeChars?: number` to the `Tool` interface. When a tool result exceeds the limit, truncate it with a structured summary rather than storing it externally. The model works with the summary; if it needs more detail, it re-calls the tool with narrower parameters (a date range, a limit, a specific service name).

```typescript
interface Tool {
  // ...existing fields...
  maxResultSizeChars?: number; // default: unlimited
  summarizeOnTruncate?: (result: string, maxChars: number) => string; // optional custom truncator
}

// In runTools(), default truncation:
function truncateToolResult(result: string, maxChars: number, toolName: string): string {
  if (result.length <= maxChars) return result;
  const preview = result.slice(0, maxChars);
  const linesOmitted = result.split('\n').length - preview.split('\n').length;
  return `${preview}\n\n[Truncated — ${linesOmitted} lines omitted. Call ${toolName} with narrower parameters (e.g. smaller date range or limit) to see more.]`;
}
```

This avoids the `retrieve_result` round-trip (which adds latency to reduce context — counterproductive). The model already knows how to re-call tools with narrower parameters; the truncation message just makes it explicit.

**Per-tool limits (starting values):**

| Tool | maxResultSizeChars |
|------|--------------------|
| `transaction_history` | 8,000 |
| `defillama_yield_pools` | 6,000 |
| `mpp_services` | 5,000 |
| `defillama_protocol_info` | 4,000 |
| `web_search` | 8,000 |
| All others | unlimited |

**Effort:** ~1 day. `maxResultSizeChars` added to Tool interface, `truncateToolResult` in `runTools`, five tool definitions updated. No external store needed.

---

### 1c. Microcompact — the one genuinely new compaction strategy

**Current state:** `compactMessages()` in `packages/engine/src/context.ts` already has a well-structured multi-phase approach: check budget → split old/recent (protects last 8 turns) → optional LLM summarization of old turns → truncate long tool results in old messages → drop middle messages → truncate recent tool results → `sanitizeMessages` to clean orphaned tool pairs. The "snip compact" and "truncate fallback" described in earlier drafts of this spec already exist.

**The one missing strategy — microcompact:**

Before any of the existing phases run, add a zero-cost deduplication pass: if the same tool was called with identical inputs in an earlier turn and the result hasn't changed, replace the full prior result with a back-reference. This runs every turn before the API call and costs nothing.

```typescript
// packages/engine/src/compact/microcompact.ts

export function microcompact(messages: Message[]): Message[] {
  // Build a map of toolName+inputs → first occurrence result
  const seen = new Map<string, { turnIndex: number; result: string }>();
  
  return messages.map((msg, i) => {
    if (msg.role !== 'tool') return msg;
    
    const key = `${msg.toolName}:${JSON.stringify(msg.toolInput)}`;
    const prior = seen.get(key);
    
    if (prior) {
      // Replace full result with a compact reference
      return {
        ...msg,
        content: `[Same result as turn ${prior.turnIndex} — ${msg.toolName} with same inputs. Result unchanged.]`,
      };
    }
    
    seen.set(key, { turnIndex: i, result: msg.content });
    return msg;
  });
}
```

**Where it slots in:** Call `microcompact` at the top of `compactMessages()` before any existing phase. It's idempotent and cheap — if nothing deduplicates, the messages array is returned unchanged.

**Expected impact:** Sessions where `balance_check` is called every few turns (very common — users repeatedly check their balance mid-conversation) can save 2,000-5,000 tokens per duplicate. At scale this is meaningful cost reduction.

**Effort:** ~0.5 days. New `microcompact.ts`, one line added to `compactMessages()` orchestration.

---

### 1d. Session pre-fetch upgrade

**Current state:** `createEngine()` in `engine-factory.ts` already runs a `Promise.all` that pre-fetches portfolio data, wallet coins, token prices, savings goals, advice context, financial profile, and memories. This data feeds `buildDynamicBlock()` which assembles the system prompt. The model already sees balance and position data on turn 1 via the system prompt.

**The gap:** The model still calls `balance_check` on the first user turn even when the data is already in context. This happens because the system prompt injects structured data (objects, numbers), but the model doesn't treat this as a prior tool result — it calls the tool anyway to be thorough. The result is a redundant API call and 1-2 seconds of unnecessary wait.

**What to build:** Inject the pre-fetched data as synthetic tool results in the opening message — the model treats these exactly like it called the tools itself, so it won't re-call them unless the user explicitly asks for fresh data.

```typescript
// In audric/app/api/engine/chat/route.ts, for new sessions:
if (isNewSession) {
  const [balance, health, rates] = await Promise.allSettled([
    agent.balance(),
    agent.healthFactor(),
    agent.rates(),
  ]);

  // Inject as synthetic tool results — model treats these as if it already called the tools
  const syntheticResults = buildSyntheticToolResults({ balance, health, rates });
  // Prepend to session history before the user's first message
  sessionHistory.unshift(...syntheticResults);
}
```

The key difference from the current approach: instead of injecting into the system prompt (which the model reads as context), inject as synthetic `tool` role messages (which the model reads as "I already checked this"). This eliminates the redundant first-turn tool calls entirely.

**Effort:** ~0.5 days. Small change to the chat route; the pre-fetch itself already exists.

---

## Initiative 2: Chain-native memory

### The problem with conversation-derived memory

`UserMemory` is populated by `runMemoryExtraction()` which runs a Claude extraction over conversation history. If a user is quiet — doesn't narrate their thinking, just does transactions — the memory system stays empty. This produces the failure mode: Audric has known this user for 3 months, they've saved $2,000 and borrowed twice, and the memory system knows nothing about them.

### Data source reality check

The spec originally referenced a `Transaction` model that doesn't exist in the Prisma schema. The actual available data sources are:

- **`AppEvent`** — logs Audric-initiated actions (saves, sends, borrows, swaps) with action type, amount, and timestamp. Covers all actions taken through Audric but not external wallet activity.
- **`PortfolioSnapshot`** — daily snapshots with `walletUsd`, `savingsUsd`, `debtUsdc`, `healthFactor`, `yieldEarnedUsd`. Rich time-series data.
- **On-chain RPC** — `activity-data.ts` queries Sui JSON-RPC for transaction history but doesn't persist results.

**MVP approach (recommended):** Run classifiers over `AppEvent` + `PortfolioSnapshot` only. This covers all Audric-originated actions (the ones that matter for pattern detection) and the full portfolio time series. External wallet activity is out of scope for V1 — if the user did a DeFi action outside Audric, Audric didn't do it and shouldn't automate it anyway.

**If broader history is needed later:** Add a `TransactionRecord` model populated by a nightly job querying Sui RPC for each user's address. This is the "indexer" referenced in the architecture diagram — it doesn't exist yet and is not needed for MVP chain memory.

### What to build: the Chain Memory Pipeline

A background job (`runChainMemoryExtraction()`) that reads from `AppEvent` and `PortfolioSnapshot` records and generates structured financial facts for injection into the memory system.

**Step 1: Financial fact types**

```typescript
interface ChainFact {
  type: 
    | 'deposit_pattern'     // "deposits consistently on Fridays"
    | 'risk_profile'        // "has never been below HF 2.1"
    | 'yield_behavior'      // "never withdraws — lets yield compound"
    | 'borrow_behavior'     // "borrowed twice, repaid within 7 days both times"
    | 'near_liquidation'    // "HF dropped to 1.4 on [date]"
    | 'large_transaction'   // "largest single deposit: $500 on [date]"
    | 'compounding_streak'; // "saved yield 14 consecutive months"
  fact: string;
  confidence: number;       // 0-1
  derivedAt: Date;
  source: 'app_event' | 'snapshot';
}
```

**Step 2: Classifier functions**

These are pure functions over DB records. They belong in `audric/apps/web/lib/chain-memory/classifiers.ts` — not in the engine package, because they contain Prisma queries (app-specific DB logic that doesn't belong in a published npm package).

```typescript
// audric/apps/web/lib/chain-memory/classifiers.ts

export function classifyDepositPattern(events: AppEvent[]): ChainFact | null {
  const saves = events.filter(e => e.type === 'save');
  if (saves.length < 3) return null;
  // Group by day of week, check consistency
}

export function classifyRiskProfile(snapshots: PortfolioSnapshot[]): ChainFact | null {
  const hfValues = snapshots.map(s => s.healthFactor).filter(Boolean) as number[];
  if (hfValues.length < 7) return null;
  const minHF = Math.min(...hfValues);
  const avgHF = hfValues.reduce((a, b) => a + b, 0) / hfValues.length;
  return {
    type: 'risk_profile',
    fact: minHF > 2.5
      ? `Conservative risk profile — health factor never below ${minHF.toFixed(2)}`
      : minHF < 1.6
      ? `Has experienced near-liquidation — HF reached ${minHF.toFixed(2)}`
      : `Moderate risk tolerance — average HF ${avgHF.toFixed(2)}`,
    confidence: snapshots.length > 14 ? 0.9 : 0.6,
    derivedAt: new Date(),
    source: 'snapshot',
  };
}

// ...etc for borrow_behavior, yield_behavior, compounding_streak
```

**Step 3: Cron job** (`apps/server/src/cron/jobs/chain-memory.ts`)

Runs nightly alongside existing cron jobs. For each active user:
1. Load last 90 days of `AppEvent` and `PortfolioSnapshot` records
2. Run all classifiers
3. Upsert `UserMemory` records with `source: 'chain'` (vs `source: 'conversation'` for existing)
4. Deduplicate against existing memories using same Jaccard similarity as today

The cron calls an internal Audric API route (`POST /api/internal/chain-memory`) rather than accessing the DB directly — same pattern as all existing cron-to-audric communication via `AUDRIC_INTERNAL_KEY`.

**Step 4: Injection**

`buildMemoryContext()` already injects memories into the prompt. Chain-derived facts use the same `UserMemory` table with a `source: 'chain'` field. No new injection mechanism needed.

**Effort:** ~3 days. Classifiers in `audric/lib/chain-memory/` (~1.5d), internal API route + cron job (~1d), `source` field migration on `UserMemory` (~0.5d).

---

## Initiative 3: Granular permission rules

**Problem:** The current three-tier system (`auto`, `confirm`, `explicit`) is too coarse. An agent that confirms a $5 save is annoying. An agent that auto-executes a $2,000 save is frightening. Users need a spectrum, and the threshold should be user-configurable.

### Dollar-threshold permission model

Replace the hard-coded permission tier on write tools with a rule engine that resolves the tier at runtime based on the transaction value and user config.

**USD resolution:** At tool dispatch time in the engine, tool inputs contain token amounts (possibly in MIST or token decimals), not USD values. For example, `save_deposit` receives `{ amount: 50, asset: 'USDC' }` (trivial — 1:1), but `swap_execute` receives `{ fromAmount: 1000000000, fromAsset: 'SUI' }` (requires the current SUI price). The engine must resolve USD value before calling `resolvePermissionTier`. The session pre-fetch (Initiative 1d) already caches token prices — inject that price cache into the tool context so USD resolution is a local lookup, not a new API call.

```typescript
// In tool context (engine-factory.ts):
interface ToolContext {
  agent: T2000;
  userId: string;
  priceCache: Map<string, number>; // symbol → USD price, populated at session start
  permissionConfig: UserPermissionConfig;
}

// USD resolution before permission check:
function resolveUsdValue(
  toolName: string,
  input: Record<string, unknown>,
  priceCache: Map<string, number>
): number {
  switch (toolName) {
    case 'save_deposit':
    case 'repay_debt':
      return Number(input.amount); // USDC — 1:1
    case 'send_transfer':
      return Number(input.amount) * (priceCache.get(String(input.asset)) ?? 1);
    case 'swap_execute':
      return Number(input.fromAmount) * (priceCache.get(String(input.fromAsset)) ?? 0);
    default:
      return 0; // no USD value — defaults to auto
  }
}
```

**Architecture note:** The permission rule resolution logic lives in the engine (`packages/engine/src/permission-rules.ts`), not the SDK. The current permission system (`buildTool` + `permissionLevel`) is already engine-layer logic. Moving it to `packages/sdk/src/safeguards/` would create a cross-package dependency where the engine needs to import from SDK at dispatch time. Keep the rule resolver in the engine and the per-user config in `UserPreferences.limits` (Audric app layer) — the engine factory reads the config and injects it into ToolContext at session start.

```typescript
// packages/engine/src/permission-rules.ts

export interface PermissionRule {
  operation: 'save' | 'withdraw' | 'send' | 'borrow' | 'repay' | 'swap' | 'pay';
  autoBelow: number;      // auto-execute if USD amount < this
  confirmBetween: number; // confirm if between autoBelow and this
  // explicit for anything above confirmBetween
}

export interface UserPermissionConfig {
  rules: PermissionRule[];
  globalAutoBelow: number;
  autonomousDailyLimit: number; // max total USD autonomous actions per day
}

export const DEFAULT_PERMISSION_CONFIG: UserPermissionConfig = {
  globalAutoBelow: 10,
  autonomousDailyLimit: 200,
  rules: [
    { operation: 'save',     autoBelow: 50,  confirmBetween: 1000 },
    { operation: 'send',     autoBelow: 10,  confirmBetween: 200  },
    { operation: 'borrow',   autoBelow: 0,   confirmBetween: 500  }, // always confirm
    { operation: 'withdraw', autoBelow: 25,  confirmBetween: 500  },
    { operation: 'swap',     autoBelow: 25,  confirmBetween: 300  },
    { operation: 'pay',      autoBelow: 1,   confirmBetween: 50   },
  ],
};

export function resolvePermissionTier(
  operation: string,
  amountUsd: number,
  config: UserPermissionConfig
): 'auto' | 'confirm' | 'explicit' {
  const rule = config.rules.find(r => r.operation === operation) ?? {
    autoBelow: config.globalAutoBelow,
    confirmBetween: 1000,
  };
  if (amountUsd < rule.autoBelow) return 'auto';
  if (amountUsd < rule.confirmBetween) return 'confirm';
  return 'explicit';
}
```

**User interface:**

A "Permissions" section in Settings (alongside the existing Safeguards section) with sliders per operation type. "Auto-approve saves up to: $___". This replaces the current blunt `maxPerTx` limit with something more expressive.

**Effort:** ~2 days. `permission-rules.ts` in engine, USD resolution in tool dispatch, settings UI sliders, config persistence in `UserPreferences.limits`.

---

## Initiative 4: Autonomous action loop

This is the connective tissue. Chain memory knows who you are. Granular permissions tell Audric what it's allowed to do. The autonomous action loop is what ties both together into an agent that *acts for you* — surfacing proposals, earning confirmation once, then running automatically forever.

### The core insight: trust is earned per-pattern, not per-session

The existing trust ladder in `ScheduledAction` (5 confirmations → autonomous) is the right primitive but it's too narrow. It only applies to *explicit* DCA schedules the user creates. Real trust-building should happen across *all* recurring behaviors that Audric observes — whether the user declared them or not.

When Audric notices that a user accepts "save $50" every Friday for three weeks, it should propose making that automatic. When it notices the user always repays borrowings within a week, it should ask if auto-repay when debt exceeds $X is appropriate. The user doesn't need to know the word "DCA" or navigate a scheduling UI. They just say yes once.

---

### The Behavioral Pattern Detector

**What it observes** (runs over `AppEvent` + `PortfolioSnapshot` records — see Initiative 2 for data source rationale):

```typescript
// audric/apps/web/lib/chain-memory/pattern-types.ts
// Note: classifiers live in audric/lib/, not packages/engine/ — they contain Prisma queries

export interface BehavioralPattern {
  id: string;
  type:
    | 'recurring_save'        // saves of similar amount on similar cadence
    | 'yield_reinvestment'    // consistently claims and re-saves rewards
    | 'debt_discipline'       // always repays within N days of borrowing
    | 'idle_usdc_tolerance'   // never lets >$X sit uninvested for >N days
    | 'rate_chaser'           // moves savings when APY drops below threshold
    | 'health_conservatism'   // always keeps HF above X
    | 'swap_pattern';         // regular SUI→USDC conversion after paycheck-like deposits

  confidence: number;         // 0–1, based on recurrence and consistency
  observations: number;       // how many times this pattern was observed
  lastSeen: Date;

  // Human-readable proposal Audric can surface
  proposalText: string;       // "You've saved ~$50 every Friday for 3 weeks. Want me to automate that?"
  proposedAction: ProposedAutonomousAction;
}

export interface ProposedAutonomousAction {
  toolName: string;           // 'save_deposit' | 'repay_debt' | 'swap_execute' | etc.
  params: Record<string, unknown>;
  schedule?: string;          // cron expression if periodic
  trigger?: ActionTrigger;    // condition-based trigger if not periodic
}

export interface ActionTrigger {
  type: 'idle_usdc_above' | 'health_factor_below' | 'apy_drops_below' | 'debt_above';
  threshold: number;
}
```

**Detector functions** (pure, testable, run in the nightly cron):

```typescript
export function detectRecurringSave(
  events: AppEvent[]
): BehavioralPattern | null {
  // Group deposits by week, check if amount is within 20% of median
  // Check if day-of-week is consistent (e.g. always Friday ±1 day)
  // Require at least 3 observations and confidence > 0.75
  const deposits = events.filter(e => e.type === 'save');
  if (deposits.length < 3) return null;

  const amounts = deposits.map(t => t.amountUsd);
  const median = medianOf(amounts);
  const consistent = amounts.every(a => Math.abs(a - median) / median < 0.2);
  if (!consistent) return null;

  const dayOfWeek = mostCommonDayOfWeek(deposits.map(t => t.createdAt));
  const dayConsistency = deposits.filter(
    t => getDayOfWeek(t.createdAt) === dayOfWeek
  ).length / deposits.length;

  if (dayConsistency < 0.7) return null;

  return {
    id: `recurring-save-${userId}`,
    type: 'recurring_save',
    confidence: Math.min(0.5 + deposits.length * 0.1, 0.95),
    observations: deposits.length,
    lastSeen: deposits[deposits.length - 1].createdAt,
    proposalText: `You've saved ~$${Math.round(median)} every ${DAY_NAMES[dayOfWeek]} for ${deposits.length} weeks. Want me to automate that?`,
    proposedAction: {
      toolName: 'save_deposit',
      params: { amount: Math.round(median), asset: 'USDC' },
      schedule: `0 9 * * ${dayOfWeek}`, // 9am on that day
    },
  };
}

export function detectIdleUsdcPattern(
  snapshots: PortfolioSnapshot[]
): BehavioralPattern | null {
  // Check if wallet USDC consistently stays near zero (user always invests quickly)
  // If so, propose: "whenever your wallet hits $X, auto-save the excess"
  const avgIdleUsdc = average(snapshots.map(s => s.walletUsd - s.savingsUsd));
  if (avgIdleUsdc > 20) return null; // user tolerates idle USDC, don't nag

  return {
    id: `idle-usdc-${userId}`,
    type: 'idle_usdc_tolerance',
    confidence: 0.85,
    observations: snapshots.length,
    lastSeen: snapshots[snapshots.length - 1].date,
    proposalText: `You consistently keep your wallet near zero — you invest idle USDC fast. Want me to auto-save anything above $10 the moment it lands?`,
    proposedAction: {
      toolName: 'save_deposit',
      params: { amount: 'dynamic', keepReserve: 10 },
      trigger: { type: 'idle_usdc_above', threshold: 10 },
    },
  };
}

export function detectDebtDiscipline(
  events: AppEvent[]
): BehavioralPattern | null {
  // Check borrow/repay pairs — if user always repays within 7 days
  const borrows = events.filter(e => e.type === 'borrow');
  const repays = events.filter(e => e.type === 'repay');
  if (borrows.length < 2) return null;

  const repayDelays = borrows.map(b => {
    const repay = repays.find(r => r.createdAt > b.createdAt);
    return repay ? daysBetween(b.createdAt, repay.createdAt) : null;
  }).filter(Boolean);

  const avgDelay = average(repayDelays);
  if (avgDelay > 10) return null;

  return {
    id: `debt-discipline-${userId}`,
    type: 'debt_discipline',
    confidence: 0.8,
    observations: borrows.length,
    lastSeen: borrows[borrows.length - 1].createdAt,
    proposalText: `You always repay borrowings within ${Math.round(avgDelay)} days. Want me to auto-repay whenever your wallet has enough to cover the debt?`,
    proposedAction: {
      toolName: 'repay_debt',
      params: { amount: 'all' },
      trigger: { type: 'debt_above', threshold: 0 }, // trigger: any time there's debt + wallet has funds
    },
  };
}
```

---

### The Confidence-Gated Proposal System

Detected patterns don't immediately become autonomous actions. They flow through a three-stage proposal pipeline before Audric acts without asking.

```
Pattern detected (confidence > 0.75)
    │
    ▼
Stage 1: Surfaced in chat (not pushed)
    Audric mentions it conversationally when relevant:
    "By the way — I noticed you've saved ~$50 every Friday for 3 weeks.
     Want me to handle that automatically going forward?"
    │
    ├── User says yes → moves to Stage 2
    └── User says no / ignores → pattern marked 'declined', not surfaced again for 30 days
    │
    ▼
Stage 2: Confirmed once, runs with notification
    Audric executes the action when triggered.
    Always sends a notification: "I saved $50 USDC for you (Friday auto-save). Tx: 0x..."
    User can reply "stop" at any time.
    Runs for 3 executions in this stage.
    │
    ▼
Stage 3: Fully autonomous, silent
    After 3 successful Stage 2 executions with no cancellation:
    Audric acts without notifying unless something unexpected happens.
    Unexpected = amount differs by >20%, health factor would drop below 2.0,
                 insufficient balance, or it's been >2x the expected cadence.
```

**DB schema — unified with ScheduledAction:**

The `AutonomousPattern` model is **not** a new table. It is the existing `ScheduledAction` model extended with three new fields. This keeps one execution system, one trust ladder, one Settings UI section, and one cron job.

```prisma
// Addition to existing ScheduledAction model in apps/server/prisma/schema.prisma:
model ScheduledAction {
  // ... all existing fields unchanged ...

  // New fields for behavior-detected patterns:
  source       String    @default("user_created")
  // 'user_created'      — user explicitly created via chat ("save $50 every Friday")
  // 'behavior_detected' — pattern detector proposed this automatically

  patternType  String?
  // 'recurring_save' | 'idle_usdc_tolerance' | 'debt_discipline' | etc.
  // null for user_created actions

  detectedAt   DateTime?
  // When the pattern was first observed. null for user_created.
}

// New table for execution records (replaces the existing ad-hoc approach):
model ScheduledExecution {
  id              String   @id @default(cuid())
  scheduledActionId String
  scheduledAction ScheduledAction @relation(...)
  txDigest        String?
  amountUsd       Float
  status          String   // 'success' | 'skipped' | 'failed' | 'cancelled_by_user'
  skipReason      String?
  idempotencyKey  String   @unique  // e.g. "action:clxyz:2026-W16"
  notified        Boolean  @default(false)
  executedAt      DateTime @default(now())
}
```

**Behaviour difference by source:**

| | `user_created` | `behavior_detected` |
|---|---|---|
| Initial stage | 1 (already proposed, user created it) | 0 (detected, not yet surfaced) |
| Surfacing | User created it — no proposal needed | Audric mentions it once in chat when contextually relevant |
| Trust ladder | Starts at Stage 1, same 5-confirm → autonomous path | Starts at Stage 0 → 1 (on user confirmation) → 2 → 3 |
| Settings label | "User-created" | "Auto-detected" |

---

### Engine integration

**New engine tool: `pattern_status`** (read, auto)

```typescript
export const patternStatusTool = buildTool({
  name: 'pattern_status',
  description: 'Show detected behavioral patterns and their current autonomy stage. Use when user asks about automatic actions, what Audric does on its own, or to review autonomous behavior.',
  permissionLevel: 'auto',
  flags: { isReadOnly: true },
  input: z.object({}),
  execute: async (_, ctx) => {
    const actions = await ctx.db.scheduledAction.findMany({
      where: { userId: ctx.userId, stage: { gte: 1 } },
    });
    return actions.map(a => ({
      type: a.patternType ?? 'user_created',
      source: a.source,
      stage: STAGE_LABELS[a.stage],
      executions: a.confirmationsCompleted,
      lastRun: a.lastExecutedAt,
      action: JSON.parse(a.proposedAction),
    }));
  },
});
```

**New engine tool: `pause_pattern`** (write, confirm)

```typescript
export const pausePatternTool = buildTool({
  name: 'pause_pattern',
  description: 'Pause or permanently stop an autonomous action pattern.',
  permissionLevel: 'confirm',
  flags: { isReadOnly: false, irreversible: false },
  input: z.object({
    patternType: z.string(),
    permanent: z.boolean().default(false),
  }),
  execute: async ({ patternType, permanent }, ctx) => {
    await ctx.db.scheduledAction.updateMany({
      where: { userId: ctx.userId, patternType },
      data: permanent ? { enabled: false } : { pausedAt: new Date() },
    });
    return { paused: true, permanent };
  },
});
```

**Proposal injection into the dynamic block:**

When `buildDynamicBlock()` runs, it checks for Stage 0 patterns with confidence > 0.8 that haven't been surfaced in the last 7 days. If any exist, it adds a hint to the dynamic context:

```typescript
// In engine-context.ts buildDynamicBlock():
const pendingProposals = await db.scheduledAction.findMany({
  where: {
    userId,
    source: 'behavior_detected',
    stage: 0,
    confidence: { gte: 0.8 },
    OR: [{ declinedAt: null }, { declinedAt: { lt: sevenDaysAgo } }],
  },
});

if (pendingProposals.length > 0) {
  dynamicBlock += `\n<pending-proposals>
The following behavioral patterns have been detected and not yet proposed to the user.
Mention ONE naturally during this conversation if it's contextually relevant — do not list them all unprompted.
${pendingProposals.map(p => `- ${p.proposedAction}`).join('\n')}
</pending-proposals>`;
}
```

This is the key constraint: Audric never dumps a list of automation proposals at the user. It mentions one, when relevant, conversationally — the way a trusted advisor would.

---

### The trigger execution cron

```typescript
// apps/server/src/cron/jobs/autonomous-actions.ts

export async function runAutonomousActions() {
  const actions = await db.scheduledAction.findMany({
    where: { enabled: true, stage: { gte: 2 }, pausedAt: null },
    include: { user: true },
  });

  for (const scheduledAction of actions) {
    const proposed = JSON.parse(scheduledAction.proposedAction) as ProposedAutonomousAction;

    // Check if this action should fire now
    const shouldFire = await evaluateTrigger(scheduledAction, proposed);
    if (!shouldFire.fire) {
      if (shouldFire.reason) await logSkip(scheduledAction, shouldFire.reason);
      continue;
    }

    // Safety checks before execution
    const agent = await loadAgent(scheduledAction.user);
    const safetyCheck = await runAutonomySafetyChecks(agent, proposed);
    if (!safetyCheck.safe) {
      await logSkip(scheduledAction, safetyCheck.reason);
      // If health factor is the reason, escalate to alert
      if (safetyCheck.reason === 'hf_too_low') {
        await sendHealthAlert(scheduledAction.user, safetyCheck.details);
      }
      continue;
    }

    // Execute
    try {
      const result = await executeAutonomousAction(agent, proposed);
      await logExecution(scheduledAction, result);

      // Stage 2: always notify
      if (scheduledAction.stage === 2) {
        await sendAutonomousActionNotification(scheduledAction.user, scheduledAction, result);
      }

      // Stage 3: notify only if unexpected
      if (scheduledAction.stage === 3 && result.unexpected) {
        await sendAutonomousActionNotification(scheduledAction.user, scheduledAction, result);
      }

      // Promote from Stage 2 → Stage 3 after 3 successful executions
      if (scheduledAction.stage === 2 && scheduledAction.confirmationsCompleted + 1 >= 3) {
        await db.scheduledAction.update({
          where: { id: scheduledAction.id },
          data: { stage: 3, confirmationsCompleted: { increment: 1 } },
        });
      } else {
        await db.scheduledAction.update({
          where: { id: scheduledAction.id },
          data: { confirmationsCompleted: { increment: 1 }, lastExecutedAt: new Date() },
        });
      }
    } catch (err) {
      await logExecutionFailure(scheduledAction, err);
    }
  }
}
```

**Autonomy safety checks** (non-negotiable gates before any autonomous execution):

```typescript
async function runAutonomySafetyChecks(
  agent: T2000,
  action: ProposedAutonomousAction
): Promise<{ safe: boolean; reason?: string; details?: unknown }> {
  const balance = await agent.balance();
  const amount = resolveAmount(action.params, balance);

  // 1. Sufficient balance
  if (amount > balance.available) {
    return { safe: false, reason: 'insufficient_balance' };
  }

  // 2. Health factor won't drop below 1.8 after action
  if (['save_deposit', 'borrow'].includes(action.toolName)) {
    const hf = await agent.healthFactor();
    if (hf.value < 1.8) {
      return { safe: false, reason: 'hf_too_low', details: { current: hf.value } };
    }
  }

  // 3. Amount within user's autonomous permission limit
  const permConfig = await loadUserPermissionConfig(agent.address());
  const tier = resolvePermissionTier(action.toolName, amount, permConfig);
  if (tier !== 'auto') {
    return { safe: false, reason: 'requires_confirmation', details: { tier, amount } };
  }

  // 4. Daily autonomous spend limit not exceeded
  const todaySpend = await getTodayAutonomousSpend(agent.address());
  const dailyLimit = permConfig.autonomousDailyLimit ?? 200;
  if (todaySpend + amount > dailyLimit) {
    return { safe: false, reason: 'daily_limit_exceeded', details: { todaySpend, dailyLimit } };
  }

  return { safe: true };
}
```

---

### How memory, permissions, and autonomy connect

This is the through-line that makes the three features feel like one product:

```
Chain memory detects:
  "User deposits $50 every Friday, confidence 0.91"
        │
        ▼
Permission rules determine:
  save_deposit < $50 → 'auto' tier for this user
        │
        ▼
Pattern proposal surfaces in chat:
  "You've saved ~$50 every Friday for 4 weeks. Automate it?"
        │
  User: "yes"
        │
        ▼
Stage 2: Audric executes + notifies via email (3 times)
  "I saved $50 USDC for you (Friday auto-save). Tx: 0x..."
        │
  No cancellation
        │
        ▼
Stage 3: Silent autonomy
  Every Friday at 9am, Audric saves $50 USDC.
  Email only if something unexpected happens.
        │
        ▼
Morning briefing reflects it:
  "Auto-saved $50 yesterday. Savings balance: $2,650 at 5.0% APY.
   Earning $0.36/day."
```

This is what "Claude-like for DeFi" actually means. Not a smarter chatbot. An agent that watches you long enough to understand your patterns, asks once, then handles it.

---

### Autonomy transparency: the trust dashboard

Users need to see everything Audric is doing autonomously. Add a unified "Schedules & Automations" section to Settings (replacing the existing Settings > Schedules section — same data, expanded to show both user-created and behavior-detected patterns):

**What it shows:**
- Active patterns with stage indicator (Proposed / Confirmed / Autonomous) and source label (User-created / Auto-detected)
- Recent executions with amounts, timestamps, and tx links
- Upcoming scheduled executions (next fire time)
- Per-pattern pause/stop controls
- Daily autonomous spend (today: $X of $Y limit)

**The "explain this" affordance:**
Every autonomous execution notification email includes a link that opens a chat session pre-loaded with: "Explain the autonomous save that just happened and show me the transaction." Users who can see the reasoning give the agent more autonomy. More autonomy means more useful work done.

**The "reverse this" affordance:**
Every Stage 2/3 execution notification includes a "Reverse this" button that pre-fills a chat: "Withdraw $50 from my savings" (the inverse of the auto-save that just fired). For financial actions, users need a one-tap undo path. This is not an automated reversal — it pre-fills the chat and the user confirms, maintaining the human-in-the-loop for any reversal.

---

### Critical: server-side transaction signing

**This is the most important implementation detail in the entire spec and must be resolved before building.**

With zkLogin, the user's ephemeral signing key is session-scoped and never persisted to the server. When the autonomous action cron fires at 9am on Friday and the user isn't online, the server cannot sign a Sui transaction on their behalf via the zkLogin key.

**How the existing `ScheduledAction` system solves this:** Before building `AutonomousPattern`, verify exactly how `runScheduledActions()` currently signs and executes transactions. The mechanism is almost certainly one of:

1. **Allowance contract delegation** — the user pre-authorises the Audric admin key to call specific Move functions on their behalf via the `allowance.move` contract. The admin key (`ADMIN_PRIVATE_KEY` in AWS Secrets Manager) signs transactions that deduct from the user's allowance. If `allowance.move` already permits `save_deposit` as an allowed operation, autonomous saves are already possible without the user's ephemeral key.

2. **Enoki server-side sponsorship** — Enoki may support server-triggered sponsored transactions for zkLogin users. Check Mysten's current Enoki API docs.

**Action required before coding:** Read `apps/server/src/cron/jobs/scheduled-actions.ts` and `executeWithIntent()` to understand the current signing path. If the allowance contract approach is already working for `ScheduledAction`, `AutonomousPattern` uses the identical mechanism — no new signing infrastructure needed. If it isn't solved, this is a blocker that must be resolved first.

---

### AutonomousPattern unification with ScheduledAction

The existing `ScheduledAction` model already has: trust ladder (`confirmationsRequired` / `confirmationsCompleted`), execution tracking, pause/resume, and cron expressions. `AutonomousPattern` has essentially the same shape but is behavior-detected rather than user-created.

**Don't build two parallel autonomous execution systems.** Unify them:

```typescript
model ScheduledAction {
  // ... existing fields ...
  source          String @default("user_created")
  // 'user_created'      — user explicitly typed "save $50 every Friday"
  // 'behavior_detected' — pattern detector proposed this automatically
  patternType     String? // 'recurring_save' | 'idle_usdc_tolerance' | etc. (null for user_created)
  detectedAt      DateTime? // when the pattern was first detected (null for user_created)
}
```

With this single `source` field addition, user-created DCA and behavior-detected patterns share the same trust ladder, cron execution, notification system, and Settings UI. User-created actions start at Stage 2 (already confirmed once by the act of creating them). Detected patterns start at Stage 0 and flow through the proposal pipeline. The Settings > Schedules UI shows both — distinguished by source label, not separate sections.

**This eliminates an entire parallel system and cuts the implementation effort by ~2 days.**

---

### Execution idempotency

If the ECS cron fires twice (container restart, EventBridge rule misconfiguration), the `for (const scheduledAction of actions)` loop could double-execute and auto-save $50 twice. Each autonomous execution needs an idempotency key checked before execution:

```typescript
// Before executing any autonomous action:
const idempotencyKey = `action:${scheduledAction.id}:${getExecutionDateKey(scheduledAction, proposed)}`;
// e.g. "action:clxyz:2026-W16" for a weekly Friday save

const alreadyExecuted = await db.scheduledExecution.findFirst({
  where: { idempotencyKey },
});
if (alreadyExecuted) {
  await logSkip(scheduledAction, 'already_executed_this_period');
  continue;
}

// Proceed with execution, store idempotencyKey in ScheduledExecution record
```

`getExecutionDateKey` returns a string representing the current execution period — for a weekly Friday pattern, it's the ISO week string (`2026-W16`); for a monthly pattern, it's `2026-04`; for a trigger-based pattern with no schedule, it's the date.

---

### Circuit breaker

If a pattern fails 3 executions in a row, auto-pause it and alert the user rather than retrying indefinitely:

```typescript
// In runAutonomousActions(), after logExecutionFailure():
const recentFailures = await db.scheduledExecution.count({
  where: {
    scheduledActionId: scheduledAction.id,
    status: 'failed',
    executedAt: { gte: subDays(new Date(), 14) },
  },
});

if (recentFailures >= 3) {
  await db.scheduledAction.update({
    where: { id: scheduledAction.id },
    data: { pausedAt: new Date() },
  });
  await sendEmail(scheduledAction.user.email, {
    subject: 'Your Friday auto-save has been paused',
    body: `It failed 3 times. Check your settings to resume: audric.ai/settings?section=autonomy`,
  });
}
```

---

### Notification delivery

Stage 2 executions always notify. Stage 3 executions notify only on unexpected results. The delivery channel is **email via Resend** — same infrastructure as morning briefings and health alerts. Users need a record of autonomous actions outside the app; an in-app toast alone isn't sufficient for financial actions.

Email template (Stage 2):
```
Subject: ✓ Saved $50 USDC (Friday auto-save)

Audric saved $50 USDC into NAVI on your behalf.

  Amount: $50.00 USDC
  APY:    5.0%
  Tx:     https://suiscan.xyz/mainnet/tx/...

This is execution 2 of 3 before going fully automatic.
[View in Audric →]  [Pause this action →]
```

Email template (Stage 3, unexpected):
```
Subject: ⚠ Friday auto-save skipped — low balance

Your scheduled Friday save was skipped because your available
balance ($8.42) was below the $50 target.

[Top up] or [Edit the save amount →]
```

"Unexpected" is defined as: insufficient balance, health factor gate triggered, daily limit reached, or amount differed by >20% from the pattern's historical median.

---

### Testing strategy

Before shipping, the autonomous action loop requires:

**Unit tests** (for each classifier in `chain-memory/classifiers.ts`):
- `detectRecurringSave` returns null for < 3 deposits
- `detectRecurringSave` returns null for inconsistent amounts (>20% variance)
- `classifyRiskProfile` returns null for < 7 snapshots
- Correct confidence scores at various data volumes

**Integration tests** (for the safety check pipeline):
- Insufficient balance → `safe: false, reason: 'insufficient_balance'`
- HF < 1.8 → `safe: false, reason: 'hf_too_low'`
- Amount above permission tier → `safe: false, reason: 'requires_confirmation'`
- Daily limit exceeded → `safe: false, reason: 'daily_limit_exceeded'`

**Idempotency tests**:
- Cron runs twice in same period → second run skips all patterns
- Pattern with `alreadyExecuted` record → logged as `already_executed_this_period`

**Circuit breaker test**:
- 3 consecutive failures → pattern paused, alert email triggered

**E2E test** (staging environment only):
- Pattern at Stage 2, cron fires → execution recorded, email sent, `executions` incremented
- Pattern at Stage 2 with 3 executions → promoted to Stage 3
- Stage 3 pattern with unexpected result → email sent

---

### New files for Initiative 4

```
audric/apps/web/lib/chain-memory/classifiers.ts       — behavioral pattern classifiers
audric/apps/web/lib/chain-memory/types.ts             — ChainFact interface
audric/apps/web/app/api/internal/chain-memory/route.ts — internal route called by cron
packages/engine/src/permission-rules.ts               — UserPermissionConfig, resolvePermissionTier
packages/engine/src/tools/autonomy.ts                 — pattern_status, pause_pattern tools
apps/server/src/cron/jobs/chain-memory.ts             — nightly chain memory extraction
apps/server/src/cron/jobs/autonomous-actions.ts       — trigger evaluation + execution (unified with ScheduledAction)
apps/server/src/autonomy/trigger-evaluator.ts         — condition-based trigger logic
```

### Modified files

```
apps/server/prisma/schema.prisma     — add source + patternType + detectedAt to ScheduledAction
                                       add AutonomousExecution table with idempotencyKey
audric/app/api/engine/chat/route.ts  — inject permissionConfig into ToolContext
packages/engine/src/engine.ts        — USD resolution + permission check at dispatch time
packages/engine/src/engine-context.ts — pending pattern proposals injection
audric/app/settings/page.tsx         — Autonomy/Schedules unified section + trust dashboard
```

**Effort:** ~8 days (revised from 5). Verify signing mechanism + unify with ScheduledAction (~1.5d), classifiers + internal API (~1.5d), trigger cron + idempotency + circuit breaker (~2d), engine permission dispatch + USD resolution (~1d), Settings UI + trust dashboard (~1d), tests (~1d).

---

## Initiative 5: Public wallet intelligence report

### Why this belongs in the spec

`audric.ai/report/[address]` is an acquisition funnel — any Sui wallet address gets a free, no-signup financial analysis in seconds. It reuses canvas infrastructure already built (Phase AC), has zero legal risk, and works immediately for anyone with no Audric history. Every person who generates a report and finds it useful is a conversion opportunity. The "Audric would do this for you" section at the bottom is the pitch.

This is the valuable half of the growth & tax spec (`audric-growth-tax-spec.md`). The tax engine was descoped; this wasn't.

### What it builds

**Public mode** (`audric.ai/report/[address]`): Any valid Sui address. No signup. Single-wallet analysis. 24-hour cache. Rate-limited to 5 per IP per hour. Reuses `WatchAddressCanvas` subcomponents — no new component tree.

**Signed-in mode**: Not a separate page. `render_canvas({ template: 'full_portfolio' })` extended to aggregate across all `LinkedWallet` rows. The existing `FullPortfolioCanvas` 4-panel grid gets a wallet-switcher tab and aggregated totals header.

**Multi-chain acquisition** (future): The `ChainAdapter` abstraction makes `audric.ai/report/[address]` chain-agnostic via address format detection (64-char hex = Sui, 40-char hex = EVM). Adding Ethereum support later means the page becomes a universal free tool for an audience orders of magnitude larger than Sui-only — with no changes to report or display logic.

### LinkedWallet schema

```prisma
model LinkedWallet {
  id          String    @id @default(cuid())
  userId      String
  suiAddress  String
  label       String?   // "Cold storage", "Trading wallet"
  isPrimary   Boolean   @default(false)
  verifiedAt  DateTime? // Required for tax reports (when shipped). Optional for analytics.
  addedAt     DateTime  @default(now())

  user        User      @relation(fields: [userId], references: [id])

  @@unique([userId, suiAddress])
  @@index([userId])
}
```

Ownership verification (Ed25519 signature challenge) is not required for the public report — it reads public chain data. It is built now so the schema is ready when the tax engine ships later.

### WalletReportData type

```typescript
// audric/apps/web/lib/report/types.ts

interface WalletReportData {
  address: string;
  generatedAt: string;

  portfolio: {
    totalUsd: number;
    tokens: Array<{ symbol: string; amount: number; usdValue: number }>;
    savingsUsdc: number;
    savingsApyRate: number;
    debtUsdc: number;
    healthFactor: number | null;
  };

  yieldEfficiency: {
    totalStableUsd: number;
    earningUsd: number;
    idleUsd: number;
    efficiencyPct: number;       // earningUsd / totalStableUsd
    dailyYieldUsd: number;
    potentialDailyYieldUsd: number;
    opportunityCostPerMonth: number;
  };

  activity: {
    txCount30d: number;
    txCount90d: number;
    swapCount90d: number;
    lastActivityAt: string | null;
  };

  patterns: Array<{             // Behavioral observations in plain English
    label: string;
    description: string;
    confidence: 'high' | 'medium' | 'low';
  }>;

  riskSignals: Array<{
    severity: 'high' | 'medium' | 'low';
    message: string;
  }>;

  audricWouldDo: Array<{        // The conversion pitch
    action: string;
    reason: string;
    estimatedImpact: string;    // "$0.04/day additional yield"
  }>;
}
```

### ChainAdapter abstraction

Both the public report and the eventual tax engine share the same transaction history pipeline. Wrapping it behind a `ChainAdapter` interface means neither calls Sui RPC directly, and adding Ethereum later requires only a new adapter:

```typescript
// audric/apps/web/lib/report/transaction-pipeline.ts

export interface ChainAdapter {
  chainId: 'sui' | 'ethereum' | 'base';
  fetchTransactionHistory(address: string, options: { fromDate?: Date }): Promise<RawTx[]>;
  classifyTransaction(tx: RawTx, userAddress: string): ClassifiedTx;
  fetchBalances(address: string): Promise<TokenBalance[]>;
  fetchYieldPositions(address: string): Promise<YieldPosition[]>;
}

export function detectChain(address: string): 'sui' | 'evm' | 'unknown' {
  if (/^0x[0-9a-fA-F]{64}$/.test(address)) return 'sui';
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return 'evm';
  return 'unknown';
}
```

`SuiAdapter` wraps existing `suix_queryTransactionBlocks` pagination logic. `EVMAdapter` is a stub that throws — implemented when multi-chain ships.

### Public route

```typescript
// audric/apps/web/app/report/[address]/page.tsx
// Rate limited: 5/IP/hour via Upstash
// Cached: 24h per address in PublicReport table
// UI: reuses WatchAddressCanvas subcomponents directly — no new component tree
// OG image: generateMetadata() returns amount + label for link previews in WhatsApp/Slack
```

The report page is mobile-first — most people will share these links in messaging apps. OG metadata makes the preview look good: "0x7f20...f6dc — $2,847 portfolio · 62% yield efficiency · 3 suggestions".

### FullPortfolioCanvas multi-wallet extension

The existing `FullPortfolioCanvas` (CA-7, already built) gains a wallet-switcher tab bar in multi-wallet mode:

```
┌──────────────────────────────────────────────────────┐
│  YOUR FINANCIAL OVERVIEW                     [↗]    │
│  [All Wallets ▼] [Primary 0x7f20] [Cold 0xa3b1]    │
│  $2,847 total across 2 wallets                      │
│──────────────────────────────────────────────────────│
│  [existing 4-panel grid, unchanged]                  │
└──────────────────────────────────────────────────────┘
```

The 4-panel grid, expand behaviour, and action buttons are unchanged. Only the header and data source change in multi-wallet mode.

### PublicReport cache schema

```prisma
model PublicReport {
  id          String    @id @default(cuid())
  suiAddress  String
  reportData  Json
  viewCount   Int       @default(0)
  generatedAt DateTime  @default(now())
  expiresAt   DateTime
  @@index([suiAddress])
}
```

### New files for Initiative 5

```
audric/app/report/page.tsx                              — address input landing
audric/app/report/[address]/page.tsx                    — public report page
audric/app/report/[address]/opengraph-image.tsx         — OG image for social sharing
audric/lib/report/types.ts                              — WalletReportData type
audric/lib/report/transaction-pipeline.ts               — ChainAdapter + SuiAdapter + EVMAdapter stub
audric/lib/report/classifier.ts                         — transaction classifier
audric/lib/report/generator.ts                          — generateWalletReport()
audric/app/api/analytics/portfolio-multi/route.ts       — multi-wallet aggregation
audric/app/api/wallet/link/route.ts                     — link a new wallet
audric/app/api/wallet/challenge/route.ts                — signature challenge
audric/app/api/wallet/verify/route.ts                   — verify ownership
```

### Modified files

```
audric/app/settings/page.tsx                            — Settings > Wallets section
audric/components/engine/canvas/FullPortfolioCanvas.tsx — multi-wallet tab extension
packages/engine/src/tools/canvas.ts                     — full_portfolio multi-wallet mode
apps/server/prisma/schema.prisma                        — LinkedWallet, PublicReport tables
```

**Effort:** ~5 days total. LinkedWallet schema + wallet management UI (~1d), ChainAdapter + SuiAdapter + classifier (~1.5d), generateWalletReport + public route (~1.5d), FullPortfolioCanvas multi-wallet extension (~1d).

---

## Initiative 6: Self-hosting roadmap

The driver is all three: cost reduction, domain fine-tuning, and data privacy. This is a 12-18 month horizon, not a 90-day priority. Here's the correct sequencing.

### Stage 1: Reduce Anthropic dependency (now, no self-hosting)

Before self-hosting, reduce the surface area:

**Prompt caching audit:** Run an analysis of your `CostTracker` data in production. What's the cache hit rate on the static system prompt? If it's below 70%, your dynamic block is changing too frequently and invalidating the cache. Each 10% improvement in cache hit rate cuts your Anthropic bill by ~15-20%.

**Model routing:** Use `claude-haiku-4-5` for simple queries (balance checks, rate lookups, routine saves under $50) and `claude-sonnet-4-6` for complex queries (multi-step DeFi operations, health factor explanations). The `classifyEffort()` function already exists — wire it to model selection, not just thinking budget.

```typescript
// In engine-factory.ts
const model = effort === 'low' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6';
```

**Important validation step before shipping:** `classifyEffort()` currently only sets `outputConfig.effort` and `maxTokens` — it does not change the model. Wiring it to model selection is a small code change but requires validation that Haiku handles the full set of 47 tool definitions correctly. Haiku has a smaller context window than Sonnet — run a sample of 50 real `low`-effort sessions through Haiku and verify correct tool selection and parameter accuracy before deploying to all users.

**Synthetic query caching:** For truly static responses (current APYs, token prices, protocol info), cache at the application layer for 60 seconds. Don't call the LLM to answer "what's the current USDC APY" 50 times in a minute from 50 users — call it once, cache the structured response, let the LLM compose from cached context.

### Stage 2: Evaluate open models (3-6 months)

Once you have meaningful user volume, evaluate open models as the harness model (not the reasoning model):

**Candidate models for financial tool calling:**
- **Qwen2.5-72B-Instruct** — strong tool use, available on Together AI (~5x cheaper than Sonnet)
- **Llama-3.3-70B-Instruct** — Meta's best tool-use model, runs on Groq (fast inference)
- **DeepSeek-V3** — excellent reasoning, strong Chinese financial context (may not matter)
- **Mistral-Large-2** — solid tool calling, European data residency if privacy matters

**Evaluation framework:** Build an Audric-specific eval set of 200 queries across categories: balance queries, DeFi operations, health factor alerts, complex multi-step operations. Score on: correct tool selection, correct tool parameters, refusal rate on invalid operations, latency. Run Sonnet as baseline.

Open models typically need fine-tuning to match Sonnet on domain-specific tool calling. The eval data you generate becomes your fine-tuning dataset.

### Stage 3: Fine-tuning on domain data (6-12 months)

The fine-tuning dataset builds naturally from production:

1. Every accepted `pending_action` is a positive example: this user said this thing, the model called this tool with these params, the user confirmed — correct.
2. Every rejected `pending_action` is a negative example or an ambiguity example.
3. Every autonomous action execution is a behavioral trace.
4. Guard runner interventions are safety examples.

By 1,000 active users, you'll have enough signal to fine-tune a 7-70B model to match Sonnet's performance on Audric-specific queries at 10x lower cost.

**Infrastructure for fine-tuning:**
- Dataset generation: filter `SessionUsage` for high-quality sessions (user didn't cancel, no error events, low token count)
- Fine-tuning: Unsloth + QLoRA for 70B models on a rented H100 (~$2/hour on Lambda Labs)
- Serving: vLLM on a persistent GPU instance once fine-tuned model is production-ready
- Target: 2x A100 80GB (can serve 70B at ~200 tokens/second) — ~$3,000/month vs potentially $15-20K/month Anthropic at scale

### Stage 4: Hybrid routing (12-18 months)

Production architecture once fine-tuned model is validated:

```
Query arrives
    │
    ├── classifyEffort() → 'low'
    │   → Fine-tuned Audric-70B (self-hosted, ~$0.0002/1k tokens)
    │   → Handles: balance queries, routine saves, standard DeFi ops
    │
    └── classifyEffort() → 'medium' | 'high'
        → Claude Sonnet 4.6 (Anthropic API)
        → Handles: complex multi-protocol queries, unusual requests, reasoning-heavy turns
```

This hybrid approach reduces Anthropic spend by 70-80% while maintaining quality on complex queries where the fine-tuned model underperforms.

**Data privacy note:** For Stage 2+, user financial data leaves your infrastructure when you call external APIs. If privacy is a hard requirement, the timeline accelerates: skip to Stage 3/4 and accept higher initial infrastructure cost.

---

## Initiative 7: Sequencing for a solo builder

The mistake is trying to build everything in parallel. Here's the dependency-ordered execution plan.

### Phase A: Quick wins (Week 1-2)
*Highest impact, lowest risk*

1. **Session pre-fetch** (0.5 days) — instant perceived performance on first message
2. **Extended thinking on by default** (0.5 days) — remove `ENABLE_THINKING` flag, `low` effort as floor
3. **Model routing: Haiku for low effort** (0.5 days) — immediate cost reduction
4. **Live stats on Audric.ai** (0.5 days) — trust signal, removes the "— Users" embarrassment
5. **Grace period UX for empty allowance** (1 day) — prevents user loss on allowance drain
6. **Session URL routing** (0.5 days) — add `app/chat/[sessionId]/page.tsx`, sync URL on session load/create. Currently all sessions open as `/new` with session ID in React state only — no bookmarking, no deep-linking, refresh loses the loaded session. Phase D notification emails need linkable sessions ("Explain the autonomous save that just happened").

Phase A total: ~3.5 days. Ships in week 1-2. Users feel the difference immediately.

### Phase B: Harness upgrades (Week 2-4)
*Architecture work, unlocks everything else*

1. **Streaming tool execution** (5 days) — biggest latency win, most complex change; touches the engine's core loop
2. **Tool result budgeting** (1 day) — truncation with narrow-parameter hint, no external store
3. **Microcompact** (0.5 days) — deduplicate identical tool calls, zero model cost
4. **Granular permission rules** (2 days) — USD resolution + per-operation thresholds

Phase B total: ~8.5 days.

### Phase C: Chain-native memory (Week 4-6)
*Requires Phase B stable. Feeds Phase D.*

1. **Chain Memory Pipeline** (2.5 days) — classifiers over AppEvent + PortfolioSnapshot, internal API route
2. **Prompt injection** (0.5 days) — `source` field on UserMemory, wire into buildMemoryContext

Phase C total: ~3 days.

### Phase D: Autonomous action loop (Week 6-9)
*Requires Phase B (permissions) and Phase C (chain memory). This is the product unlock.*
*First task: read `runScheduledActions()` + `executeWithIntent()` to confirm server-side signing mechanism.*

1. **Verify signing + unify with ScheduledAction** (1.5 days) — add `source`, `patternType`, `detectedAt` fields; confirm execution path
2. **Behavioral pattern detector** (1.5 days) — classifiers over AppEvent + PortfolioSnapshot in `audric/lib/chain-memory/`
3. **Trigger cron + idempotency + circuit breaker** (2 days) — execution loop, idempotency key, 3-failure auto-pause
4. **Engine tools + proposal injection** (1.5 days) — `pattern_status`, `pause_pattern`, dynamic block hint
5. **Settings UI trust dashboard + notification emails** (1.5 days) — unified Schedules & Automations section, Resend templates

Phase D total: ~8 days.

### Phase E: Public wallet intelligence report (Week 8-10)
*Independent of Phase D. Can start as early as Week 6 if capacity allows.*

1. **LinkedWallet schema + wallet management UI** (1 day) — Settings > Wallets, signature verification routes
2. **ChainAdapter + SuiAdapter + transaction classifier** (1.5 days) — shared pipeline for report and future tax engine
3. **generateWalletReport() + public route** (1.5 days) — `audric.ai/report/[address]` with rate limiting + 24h cache
4. **FullPortfolioCanvas multi-wallet extension** (1 day) — wallet-switcher tab, `/api/analytics/portfolio-multi`

Phase E total: ~5 days.

### Phase F: gRPC migration (Start no later than June 16)
*Hard deadline: July 31, 2026. Non-negotiable.*

Sui JSON-RPC is fully deprecated July 31. Missing this deadline means every balance check, health factor lookup, and transaction history call goes dark simultaneously. This is a correctness deadline, not a performance opportunity — gRPC itself won't improve latency noticeably. Run in parallel with Phase E.

**Actual scope:** ~38 files in t2000 monorepo + ~9 in Audric. The original estimate of 28 t2000 files was stale. Additionally, `packages/engine/src/sui-rpc.ts` uses raw `fetch()` against JSON-RPC directly (not `SuiJsonRpcClient`) — this file won't appear in a `SuiJsonRpcClient` grep and must be migrated separately. Allow 7 days, not 6, to account for the higher file count and the raw-fetch edge case. Start June 16 to have 6 weeks of buffer before July 31.

### Phase G: Self-hosting evaluation (Month 4+)
*Requires production data from real users*

Start eval set construction at 100+ active users. First fine-tuning run at 500+. Hybrid routing in production at 1,000+.

---

### The full dependency graph

```
Phase A (week 1–2): quick wins — no deps
    │
    ▼
Phase B (week 2–4): harness upgrades
    │
    ├──────────────────────────────────────────────┐
    ▼                                              ▼
Phase C (week 4–6): chain memory        Phase E (week 8–10): public wallet report
    │                                              (independent, can start week 6)
    ▼
Phase D (week 6–9): autonomous loop ◄── requires B + C
    │
    ▼
Phase F (start June 16): gRPC migration ◄── hard deadline July 31, parallel with E
    │
    ▼
Phase G (month 4+): self-hosting ◄── requires real user data
```

---

## How the features compound

At full build-out, the features are not additive — they are multiplicative:

**Without chain memory:** Audric asks "want to automate your Friday saves?" but doesn't know you've been doing this manually for 8 weeks. The proposal feels cold and generic.

**Without granular permissions:** Audric detects the pattern and proposes it, but even after you say yes, it still asks for confirmation every time because $50 sits above the default auto threshold. The autonomy never materializes.

**Together:** Audric knows your patterns from chain data, has permission to act within them, and acts silently. Every Friday at 9am, $50 saves itself. You open the app and the activity feed shows twelve autonomous saves, compounding at 5% APY. The trust dashboard shows exactly what ran, when, and why. That is the Claude-like experience — not a better chatbot, an agent you trust enough to hand recurring financial decisions to.

**The public report as acquisition:** `audric.ai/report/[address]` shows a prospective user exactly what Audric would do with their wallet. "You have $340 idle USDC earning 0%. Audric would auto-save it when it lands. Your yield efficiency is 62% — Audric would get it to 95%." The report is the pitch. The conversion is one tap.

---

## Architecture — full Audric 2.0 stack

```
User
  │
  ▼
Chat UI (audric.ai)
  │ SSE stream
  ▼
QueryEngine (upgraded)
  ├── Early tool dispatcher        [1a]  — mid-stream read-tool execution (engine.ts)
  ├── Tool result budgeting        [1b]  — per-tool size limits + truncation hint
  ├── Microcompact                 [1c]  — deduplicate identical tool calls, free
  ├── Session pre-fetch upgrade    [1d]  — synthetic tool results injected at session start
  ├── Granular permission rules    [3]   — USD-resolved dollar-threshold tiers (engine layer)
  └── Extended thinking (always on)      — low effort as floor

Memory system
  ├── Conversation facts             [existing]
  ├── Chain-derived facts            [2]   — deposit patterns, risk profile, behavior (AppEvent + PortfolioSnapshot)
  └── Proposal injection             [4]   — pending patterns surfaced contextually

Autonomous action loop              [4]  — unified with ScheduledAction (source field)
  ├── BehavioralPatternDetector      — classifiers over AppEvent + PortfolioSnapshot
  ├── ConfidenceGatedProposals       — surfaces one proposal at a time, conversationally
  ├── TrustLadder                    — Stage 0 detected → 1 proposed → 2 confirmed → 3 autonomous
  ├── TriggerEvaluator               — schedule-based and condition-based triggers
  ├── AutonomySafetyChecks           — hf, balance, permission tier, daily limit, idempotency
  ├── CircuitBreaker                 — auto-pause after 3 consecutive failures
  └── TrustDashboard (Settings UI)   — unified Schedules & Automations, reverse affordance

Public wallet report                [5]
  ├── ChainAdapter / SuiAdapter      — chain-agnostic transaction pipeline
  ├── Transaction classifier         — navi_deposit, cetus_swap, transfer_in, etc.
  ├── generateWalletReport()         — yield efficiency, patterns, risk signals, suggestions
  ├── audric.ai/report/[address]     — public, no signup, 24h cache, rate limited
  ├── LinkedWallet schema            — foundation for multi-wallet + future tax engine
  └── FullPortfolioCanvas multi-wallet extension

LLM routing                         [6]
  ├── low effort   → claude-haiku-4-5   (~60% of sessions, validate first)
  └── medium/high  → claude-sonnet-4-6  (~40% of sessions)

Infrastructure (unchanged)
  ├── AppEvent + PortfolioSnapshot → feed Chain Memory classifiers + pattern detector
  └── ECS cron → autonomous action trigger evaluation
```

---

## Success metrics

**Harness upgrades:**
- p50 latency on multi-tool queries: target < 3s (from ~6-8s)
- Context overflow rate: target < 5% of sessions
- LLM compaction cost per session: target 40% reduction

**Chain memory:**
- % of users with > 5 chain-derived memory facts at 30 days: target 80%
- % of users with non-empty profile at 7 days: target 95%

**Autonomous actions:**
- % of users who progress a pattern from Stage 1 → Stage 2: target 40%
- % of Stage 2 patterns that reach Stage 3 (fully autonomous): target 70%
- Autonomous action cancellation rate (user says stop): target < 5%

**Public wallet report:**
- Weekly unique report page views: target 500+ within 60 days of launch
- Report → signup conversion rate: target > 8%
- Social share rate (OG link previews shared): track as leading indicator

**Model routing:**
- % of sessions on Haiku: target 60-70%
- Anthropic cost per active user per month: target < $0.15

**Self-hosting (12 months):**
- Fine-tuned model eval score vs Sonnet baseline on Audric eval set: target > 90%
- Anthropic API cost reduction: target 70%

---

## What this spec does NOT cover

- **Crypto tax accounting** — descoped. Full spec lives in `audric-growth-tax-spec.md`. Revisit when you have 1,000+ active users with 6+ months of Audric transaction history. The `LinkedWallet` model and `ChainAdapter` built in Phase E are the foundation — when tax ships, the pipeline is already there.
- **Phase 5 (Store)** — deferred until 500+ active users
- **Multi-chain (EVM)** — `EVMAdapter` stub is built in Phase E but not implemented. Full Ethereum/Base support is a separate feature when timing is right.
- **Autonomous actions for borrows** — intentionally excluded; borrows always require explicit confirmation regardless of permission tier
- **gRPC migration details** — mechanical work specced in `PRODUCT_SPEC.md` Phase 5 section. Start June 16, done before July 31.
- **`TransactionRecord` indexer** — the chain memory MVP uses `AppEvent` + `PortfolioSnapshot` only. A full on-chain indexer (querying Sui RPC and persisting all user transactions) is deferred — not needed for the behavioral patterns that matter for autonomous action detection.
- **ChainAdapter / YAGNI concern** — the `ChainAdapter` abstraction in Initiative 5 adds interface complexity for a single-chain product. If multi-chain feels too speculative, drop the abstraction and query Sui directly; refactor when EVM support is actually prioritised. The `LinkedWallet` model is worth keeping regardless.

---

## UI/UX considerations

The spec is engine-heavy. This section covers the user-facing surfaces each phase touches, new components needed, and UX decisions that must be made before implementation.

### Proposal card (`ProposalCard`)

When the autonomous action loop (Phase D) detects a pattern and surfaces it in chat, the model should not generate free-text proposals that vary every time. Build a structured `ProposalCard` in `components/engine/cards/ProposalCard.tsx` with:

- Pattern description ("You've saved ~$50 every Friday for 4 weeks")
- Proposed action summary ("Auto-save $50 USDC every Friday at 9am")
- **Accept** / **Decline** buttons (not free-text yes/no)
- "Learn more" expandable with historical data (amounts, dates, consistency score)

The engine returns this as a `pending_action` with `type: 'pattern_proposal'`. The chat UI renders `ProposalCard` instead of `PermissionCard`. On accept, the client POSTs to `/api/schedules` to create the `ScheduledAction` with `source: 'behavior_detected'`. On decline, POSTs to mark the pattern declined for 30 days.

This ensures consistent UX across all proposals and gives reliable structured input back to the engine — no ambiguity about whether "sure" or "maybe later" counts as acceptance.

### Streaming tool loading states (Phase B)

Streaming tool execution (1a) changes how the chat UI shows tool progress. Currently `UnifiedTimeline` renders all tool results at once after the stream closes. With early dispatch:

- `AgentStep` must accept a `status: 'loading' | 'complete' | 'error'` prop per tool
- Completed tool results render immediately with their rich card (`BalanceCard`, `SavingsCard`, etc.)
- In-flight tools show a skeleton/spinner with the tool name ("Checking savings...")
- `ToolResultCard` re-renders in-place when the result arrives — no layout shift
- Tool results display in the original call order even if tool 2 finishes before tool 1

Modified files: `components/engine/AgentStep.tsx`, `components/engine/ToolResultCard.tsx`, `components/dashboard/UnifiedTimeline.tsx`.

### Activity feed integration (Phase D)

Autonomous action executions must appear in the Activity tab — not just email. The existing `ActivityFeed` component renders `FeedItemCard` rows. Add a new feed item type:

```typescript
interface AutonomousExecutionFeedItem {
  type: 'autonomous_execution';
  scheduledActionId: string;
  source: 'user_created' | 'behavior_detected';
  toolName: string;
  amountUsd: number;
  txDigest: string | null;
  status: 'success' | 'skipped' | 'failed';
  executedAt: string;
}
```

Activity tab gains an unread badge/dot when new autonomous executions exist since the user's last visit. The badge clears on tab focus. This uses a `lastSeenAutonomousAt` timestamp in `UserPreferences`.

### In-app notification for autonomous actions

Email alone is insufficient for users who are already in the app. When an autonomous action executes:

1. **Activity feed** — new `FeedItemCard` row (above)
2. **Activity tab badge** — dot indicator on the "Activity" tab in `DashboardTabs`
3. **Morning briefing inclusion** — autonomous executions from the last 24h summarised in the next morning briefing ("Auto-saved $50 yesterday. Savings balance: $2,650.")

No toast/popup — financial actions should not surprise users with ephemeral UI. The Activity tab and email are durable surfaces the user can review at their own pace.

### Empty states

New Settings sections need empty states that educate rather than just say "nothing here":

**Trust dashboard (zero patterns detected):**
> "As you use Audric, I'll learn your financial patterns — like regular saves or consistent debt repayment. When I'm confident enough, I'll suggest automating them. Your existing scheduled actions appear here too."

**Settings > Wallets (primary wallet only):**
> "Your primary wallet is linked automatically. Add additional wallets to see a combined portfolio view and get a unified financial report."

**Settings > Permissions (defaults loaded):**
> "These thresholds control when Audric acts automatically vs. asks for confirmation. The defaults are conservative — adjust as you build trust."

### Permission UX simplification

The spec defines per-operation sliders with two thresholds each (autoBelow + confirmBetween). That's 12+ inputs on a single Settings section. For v1, simplify:

**Three presets:** Conservative / Balanced / Aggressive
- Conservative: auto below $5 for all, confirm below $100
- Balanced: auto below $25 for saves/swaps, $10 for sends, confirm below $500
- Aggressive: auto below $50 for saves, $25 for sends/swaps, confirm below $1000

**"Customise" toggle** reveals per-operation sliders for users who want granular control. Presets map directly to `UserPermissionConfig.rules[]` — same engine interface, friendlier UI.

The daily autonomous spend limit (`autonomousDailyLimit`) is always visible regardless of preset — this is the global safety net and should be prominent.

### Report page sharing (Phase E)

`audric.ai/report/[address]` is an acquisition funnel. Sharing mechanics are critical:

- **Copy link** button (top of report, sticky on mobile)
- **Share to Twitter** — pre-filled tweet: "My Sui wallet financial report by @AudricAI — {efficiencyPct}% yield efficiency, {suggestions} optimization suggestions"
- **Share to Telegram** — deep link with OG preview
- **Download as image** — `html2canvas` snapshot of the report summary card for sharing in Discord/group chats
- **QR code** — for the report URL, useful for in-person sharing at events

OG metadata (already specified) handles link previews in WhatsApp/Slack/Discord automatically.

### Mobile responsiveness

The report page is already noted as mobile-first. Other new surfaces need the same attention:

- **Trust dashboard** — execution history table collapses to a card list on mobile. Stage indicators use icons (shield outline → shield half → shield solid) instead of text labels.
- **Permission sliders** — preset selector works well on mobile. Per-operation sliders stack vertically with clear labels.
- **Wallet management** — address truncation with copy button. Signature challenge needs clear mobile UX (wallet connects via mobile browser deeplink).
- **Proposal card** — full-width on mobile with large tap targets for Accept/Decline.

### Session URL deep links (Phase A + D interaction)

Phase A adds `/chat/[sessionId]` routing. Phase D notification emails link to specific sessions. The interaction:

- Stage 2 email "View in Audric" links to: `audric.ai/chat/new?q=Explain+the+autonomous+save+that+just+happened`
- Stage 2 email "Reverse this" links to: `audric.ai/chat/new?q=Withdraw+$50+from+my+savings`
- Stage 2 email "Pause this" links to: `audric.ai/settings?section=autonomy`
- Circuit breaker email links to: `audric.ai/settings?section=autonomy&highlight={actionId}`

The `/chat/new` route accepts a `?q=` query parameter that pre-fills the input bar. The user sees the pre-filled message and sends it — Audric never auto-sends on their behalf from a deep link.

---

## Cross-cutting: Testing + Documentation

Testing and documentation are not a separate phase — they run alongside each phase. Budget them explicitly or they'll be skipped under shipping pressure.

### Testing (~2 days, distributed across phases)

**Phase B — Engine unit tests (0.5 days):**
- `EarlyToolDispatcher`: read-only tool dispatched mid-stream, write tool queued until stream closes
- `EarlyToolDispatcher`: stream failure with in-flight tools → synthetic error results
- `EarlyToolDispatcher`: abort signal propagation kills running tools
- `EarlyToolDispatcher`: results yield in original call order regardless of completion order
- `truncateToolResult`: result under limit → unchanged; over limit → truncated with hint
- `truncateToolResult`: custom `summarizeOnTruncate` called when provided
- `deduplicateToolCalls` (microcompact): identical consecutive calls → single execution, cached result
- `resolvePermissionTier`: amount below autoBelow → `'auto'`; between → `'confirm'`; above → `'explicit'`
- `resolveUsdValue`: USDC tools return 1:1; non-USDC tools multiply by price cache; unknown tool returns 0

**Phase C — Classifier tests (0.25 days):**
- `classifyDepositPattern`: < 3 deposits → null; consistent amounts/days → pattern with correct confidence
- `classifyRiskProfile`: < 7 snapshots → null; HF never below 2.5 → "conservative"; HF reached 1.4 → "near-liquidation"
- `classifyYieldBehavior`: user never withdraws → "compounds"; claims and re-saves → "reinvests"
- Chain memory cron: integration test — seed AppEvent + PortfolioSnapshot rows, run extraction, verify UserMemory records created with `source: 'chain'`

**Phase D — Autonomous action tests (0.75 days):**
- Safety checks: insufficient balance → `safe: false`; HF < 1.8 → `safe: false`; above permission tier → `safe: false`; daily limit exceeded → `safe: false`
- Idempotency: cron runs twice in same period → second run skips with `'already_executed_this_period'`
- Circuit breaker: 3 consecutive failures → pattern auto-paused, email triggered
- Trust ladder: Stage 2 with 3 successful executions → promoted to Stage 3
- Stage 3 unexpected result (amount differs >20%) → notification email sent
- Pattern proposal injection: Stage 0 pattern with confidence > 0.8 → appears in dynamic block; declined pattern → not surfaced for 30 days
- E2E (staging): cron fires → ScheduledExecution created → email sent → verify tx on testnet

**Phase E — Report tests (0.25 days):**
- `generateWalletReport`: valid Sui address → `WalletReportData` with portfolio, yield efficiency, patterns
- `generateWalletReport`: invalid address → error
- Rate limiting: 6th request from same IP within 1 hour → 429
- Report cache: second request for same address within 24h → cached response, no RPC calls
- OG image: `opengraph-image.tsx` returns valid PNG with address + portfolio summary

**Regression (0.25 days per phase):**
After each phase ships, verify existing features still work:
- Chat flow: send a message → streaming response → tool results → rich cards render
- Chip flows: Save, Send, Swap, Credit → confirmation → transaction → receipt
- Canvas: portfolio timeline, activity heatmap, spending breakdown, full portfolio
- DCA/Schedules: create → execute → trust ladder progress
- Morning briefing: triggers on first visit of day
- Settings: all sections load, preferences save

### Documentation (~1.5 days, after Phase E ships)

Documentation updates should happen in a single pass after all features are stable, not piecemeal during implementation. One focused day of doc work is more consistent than scattered updates.

**Audric repo:**

| File | What to update |
|------|---------------|
| `CLAUDE.md` | Add sections: permission rules (engine layer), chain memory pipeline, autonomous action loop (trust ladder, ScheduledAction unification), trust dashboard, ProposalCard, public report route, session URL routing, deep link query params, new email templates, new engine tools (`pattern_status`, `pause_pattern`) |
| `README.md` | Add "How Audric works" section explaining the autonomy loop. Add public report (`/report/[address]`) as a feature. Update feature list with chain memory, autonomous actions, permission presets. Update tool count |

**t2000 repo:**

| File | What to update |
|------|---------------|
| `CLAUDE.md` | Engine section: add `EarlyToolDispatcher`, `truncateToolResult`, `resolvePermissionTier`, `resolveUsdValue` to import patterns. Add `Tool.maxResultSizeChars` and `Tool.summarizeOnTruncate` to tool interface. Update tool permission levels section with USD-aware resolution |
| `packages/engine/README.md` | New exports: `permission-rules.ts` (PermissionRule, UserPermissionConfig, resolvePermissionTier, DEFAULT_PERMISSION_CONFIG). Updated `runTools` behavior (early dispatch for read-only tools). Tool result budgeting API |
| `PRODUCT_FACTS.md` | Update tool count (currently 47 → will grow with `pattern_status`, `pause_pattern`). Add autonomous action capabilities. Update engine version |
| `spec/REASONING_ENGINE.md` | Add sections: streaming tool execution (EarlyToolDispatcher pattern), tool result budgeting (maxResultSizeChars, truncation), microcompact tier in compaction hierarchy |
| `audric-build-tracker.md` | Mark phases complete as they ship. Update status column for each task row |
| `audric-roadmap.md` | Mark Audric 2.0 phases as they complete in the "What's next" section |

### New files list (consolidated)

All new files introduced across the spec, for reference during doc updates:

```
# Engine (t2000 repo)
packages/engine/src/early-dispatcher.ts          — EarlyToolDispatcher class
packages/engine/src/permission-rules.ts          — PermissionRule, resolvePermissionTier, DEFAULT_PERMISSION_CONFIG
packages/engine/src/tools/autonomy.ts            — pattern_status, pause_pattern tools

# Audric app (audric repo)
apps/web/app/chat/[sessionId]/page.tsx           — session URL routing
apps/web/app/report/page.tsx                     — report address input
apps/web/app/report/[address]/page.tsx           — public wallet report
apps/web/app/report/[address]/opengraph-image.tsx — OG image for social sharing
apps/web/app/api/internal/chain-memory/route.ts  — chain memory extraction endpoint
apps/web/app/api/analytics/portfolio-multi/route.ts — multi-wallet aggregation
apps/web/app/api/wallet/link/route.ts            — link wallet
apps/web/app/api/wallet/challenge/route.ts       — signature challenge
apps/web/app/api/wallet/verify/route.ts          — verify wallet ownership
apps/web/lib/chain-memory/classifiers.ts         — behavioral pattern classifiers
apps/web/lib/chain-memory/types.ts               — ChainFact, BehavioralPattern interfaces
apps/web/lib/report/types.ts                     — WalletReportData
apps/web/lib/report/transaction-pipeline.ts      — ChainAdapter + SuiAdapter
apps/web/lib/report/classifier.ts                — transaction classifier
apps/web/lib/report/generator.ts                 — generateWalletReport()
apps/web/components/engine/cards/ProposalCard.tsx — autonomous pattern proposal card

# Server (t2000 repo)
apps/server/src/cron/jobs/chain-memory.ts        — nightly chain memory extraction
apps/server/src/cron/jobs/autonomous-actions.ts   — trigger evaluation + execution
apps/server/src/autonomy/trigger-evaluator.ts    — condition-based trigger logic
```

---

## Total effort summary

| Phase | What ships | Effort | When |
|-------|-----------|--------|------|
| A | Quick wins: pre-fetch upgrade, thinking on, Haiku routing (with validation), live stats, allowance grace period, session URL routing | ~3.5 days | Week 1-2 |
| B | Harness: streaming tools, result budgeting, microcompact, permission rules | ~8.5 days | Week 2-4 |
| C | Chain-native memory pipeline (AppEvent + PortfolioSnapshot) | ~3 days | Week 4-6 |
| D | Autonomous action loop (unified with ScheduledAction) | ~8 days | Week 6-9 |
| E | Public wallet intelligence report | ~5 days | Week 9-11 |
| F | gRPC migration | ~7 days | Start June 16 |
| G | Self-hosting evaluation | ongoing | Month 4+ |
| — | Testing (distributed across B–E) | ~2 days | Alongside each phase |
| — | Documentation (single pass after Phase E) | ~1.5 days | Week 11-12 |

**Total to Phase E (incl. testing + docs):** ~31.5 days of focused solo work across ~12 weeks. The original estimate of 25 days was ~35% optimistic on the two hardest initiatives (1a streaming and Initiative 4 autonomous loop). Testing and documentation add ~3.5 days but prevent the debt that compounds when they're skipped. Each phase ships independently — nothing is blocked waiting for the whole spec to be complete.

**Before starting Phase D:** Verify the server-side signing mechanism by reading `runScheduledActions()` and `executeWithIntent()`. If signing is already solved for `ScheduledAction`, Phase D proceeds normally. If not, that investigation and fix become the first task of Phase D.

---

*Each initiative is scoped to be handed directly to Claude Code as a standalone task using the file references listed. Start with Phase A (3 days) and the product changes before the bigger architectural work lands. The autonomous action loop (Phase D) is the product unlock — once it ships, Audric stops being a better chatbot and starts being an agent. Phase E (public wallet report) is the acquisition unlock — the page that shows prospective users exactly what they're missing.*
