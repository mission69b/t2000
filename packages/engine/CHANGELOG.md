# Changelog

## 0.47.0 (2026-04-27)

Audric Harness Intelligence v1.4 — vendor consolidation + harness instrumentation. Tagged `v0.47.0` and published in lockstep with `@t2000/sdk`, `@t2000/cli`, and `@t2000/mcp`.

### Breaking

- **Removed 7 `defillama_*` LLM tools.** `defillama_token_prices`, `defillama_price_change`, `defillama_yield_pools`, `defillama_protocol_info`, `defillama_chain_tvl`, `defillama_protocol_fees`, `defillama_sui_protocols` are gone. `protocol_deep_dive` retains its DefiLlama dependency (narrow scope, no equivalent on BlockVision).
- **Deleted `defillama-prices.ts`** and the inline DefiLlama fallback inside `tools/rates.ts`. Hosts importing `fetchTokenPrices` now get the BlockVision-backed implementation re-exported from `index.ts` — same name, different signature: `fetchTokenPrices(coinTypes, apiKey, cache?)`.
- **`PendingAction.attemptId: string`** is now a required field (UUID v4 stamped at yield time). Hosts that persist or rehydrate `PendingAction` need to round-trip the new field.

### Added

- **`packages/engine/src/blockvision-prices.ts`** — `fetchAddressPortfolio` and `fetchTokenPrices` against the BlockVision Indexer REST API (`api.blockvision.org/v2`). Sub-500ms portfolio fetches in production. Sui-RPC + hardcoded-stable allow-list degraded fallback when the API key is absent or 5xx.
- **`token_prices` tool** — single BlockVision-backed read tool replacing the two deleted `defillama_token_prices` / `defillama_price_change` LLM tools.
- **`balance_check` and `portfolio_analysis` rewired** to `fetchAddressPortfolio()`. Output shape unchanged (UI-compatible). vSUI exchange-rate workaround preserved.
- **`EngineConfig.blockvisionApiKey?: string`** and **`EngineConfig.portfolioCache?: Map<string, AddressPortfolio>`** — host wiring for the BlockVision integration.
- **`EngineConfig.onAutoExecuted` payload extended with `walletAddress?: string`** — populated from `config.walletAddress` so hosts can invalidate cross-session caches keyed by the user's address.
- **`ToolContext.blockvisionApiKey`** and **`ToolContext.portfolioCache`** — forwarded from `EngineConfig` and consumed by the BlockVision tools.
- **`argsFingerprint`** promoted from `__testOnly__` to a public export of `intent-dispatcher.ts` (Audric uses it for resumed-session prefetch dedup).

### Changed

- **Tool count** went from 40 (29 read, 11 write) to **34 (23 read, 11 write)**.

### Removed

- `packages/engine/src/defillama-prices.ts` (~85 lines)
- `packages/engine/src/tools/defillama.ts` (~500 lines, 7 tools)
- `fetchRatesFromDefiLlama` fallback inside `tools/rates.ts`

### Notes

- `protocol_deep_dive` is now the lone production consumer of `api.llama.fi`.
- This release is the engine half of the v1.4 spec (`AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md`). The Audric web app side (`<financial_context>` system-prompt block, `UserFinancialContext` daily snapshot, TurnMetrics integrity columns, resume route instrumentation) ships in `audric/apps/web` and consumes this engine version via lockstep `@t2000/engine` + `@t2000/sdk` pinning.

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
