# @t2000/engine

Agent engine for conversational finance — implements **Audric Intelligence** (the moat behind the Audric consumer product). Five systems work together: Agent Harness (34 tools — 23 read, 11 write), Reasoning Engine (14 guards across 3 priority tiers + 6 YAML skill recipes), Silent Profile, Chain Memory, and AdviceLog. Every action it triggers waits on Audric Passport's tap-to-confirm.

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

> _Not a chatbot. A financial agent._ Five systems work together to **understand** the user's money, **reason** about decisions, **act** through 34 financial tools in one conversation, **remember** what they did on-chain, and **remember what it told them**. Every action still waits on Audric Passport's tap-to-confirm.

| System | One-line | Owns | Lives in |
|---|---|---|---|
| 🎛️ **Agent Harness** | 34 tools, one agent. | Tool registry, parallel reads, serial writes, permission gates, streaming dispatch | `engine.ts`, `tool.ts`, `orchestration.ts`, `tools/*` |
| ⚡ **Reasoning Engine** | Thinks before it acts. | Adaptive thinking effort, 14 guards (12 pre-exec + 2 post-exec), 6 YAML skill recipes, prompt caching, preflight validation | `classify-effort.ts`, `guards.ts`, `recipes/registry.ts`, `engine.ts` `cache_control` |
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
| `streaming.ts` | `serializeSSE`, `parseSSE`, `engineToSSE` | SSE wire format |
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
> equivalent on BlockVision). Net: 23 reads + 11 writes = 34 tools.

## Recent Upgrades — Spec 1 (Correctness) + Spec 2 (Intelligence)

Two upgrades shipped on top of the 5-system base:

| Spec | Versions | What it added |
|---|---|---|
| **Spec 1 — Correctness** | v0.41.0 → v0.50.3 | Per-yield `attemptId` (UUID v4) on every `pending_action` — stable join key from action → on-chain receipt → `TurnMetrics` row. `modifiableFields` registry — fields the user can edit on a confirm card without losing the LLM's reasoning (resume route applies `modifications`). `EngineConfig.onAutoExecuted` hook so `auto`-permission writes participate in the same telemetry as confirm-gated ones. |
| **Spec 2 — Intelligence** | v0.47.0 → v0.54.1 | BlockVision swap — replaced 7 `defillama_*` tools with one `token_prices`; `balance_check` + `portfolio_analysis` rewired to BlockVision Indexer REST. Sticky-positive cache + retry/circuit breaker (`fetchBlockVisionWithRetry`) for graceful 429 handling. `<financial_context>` boot-time orientation injected from the daily `UserFinancialContext` snapshot (Silent Profile). `attemptId`-keyed resume (no clobbering between two pending actions in the same turn). `protocol_deep_dive` retained on DefiLlama as the lone exception. |

> Local-only specs: `AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md`, `AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md`. Cross-repo contracts: `t2000/.cursor/rules/agent-harness-spec.mdc` + `t2000/.cursor/rules/blockvision-resilience.mdc` + `audric/.cursor/rules/audric-transaction-flow.mdc` + `audric/.cursor/rules/write-tool-pending-action.mdc`.

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
- **Skill recipes** — 6 YAML recipes (`swap_and_save`, `safe_borrow`, `send_to_contact`, `portfolio_rebalance`, `account_report`, `emergency_withdraw`) with longest-trigger-match-wins
- **Context compaction** — 200k limit, 85% compact trigger, LLM summarizer fallback
- **Tool flags** — `mutating`, `requiresBalance`, `affectsHealth`, `irreversible` etc.
- **Preflight validation** — input validation on `send_transfer`, `swap_execute`, `pay_api`, `borrow`, `save_deposit`

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
  recipes?: RecipeRegistry;                 // YAML skill recipes (RE-3.1)
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
| `pending_action` | `action` (PendingAction with `attemptId`, `toolUseId`, `turnIndex`, `name`, `input`) | Write tool awaiting client-side execution. `attemptId` is a per-yield UUID — hosts persist it on TurnMetrics and key the resume `updateMany` on it (avoids ambiguous `(sessionId, turnIndex)` updates) |
| `canvas` | `html` | Interactive HTML visualization from `render_canvas` |
| `turn_complete` | `stopReason` | Conversation turn finished |
| `usage` | `inputTokens`, `outputTokens`, `cacheReadTokens?`, `cacheWriteTokens?` | Token usage report |
| `error` | `error` | Unrecoverable error |

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
