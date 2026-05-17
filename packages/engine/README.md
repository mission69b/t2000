# @t2000/engine

Agent engine for conversational finance — implements **Audric Intelligence** (the moat behind the Audric consumer product). Five systems work together: Agent Harness (37 tools — 25 read, 12 write), Reasoning Engine (14 guards across 3 priority tiers), Silent Profile, Chain Memory, and AdviceLog. Multi-step orchestration ("swap and save", "rebalance my portfolio", "emergency withdraw") lives in **skills** — markdown playbooks in `t2000-skills/skills/*/SKILL.md`, baked into `@t2000/mcp` and exposed to Cursor / Claude Desktop as MCP prompts. Every action it triggers waits on Audric Passport's tap-to-confirm.

QueryEngine orchestrates LLM conversations, financial tools, user confirmations, and MCP integrations into a single async-generator loop.

## Quick Start

```typescript
import { QueryEngine, AnthropicProvider, getDefaultTools } from '@t2000/engine';
import { T2000 } from '@t2000/sdk';

const agent = await T2000.create({ pin: process.env.T2000_PIN });

const engine = new QueryEngine({
  provider: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }),
  agent,
  tools: getDefaultTools(),
});

for await (const event of engine.submitMessage('What is my balance?')) {
  switch (event.type) {
    case 'text_delta':
      process.stdout.write(event.text);
      break;
    case 'tool_start':
      console.log(`\n[calling ${event.toolName}]`);
      break;
    case 'pending_action':
      // Write tool needs approval — client executes, then calls engine.resumeWithToolResult()
      break;
  }
}
```

## Audric Intelligence — the 5 systems

> _Not a chatbot. A financial agent._ Five systems work together to **understand** the user's money, **reason** about decisions, **act** through 35 financial tools in one conversation, **remember** what they did on-chain, and **remember what it told them**. Every action still waits on Audric Passport's tap-to-confirm.

| System | One-line | Owns | Lives in |
|---|---|---|---|
| 🎛️ **Agent Harness** | 37 tools (25 read + 12 write), one agent. | Tool registry, parallel reads, serial writes, permission gates, streaming dispatch | `engine.ts`, `tool.ts`, `orchestration.ts`, `tools/*` |
| ⚡ **Reasoning Engine** | Thinks before it acts. | Adaptive thinking effort, 14 guards (12 pre-exec + 2 post-exec), prompt caching, preflight validation. Multi-step playbooks (skills) ship from `@t2000/mcp`. | `classify-effort.ts`, `guards.ts`, `engine.ts` `cache_control` |
| 🧠 **Silent Profile** | Knows your finances. | Daily on-chain orientation snapshot + Claude-inferred profile, injected as `<financial_context>` block at every boot | _Audric-side_: `UserFinancialContext` + `UserFinancialProfile` Prisma models + `buildFinancialContextBlock()` |
| 🔗 **Chain Memory** | Remembers what you do on-chain. | 7 classifiers extract `ChainFact` rows from on-chain history, hydrated as silent context | _Audric-side_: 7 classifier crons + `ChainFact` Prisma model + `buildMemoryContext()` |
| 📓 **AdviceLog** | Remembers what it told you. | Every recommendation logged (`record_advice` audric tool); last 30 days hydrated each turn so the chat never contradicts itself | _Audric-side_: `AdviceLog` Prisma model + `record_advice` tool + `buildAdviceContext()` |

The engine package owns **Agent Harness** and **Reasoning Engine** in code. The other three systems are powered by audric-side data and injected via the system prompt — see `audric/.cursor/rules/engine-context-assembly.mdc` for the host contract.

## Architecture

