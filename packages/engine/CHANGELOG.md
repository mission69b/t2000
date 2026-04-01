# Changelog

## 0.1.0 (2026-02-19)

Initial release of `@t2000/engine` — the conversational finance engine powering Audric.

### Phase 1b — Core Engine

- **QueryEngine**: Stateful async-generator conversation loop with multi-turn support, tool dispatch, and abort handling
- **LLM Provider abstraction**: `LLMProvider` interface with `AnthropicProvider` (streaming, tool use, usage reporting)
- **Tool system**: `buildTool()` factory with Zod input validation, JSON schema generation, permission levels (`auto` / `confirm` / `explicit`), and concurrency classification (`isReadOnly`, `isConcurrencySafe`)
- **Orchestration**: `runTools()` executes read-only tools in parallel (`Promise.allSettled`) and write tools serially under `TxMutex`
- **Read tools**: `balance_check`, `savings_info`, `health_check`, `rates_info`, `transaction_history`
- **Write tools**: `save_deposit`, `withdraw`, `send_transfer`, `borrow`, `repay_debt`, `claim_rewards`, `pay_api`
- **Permission flow**: Asynchronous user confirmation for write tools — `permission_request` events with `resolve` callback and `AbortSignal` deadlock prevention
- **Cost tracking**: `CostTracker` with cumulative token usage, USD cost estimation, and configurable budget limits
- **SSE streaming**: `serializeSSE` / `parseSSE` for wire-safe transport, `PermissionBridge` for client-side permission resolution, `engineToSSE` adapter
- **Session store**: `MemorySessionStore` with configurable TTL and `structuredClone` isolation
- **Context window**: `estimateTokens` for rough token counting, `compactMessages` with three-phase strategy (summarize old tool results → drop old messages → truncate recent results) and `sanitizeMessages` to maintain valid tool_use/tool_result pairs
- **MCP server adapter**: `buildMcpTools` / `registerEngineTools` to expose engine tools to Claude Desktop, Cursor, and other MCP clients with `audric_` prefix
- **System prompt**: Default Audric prompt covering capabilities, guidelines, safety rules

### Phase 1d — MCP Client + NAVI Integration

- **MCP client**: `McpClientManager` — multi-server registry supporting `streamable-http` and `sse` transports, with connect/disconnect lifecycle and `isConnected()` checks
- **Response cache**: `McpResponseCache` — client-side TTL cache for read-only MCP responses
- **MCP tool adapter**: `adaptMcpTool` / `adaptAllMcpTools` / `adaptAllServerTools` — convert MCP-discovered tools into engine `Tool` objects with namespacing, passthrough Zod schema, and configurable permissions
- **NAVI MCP config**: `NAVI_MCP_CONFIG`, `NaviTools` enum with all 26 discovered tool names
- **NAVI transforms**: Pure functions (`transformRates`, `transformPositions`, `transformHealthFactor`, `transformBalance`, `transformSavings`, `transformRewards`) converting raw NAVI MCP JSON to typed engine structures with USD price conversion
- **NAVI composite reads**: `fetchRates`, `fetchHealthFactor`, `fetchBalance`, `fetchSavings`, `fetchPositions`, `fetchAvailableRewards`, `fetchProtocolStats` — orchestrate parallel MCP calls with transforms
- **MCP-first read tools**: `balance_check`, `savings_info`, `health_check`, `rates_info` updated with MCP-first strategy and SDK fallback, including SDK response normalization for type compatibility
