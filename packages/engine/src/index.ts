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

// Tool utilities
export { requireAgent, hasNaviMcp, getMcpManager, getWalletAddress } from './tools/utils.js';

// Sui RPC utilities
export { fetchWalletCoins } from './sui-rpc.js';
export type { WalletCoin, SuiCoinBalance } from './sui-rpc.js';

// DefiLlama price resolver
export { fetchTokenPrices, clearPriceCache } from './defillama-prices.js';

// DefiLlama tools
export {
  defillamaYieldPoolsTool,
  defillamaProtocolInfoTool,
  defillamaTokenPricesTool,
  defillamaPriceChangeTool,
  defillamaChainTvlTool,
  defillamaProtocolFeesTool,
  defillamaSuiProtocolsTool,
} from './tools/defillama.js';

// System prompt
export { DEFAULT_SYSTEM_PROMPT } from './prompt.js';
