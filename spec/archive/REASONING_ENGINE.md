# Reasoning Engine Spec

> Replaces the hardcoded system prompt rules with a 3-layer reasoning architecture:
> Extended Thinking (the brain), Step Guards (the guardrails), Skill Recipes (the knowledge).
>
> **Status:** Shipped (Phases 1-3). Feature-flagged behind `ENABLE_THINKING=true`.
> **Scope:** `@t2000/engine` + Audric `engine-factory.ts` + `t2000-skills/recipes/`
> **Depends on:** Anthropic extended thinking API (GA), `@anthropic-ai/sdk` ≥0.39

### Implementation Status (April 2026)

Phases 1-3 are **shipped and production-tested** (`@t2000/engine@0.33.2`). Phase 4 (system prompt reduction) is next. Some file paths and counts in this spec have drifted from the implementation:

| Spec says | Implementation |
|-----------|---------------|
| `guards/balance.ts`, `guards/runner.ts`, etc. | Consolidated in `guards.ts` (single module) |
| `context-budget.ts` | `context.ts` (ContextBudget + compactMessages) |
| `recipes/formatter.ts` | `RecipeRegistry.toPromptContext()` in `recipes/registry.ts` |
| `classifyEffort` in `engine.ts` | Separate `classify-effort.ts` module |
| ~30 tools | 47 tools (36 read, 11 write) |
| `letter.yaml`, `bulk-mail.yaml`, `merchandise.yaml` | Not created; replaced by `postcard.yaml`, `translate-document.yaml` |

See `audric-build-tracker.md` (RE Phase 1-3 sections) for exact shipped state.

---

## Problem Statement

The engine **before the reasoning layer** was a flat loop: `User → LLM → Tool → Result → LLM → Done`. All "reasoning" lived in a 300+ line system prompt that told the model what to do via hardcoded rules. This didn't scale across the full product surface:

### Failures across features

| Feature | Failure mode | Example | Root cause |
|---|---|---|---|
| **Pay** | No planning | Agent sends a plain-text postcard without generating a design | No step decomposition before acting |
| **Pay** | No evaluation | Agent retries a paid Lob call after it already charged the user | No post-action assessment |
| **Pay** | No preview | User pays $1.00 for a physical postcard they never saw | No artifact gate for irreversible actions |
| **Send** | No balance check | Agent calls `send_transfer` for $500 when user has $12 | Prompt rule ignored ("check balance first") |
| **Send** | Address confusion | Agent sends to a raw address when the user said "send to Alice" (a contact) | No structured contact resolution step |
| **Savings** | Stale data | After a swap, agent reports old balance snapshot as current | No stale-data detection after writes |
| **Savings** | Wrong token | User says "save my SUI" → agent calls `save_deposit` (USDC only) | Prompt rule buried in 300 lines |
| **Credit** | Unsafe borrow | Agent borrows without checking health factor, risking liquidation | No health-factor gate before borrow |
| **Credit** | No context | Agent says "you can borrow $X" but doesn't mention the interest rate or risk | No structured evaluation of borrow consequences |
| **Swap** | Wrong direction | "Sell SUI for USDC" → agent swaps from=USDC, to=SUI (reversed) | Prompt rule for parameter mapping ignored |
| **Swap** | No estimate | Agent executes a swap without telling the user expected output | Prompt rule ("state expected output FIRST") skipped |
| **Multi-step** | No plan | "Swap SUI to USDC then deposit" → agent deposits before swap completes | No sequential dependency tracking |
| **Multi-step** | Fabricated numbers | After swap, agent combines stale snapshot + swap result = wrong total | No stale-data flag after write tools |
| **Goals** | No connection | User deposits $100, agent doesn't mention goal progress | No automatic context linking between actions and goals |
| **General** | Prompt bloat | System prompt grows every time a feature needs special handling | Rules encoded as prose, not structure |
| **General** | Fragile rules | Agent ignores "NEVER" instructions buried in a wall of text | LLM attention degrades over long prompts |

### Root cause

Every one of these failures traces back to the same architectural gap: **the engine has no reasoning layer**. The model receives a wall of rules and tries to follow them. Sometimes it does. Sometimes it doesn't. There's no structural enforcement, no planning step, no evaluation, and no way to add new behavior without making the prompt longer and more fragile.

