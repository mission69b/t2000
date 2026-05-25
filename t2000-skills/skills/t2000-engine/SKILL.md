---
name: t2000-engine
description: >-
  Use the @t2000/engine package to build conversational AI agents with
  financial capabilities. Use when asked to set up AISDKEngine, build
  custom tools, configure LLM providers, handle streaming events, or
  integrate with MCP servers. Powers the Audric consumer product.
license: MIT
metadata:
  author: t2000
  version: "2.0"
  requires: "@t2000/engine (npm i @t2000/engine)"
---

# t2000: Agent Engine

## Purpose
Build conversational AI agents with financial capabilities on Sui.
`@t2000/engine` provides `AISDKEngine`, 37 financial tools (25 read + 12 write),
LLM orchestration via Vercel AI SDK v6, MCP client/server integration,
streaming, sessions, and cost tracking.

> The legacy `QueryEngine` + `AnthropicProvider` were deleted in engine v2.0.0 (2026-05-17).
> The `LLMProvider` abstraction + `AISDKAnthropicProvider` class were retired in v3.1.0
> (2026-05-25). `AISDKEngine` is the only engine; it wraps Vercel AI SDK v6's `streamText`
> and accepts `anthropicApiKey` (or `modelInstance` for custom providers / gateway routing).

## Quick Start
```typescript
import { AISDKEngine, getDefaultTools } from '@t2000/engine';
import { T2000 } from '@t2000/sdk';

const agent = await T2000.create({ pin: process.env.T2000_PIN });

const engine = new AISDKEngine({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
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
import { defineTool } from '@t2000/engine';

const myTool = defineTool({
  name: 'my_tool',
  description: 'Tool description for the LLM',
  inputSchema: z.object({ query: z.string() }),
  isReadOnly: true,
  isConcurrencySafe: true,
  permissionLevel: 'auto',
  async call(input, context) {
    return { data: { result: input.query }, displayText: `Result: ${input.query}` };
  },
});
```

> `defineTool` is the v2 factory. The pre-v2 `buildTool` was deleted in engine
> `1.38.0`. Signature is the same (Zod schema, isReadOnly, permissionLevel, `call`).

## Permission Levels
| Level | Behavior | Use for |
|-------|----------|---------|
| `auto` | Executes immediately | Read-only queries |
| `confirm` | Yields `pending_action`, client executes and resumes | Financial writes |
| `explicit` | Never auto-dispatched by LLM | Dangerous operations |

USD-aware resolution: write tools with `permissionLevel: 'confirm'` are
dynamically downgraded to `auto` if `amountUsd < rule.autoBelow` and the user's
`permissionConfig` is plumbed through `ToolContext`. See
`packages/engine/src/permission-rules.ts` for the three presets
(`conservative` / `balanced` / `aggressive`) and `borrow`-always-confirms rule.

## Event Types
```typescript
for await (const event of engine.submitMessage(prompt)) {
  switch (event.type) {
    case 'stream_started':    // first event — carries engine-generated streamId (v2.2.0+, when streamCheckpointStore is wired)
    case 'text_delta':        // LLM text chunk (markers like <proactive> and <eval_summary> pass through verbatim; host strips at render)
    case 'thinking_delta':    // Extended-thinking chunk (always-on)
    case 'thinking_done':     // Thinking block closed
    case 'tool_start':        // Tool execution beginning
    case 'tool_result':       // Tool execution complete
    case 'pending_action':    // Write tool needs approval → client executes, then resumes. action.attemptId is a UUID v4; persist on TurnMetrics + key resume `updateMany` on it
    case 'canvas':            // Inline HTML/React canvas artifact
    case 'turn_complete':     // Conversation turn finished
    case 'usage':             // Token usage report (input / output / cache reads + writes)
    case 'error':             // Unrecoverable error
  }
}
```

