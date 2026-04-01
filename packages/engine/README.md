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
    case 'permission_request':
      event.resolve(true); // auto-approve (or prompt the user)
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
    ├── Permission Flow
    │       └── confirm-level tools yield permission_request
    │           → client resolves → tool executes or aborts
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
| `streaming.ts` | `serializeSSE`, `parseSSE`, `PermissionBridge`, `engineToSSE` | SSE wire format + permission bridging |
| `session.ts` | `MemorySessionStore` | In-memory session store with TTL |
| `context.ts` | `estimateTokens`, `compactMessages` | Token estimation + message compaction |
| `cost.ts` | `CostTracker` | Token usage + USD cost tracking with budget limits |
| `mcp.ts` | `buildMcpTools`, `registerEngineTools` | Expose engine tools as MCP server |
| `mcp-client.ts` | `McpClientManager`, `McpResponseCache` | Multi-server MCP client with caching |
| `mcp-tool-adapter.ts` | `adaptMcpTool`, `adaptAllMcpTools` | Convert MCP tools into engine `Tool` objects |
| `navi-config.ts` | `NAVI_MCP_CONFIG`, `NaviTools` | NAVI MCP server configuration |
| `navi-transforms.ts` | `transformRates`, `transformBalance`, ... | Raw MCP response → engine types |
| `navi-reads.ts` | `fetchRates`, `fetchBalance`, ... | Composite MCP read functions |
| `prompt.ts` | `DEFAULT_SYSTEM_PROMPT` | Audric system prompt |
| `providers/anthropic.ts` | `AnthropicProvider` | Anthropic Claude LLM provider |

## Built-in Tools

### Read Tools (parallel, auto-approved)

| Tool | Description |
|------|-------------|
| `balance_check` | Available, savings, debt, rewards, gas reserve |
| `savings_info` | Positions, earnings, fund status |
| `health_check` | Health factor with risk assessment |
| `rates_info` | Current supply/borrow APYs |
| `transaction_history` | Recent transaction log |

### Write Tools (serial, confirmation required)

| Tool | Description |
|------|-------------|
| `save_deposit` | Deposit USDC to savings |
| `withdraw` | Withdraw from savings |
| `send_transfer` | Send USDC to an address |
| `borrow` | Borrow USDC against collateral |
| `repay_debt` | Repay outstanding debt |
| `claim_rewards` | Claim pending yield rewards |
| `pay_api` | Pay for an API service via MPP |

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
| `permission_request` | `toolName`, `toolUseId`, `input`, `description`, `resolve` | Write tool awaiting approval |
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