```
User message
    │
    ▼
QueryEngine.submitMessage()
    │
    ├── LLM Provider (Anthropic Claude)
    │       ├── text_delta events → streamed to client
    │       └── tool_use → dispatched to tool system
    │
    ├── Tool Orchestration (runTools)
    │       ├── Read-only tools  → parallel (Promise.allSettled)
    │       └── Write tools      → serial (TxMutex)
    │
    ├── Delegated Execution
    │       └── confirm-level tools yield pending_action
    │           → client executes on-chain → resumeWithToolResult()
    │
    └── MCP Integration
            ├── MCP Client (McpClientManager) → consume external MCPs
            └── MCP Server (buildMcpTools)    → expose tools to AI clients
```

## Modules

| Module | Export | Purpose |
|--------|--------|---------|
| `engine.ts` | `QueryEngine` | Stateful conversation loop with tool dispatch |
| `tool.ts` | `buildTool` | Typed tool factory with Zod validation |
| `orchestration.ts` | `runTools`, `TxMutex` | Parallel reads, serial writes |
| `streaming.ts` | `serializeSSE`, `parseSSE` | SSE wire format SSOT (`engineToSSE` removed in v2.2.0 — hosts iterate EngineEvent raw + call `serializeSSE` per event) |
| `stream-checkpoint.ts` | `StreamCheckpointStore`, `InMemoryStreamCheckpointStore`, `detectInFlightTool` | [v2.2.0 / Slice C] Page-reload / cold-start LIVE-stream resume. Wire `EngineConfig.streamCheckpointStore`; engine emits `stream_started` first (with engine-generated UUID streamId) and fire-and-forget appends every yielded event. Host re-passes the id as `EngineConfig.resumeStreamId` on reconnect; engine replays then continues. In-flight tool on resume → Path B error. In-memory default has a 5-min TTL; multi-instance hosts inject Upstash. |
| `session.ts` | `MemorySessionStore` | In-memory session store with TTL |
| `context.ts` | `estimateTokens`, `compactMessages` | Token estimation + message compaction |
| `cost.ts` | `CostTracker` | Token usage + USD cost tracking with budget limits |
| `mcp.ts` | `buildMcpTools`, `registerEngineTools` | Expose engine tools as MCP server |
| `mcp-client.ts` | `McpClientManager`, `McpResponseCache` | Multi-server MCP client with caching |
| `mcp-tool-adapter.ts` | `adaptMcpTool`, `adaptAllMcpTools` | Convert MCP tools into engine `Tool` objects |
| `navi-config.ts` | `NAVI_MCP_CONFIG`, `NaviTools` | NAVI MCP server configuration |
| `navi-transforms.ts` | `transformRates`, `transformBalance`, ... | Raw MCP response → engine types |
| `navi-reads.ts` | `fetchRates`, `fetchBalance`, ... | Composite MCP read functions |
| `blockvision-prices.ts` | `fetchAddressPortfolio`, `fetchTokenPrices`, `clearPortfolioCache`, `clearPortfolioCacheFor`, `clearPriceMapCache` | BlockVision Indexer REST: full wallet portfolio + multi-token USD prices (Sui RPC + hardcoded-stable degraded fallback) |
| `tools/protocol-deep-dive.ts` | `protocolDeepDiveTool` | DefiLlama protocol metadata (TVL, fees, audits, safety score) — lone production dependency on `api.llama.fi` post-Day-3 |
| `tools/token-prices.ts` | `tokenPricesTool` | BlockVision-backed multi-token spot price + 24h change (replaces deleted `defillama_token_prices` / `defillama_price_change`) |
| `tools/swap-quote.ts` | `swapQuoteTool` | Preview swap route + price impact (read-only) |
| `tools/swap.ts` | `swapExecuteTool` | Cetus Aggregator multi-DEX swap |
| `tools/volo-stats.ts` | `voloStatsTool` | VOLO liquid staking stats (vSUI/SUI rate, APY, TVL) |
| `tools/volo-stake.ts` | `voloStakeTool` | Stake SUI → vSUI |
| `tools/volo-unstake.ts` | `voloUnstakeTool` | Unstake vSUI → SUI |
| `prompt.ts` | `DEFAULT_SYSTEM_PROMPT` | Audric system prompt |
| `providers/anthropic.ts` | `AnthropicProvider` | Anthropic Claude LLM provider |