## MCP Client (consume external MCPs)
```typescript
import { McpClientManager, NAVI_MCP_CONFIG } from '@t2000/engine';

const mcpManager = new McpClientManager();
await mcpManager.connect(NAVI_MCP_CONFIG);

// Read tools auto-use MCP when available, SDK as fallback
const engine = new AISDKEngine({
  provider,
  agent,
  mcpManager,
  walletAddress: '0x...',
  tools: getDefaultTools(),
});
```

> Internally backed by `@ai-sdk/mcp`'s `createMCPClient` since engine `v2.1.0`
> (SPEC 37 v0.7a Phase 4); `McpClientManager` class name + public method
> signatures preserved verbatim. `McpPromptAdapter` for MCP prompts is new in `v2.1.0`.

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
// [v2.2.0 / SPEC 37 v0.7a Phase 5 Slice A] `engineToSSE` was deleted —
// iterate EngineEvent raw and call serializeSSE per event. Audric chat +
// resume routes have used this pattern since v1.4.2 (Spec G3). Hosts that
// want the SPEC 21.1 routing/quoting/etc → stream_state choreography wrap
// with `withStreamState` directly.
import { serializeSSE, withStreamState } from '@t2000/engine';

for await (const event of withStreamState(engine.submitMessage(prompt))) {
  const wireBytes = event.type === 'error'
    ? serializeSSE({ type: 'error', message: event.error.message })
    : serializeSSE(event);
  // Send wireBytes to client via SSE
}
// Write tools yield pending_action → client executes on-chain → POST /api/engine/resume
```

## Stream Checkpoint Resume (v2.2.0+)
```typescript
// Wire a checkpoint store to enable page-reload / cold-start resume of the
// LIVE stream. Engine emits `stream_started` first (carries the streamId),
// appends every event fire-and-forget, and replays the checkpoint when the
// host passes the id back as `EngineConfig.resumeStreamId`.
import { InMemoryStreamCheckpointStore } from '@t2000/engine';

