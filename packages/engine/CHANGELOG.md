# Changelog

## 1.13.1 (2026-05-04) — Chain-mode observability + bundle-card asset honesty

Patch follow-up to the SPEC 13 Phase 1 ship. Adds the production observability signal we couldn't infer from existing telemetry, and fixes a cosmetic bundle-card label bug surfaced during the P0-* corpus soak.

### Added

- **`engine.bundle_chain_mode_set` counter** — fired inside `composeBundleFromToolResults` whenever `shouldChainCoin` returns true and a step's `inputCoinFromStep` is populated. Tags: `{ producer, consumer }`. Lets hosts confirm chain-mode is actually firing per pair in production rather than silently falling back to wallet-mode for assets that happen to live in the wallet. Critical input for sizing Phase 2's "raise cap to 3" decision — without this counter, Phase 2 ships blind.
- **3 new chain-mode telemetry tests** in `engine-bundle.test.ts` covering: counter fires once with correct labels for an aligned whitelisted pair, counter does NOT fire for asset-misaligned pairs (wallet-mode fallback), counter does NOT fire for non-whitelisted pairs.

### Fixed

- **`describeAction` save_deposit** rendered "Save 4.997 USDC into lending" for a USDsui save (the on-chain action correctly deposited USDsui — only the bundle confirm-card label was wrong). Now reads `input.asset` and renders "Save 4.997 USDsui into lending". Per the savings-usdc-only.mdc strategic exception, save_deposit accepts both USDC and USDsui.
- **`describeAction` borrow** had the same class of bug — hardcoded `$X against collateral` with no asset surfaced. Now renders `Borrow $X USDC|USDsui against collateral`.
- **`describeAction` repay_debt** had the same class of bug — hardcoded `$X of outstanding debt` with no asset surfaced. Repay must use the same asset as the borrow per `savings-usdc-only.mdc`; surfacing the asset on the confirm card makes that constraint legible to the user.

### Notes

- All three asset-aware fixes default to `USDC` when `input.asset` is absent — matches the SDK's `resolveSaveableAsset` default, so behaviour is identical for the dominant USDC path.
- 891/891 engine tests passing (was 888/889). Type fix on `vi.fn` generic signature for compatibility with vitest 3.x's narrower mock types.

## 1.13.0 (2026-05-03 night) — SPEC 13 Phase 1: chained-coin handoff foundation

Lifts SPEC 13's central restriction. Multi-write bundles can now thread a producer's output coin handle directly into a downstream consumer's input slot inside one PTB — no wallet round-trip between steps. The May 3 production failures (`swap_execute(USDC→USDsui) + save_deposit(USDsui)` reverting at PREPARE because USDsui didn't exist in the wallet yet) become impossible by construction for the 7 whitelisted producer→consumer pairs when assets align.

The day-1 spike (`spec/SPEC_13_PHASE1_SPIKE_REPORT.md`) found every SDK builder was already structurally chain-ready (consumers accept `coin: TransactionObjectArgument`, producers return the handle, `addSwapToTx` already exposes both modes). Phase 1 is therefore a pure orchestration-layer change in `composeTx` plus one optional field on `PendingActionStep`.

### Added

- **`PendingActionStep.inputCoinFromStep?: number`** — optional index of an earlier step whose output coin handle is consumed as THIS step's input. Auto-populated by `composeBundleFromToolResults` for whitelisted producer→consumer pairs whose assets align.
- **`shouldChainCoin(producer, consumer)`** — exported from `@t2000/engine`. Returns `true` when the pair is in `VALID_PAIRS` AND producer output asset == consumer input asset (case-insensitive symbol comparison).
- **`inferProducerOutputAsset(toolName, input)`** + **`inferConsumerInputAsset(toolName, input)`** — exported helpers backing `shouldChainCoin`. Producer output: `swap.to`, `withdraw.asset`, `borrow.asset` (default `USDC`). Consumer input: `send.asset` / `save.asset` / `repay.asset` (default `USDC`), `swap.from`.
- **19 SPEC 13 chain-mode engine tests** in `engine-bundle.test.ts` covering inferProducerOutputAsset, inferConsumerInputAsset, shouldChainCoin gating (whitelisted+aligned, whitelisted+misaligned, non-whitelisted, case-insensitive), and `composeBundleFromToolResults` populating `inputCoinFromStep` for all 7 whitelisted aligned pairs.

### SDK changes (`@t2000/sdk` 1.13.0, lockstep)

- **`WriteStep.inputCoinFromStep?: number`** added to the consumer/dual variants (`save_deposit`, `repay_debt`, `send_transfer`, `swap_execute`, `volo_stake`, `volo_unstake`). Producer-only tools (`withdraw`, `borrow`, `claim_rewards`) don't accept it.
- **`AppenderContext.chainedCoin`** — passed by the orchestration loop to consumer appenders. When set, the consumer skips wallet pre-fetch via `selectAndSplitCoin` / `selectSuiCoin` and consumes the handle directly.
- **`AppenderContext.isOutputConsumed`** — set when a downstream step references this step. Producer appenders skip their terminal `tx.transferObjects([coin], ctx.sender)` when set, so the same handle isn't double-consumed.
- **`composeTx` orchestration loop** rebuilt — first pass validates every `inputCoinFromStep` reference (forward-only integers, terminal-consumer producers rejected) and computes `consumedSteps: Set<number>`; second pass dispatches each step with the appropriate `chainedCoin` / `isOutputConsumed` flags and captures producers' output handles into `priorOutputs[]`.
- **New error code `CHAIN_MODE_INVALID`** in `T2000ErrorCode` covering: forward-only violation, self-reference, future-reference, and "terminal consumer can't be a producer" misuse.
- **10 SPEC 13 chain-mode SDK tests** in `composeTx.test.ts` covering swap+save / withdraw+swap / withdraw+send / borrow+send happy paths, output-suppression invariant in wallet vs chain mode, single-step backward-compat, and all 4 validation error paths.

