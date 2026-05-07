// Core engine
export { QueryEngine, validateHistory } from './engine.js';

// Types
export type {
  Message,
  ContentBlock,
  EngineEvent,
  EngineConfig,
  StopReason,
  PendingAction,
  PendingActionStep,
  PendingActionModifiableField,
  Tool,
  ToolFlags,
  PreflightResult,
  ToolResult,
  ToolContext,
  ToolJsonSchema,
  ToolDefinition,
  PermissionLevel,
  PermissionResponse,
  LLMProvider,
  ChatParams,
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
// audric's chip-Confirm fast-path in `audric/apps/web/lib/engine/
// fast-path-bundle.ts`) MUST call this helper instead of building
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
export type { BundleCompositionInput } from './compose-bundle.js';

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

// Tool factory
export { buildTool, toolsToDefinitions, findTool } from './tool.js';
export type { BuildToolOptions } from './tool.js';

// Orchestration
export { TxMutex, runTools, budgetToolResult } from './orchestration.js';
export type { PendingToolCall } from './orchestration.js';

// Cost tracking
export { CostTracker } from './cost.js';
export type { CostSnapshot, CostTrackerConfig } from './cost.js';

// Streaming (SSE)
export { serializeSSE, parseSSE, engineToSSE } from './streaming.js';
export type { SSEEvent } from './streaming.js';

// Session store
export { MemorySessionStore } from './session.js';
export type { SessionData, SessionStore } from './session.js';

// Tool flags (RE-2.1) + bundleable predicate (SPEC 7 P2.5)
export { TOOL_FLAGS, applyToolFlags, getToolFlags, isBundleableTool } from './tool-flags.js';

// Guard runner (RE-2.2)
export {
  DEFAULT_GUARD_CONFIG,
  BalanceTracker,
  RetryTracker,
  runGuards,
  createGuardRunnerState,
  updateGuardStateAfterToolResult,
  extractConversationText,
  guardArtifactPreview,
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

// Recipes (RE-3.1)
export { RecipeRegistry, loadRecipes, parseRecipe } from './recipes/index.js';
export type { Recipe, RecipeStep, RecipeStepOnError, RecipePrerequisite } from './recipes/index.js';

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

// [SPEC 9 v0.1.3 P9.4] Inline-form structured input primitive. Tools
// that need user-supplied fields before they can run return
// `{ valid: false, needsInput: { schema, description } }` from preflight;
// the engine yields `pending_input`; the host renders the form; the
// host calls `engine.resumeWithInput(pendingInput, values)` to feed
// validated values back as the tool's input.
export type {
  FormFieldKind,
  FormField,
  FormSchema,
  PendingInput,
  PendingInputState,
} from './pending-input.js';

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

// Early tool dispatch (B.1)
export { EarlyToolDispatcher } from './early-dispatcher.js';

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
export { buildMcpTools, registerEngineTools } from './mcp/index.js';
export type { McpToolDescriptor } from './mcp/index.js';

// MCP client
export { McpClientManager, McpResponseCache } from './mcp/client.js';
export type { McpServerConfig, McpServerConnection, McpCallResult } from './mcp/client.js';

// MCP tool adapter
export { adaptMcpTool, adaptAllMcpTools, adaptAllServerTools } from './mcp/tool-adapter.js';
export type { McpToolAdapterConfig } from './mcp/tool-adapter.js';

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

// Providers
export { AnthropicProvider } from './providers/anthropic.js';
export type { AnthropicProviderConfig } from './providers/anthropic.js';

// Canvas
export { CANVAS_TEMPLATES } from './tools/canvas.js';
export type { CanvasTemplate } from './tools/canvas.js';

// Built-in tools — reads
export {
  READ_TOOLS,
  renderCanvasTool,
  balanceCheckTool,
  savingsInfoTool,
  healthCheckTool,
  ratesInfoTool,
  transactionHistoryTool,
  swapQuoteTool,
  voloStatsTool,
  mppServicesTool,
  webSearchTool,
  explainTxTool,
  portfolioAnalysisTool,
  protocolDeepDiveTool,
  spendingAnalyticsTool,
  yieldSummaryTool,
  activitySummaryTool,
  resolveSuinsTool,
  // [SPEC 8 v0.5.1] update_todo is exported but NOT in READ_TOOLS — hosts
  // opt in via [...getDefaultTools(), updateTodoTool].
  updateTodoTool,
  // [SPEC 9 v0.1.3 P9.4] add_recipient is also opt-in — hosts that
  // don't yet render `pending_input` forms shouldn't expose it.
  addRecipientTool,
} from './tools/index.js';
export type { TodoItem } from './types.js';
export type { TodoItem as UpdateTodoItem, UpdateTodoInput } from './tools/update-todo.js';

// Built-in tools — writes
export {
  WRITE_TOOLS,
  saveDepositTool,
  withdrawTool,
  sendTransferTool,
  borrowTool,
  repayDebtTool,
  claimRewardsTool,
  payApiTool,
  swapExecuteTool,
  voloStakeTool,
  voloUnstakeTool,
  saveContactTool,
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
// Spot prices live on `tokenPricesTool` (BlockVision); protocol metadata
// stays on `protocolDeepDiveTool` (already re-exported above via
// `tools/index.js`), which still talks to `api.llama.fi` directly
// inside its handler — that's the lone surviving production dependency
// on DefiLlama.
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