const engine = new AISDKEngine({
  // ...
  streamCheckpointStore: new InMemoryStreamCheckpointStore(),
});
// In-flight tool on resume = Path B (error + re-prompt). CLI / MCP / tests
// use the in-memory default; multi-instance hosts (audric on Vercel) inject Upstash.
```

## Built-in Tools (26 — was 31 pre-S.277)

### Read (18, parallel, auto-approved)
`render_canvas`, `balance_check`, `savings_info`, `health_check`, `rates_info`,
`transaction_history`, `swap_quote`, `explain_tx`, `portfolio_analysis`,
`token_prices`, `create_payment_link`, `list_payment_links`,
`cancel_payment_link`, `spending_analytics`, `yield_summary`,
`activity_summary`, `resolve_suins`, `pending_rewards`

### Write (8, structurally serial, confirmation required)
`save_deposit` (USDC + USDsui), `withdraw`, `send_transfer`,
`borrow` (USDC + USDsui), `repay_debt` (USDC + USDsui — same asset as borrow),
`claim_rewards`, `harvest_rewards`, `swap_execute`

> **S.245 (2026-05-22):** `pay_api` (write) + `mpp_services` (read) deleted
> per V07E_D_QUESTION_AUDITS D-2 reframe. The legacy MPP gateway
> capability returns as a Commerce primitive in the upcoming Audric Store
> SPEC — clean-slate redesign, not a port of the legacy 3-leg apps/web flow.
>
> **S.269 (2026-05-23):** `save_contact` deleted (engine-side dead — host
> owns Prisma persistence). V07E_INVOICE_DEPRECATION (item 7 of S.269)
> deleted 3 invoice tools — `create_invoice`, `list_invoices`,
> `cancel_invoice` — and the `InvoiceSchema` Zod definition. Payment
> links absorb the invoicing use case (label/memo encode invoice
> context). 35 → 31 tools.
>
> **S.277 (2026-05-23):** "Earns Its Keep" audit cut 5 tools + 2 dead
> guards (engine 2.18.0). Volo trio (`volo_stats`, `volo_stake`,
> `volo_unstake`) — no Audric chip / product slot for liquid staking;
> `harvest_rewards` routes vSUI via Cetus, not Volo. `web_search`
> (Brave-backed) — gateway path uses Vercel AI Gateway's
> `perplexity_search` instead. `protocol_deep_dive` (DefiLlama) —
> `rates_info` covers the in-product safety lens; engine no longer
> talks to `api.llama.fi`. 2 dead guards removed (`guardCostWarning`,
> `guardArtifactPreview`) — both unreachable post-S.245. `explain_tx`
> kept but description tightened to "arbitrary external digest only".
> SDK + CLI + MCP retain Volo for non-Audric consumers. 31 → 26 tools
> (18 read + 8 write), 14 → 12 guards.
>
> **S.269 item 6 (2026-05-23):** `save_contact` (write) deleted as part of
> the template-divergence cleanup slice. Engine-side dead tool — host-side
> Prisma persistence with no engine-owned effect; the user surface is the
> audric send screen, not the LLM.
>
> **S.277 (2026-05-23):** "Earns Its Keep" audit cut 5 tools from the
> engine surface — `volo_stats` / `volo_stake` / `volo_unstake` (no
> Audric chip / product slot; SDK + CLI + MCP retain Volo for non-Audric
> consumers), `web_search` (Brave-backed; gateway path uses Vercel AI
> Gateway's `perplexity_search`), `protocol_deep_dive` (DefiLlama-backed;
> rates_info is the in-product proxy). Also dropped: 2 dead guards
> (`costWarning`, `artifactPreview`) + the `costAware` flag. `explain_tx`
> kept but description tightened to "arbitrary external digest only". Net
> 31 → 26 engine tools. See `spec/archive/v07e/AUDIT_V07E_EARNS_ITS_KEEP_2026-05-23.md`.

> Write serialization is structural in v2 — no in-process mutex. Confirm-tier
> writes yield a `pending_action` event, the host round-trips through user
> confirm, and the next step runs the next write. Auto-execute writes
> (USD-aware permission resolver, sub-threshold) inherit one-write-per-step
> from the LLM's planning + the conservative-default preset.

## Configuration
```typescript
new AISDKEngine({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY, // Required (or pass `modelInstance` for custom providers)
  agent,                // T2000 SDK instance
  mcpManager,           // McpClientManager for MCP-first reads
  walletAddress,        // Sui address for MCP reads
  tools: getDefaultTools(),
  systemPrompt,         // Override default Audric prompt
  model: 'claude-sonnet-4-5',
  maxTurns: 10,
  maxTokens: 4096,
  costTracker: { budgetLimitUsd: 1.0 },
  streamCheckpointStore, // optional, v2.2.0+ for live-stream resume
  resumeStreamId,        // optional, replays a checkpointed stream on cold start
});
```

## Key Imports
```typescript
// Core
import { AISDKEngine, getDefaultTools } from '@t2000/engine';
// Tools (defineTool is the v2 factory; READ_TOOL_SET / WRITE_TOOL_SET / READ_TOOL_NAMES are the tool registries since v3.0.0)
import { defineTool, READ_TOOL_SET, WRITE_TOOL_SET, READ_TOOL_NAMES } from '@t2000/engine';
// Streaming (`engineToSSE` was deleted in v2.2.0 — see "SSE Streaming" above)
import { serializeSSE, parseSSE, withStreamState } from '@t2000/engine';
// Stream checkpoint resume (v2.2.0+)
import { InMemoryStreamCheckpointStore } from '@t2000/engine';
// Sessions
import { MemorySessionStore } from '@t2000/engine';
// Cost
import { CostTracker } from '@t2000/engine';
// Microcompact + context budgeting
import { microcompact, compactMessages, estimateTokens } from '@t2000/engine';
// Granular permissions (USD-aware resolver)
import {
  resolvePermissionTier, resolveUsdValue, toolNameToOperation,
  DEFAULT_PERMISSION_CONFIG, PERMISSION_PRESETS,
} from '@t2000/engine';
// MCP
import {
  McpClientManager, McpPromptAdapter,
  NAVI_MCP_CONFIG, buildMcpTools, registerEngineTools,
} from '@t2000/engine';
```
