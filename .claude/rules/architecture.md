# Architecture Rules

## Two-brand strategy

- **t2000** = infrastructure brand (CLI, SDK, MCP, gateway, contracts). Never rename.
- **Audric** = consumer brand (audric.ai website, app, extension). Separate repo.
- **suimpp** = protocol brand (suimpp.dev). Already separate.

The consumer product (Audric) imports `@t2000/engine` and `@t2000/sdk` from npm.

## MCP-first integration

- All DeFi protocol reads go through MCP (NAVI MCP: `https://open-api.naviprotocol.io/api/mcp`)
- All DeFi protocol writes use thin transaction builders (`@mysten/sui` Transaction class)
- Do NOT add new protocol SDK dependencies (`@naviprotocol/lending`, `@suilend/sdk`, `@cetusprotocol/*`)
- When a new protocol releases an MCP server, connect to it — no SDK needed

## Product boundaries

- Savings, Pay, Send, Credit, Receive = the five products
- Invest and Swap are REMOVED — do not re-add
- Gateway is infrastructure behind Pay, not a consumer product

## @t2000/engine (v0.4.5)

Agent engine powering Audric — conversational finance on Sui.

### Core modules
- `QueryEngine`: stateful async-generator conversation loop with multi-turn support, tool dispatch, and abort handling
- `AnthropicProvider`: streaming LLM provider with tool use and usage reporting
- `buildTool()`: typed tool factory with Zod validation, JSON schema, permission levels (`auto` / `confirm` / `explicit`), concurrency flags
- `runTools()`: parallel read-only dispatch (`Promise.allSettled`) + serial write dispatch (`TxMutex`)

### Financial tools (12 total)
- Read (5): `balance_check`, `savings_info`, `health_check`, `rates_info`, `transaction_history`
- Write (7): `save_deposit`, `withdraw`, `send_transfer`, `borrow`, `repay_debt`, `claim_rewards`, `pay_api`

### MCP integration
- `McpClientManager`: multi-server MCP client with response caching, `streamable-http` + `sse` transports
- `adaptMcpTool()`: converts external MCP tools into engine `Tool` objects with namespacing
- `buildMcpTools()` / `registerEngineTools()`: exposes engine tools as MCP server with `audric_` prefix
- NAVI MCP: config, transforms, and composite reads for all NAVI Protocol data

### Supporting modules
- `CostTracker`: token usage + USD cost with budget kill switch
- `MemorySessionStore`: in-memory session store with TTL and `structuredClone` isolation
- `compactMessages()`: three-phase context window compaction
- `serializeSSE` / `parseSSE` / `engineToSSE`: SSE streaming
- `validateHistory()`: pre-flight message history validation before every LLM call

### Key patterns
- Read tools use MCP-first strategy (NAVI MCP) with SDK fallback
- Write tools always go through `@t2000/sdk` + `TxMutex`
- `ToolContext` passes `agent`, `mcpManager`, `walletAddress`, `signal` to every tool
- Events are yielded as `EngineEvent` discriminated union

For the canonical reasoning-engine breakdown see `ARCHITECTURE.md` § "Audric Intelligence — the 5-system moat" and `packages/engine/README.md`.
