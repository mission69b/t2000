// Types
//
// [P4.1 / v3.0.0 / 2026-05-25] `Tool` (legacy engine interface with
// `.call()` + `.name`) is no longer re-exported. Hosts that need a
// tool type import `Tool` / `ToolSet` directly from the `ai` package —
// every engine tool is now a native AI SDK `tool({...})`. `ToolFlags`
// / `PreflightResult` / `ToolResult` / `ToolContext` stay exported
// because tool-author code (in audric and future SDK consumers) still
// wires `wrapEngineExecute` against them.
//
// [v3.1.0 — 2026-05-25] `LLMProvider`, `ChatParams`, and `ToolDefinition`
// removed. The legacy provider abstraction (`LLMProvider.chat()` →
// `AnthropicProvider` / `AISDKAnthropicProvider`) had zero consumers
// after the v2 engine cutover (the engine wraps `streamText` directly).
// Hosts that need a tool type import `Tool` / `ToolSet` from `ai`;
// custom-provider hosts pass `modelInstance` (any AI SDK `LanguageModel`)
// to `AISDKEngine` for multi-provider / gateway routing.
export type {
  Message,
  ContentBlock,
  EngineEvent,
  EngineConfig,
  StopReason,
  PendingAction,
  PendingActionStep,
  PendingActionModifiableField,
  ToolFlags,
  PreflightResult,
  ToolResult,
  ToolContext,
  ToolContextEnv,
  ToolJsonSchema,
  PermissionLevel,
  PermissionResponse,
  ProviderEvent,
  ServerPositionData,
  ToolChoice,
  ThinkingConfig,
  ThinkingEffort,
  OutputConfig,
  SystemBlock,
  SystemPrompt,
  HarnessShape,
} from './types.js';

// [SPEC 8 v0.5.1 B3.2] Adaptive harness shape mapping helper.
export { harnessShapeForEffort } from './types.js';

// [SPEC 7 v0.4 Layer 2] Per-tool result freshness budgets for the
// Quote-Refresh ReviewCard (Layer 3 / P2.4b host wires the regenerate UI).
export { TOOL_TTL_MS, DEFAULT_TOOL_TTL_MS, bundleShortestTtl, REGENERATABLE_READ_TOOLS } from './tool-ttls.js';
// [Phase 0 / SPEC 13 / 2026-05-03] Bundle composition controls exposed
// to hosts so system prompts can advertise the cap + whitelist
// programmatically. `MAX_BUNDLE_OPS` was 5 (F14-fix-2 morning) → 2
// (Phase 0 evening); whitelist enumerates the 7 pairs that can bundle
// atomically today. See `compose-bundle.ts:MAX_BUNDLE_OPS` JSDoc for
// the rationale and the SPEC 13 phased rollout that lifts the cap.
//
// **[SPEC 15 v0.7 follow-up #3 — single-source bundle composer, 2026-05-04]**
// `composeBundleFromToolResults` is now a public export. Hosts that
// produce bundles outside the canonical engine agent loop (today:
// audric's chip-Confirm fast-path; pre-v0.7e Phase 5 this lived at
// `audric/apps/web/lib/engine/fast-path-bundle.ts`; in web-v2 the chip
// confirm flow goes through `lib/audric/dispatch-intents.ts`) MUST call
// this helper instead of building
// `PendingAction`s by hand — that's how the bundle PermissionCard's
// `↻ Refresh quote` button + `modifiableFields` inline edits + every
// future bundle-shape addition stay in sync across paths. Drift was
// the root cause of the "no Refresh button on chip-confirmed
// bundles" production bug fixed here.
//
// `BundleCompositionInput` is exported so hosts can type the input
// without re-importing the type from a deeper path.
export {
  MAX_BUNDLE_OPS,
  VALID_PAIRS,
  checkValidPair,
  composeBundleFromToolResults,
  computeRegenerateFields,
} from './compose-bundle.js';
export type { BundleCompositionInput, SwapQuoteReadEntry } from './compose-bundle.js';
// [SPEC 20.2] Cetus route matching helper — exposed so hosts can replicate
// the same matching logic when composing pending_actions from non-engine
// flows (e.g. audric's bundle-prepare path).
export { findMatchingCetusRoute } from './swap-route-matching.js';

