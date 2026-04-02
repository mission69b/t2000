---
name: t2000-engine
description: >-
  Use the @t2000/engine package to build conversational AI agents with
  financial capabilities. Use when asked to set up QueryEngine, build
  custom tools, configure LLM providers, handle streaming events, or
  integrate with MCP servers. Powers the Audric consumer product.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: "@t2000/engine (npm i @t2000/engine)"
---

# t2000: Agent Engine

## Purpose
Build conversational AI agents with financial capabilities on Sui.
`@t2000/engine` provides QueryEngine, 12 financial tools, LLM orchestration,
MCP client/server integration, streaming, sessions, and cost tracking.

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
  if (event.type === 'text_delta') process.stdout.write(event.text);
}
```

## Building Custom Tools
```typescript
import { z } from 'zod';
import { buildTool } from '@t2000/engine';

const myTool = buildTool({
  name: 'my_tool',
  description: 'Tool description for the LLM',
  inputSchema: z.object({ query: z.string() }),
  isReadOnly: true,
  permissionLevel: 'auto',
  async call(input, context) {
    return { data: { result: input.query }, displayText: `Result: ${input.query}` };
  },
});
```

## Permission Levels
| Level | Behavior | Use for |
|-------|----------|---------|
| `auto` | Executes immediately | Read-only queries |
| `confirm` | Yields `pending_action`, client executes and resumes | Financial writes |
| `explicit` | Never auto-dispatched by LLM | Dangerous operations |

## Event Types
```typescript
// Handle events from engine.submitMessage()
for await (const event of engine.submitMessage(prompt)) {
  switch (event.type) {
    case 'text_delta':       // LLM text chunk
    case 'tool_start':       // Tool execution beginning
    case 'tool_result':      // Tool execution complete
    case 'pending_action':     // Write tool needs approval → client executes, then resumes
    case 'turn_complete':    // Conversation turn finished
    case 'usage':            // Token usage report
    case 'error':            // Unrecoverable error
  }
}
```

## MCP Client (consume external MCPs)
```typescript
import { McpClientManager, NAVI_MCP_CONFIG } from '@t2000/engine';

const mcpManager = new McpClientManager();
await mcpManager.connect(NAVI_MCP_CONFIG);

// Read tools auto-use MCP when available, SDK as fallback
const engine = new QueryEngine({
  provider,
  agent,
  mcpManager,
  walletAddress: '0x...',
  tools: getDefaultTools(),
});
```

## MCP Server (expose tools to AI clients)
```typescript
import { registerEngineTools, getDefaultTools } from '@t2000/engine';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const server = new McpServer({ name: 'audric', version: '0.1.0' });
registerEngineTools(server, getDefaultTools());
// Tools exposed as audric_balance_check, audric_save_deposit, etc.
```

## SSE Streaming (web apps)
```typescript
import { engineToSSE } from '@t2000/engine';

for await (const chunk of engineToSSE(engine.submitMessage(prompt))) {
  // Send chunk to client via SSE
}
// Write tools yield pending_action → client executes on-chain → POST /api/engine/resume
```

## Built-in Tools (12)

### Read (parallel, auto-approved)
`balance_check`, `savings_info`, `health_check`, `rates_info`, `transaction_history`

### Write (serial, confirmation required)
`save_deposit`, `withdraw`, `send_transfer`, `borrow`, `repay_debt`, `claim_rewards`, `pay_api`

## Configuration
```typescript
new QueryEngine({
  provider: new AnthropicProvider({ apiKey }),  // Required
  agent,                // T2000 SDK instance
  mcpManager,           // McpClientManager for MCP-first reads
  walletAddress,        // Sui address for MCP reads
  tools: getDefaultTools(),
  systemPrompt,         // Override default Audric prompt
  model: 'claude-sonnet-4-20250514',
  maxTurns: 10,
  maxTokens: 4096,
  costTracker: { budgetLimitUsd: 1.0 },
});
```

## Key Imports
```typescript
// Core
import { QueryEngine, AnthropicProvider, getDefaultTools } from '@t2000/engine';
// Tools
import { buildTool, READ_TOOLS, WRITE_TOOLS } from '@t2000/engine';
// Streaming
import { serializeSSE, parseSSE, engineToSSE } from '@t2000/engine';
// Sessions
import { MemorySessionStore } from '@t2000/engine';
// Cost
import { CostTracker } from '@t2000/engine';
// MCP
import { McpClientManager, NAVI_MCP_CONFIG, buildMcpTools, registerEngineTools } from '@t2000/engine';
```
