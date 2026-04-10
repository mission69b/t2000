import type { z } from 'zod';

// ---------------------------------------------------------------------------
// Messages — provider-agnostic conversation format
// ---------------------------------------------------------------------------

export type ContentBlock =
  | { type: 'text'; text: string }
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
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; toolName: string; toolUseId: string; input: unknown }
  | {
      type: 'tool_result';
      toolName: string;
      toolUseId: string;
      result: unknown;
      isError: boolean;
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
  | { type: 'error'; error: Error };

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'max_turns' | 'error';

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

export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  jsonSchema: ToolJsonSchema;
  call(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
  isConcurrencySafe: boolean;
  isReadOnly: boolean;
  permissionLevel: PermissionLevel;
}

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
  systemPrompt?: string;
  model?: string;
  maxTurns?: number;
  maxTokens?: number;
  temperature?: number;
  /** Force tool usage on the first LLM turn (prevents text-only refusals). */
  toolChoice?: ToolChoice;
  /** Environment variables forwarded to tool context (API keys, URLs). */
  env?: Record<string, string>;
  costTracker?: {
    budgetLimitUsd?: number;
    inputCostPerToken?: number;
    outputCostPerToken?: number;
  };
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
  systemPrompt: string;
  tools: ToolDefinition[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  toolChoice?: ToolChoice;
  signal?: AbortSignal;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: ToolJsonSchema;
}

export type ProviderEvent =
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