// [SPEC 7 P2.4b] Bundle regeneration — re-fire upstream reads + rebuild
// a multi-step pending_action without re-running the LLM. Hosts call
// this from `POST /api/engine/regenerate` (synchronous JSON endpoint —
// the chat SSE stream has already closed by the time the user taps
// REGENERATE). See `packages/engine/src/regenerate.ts` for the full
// contract + failure modes.
export { regenerateBundle } from './regenerate.js';
export type {
  RegenerateResult,
  RegenerateSuccess,
  RegenerateFailure,
  RegenerateTimelineEvent,
} from './regenerate.js';

// [P4.1 / 2026-05-25] Pending tool call shape — surfaced to hosts that
// build PendingActions outside the engine (compose-bundle consumers).
export type { PendingToolCall } from './types.js';

// Cost tracking
export { CostTracker } from './cost.js';
export type { CostSnapshot, CostTrackerConfig } from './cost.js';

// Streaming (SSE wire format)
// [SPEC 37 v0.7a Phase 5 Slice A / v2.2.0 / 2026-05-17] `engineToSSE` removed —
// see `streaming.ts` header for the deletion rationale. Hosts that previously
// wrapped `engine.submitMessage()` with `engineToSSE` now iterate the
// EngineEvent generator raw and call `serializeSSE` per-event (audric switched
// to this pattern in v1.4.2; CLI / MCP never used the SSE path). `SSEEvent` +
// `serializeSSE` + `parseSSE` remain as the wire-format single source of truth.
export { serializeSSE, parseSSE } from './streaming.js';
export type { SSEEvent } from './streaming.js';

// [SPEC 21.1] Stream-state choreography wrapper — converts `routing` /
// `quoting` / `confirming` / `settling` / `done` engine signals into
// `stream_state` events for UI motion. Previously default-applied inside
// `engineToSSE`; hosts now wrap their EngineEvent iteration with it directly.
export { withStreamState } from './stream-state.js';
export type { StreamState, StreamStateEvent } from './stream-state.js';

// [SPEC 37 v0.7a Phase 5 Slice C / v2.2.0] Stream checkpoint store —
// pluggable per-stream EngineEvent log for page-reload / cold-start
// resume of the LIVE stream. Wire by setting `EngineConfig.streamCheckpointStore`
// (engine then emits `stream_started` first and appends every event
// fire-and-forget); host re-passes the streamId as `EngineConfig.resumeStreamId`
// on reconnect. The CLI / MCP / tests / single-instance dev should use
// the in-memory default; multi-instance hosts (audric on Vercel) need
// an Upstash-backed impl.
export {
  InMemoryStreamCheckpointStore,
  detectInFlightTool,
} from './stream-checkpoint.js';
export type {
  StreamCheckpointStore,
  InFlightToolDetection,
  StreamResumeOutcome,
} from './stream-checkpoint.js';

// [SPEC_PHASE_7_DRAFT.md / v2.7.0] Memory store (engine-side abstraction
// for MemWal-class backends). Engine ships `InMemoryMemoryStore` as the
// reference impl + test default; production hosts inject
// `MemWalMemoryStore` (or similar) via `EngineConfig.memoryStore`.
// Consumed by `prepareStep` in `v2/engine.ts` to inject a
// `<memory_recall>` block as layer 3 of the F-4 5-layer system-prompt
// assembly.
export { InMemoryMemoryStore } from './memory/in-memory-store.js';
export type { MemoryStore, MemoryRecord } from './memory/store.js';

// Session store
export { MemorySessionStore } from './session.js';
export type { SessionData, SessionStore } from './session.js';

// Tool flags (RE-2.1) + bundleable predicate (SPEC 7 P2.5)
export { TOOL_FLAGS, getToolFlags, isBundleableTool } from './tool-flags.js';

// Guard runner (RE-2.2)
export {
  DEFAULT_GUARD_CONFIG,
  BalanceTracker,
  RetryTracker,
  runGuards,
  createGuardRunnerState,
  updateGuardStateAfterToolResult,
  extractTrustedAddressesFromResult,
  extractConversationText,
  guardStaleData,
} from './guards.js';
export type {
  GuardVerdict,
  GuardTier,
  GuardResult,
  GuardInjection,
  GuardCheckResult,
  GuardEvent,
  GuardConfig,
  GuardRunnerState,
} from './guards.js';