## Built-in Tools

### Read Tools (23 — parallel, auto-approved)

| Tool | Description |
|------|-------------|
| `balance_check` | Available, savings, debt, rewards, gas reserve (BlockVision pricing, Sui RPC fallback) |
| `savings_info` | Positions, earnings, fund status |
| `health_check` | Health factor with risk assessment |
| `rates_info` | Current supply/borrow APYs |
| `transaction_history` | Recent transaction log |
| `explain_tx` | Human-readable transaction explanation from digest |
| `web_search` | Web search via Brave Search API |
| `swap_quote` | Preview swap route, output amount, and price impact (no execution) |
| `volo_stats` | VOLO liquid staking stats — vSUI/SUI rate, APY, TVL |
| `portfolio_analysis` | Portfolio breakdown with diversification insights |
| `protocol_deep_dive` | Deep protocol analysis — TVL, yields, risks, alternatives (lone surviving DefiLlama dependency) |
| `mpp_services` | Browse available MPP gateway services and endpoints |
| `token_prices` | Current USD prices for Sui tokens (BlockVision; optional 24h change). Replaces deleted `defillama_token_prices` and `defillama_price_change`. |
| `create_payment_link` | Create a shareable USDC payment link |
| `list_payment_links` | List payment links with statuses |
| `cancel_payment_link` | Cancel an active payment link |
| `create_invoice` | Create a formal invoice with due date and line items |
| `list_invoices` | List invoices with statuses |
| `cancel_invoice` | Cancel an unpaid invoice |
| `spending_analytics` | Spending breakdown by service/category over time period |
| `yield_summary` | Yield earned + projections with sparkline data |
| `activity_summary` | Activity breakdown by action type |
| `render_canvas` | Generate interactive HTML canvas visualizations |

### Write Tools (11 — serial, confirmation required)

| Tool | Description |
|------|-------------|
| `save_deposit` | Deposit **USDC or USDsui** to NAVI savings (v0.51.0+ strategic exception). Pass `asset: 'USDC' \| 'USDsui'`. Other tokens must be swapped first — never auto-chained. |
| `withdraw` | Withdraw from savings (optional `asset` for multi-asset withdrawals; supports USDC, USDsui, plus legacy USDe / SUI positions) |
| `send_transfer` | Send USDC to an address |
| `borrow` | Borrow **USDC or USDsui** against collateral (v0.51.0+). Pass `asset: 'USDC' \| 'USDsui'`. |
| `repay_debt` | Repay outstanding **USDC or USDsui** debt (v0.51.1+). Pass `asset` to target a specific debt; omit for highest-APY repay. **Repay symmetry is enforced:** USDsui debt MUST be repaid with USDsui. |
| `claim_rewards` | Claim pending yield rewards |
| `pay_api` | Pay for an API service via MPP |
| `swap_execute` | Swap any token pair via Cetus Aggregator (20+ DEXs) |
| `volo_stake` | Stake SUI for vSUI (VOLO liquid staking) |
| `volo_unstake` | Unstake vSUI back to SUI |
| `save_contact` | Save a contact name + address for quick sends |

> Note: `record_advice` is an Audric-local tool registered in
> `audric/apps/web/lib/engine/advice-tool.ts`, not part of the engine package.