**The goal:** The agent should *reason* about what to do across all features — plan steps, validate preconditions, evaluate results, show previews, avoid irreversible mistakes, and connect related actions — without needing a bespoke rule for every feature and edge case. The same architecture that makes Claude good (extended thinking) should make Audric good.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│  User Message                                          │
├────────────────────────────────────────────────────────┤
│  Layer 1: Extended Thinking                            │
│  ├── Model reasons before every turn                   │
│  ├── Plans multi-step workflows                        │
│  ├── Evaluates irreversibility, cost, prerequisites    │
│  └── Self-corrects before responding                   │
├────────────────────────────────────────────────────────┤
│  Layer 2: Step Guards (engine middleware)               │
│  ├── Irreversibility gate → require preview/confirm    │
│  ├── Artifact gate → pause when tool produces media    │
│  ├── Cost gate → warn above threshold                  │
│  ├── Retry gate → block re-execution of paid failures  │
│  └── Input validation gate → check schemas pre-call    │
├────────────────────────────────────────────────────────┤
│  Layer 3: Skill Recipes (declarative workflows)        │
│  ├── Loaded from t2000-skills/recipes/*.yaml           │
│  ├── Injected into context when relevant               │
│  ├── Define step order, gates, input transforms        │
│  └── New service = new file, no prompt changes         │
├────────────────────────────────────────────────────────┤
│  Existing: Tool Execution, Permission System, MCP      │
└────────────────────────────────────────────────────────┘
```

Each layer is independent. Layer 1 can ship alone and deliver most of the value. Layers 2 and 3 add structural guarantees that don't depend on the model's reasoning quality.

---

## Layer 1: Extended Thinking

### What it is

Anthropic's extended thinking gives the model a hidden chain-of-thought before every response. The model produces `thinking` content blocks containing its internal reasoning, then acts. This is the exact mechanism behind Claude's strong performance on complex tasks.

### API shape

Use **adaptive thinking** on all current models. The `effort` parameter routes the model between reasoning depths — but it lives in a **separate top-level `output_config` object**, not inside the `thinking` object. Placing `effort` inside `thinking` will cause a build-time or runtime API error.

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 16000,
  thinking: { type: 'adaptive' },           // ← thinking: type only, NO effort here
  output_config: { effort: 'medium' },      // ← effort goes here, top-level
  tools: [...],
  messages: [...],
});
```

> **⚠️ Do not use** `{ type: 'enabled', budget_tokens: N }` on Sonnet 4.6 or Opus 4.6. Manual mode is **deprecated** on these models and will be removed in a future release. The `budget_tokens` form remains valid only for Sonnet 3.7 and Haiku 4.5.
>
> **⚠️ Do not put `effort` inside the `thinking` object.** The correct field is `output_config.effort`. This is a separate top-level parameter supported on Opus 4.6, Sonnet 4.6, and Opus 4.5. It is **not** supported on Haiku 4.5.

The response contains `thinking`, `redacted_thinking`, `text`, and `tool_use` blocks. Both thinking block variants must be handled — silently dropping `redacted_thinking` blocks breaks multi-turn continuity:

```json
{
  "content": [
    { "type": "thinking", "thinking": "Let me check their health factor...", "signature": "WaUj..." },
    { "type": "redacted_thinking", "data": "ErUB..." },
    { "type": "text", "text": "I'll check your health factor first." },
    { "type": "tool_use", "name": "health_check", "input": {} }
  ]
}
```

**Interleaved thinking with tool use is automatic** on Opus 4.6 and Sonnet 4.6 with adaptive thinking — no beta header required. Each tool call in a multi-turn loop can produce new thinking blocks interleaved with tool results.

### Constraints

| Constraint | Impact | Mitigation |
|---|---|---|
| `tool_choice` must be `"auto"` or `"none"` | Engine currently forces `"any"` on turn 1 | Switch to `"auto"` when thinking enabled — model reliably uses tools under `"auto"` |
| Both `thinking` AND `redacted_thinking` blocks must be preserved and passed back | Dropping either breaks reasoning continuity | Store both in `assistantBlocks`; treat identically in message reconstruction |
| `temperature` locked at 1.0 | Can't use lower temperatures | Acceptable — thinking compensates for temperature randomness |
| `max_tokens` must be set high enough for reasoning output | Thinking uses output token budget | Set `max_tokens: 16000` for `high`/`max` effort turns; `8192` for `low`/`medium` |
| `effort` is in `output_config`, not `thinking` | Wrong placement causes runtime error | `thinking: { type: 'adaptive' }` + `output_config: { effort: '...' }` as separate top-level fields |
| `effort` not supported on Haiku 4.5 | Haiku only supports manual `budget_tokens` mode | Do not pass `output_config` to Haiku; use `{ type: 'enabled', budgetTokens: N }` |
| Latency scales with effort level | `high`/`max` effort adds 3-6s per turn | Route `low` for reads (< 1s addition), `max` only for Opus 4.6 on the most complex turns |
| Cost scales with effort level | Thinking tokens billed as output tokens | Offset by fewer retries, fewer wasted tool calls, shorter prompt. Adaptive optimizes automatically. |
| From Opus 4.5+, thinking blocks are preserved by default across turns | Long sessions accumulate thinking in context | Requires explicit compaction strategy — see Context Window Management section |

### Changes required

#### `packages/engine/src/types.ts`

Add thinking config and content block. Both `thinking` and `redacted_thinking` must be represented as first-class types:

```typescript
// effort is NOT part of ThinkingConfig — it lives in OutputConfig as a separate top-level API field
export type ThinkingEffort = 'low' | 'medium' | 'high' | 'max';

export type ThinkingConfig =
  | { type: 'disabled' }
  // Adaptive: recommended for Sonnet 4.6, Opus 4.6, Opus 4.5
  | { type: 'adaptive'; display?: 'summarized' | 'omitted' }
  // Manual: only for Sonnet 3.7, Haiku 4.5 — deprecated on 4.6+ models
  | { type: 'enabled'; budgetTokens: number; display?: 'summarized' | 'omitted' };

// Separate top-level API field — supported on Opus 4.6, Sonnet 4.6, Opus 4.5
// NOT supported on Haiku 4.5 or Sonnet 3.7
export interface OutputConfig {
  effort?: ThinkingEffort;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  // Both thinking block types must be preserved during tool loops.
  // Dropping redacted_thinking silently breaks multi-turn reasoning continuity.
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean };
```

Add to `EngineConfig`:

```typescript
export interface EngineConfig {
  // ... existing fields ...
  thinking?: ThinkingConfig;
}
```

Add to `ChatParams`:

```typescript
export interface ChatParams {
  // ... existing fields ...
  thinking?: ThinkingConfig;
}
```

#### `packages/engine/src/providers/anthropic.ts`

Pass `thinking` param to the Anthropic API. Handle both `thinking` and `redacted_thinking` content blocks in the stream. Both types must be accumulated and preserved — they are treated identically by the engine (opaque blocks to be passed back to the API).

```typescript
case 'content_block_start': {
  const block = event.content_block;
  if (block.type === 'thinking') {
    thinkingBuffers.set(event.index, { type: 'thinking', text: '', signature: '' });
  }
  if (block.type === 'redacted_thinking') {
    // Redacted thinking — no content to accumulate, but must be stored and passed back
    thinkingBuffers.set(event.index, { type: 'redacted_thinking', data: block.data });
  }
}

case 'content_block_delta': {
  if (delta.type === 'thinking_delta') {
    const buf = thinkingBuffers.get(event.index);
    if (buf?.type === 'thinking') buf.text += delta.thinking;
    yield { type: 'thinking_delta', text: delta.thinking };
  }
  if (delta.type === 'signature_delta') {
    const buf = thinkingBuffers.get(event.index);
    if (buf?.type === 'thinking') buf.signature = delta.signature;
  }
}

case 'content_block_stop': {
  const buf = thinkingBuffers.get(event.index);
  if (buf?.type === 'thinking') {
    yield { type: 'thinking_done', thinking: buf.text, signature: buf.signature };
  }
  // redacted_thinking is already complete at block_start — no stop action needed
}
```

**Message reconstruction:** When building the assistant message to pass back for tool loops, include all thinking blocks in the exact order they were received. The API requires this for multi-turn continuity. Never filter or reorder.

#### `packages/engine/src/engine.ts`

1. Pass `thinking` config through to `provider.chat()` alongside `output_config: { effort }` — the complexity classifier returns both separately; `effort` must be a top-level field, not nested inside `thinking`
2. Preserve both `thinking` and `redacted_thinking` blocks in `acc.assistantBlocks`
3. When thinking is enabled, force `toolChoice` to `"auto"` regardless of config
4. Emit `thinking_delta` events — see product decision in Thinking Display section
5. Track accumulated context size — trigger compaction when approaching limits

#### `EngineEvent` additions

```typescript
export type EngineEvent =
  | { type: 'thinking_delta'; text: string }  // Streaming thinking content
  | { type: 'thinking_done'; summary?: string }  // Thinking turn complete (with optional summary)
  | { type: 'text_delta'; text: string }
  // ... existing events ...
```

### What this solves alone

With extended thinking, the model reasons before every action across all features:

**Savings:**
- "User wants to save SUI, but save_deposit only accepts USDC. I should explain they need to swap first, and offer to do it."
- "User just did a swap — the balance snapshot is stale. Let me call balance_check before suggesting a deposit amount."
- "User wants to save 'everything'. Let me check the actual USDC balance before calling save_deposit."

**Send:**
- "User said 'send to Alice'. I have a contact named Alice at 0x7f20...f6dc. I'll use that address directly."
- "User wants to send $500 but their snapshot shows $12 USDC. I should refuse and state the actual balance."
- "This is a large external transfer. Let me double-check the amount and address before proceeding."

**Credit:**
- "User wants to borrow $200. Their health factor is 1.3 — borrowing more could risk liquidation. I should warn them."
- "I should call health_check before borrow to get the current health factor, not rely on stale data."
- "User asks 'how much can I borrow?' — I need to check both max borrow capacity AND warn about the interest rate."

**Swap:**
- "'Sell SUI for USDC' means from=SUI, to=USDC. Let me verify: the 'from' token is what leaves the wallet."
- "Before executing, I should estimate the output: at $0.87/SUI, 100 SUI ≈ $87 USDC."
- "This is a low-liquidity token. The swap might fail or have high slippage. I should mention this."

**Pay (services):**
- "The user wants a postcard. I need to: 1) generate a design, 2) show it, 3) get confirmation, 4) send to Lob."
- "The Lob call failed but payment was confirmed. I must NOT retry — I should report the error."

**Multi-step workflows:**
- "'Swap SUI to USDC then deposit': 1) swap_execute, 2) check the 'received' field, 3) save_deposit with the actual received amount."
- "'Rebalance my portfolio': 1) check current positions, 2) calculate targets, 3) execute swaps, 4) deposit/withdraw as needed."
- "'DCA $50 into SUI weekly': I can execute one swap now and explain how to set this up as a recurring action."

**Goals & context:**
- "User just deposited $100. They have a goal 'Emergency Fund' targeting $1,000. Current savings: $450. I should mention they're 55% to their goal."
- "User is withdrawing all savings. They have an active goal — I should mention this affects their progress."

This alone replaces ~70% of the hardcoded system prompt rules because the model *evaluates the situation* instead of following a checklist.

### Thinking mode selection

| Model | Thinking config | `output_config.effort` | Notes |
|---|---|---|---|
| `claude-sonnet-4-6` | `{ type: 'adaptive' }` | `low` / `medium` / `high` | **Default — always set effort explicitly; recommended default is `medium`** |
| `claude-opus-4-6` | `{ type: 'adaptive' }` | `low` / `medium` / `high` / `max` | Higher quality; `max` available for most complex turns |
| `claude-opus-4-5` | `{ type: 'adaptive' }` | `low` / `medium` / `high` | Adaptive + effort supported |
| `claude-sonnet-4-20250514` | `{ type: 'enabled', budgetTokens: 8000 }` | Not supported | Legacy — migrate to 4.6 when possible |
| `claude-haiku-4-5` | `{ type: 'enabled', budgetTokens: 5000 }` | Not supported | Does not support `output_config.effort` |
| Any future model | `{ type: 'adaptive' }` | Per model docs | Adaptive is the forward direction |

**Critical notes for model routing:**
- **Sonnet 4.6**: Always set `output_config.effort` explicitly. The docs warn against relying on the default to avoid unexpected latency. Recommended starting point: `'medium'` for most turns.
- **Opus 4.6 manual mode**: If anyone switches Opus 4.6 to `{ type: 'enabled', budgetTokens: N }`, interleaved thinking is **not available** — thinking will not occur between tool calls. Use adaptive mode on Opus 4.6 if interleaved thinking is needed (which it is, for multi-step financial workflows).
- **Haiku 4.5**: Never pass `output_config` — the field is not supported and will cause an error.

The engine detects the model and automatically selects the appropriate config. Manual mode is a fallback for legacy models only.

### Complexity classifier — session-level effort routing

A fixed thinking effort on every turn wastes tokens on simple queries and under-invests on complex ones. The engine runs a lightweight classifier before each turn to select the effort level:

```typescript
// effort maps to output_config.effort — separate from thinking config
type TurnEffort = 'low' | 'medium' | 'high' | 'max';

function classifyEffort(
  model: string,
  userMessage: string,
  matchedRecipe: Recipe | null,
  sessionWriteCount: number,
): TurnEffort {
  // 'max' only available on Opus 4.6 — route highest complexity turns there
  const supportsMax = model.includes('opus-4-6');

  // Max (Opus 4.6 only): most complex, irreversible multi-step flows
  if (supportsMax) {
    if (matchedRecipe?.name === 'portfolio_rebalance') return 'max';
    if (matchedRecipe?.name === 'emergency_withdraw') return 'max';
    if (/rebalance|reallocate|dca setup|close.*position/i.test(userMessage)) return 'max';
  }

  // High: multi-step recipes, post-write decisions, complex financial operations
  if (matchedRecipe && matchedRecipe.steps.length >= 3) return 'high';
  if (matchedRecipe?.name === 'safe_borrow' || matchedRecipe?.name === 'bulk_mail') return 'high';
  if (sessionWriteCount > 0 && /borrow|withdraw|send|swap/i.test(userMessage)) return 'high';

  // Low: read-only queries, simple lookups, clarifications
  if (/balance|rate|how much|what is|check|history|show/i.test(userMessage)) return 'low';
  if (!matchedRecipe && !/deposit|send|swap|borrow|withdraw|save|pay/i.test(userMessage)) return 'low';

  // Medium: single-step writes, known flows, service calls — recommended default for Sonnet 4.6
  return 'medium';
}
```

Effort level maps to `output_config.effort` as a **separate top-level API field**:

| Effort | `output_config` | Typical tokens | Use case | Available on |
|---|---|---|---|---|
| `'low'` | `{ effort: 'low' }` | ~200-500 | Balance check, rate lookup, simple question | Sonnet 4.6, Opus 4.6, Opus 4.5 |
| `'medium'` | `{ effort: 'medium' }` | ~1000-3000 | Single deposit, send, translation, weather | Same — **recommended default for Sonnet 4.6** |
| `'high'` | `{ effort: 'high' }` | ~5000-12000 | Multi-step postcard, borrow decision, swap+save | Same |
| `'max'` | `{ effort: 'max' }` | ~10000-20000 | Portfolio rebalance, emergency withdraw | **Opus 4.6 only** |

> **Sonnet 4.6 default:** The Anthropic docs explicitly recommend setting effort explicitly on Sonnet 4.6, with `'medium'` as the recommended starting point for most applications. Do not rely on the API default — it may cause unexpected latency. Our classifier defaults to `'medium'` for all unclassified turns, which is correct.

Usage in `provider.chat()`:

```typescript
// packages/engine/src/providers/anthropic.ts
const streamParams = {
  model: params.model,
  max_tokens: params.maxTokens,
  thinking: toAnthropicThinking(params.thinking),     // { type: 'adaptive' } or { type: 'enabled', budget_tokens: N }
  output_config: params.outputConfig ?? undefined,    // { effort: 'medium' } — separate top-level field
  system: params.systemPrompt,
  messages,
  tools,
};
```

This replaces the previous fixed `budget_tokens` approach entirely. Cost per session becomes proportional to actual query complexity.

---

## Layer 2: Step Guards

### What it is

Engine-level middleware that evaluates tool calls *before* execution. Even if the model skips reasoning or ignores instructions, the guards catch it. Guards are declarative — defined on tools, not in prompts.

### Tool flags

Every tool declares its characteristics via flags. Guards read these flags to decide what checks to run.

```typescript
interface ToolFlags {
  irreversible?: boolean;       // Physical mail, external transfers — can't undo
  producesArtifact?: boolean;   // Returns images, documents, generated content
  costAware?: boolean;          // Has a monetary cost the user should know about
  mutating?: boolean;           // Changes on-chain state (deposit, swap, send, borrow)
  affectsHealth?: boolean;      // Can change borrow health factor (withdraw, borrow)
  requiresBalance?: boolean;    // Needs sufficient funds (send, deposit, swap, pay)
  maxRetries?: number;          // Max times this tool can be called with same input (default: unlimited for reads, 1 for writes)
}
```

### Guard types

#### 1. Balance Validation Gate

**Applies to:** `save_deposit`, `send_transfer`, `swap_execute`, `pay_api`, `repay_debt`, `volo_stake`

Before any tool with `requiresBalance: true`, the engine checks whether the conversation contains a recent balance read (within the current session after the last write). If the balance is stale or missing, the guard injects:

```json
{
  "_gate": "balance_required",
  "_hint": "Balance data is stale (a write action occurred since last check). Call balance_check first to verify sufficient funds."
}
```

**Implementation:**

```typescript
class BalanceTracker {
  private lastBalanceAt: number = 0;
  private lastWriteAt: number = 0;

  recordRead(): void { this.lastBalanceAt = Date.now(); }
  recordWrite(): void { this.lastWriteAt = Date.now(); }

  isStale(): boolean {
    return this.lastWriteAt > this.lastBalanceAt;
  }
}
```

The engine calls `recordRead()` after `balance_check` / `savings_info` / `health_check` complete, and `recordWrite()` after any mutating tool completes.

**Hard mode** (configurable): Block the tool entirely and return an error:

```
[Error: Cannot execute send_transfer — balance has not been verified since last transaction. Call balance_check first.]
```

This structurally prevents the #1 failure mode: "agent calls write tool with amount exceeding balance."

#### 2. Health Factor Gate

**Applies to:** `withdraw`, `borrow`

Before any tool with `affectsHealth: true`, the engine checks the most recent health factor from the conversation context. Rules:

| Health factor | Guard behavior |
|---|---|
| Not checked this session | Inject hint: "Call health_check before this action" |
| ≥ 2.0 | Allow |
| 1.5 – 2.0 | Inject warning: "Health factor is X.XX — this action may reduce it further" |
| < 1.5 | Hard block: "Health factor is X.XX — this action risks liquidation. Refusing." |

The threshold is configurable:

```typescript
guards: {
  healthFactor: {
    warnBelow: 2.0,
    blockBelow: 1.5,
  },
}
```

#### 3. Large Transfer Gate

**Applies to:** `send_transfer`

External transfers above a configurable threshold trigger an extra confirmation nudge:

| Amount | Guard behavior |
|---|---|
| < $50 | Standard confirm flow |
| $50 – $500 | Inject hint: "This is a large transfer ($X). Verify the recipient address." |
| > $500 | Inject strong warning: "High-value transfer ($X). Double-check the address: 0xABC...DEF" |

This is a soft gate — it adds context to the tool result, not a hard block. The existing `confirm` permission on `send_transfer` already requires user approval; the gate makes the confirmation card more informative.

#### 4. Slippage Gate

**Applies to:** `swap_execute`

Before executing a swap, the guard checks whether the model has stated the expected output to the user. Detection: scan the last assistant message for a price estimate pattern (e.g., "~X.XX SUI", "approximately $X").

If no estimate found:

```json
{
  "_gate": "slippage_warning",
  "_hint": "State the expected output amount to the user before executing the swap."
}
```

For tokens not in the common set (SUI, USDC, USDT), the guard also checks if the model has warned about potential low liquidity.

#### 5. Stale Data Gate

**Applies to:** All read tools called after a write tool

After any `mutating` tool completes, the engine flags the session as "stale". If the model then references specific numbers from before the write (detected via the balance snapshot), the guard injects:

```json
{
  "_gate": "stale_data",
  "_hint": "A write action just completed. The balance snapshot is outdated. Do NOT calculate new balances from old data — call balance_check for fresh numbers, or use only the data returned by the write tool."
}
```

This prevents the fabricated-numbers failure: "After swap, agent adds swap result to old balance = wrong total."

#### 6. Irreversibility Gate

**Applies to:** `send_transfer`, `pay_api` (for Lob/Printful), any tool with `irreversible: true`

**How it works:**

When the engine encounters a `confirm`-level tool with `irreversible: true`, it checks the conversation history for evidence that the user has seen a preview or explicitly confirmed the action. If not found, the engine injects a system message:

```
[System: This action is irreversible (physical mail). The user has not seen a preview of the content. 
Ask the user to confirm after showing them what will be sent.]
```

This nudges the model to show a preview before proceeding, without blocking the tool call outright.

**Stronger variant** (optional, configurable): The engine can outright block the tool call and return an error to the model:

```
[Error: Irreversible action blocked. User must confirm after preview. 
Generate/show the content first, then call this tool after user approval.]
```

#### 2. Artifact Gate

When a tool result contains an artifact (image URL, document, generated content), the engine signals the model to pause and present it before continuing.

Detection heuristic:

```typescript
function containsArtifact(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;
  // Image URLs from fal.ai, DALL-E, etc.
  if (typeof r.url === 'string' && /\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(r.url)) return true;
  if (Array.isArray(r.images) && r.images.length > 0) return true;
  if (typeof r.image_url === 'string') return true;
  // PDF/document URLs
  if (typeof r.url === 'string' && /\.pdf(\?|$)/i.test(r.url)) return true;
  return false;
}
```

When an artifact is detected in a tool result, the engine appends a hint to the result:

```json
{
  "data": { "url": "https://..." },
  "_gate": "artifact_preview",
  "_hint": "Show this to the user before proceeding. Output as ![description](url)."
}
```

The model (especially with extended thinking) will naturally show the image and pause.

#### 3. Cost Gate

For tool calls where `costAware: true`, the engine checks whether the model has informed the user of the cost before calling.

This is a soft gate — it appends a hint if cost hasn't been mentioned:

```json
{
  "_gate": "cost_warning",
  "_hint": "This action costs $1.00. Confirm the user is aware before proceeding."
}
```

#### 4. Retry Gate

The engine tracks tool calls that have already been executed (by URL + approximate input hash). If the model attempts to call the same endpoint with similar input after a previous call returned an error with `paymentConfirmed: true`, the engine blocks it:

```json
{
  "error": "Blocked: this service was already called and payment was confirmed. Do not retry.",
  "previousResult": { ... }
}
```

This is the structural replacement for the "CRITICAL — non-retryable errors" prompt hack.

**Implementation:**

```typescript
class RetryTracker {
  private executed = new Map<string, { result: unknown; paidAt: number }>();

  key(toolName: string, input: unknown): string {
    const url = (input as Record<string, unknown>).url ?? '';
    return `${toolName}:${url}`;
  }

  record(toolName: string, input: unknown, result: unknown): void {
    const r = result as Record<string, unknown>;
    if (r.paymentConfirmed || r.doNotRetry) {
      this.executed.set(this.key(toolName, input), { result, paidAt: Date.now() });
    }
  }

  isBlocked(toolName: string, input: unknown): { blocked: boolean; reason?: string } {
    const prev = this.executed.get(this.key(toolName, input));
    if (!prev) return { blocked: false };
    return {
      blocked: true,
      reason: `Already executed and payment confirmed. Previous result attached.`,
    };
  }
}
```

#### 5. Input Validation Gate

Tools can optionally define a `preflight` function that validates input before the LLM call reaches execution:

```typescript
buildTool({
  name: 'pay_api',
  preflight: (input) => {
    const url = String(input.url ?? '');
    if (url.includes('lob/') && input.body) {
      const body = JSON.parse(String(input.body));
      const country = body.to?.address_country;
      if (country && country.length !== 2) {
        return { valid: false, error: `Country must be ISO-3166-2 code (got "${country}")` };
      }
    }
    return { valid: true };
  },
});
```

Failed preflight returns the error to the model as a tool result — the tool never executes.

### Where guards live

Guards are engine-level, not prompt-level. They execute in the `agentLoop` between tool selection and tool execution:

```
LLM response → parse tool calls → [GUARD CHECK] → execute tools → feed results back
                                        ↓
                              blocked? → inject error result
                              artifact? → inject hint
                              no preview? → inject nudge
```

### Tool → flag mapping (all built-in tools)

| Tool | Flags | Guards activated |
|---|---|---|
| `balance_check` | — (read-only) | None |
| `savings_info` | — (read-only) | None |
| `health_check` | — (read-only) | None |
| `rates_info` | — (read-only) | None |
| `transaction_history` | — (read-only) | None |
| `save_deposit` | `mutating`, `requiresBalance` | Balance validation, stale data |
| `withdraw` | `mutating`, `affectsHealth` | Health factor, stale data |
| `send_transfer` | `mutating`, `requiresBalance`, `irreversible` | Balance validation, large transfer, irreversibility, stale data |
| `swap_execute` | `mutating`, `requiresBalance` | Balance validation, slippage, stale data |
| `borrow` | `mutating`, `affectsHealth` | Health factor, stale data |
| `repay_debt` | `mutating`, `requiresBalance` | Balance validation, stale data |
| `claim_rewards` | `mutating` | Stale data |
| `volo_stake` | `mutating`, `requiresBalance` | Balance validation, stale data |
| `volo_unstake` | `mutating` | Stale data |
| `pay_api` | `mutating`, `requiresBalance`, `costAware` | Balance validation (budget), cost, retry, preflight, artifact (on result), irreversibility (Lob/Printful) |
| `save_contact` | — (lightweight write) | None |
| `savings_goal_*` | — (lightweight write) | None |
| `web_search` | — (read-only) | None |

### Guard configuration

Guards can be configured globally and per-tool:

```typescript
const engine = new QueryEngine({
  // ... existing config ...
  guards: {
    balanceValidation: true,   // Verify funds before write tools
    healthFactor: {            // Check health before borrow/withdraw
      warnBelow: 2.0,
      blockBelow: 1.5,
    },
    largeTransfer: {           // Extra confirmation for big sends
      warnAbove: 50,
      strongWarnAbove: 500,
    },
    slippage: true,            // Require estimate before swap
    staleData: true,           // Flag stale balances after writes
    irreversibility: true,     // Require preview for irreversible actions
    artifactPreview: true,     // Pause when tool produces media
    costWarning: true,         // Inform user of cost before paid actions
    retryProtection: true,     // Block re-execution of paid failures
    inputValidation: true,     // Run preflight checks on tool input
  },
});
```

---

## Layer 3: Skill Recipes

### What it is

Declarative YAML files that describe multi-step workflows for specific services. The engine loads these at startup and injects relevant recipes into the LLM context when the model's thinking or tool calls suggest a match. Replaces hardcoded multi-step instructions in the system prompt.

### Recipe format

```yaml
# t2000-skills/recipes/postcard.yaml
name: postcard
description: Send a physical postcard with a generated design
triggers:
  - "send a postcard"
  - "mail a card"
  - "physical mail"
  - "postcard to"
services:
  - fal/fal-ai/flux/dev
  - lob/v1/postcards

prerequisites:
  - field: recipient_name
    prompt: "What's the recipient's full name?"
  - field: recipient_address
    prompt: "What's the mailing address? (Include city, state/region, zip, country)"

steps:
  - name: generate_design
    tool: pay_api
    service: fal/fal-ai/flux/dev
    purpose: Generate card design image
    cost: $0.03
    output:
      type: image
      key: images[0].url
    gate: preview
    gate_prompt: "Here's the design. Print and mail for $1.00?"

  - name: print_and_mail
    tool: pay_api
    service: lob/v1/postcards
    purpose: Print and mail physical postcard
    cost: $1.00
    requires:
      - step: generate_design
        field: image_url
      - confirmation: true
    input_template:
      to: "{{recipient_address}}"
      front: '<html><body style="margin:0"><img src="{{generate_design.image_url}}" style="width:100%;height:100%;object-fit:cover"/></body></html>'
      back: '<html><body style="padding:40px;font-family:Georgia,serif"><p style="font-size:14px">{{message}}</p><div style="margin-top:20px;font-family:monospace;font-size:10px;color:#707070">sent with Audric</div></body></html>'
    flags:
      irreversible: true
```

### Financial workflow recipes

Recipes aren't just for services — they cover any multi-step flow across the product.

```yaml
# t2000-skills/recipes/swap-and-save.yaml
name: swap_and_save
description: Swap a token to USDC and deposit into savings
triggers:
  - "swap and save"
  - "convert and deposit"
  - "swap to USDC then save"
  - "move everything to savings"

steps:
  - name: check_balance
    tool: balance_check
    purpose: Get current token balances
    gate: none

  - name: swap_to_usdc
    tool: swap_execute
    purpose: Swap source token to USDC
    requires:
      - step: check_balance
        field: available_amount
    gate: estimate
    gate_prompt: "At ${{price}}/{{token}}, you'll receive ~${{estimate}} USDC."

  - name: deposit
    tool: save_deposit
    purpose: Deposit received USDC into savings
    requires:
      - step: swap_to_usdc
        field: received
    gate: none
    notes: "Use the 'received' field from the swap result — NOT the estimated amount."
```

```yaml
# t2000-skills/recipes/safe-borrow.yaml
name: safe_borrow
description: Borrow USDC with health factor validation
triggers:
  - "borrow"
  - "take out a loan"
  - "borrow against"

steps:
  - name: check_health
    tool: health_check
    purpose: Get current health factor and max borrow capacity
    gate: none

  - name: evaluate_risk
    purpose: Assess whether borrowing is safe
    gate: review
    rules:
      - "If health factor < 1.5 after borrow: refuse"
      - "If health factor 1.5-2.0 after borrow: warn"
      - "Always state: amount, interest rate, resulting health factor"

  - name: execute_borrow
    tool: borrow
    purpose: Execute the borrow
    requires:
      - step: check_health
      - step: evaluate_risk
        confirmation: true
```

```yaml
# t2000-skills/recipes/send-to-contact.yaml
name: send_to_contact
description: Send tokens to a saved contact or new address
triggers:
  - "send to"
  - "pay"
  - "transfer to"

steps:
  - name: resolve_recipient
    purpose: Resolve the recipient — check contacts first, then validate raw address
    gate: none
    rules:
      - "If user gives a name: match against contacts list"
      - "If user gives an address: validate with isValidSuiAddress()"
      - "If ambiguous: ask the user to clarify"

  - name: check_balance
    tool: balance_check
    purpose: Verify sufficient funds
    gate: none

  - name: execute_send
    tool: send_transfer
    purpose: Send the tokens
    requires:
      - step: resolve_recipient
      - step: check_balance
        field: sufficient_funds
    gate: none

  - name: offer_save_contact
    purpose: If recipient was a raw address, offer to save as contact
    gate: none
    condition: "recipient was not already a contact"
```

```yaml
# t2000-skills/recipes/portfolio-rebalance.yaml
name: portfolio_rebalance
description: Rebalance portfolio to target allocation
triggers:
  - "rebalance"
  - "rebalance my portfolio"
  - "adjust my allocation"

steps:
  - name: check_positions
    tool: balance_check
    purpose: Get current portfolio breakdown
    gate: none

  - name: plan_trades
    purpose: Calculate required swaps to reach target allocation
    gate: review
    gate_prompt: "Here's the rebalance plan:\n{{trades}}\nEstimated cost: {{slippage}}. Proceed?"

  - name: execute_swaps
    tool: swap_execute
    purpose: Execute each swap in sequence
    requires:
      - step: plan_trades
        confirmation: true
    notes: "Execute one swap at a time. Check balance after each before the next."

  - name: summary
    purpose: Report final positions
    tool: balance_check
```

```yaml
# t2000-skills/recipes/emergency-withdraw.yaml
name: emergency_withdraw
description: Safely withdraw from savings while managing health factor
triggers:
  - "withdraw everything"
  - "emergency withdraw"
  - "close my position"

steps:
  - name: check_health
    tool: health_check
    purpose: Check health factor and outstanding borrows
    gate: none

  - name: evaluate_safety
    purpose: Determine safe withdrawal amount
    gate: review
    rules:
      - "If borrows > 0: calculate max safe withdrawal that keeps health > 1.5"
      - "If no borrows: full withdrawal is safe"
      - "Warn user about goal impact if active goals exist"
    gate_prompt: "You can safely withdraw ${{safe_amount}}. {{health_warning}}"

  - name: execute_withdraw
    tool: withdraw
    purpose: Withdraw the safe amount
    requires:
      - step: evaluate_safety
        confirmation: true
```

### Service workflow recipes

```yaml
# t2000-skills/recipes/postcard.yaml
# (unchanged from above)

# t2000-skills/recipes/bulk-mail.yaml
name: bulk_mail
description: Send postcards to multiple recipients
triggers:
  - "mail 100 postcards"
  - "bulk mail"
  - "send postcards to all"

steps:
  - name: research
    tool: pay_api
    service: brave/v1/web/search
    purpose: Find target recipients
    gate: none

  - name: extract_data
    tool: pay_api
    service: firecrawl/v1/scrape
    purpose: Extract addresses from results
    gate: none

  - name: format
    tool: pay_api
    service: openai/v1/chat/completions
    purpose: Structure data into mailing format
    gate: review
    gate_prompt: "Found {{count}} addresses. Review the list?"

  - name: design
    tool: pay_api
    service: fal/fal-ai/flux/dev
    purpose: Generate card design
    gate: preview

  - name: mail_batch
    tool: pay_api
    service: lob/v1/postcards
    purpose: Print and mail all postcards
    cost_per_unit: $1.00
    requires:
      - confirmation: true
      - budget_check: true
    flags:
      irreversible: true
```

```yaml
# t2000-skills/recipes/translate-document.yaml
name: translate_document
description: Scrape a webpage and translate it
triggers:
  - "translate this page"
  - "translate this article"

steps:
  - name: extract
    tool: pay_api
    service: jina/v1/read
    purpose: Extract page content as markdown
    gate: none

  - name: translate
    tool: pay_api
    service: deepl/v1/translate
    purpose: Translate to target language
    gate: none
```

### Recipe conflict resolution

When a user message matches multiple recipes, **the most specific recipe wins** — the one whose trigger phrase has the longest character match against the normalized user message.

```typescript
class RecipeRegistry {
  match(userMessage: string): Recipe | null {
    const normalized = userMessage.toLowerCase().trim();
    let best: Recipe | null = null;
    let bestLength = 0;

    for (const recipe of this.recipes) {
      for (const trigger of recipe.triggers) {
        if (normalized.includes(trigger.toLowerCase()) && trigger.length > bestLength) {
          best = recipe;
          bestLength = trigger.length;
        }
      }
    }

    return best; // Only one recipe injected per turn
  }
}
```

**Example:** "swap SUI to USDC then save" — trigger `"swap SUI to USDC then save"` in `swap-and-save.yaml` (30 chars) beats trigger `"swap"` in a hypothetical `swap.yaml` (4 chars). Result: `swap-and-save` recipe is injected.

**Design principle:** Recipes are guidance, not constraints. The model with extended thinking can always deviate from the recipe if its reasoning concludes that's better. The recipe narrows the solution space; thinking fills the gaps.

### on_error branches in financial recipes

Every financial recipe step that can fail must declare an explicit `on_error` branch. The model should not be left to reason about error handling for consequential flows — the error path should be as declarative as the success path.

```yaml
# Extended safe-borrow.yaml with error paths
steps:
  - name: check_health
    tool: health_check
    purpose: Get current health factor and max borrow capacity
    gate: none
    on_error:
      action: abort
      message: "Cannot check health factor. Refusing borrow until health data is available."

  - name: evaluate_risk
    purpose: Assess whether borrowing is safe
    gate: review
    rules:
      - "If health factor after borrow < 1.5: refuse with reason"
      - "If health factor after borrow 1.5-2.0: warn, require explicit confirmation"
      - "Always state: borrow amount, interest rate, projected health factor"
    on_failure:
      # health factor too low
      action: refuse
      message: "Health factor would drop to {{projected_hf}}. Refusing to protect from liquidation."
      suggest: "Repay existing debt or deposit more collateral first."

  - name: execute_borrow
    tool: borrow
    purpose: Execute the borrow
    requires:
      - step: check_health
      - confirmation: true
    on_error:
      action: abort
      message: "Borrow transaction failed. No funds were moved. {{error}}"
```

```yaml
# Extended swap-and-save.yaml with error paths
steps:
  - name: swap_to_usdc
    tool: swap_execute
    on_error:
      action: abort
      message: "Swap failed — {{error}}. No deposit attempted. Your original balance is unchanged."

  - name: deposit
    tool: save_deposit
    on_error:
      action: report
      message: "Swap succeeded (received {{received}} USDC) but deposit failed — {{error}}. Your USDC is in your wallet. Try depositing manually."
      # "report" = don't retry, tell the user what happened and what their current state is
```

**`on_error` action types:**

| Action | Behavior |
|---|---|
| `abort` | Stop the recipe. Tell the user nothing happened. |
| `refuse` | Stop this step (and dependents). Report the reason. |
| `report` | Step failed but prior steps completed. Report partial state clearly. |
| `retry` | Retry this step once. Only for idempotent, non-paid tools (e.g. `balance_check`). Never for write tools. |

### How recipes are loaded

```typescript
// packages/engine/src/recipes/types.ts

interface RecipeStep {
  name: string;
  tool?: string;                // Optional — some steps are reasoning-only (e.g. "evaluate_risk")
  service?: string;             // For pay_api steps — the MPP service path
  purpose: string;
  cost?: string;
  output?: { type: string; key: string };
  gate?: 'none' | 'preview' | 'review' | 'estimate';
  gate_prompt?: string;
  requires?: Array<{ step?: string; field?: string; confirmation?: boolean }>;
  rules?: string[];             // Reasoning guidelines for non-tool steps
  condition?: string;           // When this step should execute (e.g. "recipient was not a contact")
  notes?: string;               // Extra context for the model
  flags?: ToolFlags;            // Override tool flags for this step
}

interface Recipe {
  name: string;
  description: string;
  triggers: string[];
  services?: string[];          // Optional — financial recipes may not have external services
  prerequisites?: Array<{ field: string; prompt: string }>;
  steps: RecipeStep[];
}

class RecipeRegistry {
  private recipes: Recipe[] = [];

  load(yamlDir: string): void { /* parse all .yaml files */ }

  match(userMessage: string): Recipe | null {
    // Simple trigger matching — check if any trigger phrase appears in the message
    // Extended thinking handles the nuance; this just surfaces the recipe
  }

  toPromptContext(recipe: Recipe): string {
    // Format recipe as a structured instruction block for the system prompt
    // Much shorter than the current freeform rules
  }
}
```

### How recipes integrate with the engine

Recipes don't replace the LLM's autonomy — they *inform* it. The engine injects relevant recipes into the system prompt as structured context:

```
## Active Recipe: postcard
You matched a known multi-step workflow. Follow these steps:
1. generate_design → pay_api fal/fal-ai/flux/dev → Show image to user (GATE: preview)
2. print_and_mail → pay_api lob/v1/postcards → Requires: user confirmation + image from step 1
```

This is ~5 lines vs the current 10+ lines of prose rules per service. And it's dynamically injected — not always present in the prompt.

The model, with extended thinking, reads this recipe and reasons:

> "There's a recipe for postcards. Step 1 is image generation with a preview gate. I should generate the image first, show it, then wait for confirmation before step 2."

### Recipe vs prompt: scaling comparison

| Workflows | Current approach | Recipe approach |
|---|---|---|
| 5 financial (swap+save, borrow, rebalance, withdraw, send) | 80+ lines of prompt rules | 5 recipe files, prompt stays lean |
| 5 service (postcard, letter, merch, translate, bulk) | +50 lines to system prompt | 5 recipe files |
| 10 total | 130+ lines of edge-case rules | 10 recipe files, ~50 line base prompt |
| 40+ (future: DCA, bridge, staking strategies, etc.) | Unusable prompt | 40 recipe files, same 50 line prompt |

---

## Prompt Caching Strategy

At scale (5,000+ active users), LLM cost is the primary operational expense. Prompt caching is the most impactful lever available — the system prompt + tool definitions are cacheable and re-used across turns. Without a caching strategy, the reasoning engine will be 3-4x more expensive than necessary.

### What is cacheable

Anthropic's prompt caching stores repeated input prefixes with a 5-minute TTL (extended to 1 hour for longer conversations). The cache reduces input token cost by ~90%.

| Segment | Cacheable | Notes |
|---|---|---|
| System prompt (identity, rules) | ✅ | Stable — cache as first breakpoint |
| Tool definitions (all ~30 tools) | ✅ | Changes only on deploy — cache as second breakpoint |
| Dynamic context (balance snapshot, contacts, goals) | ❌ | Changes per session — cannot cache |
| Conversation history | ✅ (partially) | Cache up to the last user message — set breakpoint there |
| Injected recipe context | ❌ | Dynamic per turn — cannot cache |

### Cache breakpoint placement

The engine must set `cache_control: { type: 'ephemeral' }` markers at specific positions in the message array:

```typescript
// packages/engine/src/providers/anthropic.ts