// Recipes (RE-3.1) — REMOVED in v0.7a Phase 6 (6E, 2026-05-17). 8 YAML
// recipes were folded into the 14 t2000-skills/skills/*/SKILL.md files;
// custom YAML loader + RecipeRegistry deleted (~510 LoC). Runtime gating
// (gate/requires/bundle) moved to `prepareStep.activeTools` + `needsApproval`
// + the existing `compose-bundle.ts` permission gate. Skill content
// distributes via @t2000/mcp skills-as-prompts adapter (see Phase 6 6C).

// Complexity classifier
export { classifyEffort } from './classify-effort.js';
// [SPEC 8 v0.5.1] Per-shape thinking-budget HARD caps + clamp utility.
export {
  EFFORT_THINKING_BUDGET_CAPS,
  clampThinkingForEffort,
} from './thinking-budget.js';
// [SPEC 8 v0.5.1] <eval_summary> marker parser + EvaluationItem type.
// Hosts use these to render the HowIEvaluatedBlock trust card.
export { parseEvalSummary } from './eval-summary.js';
export type {
  EvaluationItem,
  EvaluationStatus,
  EvalSummaryParseResult,
} from './eval-summary.js';
// [SPEC 9 v0.1.1 P9.2] <proactive> marker parser + types. Hosts use the
// `proactive_text` SSE event (carrying these fields) to render the
// `✦ ADDED BY AUDRIC` lockup variant of the text TimelineBlock.
export {
  parseProactiveMarker,
  stripProactiveMarkers,
  extractAllProactiveMarkers,
} from './proactive-marker.js';
export type { ProactiveMarker, ProactiveType } from './proactive-marker.js';

// Prompt caching
export { buildCachedSystemPrompt } from './prompt/cache.js';

// Intelligence Layer (F1, F2, F5)
export {
  buildProfileContext,
  buildProactivenessInstructions,
  buildSelfEvaluationInstruction,
} from './intelligence.js';
export type { UserFinancialProfile } from './intelligence.js';

// Conversation State Machine (F4)
export { buildStateContext } from './state/conversation-state.js';
export type {
  ConversationState,
  ConversationStateStore,
  StateType,
} from './state/conversation-state.js';

// Context management
export { estimateTokens, compactMessages, ContextBudget } from './context.js';
export type { CompactOptions, ContextBudgetConfig } from './context.js';

// Microcompact (B.3)
export { microcompact } from './compact/microcompact.js';

// Permission rules (B.4)
export {
  resolvePermissionTier,
  resolveUsdValue,
  toolNameToOperation,
  DEFAULT_PERMISSION_CONFIG,
  PERMISSION_PRESETS,
} from './permission-rules.js';
export type {
  PermissionRule,
  PermissionOperation,
  UserPermissionConfig,
} from './permission-rules.js';

// MCP server adapter
// [P4.1 / v3.0.0 / 2026-05-25] `buildMcpTools` + `registerEngineTools`
// + `McpToolDescriptor` removed (zero live consumers + threaded the
// deleted legacy `Tool.call(input, ctx)` shape). Hosts wanting to wrap
// engine tools as MCP tools either consume AI SDK `tool()` instances
// directly OR use `@t2000/mcp` which wraps the SDK directly.

// MCP client
export { McpClientManager, McpResponseCache } from './mcp/client.js';
export type { McpServerConfig, McpServerConnection, McpCallResult } from './mcp/client.js';

// MCP tool adapter
export { adaptMcpTool, adaptAllMcpTools, adaptAllServerTools } from './mcp/tool-adapter.js';
export type { McpToolAdapterConfig } from './mcp/tool-adapter.js';

// [SPEC 37 v0.7a Phase 4] MCP prompt adapter — wraps `experimental_listPrompts`
// + `experimental_getPrompt` from @ai-sdk/mcp's MCPClient. Phase 4 ships the
// adapter; Phase 6 wires `t2000-skills/skills/` through `@t2000/mcp`.
export { McpPromptAdapter } from './mcp/prompt-adapter.js';
export type {
  PromptDescriptor,
  PromptArgumentDescriptor,
  PromptCapableMcpClient,
} from './mcp/prompt-adapter.js';