> **Simplification Day 7:** Removed 9 tools — `allowance_status`, `toggle_allowance`,
> `update_daily_limit`, `update_permissions` (allowance contract dormant under zkLogin),
> `create_schedule`, `list_schedules`, `cancel_schedule` (DCA can't execute without user
> online to sign), `pattern_status`, `pause_pattern` (pattern proposals removed; classifiers
> kept as pure functions).
>
> **v1.4 BlockVision swap (April 2026):** Removed 7 `defillama_*` read tools —
> `defillama_token_prices`, `defillama_price_change`, `defillama_yield_pools`,
> `defillama_protocol_info`, `defillama_chain_tvl`, `defillama_protocol_fees`,
> `defillama_sui_protocols`. Added 1 — `token_prices` (BlockVision-backed). `balance_check`
> and `portfolio_analysis` rewired to BlockVision Indexer REST API for sub-500ms portfolio
> fetches. `protocol_deep_dive` retains its DefiLlama dependency (narrow scope, no
> equivalent on BlockVision). Net post-v1.4: 23 reads + 11 writes = 34 tools.
> Post-SPEC-10 (`resolve_suins`) + S.119 (`pending_rewards`) + Track B (`harvest_rewards`): 25 reads + 12 writes = 37 tools.
>
> **SPEC 10 SuiNS reverse-lookup (May 2026):** Added 1 read tool — `resolve_suins`.
> Net post-Phase-6 + S.119 + Track B: 25 reads + 12 writes = 37 tools.
>
> **S.119 NAVI rewards (May 2026):** Added 1 read tool — `pending_rewards` (preview claimable
> rewards without triggering a claim) — and 1 write tool — `harvest_rewards` (compound: claim
> NAVI rewards → swap each non-USDC reward to USDC → deposit merged USDC into NAVI savings,
> single PTB). Per-leg fees (10 bps Cetus overlay × N + 10 bps NAVI save fee) wired in S.120.
> Net post-S.119: **25 reads + 12 writes = 37 tools** (current).

## Recent Upgrades — Spec 1 (Correctness) + Spec 2 (Intelligence)

Two upgrades shipped on top of the 5-system base:

| Spec | Versions | What it added |
|---|---|---|
| **Spec 1 — Correctness** | v0.41.0 → v0.50.3 | Per-yield `attemptId` (UUID v4) on every `pending_action` — stable join key from action → on-chain receipt → `TurnMetrics` row. `modifiableFields` registry — fields the user can edit on a confirm card without losing the LLM's reasoning (resume route applies `modifications`). `EngineConfig.onAutoExecuted` hook so `auto`-permission writes participate in the same telemetry as confirm-gated ones. |
| **Spec 2 — Intelligence** | v0.47.0 → v0.54.1 | BlockVision swap — replaced 7 `defillama_*` tools with one `token_prices`; `balance_check` + `portfolio_analysis` rewired to BlockVision Indexer REST. Sticky-positive cache + retry/circuit breaker (`fetchBlockVisionWithRetry`) for graceful 429 handling. `<financial_context>` boot-time orientation injected from the daily `UserFinancialContext` snapshot (Silent Profile). `attemptId`-keyed resume (no clobbering between two pending actions in the same turn). `protocol_deep_dive` retained on DefiLlama as the lone exception. |

> Local-only specs: `AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md`, `AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md`. Cross-repo contracts: `t2000/.cursor/rules/agent-harness-spec.mdc` + `t2000/.cursor/rules/blockvision-resilience.mdc` + `audric/.cursor/rules/audric-transaction-flow.mdc` + `audric/.cursor/rules/write-tool-pending-action.mdc`.

### Why we keep our `PendingAction` shape instead of adopting AI SDK v6's HITL primitive

Scoping in 2026-05-18 (`SPEC_SLICE_D_DRAFT.md`) determined that AI SDK v6's native `tool-approval-request` / `needsApproval` HITL primitive is **incompatible with our zkLogin sponsored-tx model.** The native primitive assumes:

1. Tools have a `execute` function the server runs after the user approves
2. The server returns the result via the next stream

Our model is the opposite — the **client** signs sponsored transactions (zkLogin keeps the signing key browser-side), broadcasts them, and reports `{ txDigest, balanceChanges }` back to the engine via `resumeWithToolResult`. There is no server-side `execute` for our write tools because there cannot be one.

