# @t2000/engine

Agent engine for conversational finance — powers the **Audric** consumer product.

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
| `defillama-prices.ts` | `fetchTokenPrices`, `clearPriceCache` | Batch USD prices from DefiLlama (single price source) |
| `tools/defillama.ts` | 7 DefiLlama tools | Yield pools, protocol info, token prices, price changes, chain TVL, fees, Sui protocols |
| `tools/swap-quote.ts` | `swapQuoteTool` | Preview swap route + price impact (read-only) |
| `tools/swap.ts` | `swapExecuteTool` | Cetus Aggregator multi-DEX swap |
| `tools/volo-stats.ts` | `voloStatsTool` | VOLO liquid staking stats (vSUI/SUI rate, APY, TVL) |
| `tools/volo-stake.ts` | `voloStakeTool` | Stake SUI → vSUI |
| `tools/volo-unstake.ts` | `voloUnstakeTool` | Unstake vSUI → SUI |
| `prompt.ts` | `DEFAULT_SYSTEM_PROMPT` | Audric system prompt |
| `providers/anthropic.ts` | `AnthropicProvider` | Anthropic Claude LLM provider |

## Built-in Tools

### Read Tools (20 — parallel, auto-approved)

| Tool | Description |
|------|-------------|
| `balance_check` | Available, savings, debt, rewards, gas reserve (DefiLlama pricing) |
| `savings_info` | Positions, earnings, fund status |
| `health_check` | Health factor with risk assessment |
| `rates_info` | Current supply/borrow APYs |
| `transaction_history` | Recent transaction log |
| `allowance_status` | Agent budget allowance and permissions |
| `explain_tx` | Human-readable transaction explanation from digest |
| `web_search` | Web search via Brave Search API |
| `swap_quote` | Preview swap route, output amount, and price impact (no execution) |
| `volo_stats` | VOLO liquid staking stats — vSUI/SUI rate, APY, TVL |
| `portfolio_analysis` | Portfolio breakdown with diversification insights |
| `protocol_deep_dive` | Deep protocol analysis — TVL, yields, risks, alternatives |
| `mpp_services` | Browse available MPP gateway services and endpoints |
| `defillama_yield_pools` | Top yield pools by APY, filterable by chain |
| `defillama_protocol_info` | Protocol TVL, category, chains |
| `defillama_token_prices` | Current USD prices for Sui tokens |
| `defillama_price_change` | Token price % change over period |
| `defillama_chain_tvl` | Chain TVL rankings |
| `defillama_protocol_fees` | Protocol fees/revenue rankings |
| `defillama_sui_protocols` | Sui ecosystem protocols — TVL, category, changes |

### Write Tools (11 — serial, confirmation required)

| Tool | Description |
|------|-------------|
| `save_deposit` | Deposit **USDC** to savings (NAVI); non-USDC collateral must be swapped first |
| `withdraw` | Withdraw from savings (optional `asset` for multi-asset withdrawals) |
| `send_transfer` | Send USDC to an address |
| `borrow` | Borrow USDC against collateral |
| `repay_debt` | Repay outstanding debt |
| `claim_rewards` | Claim pending yield rewards |
| `pay_api` | Pay for an API service via MPP |
| `swap_execute` | Swap any token pair via Cetus Aggregator (20+ DEXs) |
| `volo_stake` | Stake SUI for vSUI (VOLO liquid staking) |
| `volo_unstake` | Unstake vSUI back to SUI |
| `save_contact` | Save a contact name + address for quick sends |

## Configuration

```typescript
interface EngineConfig {
  provider: LLMProvider;          // Required — LLM provider instance
  agent?: unknown;                // T2000 SDK instance (for tool execution)
  mcpManager?: unknown;           // McpClientManager (MCP-first reads)
  walletAddress?: string;         // User's Sui address (for MCP reads)
  tools?: Tool[];                 // Custom tool set (defaults to getDefaultTools())
  systemPrompt?: string;          // Override default Audric prompt
  model?: string;                 // LLM model override
  maxTurns?: number;              // Max conversation turns (default: 10)
  maxTokens?: number;             // Max tokens per response (default: 4096)
  costTracker?: {
    budgetLimitUsd?: number;      // Kill switch at USD threshold
    inputCostPerToken?: number;
    outputCostPerToken?: number;
  };
}
```

## Event Types

The `submitMessage()` async generator yields `EngineEvent`:

| Event | Fields | When |
|-------|--------|------|
| `text_delta` | `text` | LLM streams a text chunk |
| `tool_start` | `toolName`, `toolUseId`, `input` | Tool execution begins |
| `tool_result` | `toolName`, `toolUseId`, `result`, `isError` | Tool execution completes |
| `pending_action` | `action` (PendingAction) | Write tool awaiting client-side execution |
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