// NAVI MCP integration
export { NAVI_SERVER_NAME, NAVI_MCP_URL, NAVI_MCP_CONFIG, NaviTools } from './navi/config.js';
export {
  transformRates,
  transformPositions,
  transformHealthFactor,
  transformBalance,
  transformSavings,
  transformRewards,
  extractMcpText,
  parseMcpJson,
} from './navi/transforms.js';
export type {
  NaviRawPool,
  NaviRawPosition,
  NaviRawPositionsResponse,
  NaviRawHealthFactor,
  NaviRawCoin,
  NaviRawRewardsResponse,
  NaviRawProtocolStats,
  RatesResult,
  HealthFactorResult,
  BalanceResult,
  BalancePrices,
  PositionEntry,
  SavingsResult,
  PendingReward,
} from './navi/transforms.js';
export {
  fetchRates,
  fetchHealthFactor,
  fetchBalance,
  fetchSavings,
  fetchPositions,
  fetchAvailableRewards,
  fetchProtocolStats,
} from './navi/reads.js';
export type { NaviReadOptions, ProtocolStats } from './navi/reads.js';

// [v3.1.0 — 2026-05-25] `AISDKAnthropicProvider` removed. The
// `LLMProvider` abstraction it implemented had zero remaining consumers
// after the v2 engine cutover. Hosts that need direct provider access
// instantiate `createAnthropic({apiKey})` from `@ai-sdk/anthropic` and
// pass the resulting LanguageModel into `AISDKEngine.modelInstance`.

// [SPEC 37 v0.7a Phase 2-4 — consolidated AI-SDK-native rewrite]
// [v2.0.0 — 2026-05-17] AISDKEngine is the ONLY engine. Legacy
// QueryEngine + AnthropicProvider deleted; their ~17.3k LoC of custom
// orchestration replaced by ~4,500 LoC wrapping AI SDK v6's streamText +
// native tool() factory. Engine-specific concerns (USD permissions, 14
// guards, postWriteRefresh, financial context) compose AROUND AI SDK
// primitives instead of re-implementing them.
// [v0.7a Phase 6 — 2026-05-17] Recipes removed from this list — see the
// RE-3.1 deletion note above.
//
// See SPIKE_FINDINGS_v07a.md for the LoC delta + concerns mapping table
// + 3-4 week effort estimate that justified the consolidated rewrite.
export { AISDKEngine, TOOL_POLICY, getToolPolicy, registerToolPolicy } from './v2/index.js';
export type { AISDKEngineConfig, ToolPolicy } from './v2/index.js';

// [v2.20.0 / SPEC_AI_SDK_HARDENING P3.4 — 2026-05-24] Step-finish handler
// for hosts composing `Experimental_Agent` directly. Bundles the four
// post-step concerns the legacy `AISDKEngine.submitMessage` path runs
// automatically: (1) `updateGuardStateAfterToolResult` for every tool
// outcome (swap_quote tracker, balance freshness, retry counts), (2)
// `extractTrustedAddressesFromResult` for `lookup_user` / `resolve_suins`
// outputs, (3) SessionSpend USD accumulation + `onAutoExecuted` host
// hook for successful writes, (4) `clearPortfolioCacheFor` +
// `clearDefiCacheFor` post-write cache invalidation. Audric/web-v2
// uses this on its `Experimental_Agent` to eliminate the drift surface
// vs the engine path (CLI / MCP / tests). See
// `packages/engine/src/v2/step-finish.ts` for the full implementation.
export { buildStepFinishHandler } from './v2/step-finish.js';
export type { StepFinishMutableState } from './v2/step-finish.js';

