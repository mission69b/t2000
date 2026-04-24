import type { z } from 'zod';

// ---------------------------------------------------------------------------
// Messages — provider-agnostic conversation format
// ---------------------------------------------------------------------------

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | {
      type: 'tool_result';
      toolUseId: string;
      content: string;
      isError?: boolean;
    };

export interface Message {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

// ---------------------------------------------------------------------------
// Engine events — yielded by QueryEngine.submitMessage()
// ---------------------------------------------------------------------------

export type EngineEvent =
  | { type: 'thinking_delta'; text: string }
  | { type: 'thinking_done'; signature?: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; toolName: string; toolUseId: string; input: unknown }
  | {
      type: 'tool_result';
      toolName: string;
      toolUseId: string;
      result: unknown;
      isError: boolean;
      /**
       * [v1.4 Item 4] True when the tool was executed by `EarlyToolDispatcher`
       * (read tools dispatched concurrently before the LLM yields). Hosts
       * record this in `TurnMetrics.toolsCalled[].wasEarlyDispatched`.
       */
      wasEarlyDispatched?: boolean;
      /**
       * [v1.4 Item 4] True when this result was synthesized from a previous
       * identical tool call by `microcompact` deduplication, instead of
       * actually re-running the tool.
       */
      resultDeduped?: boolean;
      /**
       * [v1.5] True when this result was produced by the engine's
       * post-write refresh mechanism (see `EngineConfig.postWriteRefresh`).
       * The engine auto-runs configured read tools immediately after a
       * successful write so the LLM narrates from fresh on-chain state
       * instead of inferring from a stale snapshot. Hosts should render
       * these like any other tool result; the flag is for analytics and
       * UI affordances (e.g. a subtle "auto-refreshed" badge).
       */
      wasPostWriteRefresh?: boolean;
    }
  | {
      type: 'pending_action';
      action: PendingAction;
    }
  | { type: 'turn_complete'; stopReason: StopReason }
  | {
      type: 'usage';
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    }
  | { type: 'error'; error: Error }
  | {
      /** Emitted when a tool result carries a canvas payload (__canvas: true). */
      type: 'canvas';
      template: string;
      data: unknown;
      title: string;
      toolUseId: string;
    }
  /**
   * [v1.4 Item 4] Emitted exactly once per agent turn when context-window
   * compaction fires. Hosts (e.g. audric `TurnMetricsCollector`) flip a
   * boolean for the `TurnMetrics.compactionTriggered` column. Carries no
   * payload — `compactMessages` stays a pure function.
   */
  | { type: 'compaction' };

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'max_turns' | 'error';

/**
 * [v1.4 Item 6] Describes a single input field on a `PendingAction` that
 * the host UI may let the user modify before approving. Carried on the
 * `pending_action` event so clients can render editable controls without
 * hard-coding per-tool field metadata. See
 * `packages/engine/src/tools/tool-modifiable-fields.ts` for the registry.
 */
export interface PendingActionModifiableField {
  /** Input key on the `PendingAction.input` object (e.g. "amount", "to"). */
  name: string;
  /**
   * UI hint for which control to render.
   *  - `amount` — numeric input; UI shows a "~Max" hint when balance is known.
   *  - `address` — Sui address input with paste/scan affordance.
   */
  kind: 'amount' | 'address';
  /** Optional asset symbol (e.g. "USDC", "SUI", "vSUI") for amount fields. */
  asset?: string;
}

/**
 * Serializable description of a write tool that needs user approval.
 * Stored in the session so the client can act on it in a separate request.
 */
export interface PendingAction {
  toolName: string;
  toolUseId: string;
  input: unknown;
  description: string;
  /** Full assistant message content from the LLM turn that triggered this action. */
  assistantContent: ContentBlock[];
  /** Results from auto-approved tools in the same LLM turn (e.g. balance_check). */
  completedResults?: Array<{ toolUseId: string; content: string; isError: boolean }>;
  /** Guard injections (hints/warnings) from pre-execution checks. */
  guardInjections?: Array<{ _gate: string; _hint?: string; _warning?: string }>;
  /**
   * [v1.4 Item 6] Fields the host UI may let the user modify before
   * approving. Sourced from `tool-modifiable-fields.ts`. Absent (or
   * empty) means the action is approve-or-deny only.
   */
  modifiableFields?: PendingActionModifiableField[];
  /**
   * [v1.4 Item 6] Monotonic turn index (assistant message count) at the
   * point this pending action was emitted. Hosts use it to update the
   * matching `TurnMetrics` row when the action resolves — see
   * `apps/web/app/api/engine/resume/route.ts` `updateMany` clause.
   */
  turnIndex: number;
}

/**
 * Response from the client when resolving a pending action.
 * - `approved: false` → tool is declined, LLM is told "user declined"
 * - `approved: true` with `executionResult` → engine uses the client-provided result
 */
export interface PermissionResponse {
  approved: boolean;
  executionResult?: unknown;
}

// ---------------------------------------------------------------------------
// Tool types
// ---------------------------------------------------------------------------

export type PermissionLevel = 'auto' | 'confirm' | 'explicit';

export interface ToolResult<T = unknown> {
  data: T;
  displayText?: string;
}

export interface ToolContext {
  agent?: unknown; // T2000 instance — typed loosely to avoid circular dep at type level
  mcpManager?: unknown; // McpClientManager — typed loosely to avoid circular dep
  walletAddress?: string; // User's Sui wallet address (required for MCP reads)
  suiRpcUrl?: string; // Sui JSON-RPC URL for direct chain queries
  serverPositions?: ServerPositionData; // Pre-fetched positions from the server (avoids stale MCP data)
  /** Fresh on-chain position reader — bypasses MCP caching. If provided, read tools prefer this. */
  positionFetcher?: (address: string) => Promise<ServerPositionData>;
  /** Environment variables passed to tools (e.g. API keys not in process.env) */
  env?: Record<string, string>;
  signal?: AbortSignal;
  /** Token symbol → USD price map for USD-aware permission resolution (B.4). */
  priceCache?: Map<string, number>;
  /** Per-user permission config for USD-threshold write tool gating (B.4). */
  permissionConfig?: import('./permission-rules.js').UserPermissionConfig;
  /**
   * [v1.4] Cumulative USD already auto-executed in the current session.
   * Used by `resolvePermissionTier` to enforce `autonomousDailyLimit` —
   * downgrades `auto` to `confirm` when adding the incoming tool's USD
   * value would exceed the limit. Optional; omitted = unbounded.
   */
  sessionSpendUsd?: number;
}

export interface ServerPositionData {
  savings: number;
  borrows: number;
  savingsRate: number;
  healthFactor: number | null;
  maxBorrow: number;
  pendingRewards: number;
  supplies: Array<{ asset: string; amount: number; amountUsd: number; apy: number; protocol: string }>;
  borrows_detail: Array<{ asset: string; amount: number; amountUsd: number; apy: number; protocol: string }>;
}

export interface ToolJsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolFlags {
  mutating?: boolean;
  requiresBalance?: boolean;
  affectsHealth?: boolean;
  irreversible?: boolean;
  producesArtifact?: boolean;
  costAware?: boolean;
  maxRetries?: number;
}

export type PreflightResult =
  | { valid: true }
  | { valid: false; error: string };

export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  jsonSchema: ToolJsonSchema;
  call(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
  isConcurrencySafe: boolean;
  isReadOnly: boolean;
  permissionLevel: PermissionLevel;
  flags: ToolFlags;
  preflight?: (input: unknown) => PreflightResult;
  /** Max chars for the serialized tool result. Truncated with a re-call hint when exceeded. */
  maxResultSizeChars?: number;
  /** Custom truncation strategy. Falls back to generic slice + hint when omitted. */
  summarizeOnTruncate?: (result: string, maxChars: number) => string;
  /**
   * [v1.5.1] Whether `microcompact` may dedupe this tool's results across
   * multiple calls with identical input. Default `true` — most tools are
   * effectively pure within a session (price lookups, protocol info,
   * yield pools). Set to `false` for tools whose result depends on
   * mutable on-chain state and therefore changes after writes
   * (`balance_check`, `savings_info`, `health_check`,
   * `transaction_history`). Non-cacheable tools are excluded from the
   * `seen` map entirely, so neither this call nor any later call with
   * the same input gets replaced with a "[Same result …]" back-reference.
   */
  cacheable?: boolean;
}

// ---------------------------------------------------------------------------
// Thinking configuration (Anthropic extended thinking / adaptive)
// ---------------------------------------------------------------------------

export type ThinkingEffort = 'low' | 'medium' | 'high' | 'max';

export type ThinkingConfig =
  | { type: 'disabled' }
  | { type: 'adaptive'; display?: 'summarized' | 'omitted' }
  | { type: 'enabled'; budgetTokens: number; display?: 'summarized' | 'omitted' };

export interface OutputConfig {
  effort?: ThinkingEffort;
}

export interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export type SystemPrompt = string | SystemBlock[];

// ---------------------------------------------------------------------------
// Engine configuration
// ---------------------------------------------------------------------------

export interface EngineConfig {
  provider: LLMProvider;
  agent?: unknown; // T2000 instance
  mcpManager?: unknown; // McpClientManager for MCP-based reads
  walletAddress?: string; // User's Sui wallet address (required for MCP reads)
  suiRpcUrl?: string; // Sui JSON-RPC URL for direct chain queries (wallet coins, etc.)
  serverPositions?: ServerPositionData; // Pre-fetched positions from the host app
  /** Fresh on-chain position reader — called per tool invocation, bypasses MCP caching. */
  positionFetcher?: (address: string) => Promise<ServerPositionData>;
  tools?: Tool[];
  systemPrompt?: SystemPrompt;
  model?: string;
  maxTurns?: number;
  maxTokens?: number;
  temperature?: number;
  /** Force tool usage on the first LLM turn (prevents text-only refusals). */
  toolChoice?: ToolChoice;
  thinking?: ThinkingConfig;
  outputConfig?: OutputConfig;
  /** Environment variables forwarded to tool context (API keys, URLs). */
  env?: Record<string, string>;
  costTracker?: {
    budgetLimitUsd?: number;
    inputCostPerToken?: number;
    outputCostPerToken?: number;
  };
  /** Guard runner configuration (RE-2.2). Omit to disable guards. */
  guards?: import('./guards.js').GuardConfig;
  /** Recipe registry for multi-step workflow guidance (RE-3.1). */
  recipes?: import('./recipes/index.js').RecipeRegistry;
  /** Context budget tracking configuration (RE-3.3). */
  contextBudget?: import('./context.js').ContextBudgetConfig;
  /** LLM-based summarizer for context compaction (RE-3.3). */
  contextSummarizer?: (messages: import('./types.js').Message[]) => Promise<string>;
  /** Token symbol → USD price map for USD-aware permission resolution (B.4). */
  priceCache?: Map<string, number>;
  /** Per-user permission config for USD-threshold write tool gating (B.4). */
  permissionConfig?: import('./permission-rules.js').UserPermissionConfig;
  /**
   * Saved contacts for the current user. Used by `guardAddressSource`
   * (a saved contact's address is considered a trusted source for
   * `send_transfer.to`) and by `permission-rules.resolvePermissionTier`
   * (sends to non-contact addresses always require confirmation,
   * regardless of amount). Hosts SHOULD also surface these in the
   * dynamic system prompt block so the LLM can resolve "send to <name>".
   */
  contacts?: ReadonlyArray<{ name: string; address: string }>;
  /**
   * [v1.4] Cumulative USD already auto-executed in the current session.
   * Forwarded to `ToolContext` and consulted by `resolvePermissionTier` to
   * enforce `autonomousDailyLimit`.
   */
  sessionSpendUsd?: number;
  /**
   * [v1.4] Fired after a write tool successfully auto-executes (no
   * confirmation required). Hosts use this to persist cumulative spend in
   * Redis. Errors are caught — the tool result is never blocked by a failure
   * here.
   */
  onAutoExecuted?: (info: { toolName: string; usdValue: number }) => void | Promise<void>;
  /**
   * [v1.4 Item 4] Per-guard observation hook. Forwarded to `runGuards`
   * and fired once per non-`pass` verdict so hosts can record guard
   * behaviour in `TurnMetrics.guardsFired` without re-implementing the
   * verdict→action mapping. Errors thrown by the host are caught.
   */
  onGuardFired?: (guard: import('./guards.js').GuardMetric) => void;
  /**
   * [v1.5] Map of write tool name → list of read tool names whose state
   * the write invalidates. After a successful write resumes via
   * `resumeWithToolResult`, the engine auto-runs each configured read
   * tool with empty input, pushes synthetic `tool_use` + `tool_result`
   * messages into the conversation, and yields `tool_result` events
   * with `wasPostWriteRefresh: true` BEFORE handing control back to the
   * LLM for narration.
   *
   * Why: writes change on-chain state. Without a fresh read, the LLM
   * narrates from the pre-write snapshot and frequently invents balance
   * totals. Auto-injecting fresh reads makes the hallucination class
   * physically impossible — the model has authoritative ground truth in
   * its context before generating the post-write sentence.
   *
   * Constraints:
   *  - Refresh tools MUST be `isReadOnly` and `isConcurrencySafe`.
   *  - Refresh runs only when the write succeeded (executionResult is
   *    not `{ success: false }`); failed writes leave state unchanged
   *    and refreshing would be misleading.
   *  - Tools are invoked with empty input; refresh tools should accept
   *    an empty object schema (e.g. `balance_check`, `savings_info`).
   *  - Errors during refresh are non-fatal — a tool_result with
   *    `isError: true` is still pushed so the LLM knows refresh failed.
   *
   * Example:
   * ```
   * {
   *   save_deposit: ['balance_check', 'savings_info'],
   *   send_transfer: ['balance_check'],
   *   borrow: ['balance_check', 'savings_info', 'health_check'],
   * }
   * ```
   *
   * Omit (undefined / empty map) to disable post-write refresh entirely.
   */
  postWriteRefresh?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// LLM Provider interface (re-exported from providers/types for convenience)
// ---------------------------------------------------------------------------

export interface LLMProvider {
  chat(params: ChatParams): AsyncGenerator<ProviderEvent>;
}

export type ToolChoice = 'auto' | 'any' | { type: 'tool'; name: string };

export interface ChatParams {
  messages: Message[];
  systemPrompt: SystemPrompt;
  tools: ToolDefinition[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  toolChoice?: ToolChoice;
  thinking?: ThinkingConfig;
  outputConfig?: OutputConfig;
  signal?: AbortSignal;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: ToolJsonSchema;
}

export type ProviderEvent =
  | { type: 'thinking_delta'; text: string }
  | { type: 'thinking_done'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_delta'; id: string; partialJson: string }
  | { type: 'tool_use_done'; id: string; name: string; input: unknown }
  | {
      type: 'message_start';
      messageId: string;
      model: string;
    }
  | {
      type: 'usage';
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    }
  | { type: 'stop'; reason: StopReason };