The actually-fit-for-purpose AI SDK v6 primitive is **client-side tools** (no server `execute`, `onToolCall` + `addToolOutput`), but adopting it requires audric to migrate to `useChat` from `@ai-sdk/react` — that's Slice B's scope, naturally paired with the v0.7c chatbot template fork.

Net effect: we keep our 15-field `PendingAction` event (which carries load-bearing extension fields the AI SDK primitive doesn't model — `description`, `modifiableFields`, `cetusRoute`, `steps[]`, `guardInjections`, `borrowApyBps`, `currentHF`, `projectedHF`, `quoteAge`, `canRegenerate`, `regenerateInput`), and add `approvalId` as a forward-compat alias for `attemptId` (D-6.1, 2026-05-18) so future migrations have a stable AI-SDK-aligned read path.

## Engine Features

### Streaming Tool Execution (Early Dispatch)

`EarlyToolDispatcher` dispatches read-only tools mid-stream before `message_stop`. Tools with `isReadOnly && isConcurrencySafe` fire as soon as their `tool_use` block completes. Write tools still go through the permission gate.

### Tool Result Budgeting

Tools can set `maxResultSizeChars` to cap output size. Results exceeding the limit are truncated with a hint to narrow parameters. Custom `summarizeOnTruncate` callbacks supported.

### Microcompact

`microcompact(messages)` deduplicates identical tool calls (same name + input) in conversation history, replacing repeated results with `[Same result as turn N]`.

### Granular Permissions (USD-aware)

Write tool permission resolved dynamically via `resolvePermissionTier(operation, amountUsd, config)`. Small amounts auto-execute; large amounts require confirmation. Three presets: `conservative`, `balanced`, `aggressive`.

### Reasoning Engine

- **Adaptive thinking** — routes queries to `low`/`medium`/`high` effort based on financial complexity
- **Guard runner** — 14 guards (12 pre-execution + 2 post-execution hints) across 3 priority tiers (Safety > Financial > UX). See `guards.ts` for the full list.
- **Skills** — 14 markdown playbooks in `t2000-skills/skills/*/SKILL.md` (`t2000-rebalance`, `t2000-account-report`, `t2000-borrow` with safe-borrow logic, `t2000-withdraw` with emergency-close logic, `t2000-save` with swap-and-save section, `t2000-send` with offer-save-contact, plus 8 single-tool skills). Baked into `@t2000/mcp` at build time, exposed to MCP clients as `skill-<name>` prompts. Skill content guides the LLM through multi-step intents; the engine just runs the tools the LLM picks. (Pre-Phase 6 had a YAML recipe runtime; deleted May 2026 — see `index.ts` header comment for migration notes.)
- **Context compaction** — 200k limit, 85% compact trigger, LLM summarizer fallback
- **Tool flags** — `mutating`, `requiresBalance`, `affectsHealth`, `irreversible` etc.
- **Preflight validation** — input validation on `send_transfer`, `swap_execute`, `pay_api`, `borrow`, `save_deposit`

### Stream Checkpoint Resume (v2.2.0+)

Survive page reloads, Vercel cold starts, and mobile-tab swaps mid-stream **without re-running the LLM**. Engine appends every yielded `EngineEvent` to a pluggable `StreamCheckpointStore`; on a subsequent `submitMessage({ resumeStreamId })`, the engine replays the checkpoint and either continues into the live stream (if the stream had finished) or surfaces a clear error (if a tool was in-flight when the original stream dropped).

**1. Configure a store on the engine.**

```typescript
import { AISDKEngine, InMemoryStreamCheckpointStore } from '@t2000/engine';

const engine = new AISDKEngine({
  // ...other config
  streamCheckpointStore: new InMemoryStreamCheckpointStore(),
});
```

For single-instance hosts (CLI, dev, tests), the in-memory default is enough (5-min sliding TTL). Multi-instance hosts (audric on Vercel) inject a Redis-backed store — see [`audric/apps/web/lib/engine/upstash-stream-checkpoint-store.ts`](https://github.com/mission69b/audric/blob/main/apps/web/lib/engine/upstash-stream-checkpoint-store.ts) as the reference implementation (Upstash LIST per `streamId`, namespaced by `sessionId`, Error-safe serialization, fire-and-forget append).

**2. Persist the `streamId` from the first event on each fresh stream.**

```typescript
for await (const ev of engine.submitMessage(prompt)) {
  if (ev.type === 'stream_started') {
    sessionStorage.setItem('liveStreamId', ev.streamId); // or any host-local store
  }
  // ...handle the rest of the stream
}
```

`stream_started` is yielded as the **first** event whenever a checkpoint store is configured and `resumeStreamId` is not set. Engine generates a UUID v4 `streamId` per `submitMessage()`.

**3. Resume on reconnect.**

```typescript
const resumeStreamId = sessionStorage.getItem('liveStreamId');
if (resumeStreamId) {
  const engine = new AISDKEngine({
    streamCheckpointStore: store,
    resumeStreamId,
    // ...other config
  });
  for await (const ev of engine.submitMessage('')) {
    // Engine replays every previously yielded event, then either:
    //   (a) emits the original terminal (turn_complete or pending_action), OR
    //   (b) synthesises turn_complete if the original was cut between
    //       the last tool_result and turn_complete (defensive), OR
    //   (c) emits an error if a tool_start has no matching tool_result
    //       (Path B per Slice C spec — host re-prompts the user; Path A
    //       silent re-execution is deferred to v2.3.0+).
  }
}
```

Notes:
- The `message` argument is **ignored** on a resume call — pass `''`. Host validation must accept an empty message when `resumeStreamId` is set.
- `resumeStreamId` without `streamCheckpointStore` throws — it's a host bug, fail loud.
- Clear the stored `streamId` on `turn_complete` and `error`. Engine clears its own checkpoint on natural turn end.
- Stream-checkpoint resume is for the **live LLM stream**. The confirm/deny round-trip after `pending_action` still goes through `resumeWithToolResult(action, response)` keyed on `attemptId`.

## Configuration

```typescript
interface EngineConfig {
  // Core
  provider: LLMProvider;                    // Required — LLM provider instance
  agent?: unknown;                          // T2000 SDK instance (for tool execution)
  mcpManager?: unknown;                     // McpClientManager (MCP-first reads)
  walletAddress?: string;                   // User's Sui address — populated into onAutoExecuted
  suiRpcUrl?: string;                       // Sui JSON-RPC URL for direct chain queries
  tools?: Tool[];                           // Custom tool set (defaults to getDefaultTools())
  systemPrompt?: string | SystemBlock[];    // Override default Audric prompt
  model?: string;                           // LLM model override
  maxTurns?: number;                        // Max conversation turns (default: 10)
  maxTokens?: number;                       // Max tokens per response (default: 4096)

  // [v1.4 BlockVision] Pricing + portfolio
  blockvisionApiKey?: string;               // BlockVision Indexer key — degrades to Sui RPC if absent
  portfolioCache?: Map<string, AddressPortfolio>; // Per-request portfolio memoisation across read tools

  // Reasoning engine
  guards?: GuardConfig;                     // Guard runner (RE-2.2)
  // recipes?: RecipeRegistry;              // REMOVED v0.7a Phase 6 — skills moved to @t2000/mcp
  contextBudget?: ContextBudgetConfig;      // 200k limit, compaction trigger (RE-3.3)
  contextSummarizer?: (msgs) => Promise<string>; // LLM summarizer fallback for compaction
  thinking?: ThinkingConfig;                // Adaptive / extended thinking
  outputConfig?: OutputConfig;              // Effort hint

  // Permissions + state
  permissionConfig?: UserPermissionConfig;  // USD-threshold write gating (B.4)
  priceCache?: Map<string, number>;         // Symbol → USD for permission resolution
  contacts?: ReadonlyArray<{ name: string; address: string }>; // Trusted send-transfer recipients
  sessionSpendUsd?: number;                 // Cumulative session auto-execute total

  // Hooks
  onAutoExecuted?: (info: {                 // [v1.4] Fired after auto-tier write succeeds
    toolName: string;
    usdValue: number;
    walletAddress?: string;                 // Populated from config.walletAddress for cache invalidation
  }) => void | Promise<void>;
  onGuardFired?: (guard: GuardMetric) => void; // [v1.4 Item 4] Per-guard observation hook
  postWriteRefresh?: Record<string, string[]>; // [v1.5] Auto-rerun reads after a successful write

  costTracker?: {
    budgetLimitUsd?: number;                // Kill switch at USD threshold
    inputCostPerToken?: number;
    outputCostPerToken?: number;
  };

  // [v2.2.0] Stream checkpoint resume (Slice C)
  streamCheckpointStore?: StreamCheckpointStore; // Pluggable per-stream EngineEvent log (InMemoryStreamCheckpointStore default; hosts inject Redis-backed impl for multi-instance survival)
  resumeStreamId?: string;                  // When set, engine replays the checkpointed events for this streamId before/instead of starting a fresh LLM stream
}
```

> See `packages/engine/src/types.ts` for the canonical interface — additional internal fields and full JSDoc.

## Event Types

The `submitMessage()` async generator yields `EngineEvent`:

| Event | Fields | When |
|-------|--------|------|
| `text_delta` | `text` | LLM streams a text chunk |
| `thinking_delta` | `text`, `blockIndex` | Extended thinking chunk (reasoning accordion). **`blockIndex`** identifies which thinking block this delta belongs to so hosts can render multi-block thinking chronologically (Anthropic streams ≥1 thinking blocks per turn at high effort). |
| `thinking_done` | `blockIndex`, `signature?`, `summaryMode?`, `evaluationItems?` | Extended thinking block complete. `blockIndex` matches the `thinking_delta` events for that block. **`summaryMode`** flips true and **`evaluationItems`** is populated when the block contained a parseable `<eval_summary>` marker — hosts render `HowIEvaluatedBlock` ("✦ HOW I EVALUATED THIS") from these fields. |
| `todo_update` | `items`, `toolUseId` | **[SPEC 8 v0.5.1]** Side-channel event paired to every `update_todo` tool call. `items` is the full `TodoItem[]` array; hosts unconditionally replace their rendered list (the tool is idempotent). `toolUseId` keys the render to the originating call. |
| `tool_progress` | `toolUseId`, `toolName`, `message`, `pct?` | **[SPEC 8 v0.5.1]** Mid-execution progress signal from long-running tools (Cetus swap, protocol_deep_dive, portfolio_analysis). Tools opt in via `context.progress?.(msg, pct?)`. Engine wiring lands with the Cetus SDK integration in a follow-on slice. |
| `pending_input` | `schema`, `inputId`, `prompt?` | **[SPEC 8 v0.5.1, D2]** Reserved for SPEC 9 v0.1.2 inline forms. Engine doesn't emit under SPEC 8 — host adds a no-op handler now to avoid crashing when SPEC 9 ships emission. |
| `tool_start` | `toolName`, `toolUseId`, `input` | Tool execution begins |
| `tool_result` | `toolName`, `toolUseId`, `result`, `isError` | Tool execution completes |
| `pending_action` | `action` (PendingAction with `attemptId`, `approvalId`, `toolUseId`, `turnIndex`, `name`, `input`) | Write tool awaiting client-side execution. `attemptId` is a per-yield UUID — hosts persist it on TurnMetrics and key the resume `updateMany` on it (avoids ambiguous `(sessionId, turnIndex)` updates). **`approvalId` is a forward-compat alias for `attemptId`** (engine stamps both fields identically; reading either is safe). The alias exists to ease a future v0.7c migration if/when Audric (or any host) adopts AI SDK v6's `approvalId` HITL terminology — see `SPEC_SLICE_D_DRAFT.md` (D-6.1, 2026-05-18) for the impedance analysis explaining why we keep our `PendingAction` shape instead of migrating wholesale to AI SDK's `needsApproval` primitive (which is server-execute-only and incompatible with our zkLogin client-executed sponsored-tx model). |
| `canvas` | `html` | Interactive HTML visualization from `render_canvas` |
| `turn_complete` | `stopReason` | Conversation turn finished |
| `usage` | `inputTokens`, `outputTokens`, `cacheReadTokens?`, `cacheWriteTokens?` | Token usage report |
| `error` | `error` | Unrecoverable error |
| `stream_started` | `streamId` | **[v2.2.0 Slice C]** First event when `streamCheckpointStore` is configured. Carries the engine-generated UUID v4 the host persists for page-reload / cold-start resume. Pass the same id back as `EngineConfig.resumeStreamId` on reconnect to replay the checkpointed events. |

## MCP Client Integration

Connect to external MCP servers (e.g., NAVI Protocol) for data:

```typescript
import { McpClientManager, NAVI_MCP_CONFIG } from '@t2000/engine';

const mcpManager = new McpClientManager();
await mcpManager.connect(NAVI_MCP_CONFIG);

const engine = new QueryEngine({
  provider,
  agent,
  mcpManager,
  walletAddress: '0x...',
  tools: getDefaultTools(),
});
```

Read tools automatically use MCP when available, falling back to the SDK.

> **v2.1.0 internals:** `McpClientManager` now wraps `@ai-sdk/mcp`'s `createMCPClient` under the hood. The public surface (`connect`, `listTools`, `callTool`) is preserved verbatim — adding a new MCP server is still a single `mcpManager.connect(config)` call. See `__tests__/mcp-client.test.ts` for the 2-server fixture and `mcp/createMCPClient-integration.test.ts` for the wire test.

### McpPromptAdapter (v2.1.0+)

Closes the **prompts** half of the MCP composition story. MCP servers can expose prompts (parameterised reusable system messages); `McpPromptAdapter` discovers them and returns their text content for direct concatenation into the engine's `prepareStep.system` prefix.

```typescript
import { McpPromptAdapter, type PromptCapableMcpClient } from '@t2000/engine';

// The adapter takes any client exposing experimental_listPrompts +
// experimental_getPrompt — the AI SDK MCP client returned by
// createMCPClient already satisfies this shape.
const adapter = new McpPromptAdapter(mcpClient as PromptCapableMcpClient);

const prompts = await adapter.listPrompts();
const text = await adapter.getPromptText({
  name: 'skill_name',
  arguments: { foo: 'bar' },
});
```

Phase 6 (engine moat) wires the `t2000-skills/skills/` repo through `@t2000/mcp` into this adapter so a single skill file is consumable by Cursor, Claude Desktop, `claude-code`, and the audric engine simultaneously.

## MCP Server Adapter

Expose engine tools to Claude Desktop, Cursor, or any MCP client:

```typescript
import { registerEngineTools } from '@t2000/engine';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const server = new McpServer({ name: 'audric', version: '0.1.0' });
registerEngineTools(server, getDefaultTools());
```

## Custom Tools

```typescript
import { z } from 'zod';
import { buildTool } from '@t2000/engine';

const myTool = buildTool({
  name: 'my_tool',
  description: 'Does something useful',
  inputSchema: z.object({ query: z.string() }),
  isReadOnly: true,
  permissionLevel: 'auto',
  async call(input, context) {
    return { data: { answer: 42 }, displayText: 'The answer is 42' };
  },
});
```

## Development

```bash
pnpm --filter @t2000/engine build      # Build (tsup → ESM)
pnpm --filter @t2000/engine test       # Run tests (vitest)
pnpm --filter @t2000/engine typecheck  # TypeScript strict check
pnpm --filter @t2000/engine lint       # ESLint
```

## License

MIT