// [v2.11.0 / SPEC v0.7c Phase 2 Day 2e] Host-side composition primitives.
// Lets audric `web-v2` build `new Experimental_Agent({...})` directly
// without going through `AISDKEngine.submitMessage()`. See D-15 lock.
//
// - `buildToolContext` builds a fresh `ToolContext` per turn from a
//   config + per-turn input (same helper the engine uses internally).
// - `buildInternalContext` constructs the `experimental_context` envelope
//   tools see in their `.execute()` call. Mirrors the engine's internal
//   construction at `v2/engine.ts` ~L643 — exposed so hosts can compose
//   without re-implementing.
//
// [P4.1 / v3.0.0 / 2026-05-25] `toAISDKTools` removed — every tool now
// ships in native AI SDK `tool()` shape, so hosts merge `ToolSet` objects
// directly (`{ ...READ_TOOL_SET, ...WRITE_TOOL_SET }`).
export { buildToolContext } from './v2/tool-context.js';
export {
  buildInternalContext,
  asInternalContext,
  tryGetInternalContext,
} from './v2/internal-context.js';
export type {
  InternalContext,
  ConfigSubsetForStepFinish,
  BuildInternalContextOptions,
} from './v2/internal-context.js';
// Note: `createGuardRunnerState`, `GuardRunnerState`, `GuardConfig` are
// already exported above from the legacy guards block (~L160-181). Hosts
// composing via `Agent` use those exports + `buildInternalContext` together.

// Canvas
export { CANVAS_TEMPLATES } from './tools/canvas.js';
export type { CanvasTemplate } from './tools/canvas.js';

// Built-in tools — reads
export {
  READ_TOOL_SET,
  READ_TOOL_NAMES,
  renderCanvasTool,
  balanceCheckTool,
  savingsInfoTool,
  healthCheckTool,
  ratesInfoTool,
  transactionHistoryTool,
  swapQuoteTool,
  explainTxTool,
  portfolioAnalysisTool,
  spendingAnalyticsTool,
  yieldSummaryTool,
  activitySummaryTool,
  resolveSuinsTool,
} from './tools/index.js';

// Built-in tools — writes
export {
  WRITE_TOOL_SET,
  WRITE_TOOL_NAMES,
  saveDepositTool,
  withdrawTool,
  sendTransferTool,
  borrowTool,
  repayDebtTool,
  claimRewardsTool,
  swapExecuteTool,
} from './tools/index.js';

// All default tools
export { getDefaultTools } from './tools/index.js';
export { getModifiableFields, TOOL_MODIFIABLE_FIELDS } from './tools/tool-modifiable-fields.js';

// Tool utilities
export { requireAgent, hasNaviMcp, getMcpManager, getWalletAddress } from './tools/utils.js';

// Sui RPC utilities
export { fetchWalletCoins } from './sui/rpc.js';
export type { WalletCoin, SuiCoinBalance } from './sui/rpc.js';

// [v1.2 SuiNS] Address normalization (canonical 0x ↔ SuiNS resolver).
// Audric can re-export `looksLikeSuiNs` to keep the host-side
// suins-resolver thin, and surface `SuinsRpcError` etc. for typed
// error narration.
export {
  normalizeAddressInput,
  resolveSuinsViaRpc,
  resolveAddressToSuinsViaRpc,
  looksLikeSuiNs,
  SUI_ADDRESS_REGEX,
  SUI_ADDRESS_STRICT_REGEX,
  SUINS_NAME_REGEX,
  InvalidAddressError,
  SuinsNotRegisteredError,
  SuinsRpcError,
} from './sui/address.js';
export type { NormalizedAddress } from './sui/address.js';

// [v1.4 — Day 2] BlockVision Indexer REST API price resolver. Replaced the
// legacy DefiLlama `fetchTokenPrices` export wholesale: the
// `defillama-prices.ts` module is deleted and BlockVision's
// `fetchTokenPrices` takes over the canonical export name. Returns a
// richer `{ price, change24h? }` shape than the old DefiLlama version
// (which returned `Record<string, number>`); audric `engine-factory.ts`
// extracts the `.price` field for its prompt-time price block.
export {
  fetchAddressPortfolio,
  fetchAddressDefiPortfolio,
  fetchTokenPrices,
  clearPortfolioCache,
  clearPortfolioCacheFor,
  // [v2.0.2] DeFi cache invalidators — mirror the wallet cache pair
  // above. v2's step-finish.ts now calls `clearDefiCacheFor` after every
  // successful write. Hosts that drive the engine themselves (CLI,
  // future SDK clients) can import these to invalidate manually.
  clearDefiCache,
  clearDefiCacheFor,
  clearPriceMapCache,
} from './blockvision-prices.js';
export type {
  AddressPortfolio,
  PortfolioCoin,
  DefiSummary,
  DefiProtocol,
} from './blockvision-prices.js';

