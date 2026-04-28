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
} from './types.js';

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

// Tool flags (RE-2.1)
export { TOOL_FLAGS, applyToolFlags, getToolFlags } from './tool-flags.js';

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

// Prompt caching
export { buildCachedSystemPrompt } from './prompt-cache.js';

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
export { buildMcpTools, registerEngineTools } from './mcp.js';
export type { McpToolDescriptor } from './mcp.js';

// MCP client
export { McpClientManager, McpResponseCache } from './mcp-client.js';
export type { McpServerConfig, McpServerConnection, McpCallResult } from './mcp-client.js';

// MCP tool adapter
export { adaptMcpTool, adaptAllMcpTools, adaptAllServerTools } from './mcp-tool-adapter.js';
export type { McpToolAdapterConfig } from './mcp-tool-adapter.js';

// NAVI MCP integration
export { NAVI_SERVER_NAME, NAVI_MCP_URL, NAVI_MCP_CONFIG, NaviTools } from './navi-config.js';
export {
  transformRates,
  transformPositions,
  transformHealthFactor,
  transformBalance,
  transformSavings,
  transformRewards,
  extractMcpText,
  parseMcpJson,
} from './navi-transforms.js';
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
} from './navi-transforms.js';
export {
  fetchRates,
  fetchHealthFactor,
  fetchBalance,
  fetchSavings,
  fetchPositions,
  fetchAvailableRewards,
  fetchProtocolStats,
} from './navi-reads.js';
export type { NaviReadOptions, ProtocolStats } from './navi-reads.js';

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
} from './tools/index.js';

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
export { fetchWalletCoins } from './sui-rpc.js';
export type { WalletCoin, SuiCoinBalance } from './sui-rpc.js';

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
} from './defi-cache.js';
export type { DefiCacheStore, DefiCacheEntry } from './defi-cache.js';

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
} from './wallet-cache.js';
export type { WalletCacheStore, WalletCacheEntry } from './wallet-cache.js';

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
export { DEFAULT_SYSTEM_PROMPT } from './prompt.js';

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
} from './navi-cache.js';
export type { NaviCacheStore, NaviCacheEntry } from './navi-cache.js';

// Also export the NAVI CB test seam
export { _resetNaviCircuitBreaker } from './navi-reads.js';

// [PR 5 — v0.56] Pluggable telemetry sink. Default NoopSink (CLI/MCP/tests);
// Audric injects VercelTelemetrySink at engine init to emit structured
// Vercel Observability log lines and @vercel/analytics track() calls.
export {
  setTelemetrySink,
  getTelemetrySink,
  resetTelemetrySink,
} from './telemetry.js';
export type { TelemetrySink, TelemetryTags } from './telemetry.js';