### Backward compat (locked)

- Single-step `composeTx({ steps: [{...}] })` shape unchanged — no `inputCoinFromStep` means wallet mode, identical to today.
- Multi-step bundles without `inputCoinFromStep` work identically to today (each step pre-fetches its own coin from wallet).
- Engine bundle envelope shape unchanged for hosts that don't yet honour the new field. They fall back to wallet mode at execute time, which remains correct for the 7 whitelisted pairs because every producer in those pairs leaves its output in the wallet via terminal `tx.transferObjects` (Phase 0 trick that lets the whitelist work without chained handoff).

### Notes

- Phase 1 ships engine `1.13.0` + sdk `1.13.0` together. Audric host wiring (forwarding `inputCoinFromStep` from the engine bundle envelope through `useAgent.executeBundle` → `/api/transactions/prepare`) lands in audric after this publish completes — `BundleStep` interface gains the optional field, `executeToolAction.ts`'s wireSteps mapping forwards it.
- SPEC 13 doc bumped to v0.2 with the spike result + revised effort estimate (~10d → ~2.75d).
- `MAX_BUNDLE_OPS=2` and `VALID_PAIRS` whitelist remain in place — Phase 2 will widen.

## 1.12.0 (2026-05-03 evening) — Phase 0: PTB chaining foundation prep + stream instrumentation

Strict-tightening of multi-write bundle composition while SPEC 13 (chained-coin handoff foundation) is being built. Pairs with the May 3 production review that found bundle failures reduce to a missing chain-handoff primitive in `@t2000/sdk` (every appender pre-fetches coins from the wallet via `selectAndSplitCoin`, which fails when the chained asset doesn't exist there yet — e.g. `swap_execute(USDC→USDsui) + save_deposit(USDsui)` reverts at PREPARE).

Also lands streaming instrumentation so we can diagnose the production "Response interrupted · retry" bug from real traffic (the bug is independent of bundles — bites simple flows too).

### Changed

- **`MAX_BUNDLE_OPS` lowered from 5 → 2.** Multi-write bundles are capped at exactly 2 ops in Phase 0. 3+ op compositions get all-step `_gate: 'max_bundle_ops'` errors so the LLM splits sequentially. The cap rises in Phase 2 (3-op chains via SPEC 13 step-graph validator) and Phase 5 (arbitrary). See `compose-bundle.ts:MAX_BUNDLE_OPS` JSDoc for rationale.

### Added

- **`VALID_PAIRS`** — the 7-pair Phase 0 chaining whitelist (`swap_execute → send_transfer | save_deposit | repay_debt`, `withdraw → swap_execute | send_transfer`, `borrow → send_transfer | repay_debt`). Exported from `@t2000/engine` so hosts can advertise the whitelist programmatically. Engine refuses any 2-op bundle whose (producer, consumer) pair is outside the set with `_gate: 'pair_not_whitelisted'`.
- **`checkValidPair(producer, consumer)`** — typed pair lookup helper. Returns `{ ok: true, pair }` on match, `{ ok: false, pair }` otherwise.
- **`engine.turn_outcome` counter** — fired at every `agentLoop` exit point with structured tags `{ entry: 'submit'|'resume', outcome: 'turn_complete' | 'pending_action_single' | 'pending_action_bundle' | 'pending_action_decline' | 'error_aborted' | 'error_budget' | 'max_turns' | 'guard_block_continue' | 'pair_not_whitelisted_continue' | 'max_bundle_ops_continue', stopReason? }`. Pairs with new `engine.turn_duration_ms` histogram and `engine.turn_turns_used` gauge. Hosts pair this with stream-close logging at the chat/resume route boundaries to diagnose the "Response interrupted" bug shape (engine emitted but host stream closed without delivering vs engine returned silently).
- **Engine event regression tests** — 7 whitelisted-pair acceptance tests, 6 non-whitelisted rejection tests (incl. swap+swap, borrow+swap, save+send, send+send, withdraw+save, repay+send), May 3 production-repro test for the 6-op compound flow.

### Notes

- Phase 0 cap+whitelist is paired with audric host system-prompt rules teaching the LLM the new shape (sequential by default, atomic only for whitelisted 2-op pairs). The engine is correct independently — the prompt rules just save round-trips.
- SPEC 13 (`spec/SPEC_13_PTB_CHAINING_FOUNDATION.md`, local-only) lays out the phased rollout to lift the cap. Phase 1 (chained-coin handoff primitive in the SDK) ships next.

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