// [v0.54] Pluggable DeFi cache store. Default is in-memory; Audric
// injects an Upstash-backed store at engine init so all routes/
// instances share one cache (eliminates cross-instance SSOT
// divergence during BlockVision bursts). See defi-cache.ts.
export {
  InMemoryDefiCacheStore,
  setDefiCacheStore,
  getDefiCacheStore,
  resetDefiCacheStore,
} from './cache/defi.js';
export type { DefiCacheStore, DefiCacheEntry } from './cache/defi.js';

// [PR 1 — v0.55] Pluggable wallet-portfolio cache store. Same shape
// and rationale as the DeFi cache, but for the BlockVision
// `/account/coins` half. Closes the second SSOT-drift loop:
// `/api/portfolio` and `balance_check` would observe different
// wallet states for the same address during a BV 429 burst because
// each Vercel function had its own in-process Map. CLI/MCP keep the
// in-memory default; Audric injects `UpstashWalletCacheStore`.
export {
  InMemoryWalletCacheStore,
  setWalletCacheStore,
  getWalletCacheStore,
  resetWalletCacheStore,
} from './cache/wallet.js';
export type { WalletCacheStore, WalletCacheEntry } from './cache/wallet.js';

// [PR 2 — v0.55] Pluggable cross-instance request coalescer. Wraps
// BlockVision fan-outs (wallet portfolio + 9-protocol DeFi) so at
// most one Vercel instance per address is hitting BV at any moment;
// followers wait on the leader's cache write or fall through to a
// direct fetch on timeout (defensive degraded path). CLI/MCP keep
// the in-memory default; Audric injects `UpstashFetchLock`.
export {
  InMemoryFetchLock,
  setFetchLock,
  getFetchLock,
  resetFetchLock,
  awaitOrFetch,
  DEFAULT_LEASE_SEC,
  DEFAULT_POLL_BUDGET_MS,
  DEFAULT_POLL_INTERVAL_MS,
} from './cross-instance-lock.js';
export type { FetchLock, AwaitOrFetchOpts } from './cross-instance-lock.js';

// [single-source-of-truth — Apr 2026] Audric canonical-API client.
// Read tools call these helpers first when T2000_AUDRIC_API (or
// AUDRIC_INTERNAL_API_URL) is configured, otherwise fall back to their
// in-engine path. Exported so external callers can reuse the same
// client (e.g. CLI/MCP code that wants to opt in to audric data).
export {
  getAudricApiBase,
  fetchAudricPortfolio,
  fetchAudricHistory,
} from './audric-api.js';
export type {
  AudricPortfolioResult,
  AudricHistoryRecord,
} from './audric-api.js';

// [v1.4 — Day 3] All 7 `defillama_*` LLM tools removed from the engine.
// Spot prices live on `tokenPricesTool` (BlockVision). The surviving
// DefiLlama caller — `protocolDeepDiveTool` — was cut in S.277 (engine
// 2.18.0, "Earns Its Keep" audit). The engine no longer talks to
// `api.llama.fi`.
export { tokenPricesTool } from './tools/token-prices.js';

// System prompt
export { DEFAULT_SYSTEM_PROMPT } from './prompt/index.js';

// [PR 4 — v0.56] Pluggable NAVI MCP read cache. 30s TTL for address-scoped
// reads (savings, health), 5-min TTL for rates. Default in-memory store for
// CLI/MCP/tests; Audric injects UpstashNaviCacheStore at engine init.
export {
  InMemoryNaviCacheStore,
  setNaviCacheStore,
  getNaviCacheStore,
  resetNaviCacheStore,
  NAVI_ADDR_TTL_SEC,
  NAVI_RATES_TTL_SEC,
  naviKey,
} from './navi/cache.js';
export type { NaviCacheStore, NaviCacheEntry } from './navi/cache.js';

// Also export the NAVI CB test seam
export { _resetNaviCircuitBreaker } from './navi/reads.js';

// [PR 5 — v0.56] Pluggable telemetry sink. Default NoopSink (CLI/MCP/tests);
// Audric injects VercelTelemetrySink at engine init to emit structured
// Vercel Observability log lines and @vercel/analytics track() calls.
export {
  setTelemetrySink,
  getTelemetrySink,
  resetTelemetrySink,
} from './telemetry.js';
export type { TelemetrySink, TelemetryTags } from './telemetry.js';