function buildCachedMessages(
  systemPrompt: string,
  tools: ToolDefinition[],
  messages: Message[],
): { system: Anthropic.TextBlockParam[]; tools: Anthropic.Tool[]; messages: Anthropic.MessageParam[] } {
  return {
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' }, // Breakpoint 1: system prompt
      },
    ],
    tools: tools.map((t, i) =>
      i === tools.length - 1
        ? { ...toAnthropicTool(t), cache_control: { type: 'ephemeral' } } // Breakpoint 2: end of tools
        : toAnthropicTool(t),
    ),
    messages: messages.map((m, i) =>
      i === messages.length - 2  // Second-to-last message (last assistant turn)
        ? { ...toAnthropicMessage(m), cache_control: { type: 'ephemeral' } } // Breakpoint 3: conversation history
        : toAnthropicMessage(m),
    ),
  };
}
```

### Thinking and cache interaction

**Critical:** changing the `thinking` effort level invalidates cache breakpoints set on message-level content. The effort parameter is part of the API call, not the message content, so it doesn't directly invalidate the system/tools cache. But the system prompt itself must stay stable across effort levels for cache hits to land.

Rules:
- System prompt and tools must be **identical** across turns for cache to hit (no dynamic injection that changes the text)
- Dynamic context (balances, recipes) should be injected as a **separate, non-cached** system block appended after the cached block
- The recipe injection must be separated from the cached system prompt — not concatenated into it

```typescript
// Correct: two system blocks — one cached, one dynamic
system: [
  { type: 'text', text: STATIC_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
  { type: 'text', text: buildDynamicContext(session) }, // No cache_control — changes every turn
]
```

### Expected savings

| Session type | Without cache | With cache | Savings |
|---|---|---|---|
| 5-turn balance/rate check | ~15k input tokens | ~3k uncached + 12k cached | ~80% input cost reduction |
| 10-turn multi-step rebalance | ~40k input tokens | ~5k uncached + 35k cached | ~87% input cost reduction |
| Long session (20 turns) | ~100k input tokens | ~10k uncached + 90k cached | ~90% input cost reduction |

At 5,000 users × 5 sessions/day × 8 turns = 200,000 turns/day. Without caching at $3/M input tokens, ~$600/day in input costs. With caching at $0.30/M cached tokens: ~$90/day. **Caching is not optional at scale.**

---

## Context Window Budget Management

With adaptive thinking on Opus 4.5+ where thinking blocks are preserved across turns by default, long sessions accumulate substantial context. A 20-turn session with high-effort thinking can consume 150,000+ tokens — approaching the 200k context limit. Without compaction, sessions silently fail.

### When to compact

The engine tracks estimated context size after every turn:

```typescript
class ContextBudget {
  private readonly WARN_AT = 0.70;  // 70% of context window
  private readonly COMPACT_AT = 0.85; // 85% — trigger compaction
  private readonly CONTEXT_LIMIT = 200_000; // tokens (Sonnet 4.6)

  constructor(private estimatedTokens: number = 0) {}

  update(inputTokens: number): void {
    this.estimatedTokens += inputTokens;
  }

  shouldCompact(): boolean {
    return this.estimatedTokens / this.CONTEXT_LIMIT >= this.COMPACT_AT;
  }

  shouldWarn(): boolean {
    return this.estimatedTokens / this.CONTEXT_LIMIT >= this.WARN_AT;
  }
}
```

### Compaction strategy

When context approaches 85% of the limit, the engine triggers a compaction pass before the next turn:

1. **Summarize old turns** — call a separate lightweight LLM call (low effort, no tools) with the message history to produce a concise summary
2. **Replace history** — swap out the full message history with: `[{ role: 'user', content: '[Session summary: ...]' }, { role: 'assistant', content: 'Understood.' }]`
3. **Preserve recents** — always keep the last 3-4 turns verbatim (in case they contain active tool results or pending actions)
4. **Strip thinking from old turns** — thinking blocks in older turns don't need to be in the summary. Only the final text responses matter for context continuity.

```typescript
async function compactHistory(messages: Message[], provider: LLMProvider): Promise<Message[]> {
  const recentCount = 4;
  const toSummarize = messages.slice(0, -recentCount);
  const recent = messages.slice(-recentCount);

  if (toSummarize.length === 0) return messages;

  const summary = await provider.summarize(toSummarize); // Lightweight call, no thinking
  return [
    { role: 'user', content: [{ type: 'text', text: `[Conversation history summary: ${summary}]` }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Understood, I have the context.' }] },
    ...recent,
  ];
}
```

The compaction is transparent to the user — from their perspective the conversation continues uninterrupted.

### Thinking block accumulation

Thinking blocks from previous turns do not need to be kept in compressed form. The API only requires that thinking blocks accompany their associated `tool_use` block in the **current** multi-turn exchange. Once a tool loop completes and the assistant has given a text response, those thinking blocks can be dropped from the next turn's history without loss of reasoning quality.

---

## Guard Runner — Priority Ordering and Observability

### Priority ordering

Multiple guards can fire simultaneously on the same tool call. The runner must evaluate them in priority order and produce a single, coherent response to the model. Conflicting messages from multiple guards are confusing and potentially dangerous.

**Priority (highest to lowest):**

```
Tier 1 — Safety (always hard blocks, never overrideable)
  ├── Health factor gate (borrow/withdraw at dangerous HF)
  └── Retry gate (paid failure — never re-execute)

Tier 2 — Financial integrity (hard blocks in production, configurable in dev)
  ├── Balance validation gate (write without balance check)
  ├── Preflight gate (invalid input — e.g. bad country code)
  └── Large transfer gate (high-value sends)

Tier 3 — UX quality (soft nudges — inject hint, don't block)
  ├── Slippage gate (swap without estimate)
  ├── Stale data gate (using old snapshot)
  ├── Irreversibility gate (no preview before physical mail)
  ├── Artifact gate (image returned, show it)
  └── Cost gate (remind user of service cost)
```

**Runner logic:**

```typescript
class GuardRunner {
  run(toolName: string, input: unknown, context: GuardContext): GuardResult {
    const results = this.guards.map(g => g.evaluate(toolName, input, context));

    // Tier 1: safety hard block — emit event, return error immediately
    const safetyBlock = results.find(r => r.tier === 1 && r.action === 'block');
    if (safetyBlock) {
      this.emit({ tier: 1, guard: safetyBlock.guard, toolName, input, blocked: true });
      return { action: 'block', message: safetyBlock.message };
    }

    // Tier 2: financial hard block — same behavior
    const financialBlock = results.find(r => r.tier === 2 && r.action === 'block');
    if (financialBlock) {
      this.emit({ tier: 2, guard: financialBlock.guard, toolName, input, blocked: true });
      return { action: 'block', message: financialBlock.message };
    }

    // Tier 3: UX nudges — collect all, inject as combined hint
    const nudges = results.filter(r => r.tier === 3 && r.action === 'hint');
    if (nudges.length > 0) {
      nudges.forEach(n => this.emit({ tier: 3, guard: n.guard, toolName, input, blocked: false }));
      return { action: 'hint', hints: nudges.map(n => n.message) };
    }

    return { action: 'allow' };
  }
}
```

### Guard observability — GuardEvent

Every guard firing is a signal. Frequent balance guard fires = users are confused about the workflow. Frequent retry guard fires = a service is unreliable. Without logging, there's no way to tune thresholds or catch regressions.

**GuardEvent schema (Prisma model in Audric):**

```typescript
// audric/prisma/schema.prisma addition
model GuardEvent {
  id          String   @id @default(cuid())
  userId      String
  sessionId   String
  guardName   String   // 'balance', 'health_factor', 'retry', 'slippage', etc.
  tier        Int      // 1, 2, or 3
  toolName    String   // 'borrow', 'pay_api', 'swap_execute', etc.
  blocked     Boolean  // true = hard block, false = nudge
  inputHash   String?  // Hashed tool input for debugging (no PII)
  message     String   // The message injected into the tool result
  createdAt   DateTime @default(now())

  user        User     @relation(fields: [userId], references: [id])
}
```

**What to build from this data:**

| Metric | Signal | Action |
|---|---|---|
| `balance` guard fires > 2x/session | Users aren't checking balance before writes | Recipe or thinking not guiding them correctly |
| `health_factor` guard fires frequently | Users borrowing near limit | Add proactive warning in the borrowing recipe |
| `retry` guard fires | A gateway service is failing after charge | Investigate the service, add to incident dashboard |
| `slippage` guard fires often | Model skips estimate step | Strengthen recipe or lower effort threshold for swap turns |
| `irreversibility` guard fires | Agent sends mail without preview | Recipe not matching; check trigger phrases |

---

## Thinking Display — Product Decision

This is not an open question. Displaying thinking is a deliberate product choice with a strong argument for showing it in a financial context.

### Decision: Show summarized thinking for financial decisions. Stream it silently for service calls.

**Rationale:**

Trust is the primary moat for a financial agent. When Audric says "I won't let you borrow that — your health factor would drop to 1.2 and you'd risk liquidation", users need to believe it. If they can see the reasoning ("Checking health factor... current HF is 1.8, borrow of $500 would reduce it to 1.2, below our 1.5 safety threshold. Refusing."), they trust the decision. Without it, it's an unexplained refusal from a black box.

For service calls (weather, image gen), thinking is implementation noise — nobody needs to see "Let me check if fal.ai is available...". These should be silent.

**Implementation:**

```typescript
// Audric engine-factory.ts — per-category display config
// Note: effort is in output_config (top-level), NOT inside thinking
thinking: {
  type: 'adaptive',
  display: shouldShowThinking(toolCategories) ? 'summarized' : 'omitted',
},
output_config: {
  effort: classifyEffort(model, message, recipe, sessionWriteCount),
},

function shouldShowThinking(categories: ToolCategory[]): boolean {
  // Show thinking for financial decisions — builds trust
  return categories.some(c => ['savings', 'credit', 'send', 'swap'].includes(c));
  // For pure service calls (pay_api for weather/images), omit thinking
}
```

**UI treatment in Audric (Agentic Design System):**

- A collapsible `Reasoning` block before the agent's response text
- Shows the summarized thinking content in `font-family: monospace` at smaller size
- Styled as secondary/muted — present but not dominant
- Label: "How I evaluated this" for financial turns; hidden entirely for service turns
- Always collapsed by default — user expands if curious

**Example in context:**

```
┌─ Reasoning ──────────────────────────────────────────────────────┐
│ Your health factor is 1.8. Borrowing $200 at 8.5% APY would     │
│ reduce it to ~1.4 — below the safe threshold of 1.5. Refusing   │
│ to protect you from potential liquidation.                       │
└──────────────────────────────────────────────────────────────────┘

I can't execute this borrow — your health factor would drop to 1.4 
after the $200 loan, which risks liquidation. You'd need to reduce 
your existing borrow or deposit more first.
```

This is differentiated UX. No other consumer finance product shows users how it makes decisions.

---

## System Prompt Reduction

With the 3 layers in place, the system prompt shrinks from ~300 lines to ~80 lines of core rules. Everything service-specific moves to recipes. Everything behavioral moves to extended thinking. Everything structural moves to guards.

### Before (current — abbreviated)

```
You are Audric, a financial agent on Sui...
[50 lines of identity/context + wallet address + balances]
[30 lines of MANDATORY balance validation rules (check before every write)]
[15 lines of stale data rules (don't combine snapshot + write results)]
[20 lines of swap parameter rules (from/to mapping, estimate first)]
[15 lines of write tool listing + "use them, don't refuse"]
[40 lines of MPP service rules (common services + per-service workflows)]
[15 lines of postcard/letter multi-step instructions]
[20 lines of contact resolution rules]
[15 lines of savings goal rules + progress tracking]
[10 lines of planning rules (output numbered plan for multi-step)]
[15 lines of multi-step flow recipes (swap+save, buy token, etc.)]
[10 lines of advice memory context]
[10 lines of safety rules (health factor, warnings)]
= ~265 lines, growing with every feature
```

### After (with reasoning engine)

```
You are Audric, a financial agent on Sui...
[50 lines of identity/context + wallet address + balances — same]
[5 lines of balance rules — "verify balance before writes" (guard enforces)]
[5 lines of swap rules — from/to definition only (guard enforces estimate)]
[5 lines of tool listing — simplified, thinking picks the right tool]
[5 lines of MPP — "use mpp_services to discover, pay_api to call"]
[0 lines of per-service/per-feature workflows — recipes handle this]
[5 lines of contacts — "resolve names against contacts list"  ]
[5 lines of goals — "mention goal progress after deposit/withdraw"]
[0 lines of planning rules — thinking plans naturally]
[0 lines of multi-step flow recipes — recipe files handle this]
[5 lines of advice memory — same]
[5 lines of safety — "warn on low health factor" (guard enforces)]
= ~95 lines (+ dynamic recipe injection: ~5-10 lines when relevant)
```

The prompt is 3x shorter, more focused, and doesn't grow when new features or services are added. Guards structurally enforce what the old prompt asked the model to remember. Recipes inject workflow context only when needed. Thinking fills the gaps.

---

## Implementation Plan

### Phase 1: Extended Thinking (highest impact, lowest risk) — SHIPPED

**Scope:** `@t2000/engine` only. No breaking changes.

| Task | File | Effort |
|---|---|---|
| Add `ThinkingConfig` to types | `types.ts` | S |
| Add `thinking` to `ChatParams` | `types.ts` | S |
| Add `ContentBlock` thinking variant | `types.ts` | S |
| Handle `thinking` in `AnthropicProvider` stream | `providers/anthropic.ts` | M |
| Pass thinking blocks back during tool loops | `providers/anthropic.ts` | M |
| Add `thinking` to `EngineConfig` | `types.ts` | S |
| Pass thinking config through `agentLoop` | `engine.ts` | S |
| Force `toolChoice: 'auto'` when thinking enabled | `engine.ts` | S |
| Preserve thinking blocks in assistant messages | `engine.ts` | M |
| Emit `thinking_delta` event (optional) | `engine.ts` | S |
| Add thinking config to Audric `engine-factory.ts` | Audric repo | S |
| Implement complexity classifier (`classifyEffort`) | `engine.ts` or `engine-factory.ts` | M |
| Separate static vs dynamic system blocks for caching | `providers/anthropic.ts` | M |
| Add cache breakpoint markers to system + tools | `providers/anthropic.ts` | S |
| Implement `ContextBudget` tracker | `context-budget.ts` | S |
| Implement `compactHistory` with lightweight summarisation | `context-budget.ts` | M |
| Trigger compaction in `agentLoop` at 85% context | `engine.ts` | M |
| Tests: both `thinking` and `redacted_thinking` blocks preserved | `__tests__/` | M |
| Tests: `toolChoice` forced to auto with thinking | `__tests__/` | S |
| Tests: complexity classifier routes correctly per scenario | `__tests__/` | M |
| Tests: cache breakpoints placed at correct positions | `__tests__/` | S |
| Tests: compaction triggered at correct threshold | `__tests__/` | M |
| Tests: thinking blocks stripped from compacted history | `__tests__/` | S |

**Estimated effort:** 3-4 days
**Risk:** Low — additive change, existing tests unaffected
**Rollback:** Set `thinking: { type: 'disabled' }` in engine-factory

### Phase 2: Step Guards — SHIPPED

**Scope:** `@t2000/engine`. Guards consolidated in `guards.ts` (not a `guards/` directory).

| Task | File | Effort |
|---|---|---|
| Add `ToolFlags` interface | `types.ts` | S |
| Add flags to `Tool` interface (optional, backward compat) | `types.ts` | S |
| **Financial guards** | | |
| Implement `BalanceTracker` — detect stale balance after writes | `guards/balance.ts` | M |
| Implement `HealthFactorGuard` — check HF before borrow/withdraw | `guards/health.ts` | M |
| Implement `LargeTransferGuard` — warn on high-value sends | `guards/transfer.ts` | S |
| Implement `SlippageGuard` — require estimate before swap | `guards/slippage.ts` | S |
| Implement `StaleDataTracker` — flag stale snapshots after writes | `guards/stale.ts` | M |
| **Service guards** | | |
| Implement `RetryTracker` — block paid duplicate calls | `guards/retry.ts` | M |
| Implement artifact detection — pause on image/doc results | `guards/artifact.ts` | S |
| Implement irreversibility check — preview before mail/send | `guards/irreversible.ts` | M |
| Implement cost gate — inform user of cost before paid actions | `guards/cost.ts` | S |
| Implement preflight validation — validate input schemas | `guards/preflight.ts` | M |
| **Integration** | | |
| Guard runner: evaluate all guards before tool execution | `guards/runner.ts` | M |
| Add guard middleware to `agentLoop` | `engine.ts` | M |
| Add `guards` config to `EngineConfig` | `types.ts` | S |
| **Tag all tools with flags** | | |
| `save_deposit` → `mutating`, `requiresBalance` | `tools/save.ts` | S |
| `withdraw` → `mutating`, `affectsHealth` | `tools/withdraw.ts` | S |
| `send_transfer` → `mutating`, `requiresBalance`, `irreversible` | `tools/transfer.ts` | S |
| `swap_execute` → `mutating`, `requiresBalance` | `tools/swap.ts` | S |
| `borrow` → `mutating`, `affectsHealth` | `tools/borrow.ts` | S |
| `repay_debt` → `mutating`, `requiresBalance` | `tools/repay.ts` | S |
| `volo_stake` → `mutating`, `requiresBalance` | `tools/volo-stake.ts` | S |
| `pay_api` → `mutating`, `requiresBalance`, `costAware` | `tools/pay.ts` | S |
| Add `preflight` to `pay_api` (country code, address) | `tools/pay.ts` | S |
| **Observability** | | |
| Add `GuardEvent` Prisma model to Audric schema | `audric/prisma/schema.prisma` | S |
| Implement `GuardEventEmitter` in guard runner | `guards/runner.ts` | S |
| Wire `GuardEventEmitter` to Prisma write in Audric | Audric API route | S |
| **Tests** | | |
| Balance guard blocks write without prior balance check | `__tests__/guards.test.ts` | M |
| Health guard blocks borrow at low HF | `__tests__/guards.test.ts` | M |
| Health guard warns at moderate HF | `__tests__/guards.test.ts` | S |
| Stale data guard flags post-write snapshot usage | `__tests__/guards.test.ts` | S |
| Large transfer guard adds warning above threshold | `__tests__/guards.test.ts` | S |
| Slippage guard requires estimate before swap | `__tests__/guards.test.ts` | S |
| Retry gate blocks double-payment | `__tests__/guards.test.ts` | M |
| Artifact gate detects image URLs | `__tests__/guards.test.ts` | S |
| Preflight catches bad country codes | `__tests__/guards.test.ts` | S |
| All guards can be independently disabled | `__tests__/guards.test.ts` | S |
| Guard runner evaluates guards in correct order | `__tests__/guards.test.ts` | S |

**Estimated effort:** 4-5 days
**Risk:** Low-medium — guards are additive, can be disabled per-guard
**Rollback:** Set all guards to `false` in config

### Phase 3: Skill Recipes — SHIPPED

**Scope:** `@t2000/engine` + `t2000-skills/recipes/`

| Task | File | Effort |
|---|---|---|
| Define `Recipe` and `RecipeStep` interfaces | `recipes/types.ts` | S |
| YAML parser for recipe files | `recipes/loader.ts` | M |
| `RecipeRegistry` with trigger matching | `recipes/registry.ts` | M |
| Recipe → prompt context formatter | `recipes/formatter.ts` | S |
| Integrate registry into `QueryEngine` | `engine.ts` | M |
| **Financial recipes** | | |
| Write `swap-and-save.yaml` | `t2000-skills/recipes/` | S |
| Write `safe-borrow.yaml` | `t2000-skills/recipes/` | S |
| Write `send-to-contact.yaml` | `t2000-skills/recipes/` | S |
| Write `portfolio-rebalance.yaml` | `t2000-skills/recipes/` | S |
| Write `emergency-withdraw.yaml` | `t2000-skills/recipes/` | S |
| **Service recipes** | | |
| Write `postcard.yaml` | `t2000-skills/recipes/` | S |
| Write `letter.yaml` | `t2000-skills/recipes/` | S |
| Write `bulk-mail.yaml` | `t2000-skills/recipes/` | S |
| Write `translate-document.yaml` | `t2000-skills/recipes/` | S |
| Write `merchandise.yaml` (Printful) | `t2000-skills/recipes/` | S |
| **Recipe error paths** | | |
| Add `on_error` branches to all financial recipes | `t2000-skills/recipes/` | M |
| Add `on_error` branches to irreversible service recipes | `t2000-skills/recipes/` | S |
| **Prompt reduction** | | |
| Reduce Audric system prompt — remove all per-feature rules | Audric repo | M |
| **Tests** | | |
| Recipe YAML loading and parsing | `__tests__/recipes.test.ts` | M |
| Trigger matching (financial + service) | `__tests__/recipes.test.ts` | S |
| Prompt context generation is concise | `__tests__/recipes.test.ts` | S |
| Multiple recipes don't conflict | `__tests__/recipes.test.ts` | S |

**Estimated effort:** 3-4 days
**Risk:** Medium — recipe format needs iteration based on real usage
**Rollback:** Don't load recipes; system prompt works without them

### Phase 4: System Prompt Reduction — NEXT

**Scope:** Audric `engine-factory.ts`

Now that Phases 1-3 are validated and production-tested, strip the system prompt down to core rules. Remove all per-service instructions, per-service multi-step flows, and behavioral rules that thinking + guards handle.

**Estimated effort:** 1 day
**Risk:** Low — done last, after reasoning is proven

---

## Migration Strategy

Phases are additive and independently deployable:

```
Current state ──→ Phase 1 (thinking) ──→ Phase 2 (guards) ──→ Phase 3 (recipes) ──→ Phase 4 (prompt reduction)
                     ↑                      ↑                     ↑                       ↑
                Ship + validate         Ship + validate       Ship + validate         Ship + validate
```

Each phase can be A/B tested by toggling the config:

```typescript
// Feature flags in engine-factory.ts
const ENABLE_THINKING = process.env.ENABLE_THINKING === 'true';
const ENABLE_GUARDS = process.env.ENABLE_GUARDS === 'true';
const ENABLE_RECIPES = process.env.ENABLE_RECIPES === 'true';
```

### Validation criteria per phase

**Phase 1 (thinking) — all features:**

| Feature | Test scenario | Pass criteria |
|---|---|---|
| **Savings** | "Save my SUI" | Agent explains USDC-only, offers to swap first — without prompt rule |
| **Savings** | "Save everything" after a swap | Agent calls `balance_check` first to get fresh USDC balance |
| **Send** | "Send $500 to Alice" (balance: $12) | Agent refuses, states actual balance |
| **Send** | "Send to Alice" (contact exists) | Agent resolves contact, uses correct address |
| **Credit** | "Borrow $200" (HF: 1.3) | Agent warns about liquidation risk before proceeding |
| **Swap** | "Sell SUI for USDC" | Agent states expected output before executing |
| **Swap** | "Swap then save" | Agent plans: swap → check received → deposit. Visible in thinking |
| **Pay** | Postcard request | Agent generates image → shows preview → asks confirmation |
| **Pay** | Lob failure after payment | Agent does NOT retry — reports error |
| **Multi-step** | "Rebalance portfolio" | Agent outputs numbered plan before first tool call |
| **Goals** | Deposit $100 (goal: $1000 Emergency Fund) | Agent mentions goal progress |
| **Latency** | Any turn | < 3s additional vs current |
| **Cost** | Per session | < 2x increase in total tokens |

**Phase 2 (guards) — structural enforcement:**

| Guard | Test scenario | Pass criteria |
|---|---|---|
| Balance | `save_deposit` called without prior `balance_check` after a write | Guard injects "balance stale" hint |
| Health | `borrow` called with HF < 1.5 | Guard blocks with error |
| Health | `withdraw` called with HF 1.7 | Guard injects warning |
| Large transfer | `send_transfer` for $600 | Guard injects "high-value" warning |
| Slippage | `swap_execute` called without estimate in prior text | Guard injects "state estimate" hint |
| Stale data | Model references snapshot balance after a swap | Guard injects "stale data" warning |
| Retry | `pay_api` called again after paid failure | Guard blocks with previous result |
| Artifact | `pay_api` returns image URL from fal.ai | Guard injects "show to user" hint |
| Irreversibility | Lob postcard without prior preview | Guard injects "preview first" nudge |
| Preflight | Lob with country code "UK" (should be "GB") | Guard rejects before execution |
| Config | Each guard disabled individually | Engine runs without it, no errors |

**Phase 3 (recipes) — all workflow types:**

| Recipe | Test scenario | Pass criteria |
|---|---|---|
| `swap-and-save` | "Convert my SUI and save it" | Recipe matched, steps followed in order |
| `safe-borrow` | "Borrow 100 USDC" | Recipe matched, health check before borrow |
| `send-to-contact` | "Send 50 to Bob" | Recipe matched, contact resolution step |
| `portfolio-rebalance` | "Rebalance to 50/50 SUI/USDC" | Recipe matched, plan shown before execution |
| `emergency-withdraw` | "Withdraw everything" | Recipe matched, health evaluated |
| `postcard` | "Send a postcard to my mum" | Recipe matched, image gen → preview → confirm → mail |
| New recipe added | Drop a new YAML file, restart | Picked up without code changes |
| System prompt | Total prompt size with recipes | < 100 lines base + 10 lines per active recipe |

---

## Advanced Features (Phase 4+)

### Tool search / dynamic tool loading

The engine currently loads all 25+ tools on every turn. Most turns only need 3-5. Loading all tools adds ~3,000 input tokens every turn and creates decision noise — the model has more options than it needs.

Anthropic's API supports a `tool_search` meta-tool that lets the model discover available tools at runtime by searching descriptions. The engine would expose all tools as a registry and let the model request the ones it needs.

**Benefit at scale:** 80% token reduction in tool definitions for simple turns. At 200,000 turns/day, this is significant.

**When to add:** Phase 4, after guards and recipes are validated. Requires refactoring `buildSystemPrompt` to expose a tool registry API rather than injecting all definitions up front.

### Structured outputs on tool results

Tool input validation today happens in `preflight` functions (our layer). Anthropic's structured outputs feature can enforce output schemas at the API level, giving a second layer of validation for free. 

When enabled, the API guarantees the model's tool input conforms exactly to the declared JSON schema — no more "model passed `country: 'UK'` instead of `'GB'`" bugs. The preflight layer becomes a last resort, not the first line of defence.

**When to add:** Phase 3 alongside preflight. Low effort — it's a flag on the tool definition.

---

## Cost & Latency Analysis

### Extended thinking cost with adaptive effort

| Turn type | Effort | Additional output tokens | Additional cost (Sonnet) | Additional latency |
|---|---|---|---|---|
| Balance check, rate lookup | `low` | ~200-500 | +$0.001 | +0.5-1s |
| Single deposit, simple send | `medium` | ~1000-3000 | +$0.005 | +1-2s |
| Rebalance, borrow decision, postcard | `high` | ~5000-15000 | +$0.015-0.04 | +3-6s |

**Compared to fixed `budget_tokens: 10000` (old approach):**
- Old: every turn spent ~10,000 thinking tokens regardless of complexity
- New: simple turns spend ~300 tokens; complex turns spend 5-15k
- Net: ~60% reduction in thinking cost at the session level across a typical user base

### Prompt caching impact

| Scenario | Input tokens (uncached) | Input tokens (cached) | Cost reduction |
|---|---|---|---|
| Turn 1 (cache miss) | ~4000 | 4000 uncached | Baseline |
| Turn 2+ (cache hit on system+tools) | ~4000 | ~500 uncached + ~3500 cached | ~87% of input cost |
| 10-turn session total | ~40,000 input tokens | ~9,000 uncached equivalent | ~77% input cost reduction |

**Combined impact (thinking efficiency + caching):** the reasoning engine at scale should cost roughly the same per session as the current flat-prompt approach, despite being dramatically more capable. Thinking adds cost; caching saves it; the complexity classifier optimises the ratio.

### Context compaction cost

Compaction calls are rare (triggered at 85% context) and use low-effort, tool-free summarisation. Cost per compaction: ~$0.01-0.02. Prevents session termination at context limits — worth the cost.

### Summary at 5,000 users

| Component | Daily cost (current) | Daily cost (with reasoning engine) |
|---|---|---|
| LLM (input — no caching) | ~$600 | ~$130 (with caching) |
| LLM (output — no thinking) | ~$80 | ~$150 (with adaptive thinking, ~50% complex turns) |
| Guard evaluations | $0 | $0 (local, no LLM) |
| Compaction calls | $0 | ~$10 (rare) |
| **Total** | **~$680/day** | **~$290/day** |

The reasoning engine costs **less** than the current approach at scale, because caching savings outweigh thinking additions.

---

## Testing Strategy

### Unit tests (engine) — by layer

**Layer 1: Thinking**
- Both `thinking` AND `redacted_thinking` blocks preserved across tool use turns
- Neither block type dropped during message reconstruction
- `toolChoice` forced to `auto` when thinking enabled
- Adaptive thinking config serialized correctly: `thinking: { type: 'adaptive' }` + `output_config: { effort }` as separate top-level fields (not `effort` inside `thinking`, not `budget_tokens`)
- `thinking_delta` and `thinking_done` events emitted correctly during stream
- Graceful fallback when provider doesn't support thinking (no crash, prompt-only mode)
- Complexity classifier routes turns to correct effort level
- Low-effort turns don't spend high thinking budget (token efficiency test)
- Cache breakpoint placed correctly — static system block vs dynamic context block separated
- Compaction triggered at 85% context; thinking blocks stripped from compacted history

**Layer 2: Guards**
- `BalanceTracker`: marks data stale after write, fresh after read
- `HealthFactorGuard`: blocks below 1.5, warns 1.5-2.0, allows above 2.0
- `LargeTransferGuard`: categorizes amounts into warning tiers ($50, $500)
- `SlippageGuard`: detects estimate presence in prior assistant text
- `StaleDataTracker`: flags stale snapshots after any mutating tool
- `RetryTracker`: tracks paid failures, blocks duplicate calls
- `containsArtifact()`: detects image URLs, PDF URLs, image arrays
- `IrreversibilityGuard`: checks conversation history for preview evidence
- Preflight: validates pay_api input (country codes, required fields)
- Guard runner: executes all guards, respects priority order (Tier 1 → 2 → 3)
- Guard runner: multiple Tier 3 nudges combined into single coherent hint
- Guard runner: emits `GuardEvent` for every guard fire (blocked or hint)
- `GuardEvent` written to DB with guard name, tier, tool, blocked flag, message
- Each guard independently disableable without affecting others

**Layer 3: Recipes**
- YAML parsing produces correct `Recipe` structure with `on_error` branches
- Trigger matching: exact, partial, and negative cases
- Trigger matching: financial recipes match financial intents
- Trigger matching: service recipes match service intents
- Conflict resolution: longest trigger match wins over shorter matches
- Conflict resolution: only one recipe injected per turn
- `on_error` branch: `abort` action stops recipe and reports nothing happened
- `on_error` branch: `report` action describes partial state after failure
- Prompt context formatter produces concise output (< 10 lines per recipe)
- Recipe loader hot-detects new YAML files in watch mode

### Integration tests (Audric)

| Category | Test | What it validates |
|---|---|---|
| **Savings** | "Save 100 USDC" → deposit flow | Balance check before deposit, correct amount |
| **Savings** | "Save my SUI" → reject or swap suggestion | USDC-only rule enforced by thinking, not prompt |
| **Send** | "Send $50 to Alice" → contact resolution → send | Recipe-driven contact resolution + transfer |
| **Send** | "Send $5000" (balance: $100) → refuse | Balance guard catches insufficient funds |
| **Credit** | "Borrow $200" (HF: 1.2) → refuse | Health guard blocks unsafe borrow |
| **Credit** | "Borrow $50" (HF: 3.0) → proceed | Health guard allows safe borrow |
| **Swap** | "Swap 10 SUI to USDC" → estimate → execute | Slippage guard ensures estimate shown |
| **Swap+Save** | "Convert SUI to USDC then save" → multi-step | Recipe followed: swap → use received → deposit |
| **Pay** | Postcard with image | Recipe followed: generate → preview → confirm → mail |
| **Pay** | Lob failure after payment | Retry guard blocks re-call, model reports error |
| **Multi-step** | "Rebalance to 50/50" → plan → execute | Recipe followed, plan output before tools |
| **Goals** | Deposit after goal set | Thinking naturally mentions goal progress |
| **Post-write** | Balance check after deposit | Stale data guard triggers fresh check |

### Evaluation (qualitative)

Run 30 representative prompts across all features, with and without reasoning engine:

| Feature | Prompts | Metrics |
|---|---|---|
| Savings | 5 (save, withdraw, "save all", "save SUI", compound) | Correct behavior, no USDC-only violations |
| Send | 5 (contact, raw address, large, insufficient, ambiguous) | Balance validation, address resolution |
| Credit | 5 (borrow safe, borrow risky, repay, "how much can I borrow", HF check) | Health factor awareness, risk warnings |
| Swap | 5 (simple, "sell all", low liquidity, swap+save, wrong direction) | Correct from/to, estimate shown |
| Pay | 5 (postcard, weather, image gen, Lob failure, bulk mail) | Preview behavior, retry avoidance |
| Multi-step | 5 (rebalance, DCA, "move everything", research+mail, swap+stake) | Plan output, correct step ordering |

**Metrics per prompt:**
- Correct step ordering (boolean)
- Balance verified before write (boolean)
- Preview shown for irreversible (boolean)
- No stale data usage (boolean)
- Turns per completion (fewer = better)
- Total tokens (lower = better, offset by thinking)
- User would need to intervene? (boolean — should be "no")

---

## Resolved Decisions

The following were open questions in earlier drafts. They are now resolved.

| Question | Decision |
|---|---|
| `budget_tokens` vs `effort` | Use adaptive thinking (`{ type: 'adaptive' }`) + `output_config: { effort }` as a **separate top-level field** on all current models. `effort` does NOT go inside the `thinking` object. Manual mode + `budget_tokens` only for Sonnet 3.7/Haiku 4.5. |
| Thinking display | Show summarized thinking for financial decisions (savings, credit, send, swap). Silent/omitted for service calls. See Thinking Display section. |
| Recipe conflict resolution | Longest trigger match wins. Only one recipe injected per turn. Model can deviate if reasoning justifies it. |
| Guard strictness | Tier 1 (safety) and Tier 2 (financial integrity) are hard blocks. Tier 3 (UX) are soft nudges. Per-guard, not per-deployment. See Guard Runner section. |
| Guard vs recipe overlap | Intentional redundancy. Recipe guides model, guard catches it if model skips. Monitor guard fire rates to tune. |
| Context management | Compact at 85% context limit. Strip thinking blocks from compacted history. See Context Window Management section. |

## Open Questions

1. **Financial guard thresholds**: Health factor block at 1.5, large transfer warn at $50/$500 — are these the right defaults? Should users be able to adjust them via safeguards preferences? Initial values should be conservative; expose as user-configurable in Phase 3+.

2. **Backward compatibility (non-Anthropic providers)**: Thinking is Anthropic-specific. Guards and recipes work regardless of provider. If a non-Anthropic model is used, thinking is disabled and Layer 1 reasoning falls back to prompt instructions only. Layers 2 and 3 continue to function. Document this clearly in the engine's provider interface.

3. **CLI + MCP parity**: Guards and recipes live in `@t2000/engine`, which the CLI and MCP server both import. Guards should apply universally — a dangerous borrow blocked in Audric should also be blocked when triggered via the CLI or a third-party MCP client. Confirm this is the case and add tests. Recipes may not apply to the CLI context (no multi-turn sessions by default).

4. **Compaction timing**: Compaction at 85% is an estimate. The actual trigger should be based on the `usage` data from the API response, not our own estimate. Track `usage.input_tokens` cumulatively per session and trigger compaction when it exceeds 85% of the model's actual context limit.

5. **Recipe hot-reloading**: Currently recipes are loaded at engine startup. For production deployments, adding a new recipe requires a redeploy. A file-system watcher or S3-backed recipe store would allow hot-reloading without redeploy. Phase 4+ consideration.

---

## References

- [Anthropic Extended Thinking Docs](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)
- [Anthropic Adaptive Thinking](https://docs.anthropic.com/en/docs/build-with-claude/adaptive-thinking)
- [Anthropic Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Anthropic Tool Use](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview)
- [Anthropic Fine-grained Tool Streaming](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/fine-grained-tool-streaming)
- [Claude Code Architecture](spec/CLAUDE_CODE_LEVERAGE.md) — Pattern source for QueryEngine
- [Product Spec](spec/PRODUCT_SPEC.md) — Current engine capabilities
- [Lob Bug Post-mortem](agent-transcripts context) — The incident that motivated this spec
