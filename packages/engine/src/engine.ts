import type {
  EngineConfig,
  EngineEvent,
  Message,
  ContentBlock,
  PendingAction,
  Tool,
  ToolContext,
  PermissionResponse,
  ProviderEvent,
  StopReason,
} from './types.js';
import { toolsToDefinitions, findTool } from './tool.js';
import { TxMutex, runTools, type PendingToolCall } from './orchestration.js';
import { getDefaultTools } from './tools/index.js';
import { DEFAULT_SYSTEM_PROMPT } from './prompt.js';
import { CostTracker, type CostSnapshot } from './cost.js';

const DEFAULT_MAX_TURNS = 10;
const DEFAULT_MAX_TOKENS = 4096;

interface TurnAccumulator {
  text: string;
  stopReason: StopReason;
  assistantBlocks: ContentBlock[];
  pendingToolCalls: PendingToolCall[];
}

export class QueryEngine {
  private readonly provider: EngineConfig['provider'];
  private readonly tools: Tool[];
  private readonly systemPrompt: string;
  private readonly model: string | undefined;
  private readonly maxTurns: number;
  private readonly maxTokens: number;
  private readonly agent: unknown;
  private readonly mcpManager: unknown;
  private readonly walletAddress: string | undefined;
  private readonly suiRpcUrl: string | undefined;
  private serverPositions: EngineConfig['serverPositions'];
  private readonly txMutex = new TxMutex();
  private readonly costTracker: CostTracker;

  private messages: Message[] = [];
  private abortController: AbortController | null = null;

  constructor(config: EngineConfig) {
    this.provider = config.provider;
    this.agent = config.agent;
    this.mcpManager = config.mcpManager;
    this.walletAddress = config.walletAddress;
    this.suiRpcUrl = config.suiRpcUrl;
    this.serverPositions = config.serverPositions;
    this.model = config.model;
    this.maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.costTracker = new CostTracker(config.costTracker);

    this.tools = config.tools ?? (config.agent ? getDefaultTools() : []);
  }

  /**
   * Submit a user message and stream engine events.
   *
   * Read-only tools execute inline. Write tools that need confirmation yield a
   * `pending_action` event and the stream ends — no persistent connection needed.
   * The caller should save messages + pendingAction to the session store, then
   * call `resumeWithToolResult()` after the user approves/denies and executes.
   */
  async *submitMessage(prompt: string): AsyncGenerator<EngineEvent> {
    if (this.costTracker.isOverBudget()) {
      yield { type: 'error', error: new Error('Session budget exceeded') };
      return;
    }

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.messages.push({
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    });

    yield* this.agentLoop(prompt, signal);
  }

  /**
   * Resume the conversation after a pending action is resolved.
   * Called with the user's approval/denial and optional client-side execution result.
   *
   * This is a separate HTTP request — no persistent connection from submitMessage.
   */
  async *resumeWithToolResult(
    action: PendingAction,
    response: PermissionResponse,
  ): AsyncGenerator<EngineEvent> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // sanitizeMessages strips the trailing assistant tool_use (it has no
    // matching tool_result yet — that's why we're resuming). Re-add it so
    // Anthropic sees the tool_use → tool_result pair.
    const lastMsg = this.messages[this.messages.length - 1];
    const hasToolUse = lastMsg?.role === 'assistant' &&
      lastMsg.content.some((b) => b.type === 'tool_use' && b.id === action.toolUseId);

    if (!hasToolUse) {
      this.messages.push({
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: action.toolUseId,
          name: action.toolName,
          input: action.input,
        }],
      });
    }

    const toolResultBlock: ContentBlock = response.approved
      ? {
          type: 'tool_result',
          toolUseId: action.toolUseId,
          content: JSON.stringify(response.executionResult ?? { success: true }),
          isError: false,
        }
      : {
          type: 'tool_result',
          toolUseId: action.toolUseId,
          content: JSON.stringify({ error: 'User declined this action' }),
          isError: true,
        };

    this.messages.push({ role: 'user', content: [toolResultBlock] });

    yield {
      type: 'tool_result',
      toolName: action.toolName,
      toolUseId: action.toolUseId,
      result: response.approved
        ? (response.executionResult ?? { success: true })
        : { error: 'User declined this action' },
      isError: !response.approved,
    };

    if (!response.approved) {
      yield { type: 'turn_complete', stopReason: 'end_turn' };
      return;
    }

    yield* this.agentLoop(null, signal);
  }

  interrupt(): void {
    this.abortController?.abort();
  }

  getMessages(): readonly Message[] {
    return this.messages;
  }

  reset(): void {
    this.messages = [];
    this.costTracker.reset();
  }

  loadMessages(messages: Message[]): void {
    this.messages = sanitizeMessages(messages);
  }

  setServerPositions(data: EngineConfig['serverPositions']): void {
    this.serverPositions = data;
  }

  getUsage(): CostSnapshot {
    return this.costTracker.getSnapshot();
  }

  // ---------------------------------------------------------------------------
  // Core agent loop — shared by submitMessage and resumeWithToolResult
  // ---------------------------------------------------------------------------

  /**
   * Run the LLM → tool → LLM loop. When a write tool needs confirmation,
   * yields `pending_action` and returns immediately (stream ends cleanly).
   *
   * @param freshPrompt - The original user prompt (for corrupt-history retry). Null on resume.
   */
  private async *agentLoop(
    freshPrompt: string | null,
    signal: AbortSignal,
  ): AsyncGenerator<EngineEvent> {
    const context: ToolContext = {
      agent: this.agent,
      mcpManager: this.mcpManager,
      walletAddress: this.walletAddress,
      suiRpcUrl: this.suiRpcUrl,
      serverPositions: this.serverPositions,
      signal,
    };

    let turns = 0;
    let hasRetriedWithCleanHistory = false;

    while (turns < this.maxTurns) {
      if (signal.aborted) {
        yield { type: 'error', error: new Error('Aborted') };
        return;
      }

      turns++;
      const toolDefs = toolsToDefinitions(this.tools);

      const acc: TurnAccumulator = {
        text: '',
        stopReason: 'end_turn',
        assistantBlocks: [],
        pendingToolCalls: [],
      };

      try {
        const stream = this.provider.chat({
          messages: this.messages,
          systemPrompt: this.systemPrompt,
          tools: toolDefs,
          model: this.model,
          maxTokens: this.maxTokens,
          signal,
        });

        for await (const event of stream) {
          yield* this.handleProviderEvent(event, acc);
        }
      } catch (err) {
        if (freshPrompt && !hasRetriedWithCleanHistory && isCorruptHistoryError(err)) {
          hasRetriedWithCleanHistory = true;
          console.warn('[engine] Corrupt session history detected, resetting to fresh conversation');
          this.messages = [
            { role: 'user', content: [{ type: 'text', text: freshPrompt }] },
          ];
          turns--;
          continue;
        }
        throw err;
      }

      if (acc.text) {
        acc.assistantBlocks.push({ type: 'text', text: acc.text });
      }

      this.messages.push({ role: 'assistant', content: acc.assistantBlocks });

      if (acc.pendingToolCalls.length === 0) {
        yield { type: 'turn_complete', stopReason: acc.stopReason };
        return;
      }

      if (signal.aborted) {
        this.addErrorResults(acc.pendingToolCalls, 'Aborted');
        yield { type: 'error', error: new Error('Aborted') };
        return;
      }

      // --- Permission gate ---
      const approved: PendingToolCall[] = [];
      const toolResultBlocks: ContentBlock[] = [];

      for (const call of acc.pendingToolCalls) {
        const tool = findTool(this.tools, call.name);
        const needsConfirmation =
          tool && !tool.isReadOnly && tool.permissionLevel !== 'auto';

        if (!needsConfirmation) {
          approved.push(call);
          yield { type: 'tool_start', toolName: call.name, toolUseId: call.id, input: call.input };
          continue;
        }

        // Yield the pending action and RETURN — stream ends cleanly.
        // The caller saves session state (including messages and pendingAction),
        // then the client calls resumeWithToolResult() in a new HTTP request.
        yield {
          type: 'pending_action',
          action: {
            toolName: call.name,
            toolUseId: call.id,
            input: call.input,
            description: describeAction(tool!, call),
          },
        };
        return;
      }

      // Execute auto-approved tool calls
      for await (const toolEvent of runTools(approved, this.tools, context, this.txMutex)) {
        yield toolEvent;

        if (toolEvent.type === 'tool_result') {
          toolResultBlocks.push({
            type: 'tool_result',
            toolUseId: toolEvent.toolUseId,
            content: JSON.stringify(toolEvent.result),
            isError: toolEvent.isError,
          });
        }
      }

      this.messages.push({ role: 'user', content: toolResultBlocks });

      if (this.costTracker.isOverBudget()) {
        yield { type: 'error', error: new Error('Session budget exceeded') };
        return;
      }
    }

    yield { type: 'turn_complete', stopReason: 'max_turns' };
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private addErrorResults(pendingCalls: PendingToolCall[], reason: string): void {
    const errorBlocks: ContentBlock[] = pendingCalls.map((call) => ({
      type: 'tool_result' as const,
      toolUseId: call.id,
      content: JSON.stringify({ error: reason }),
      isError: true,
    }));
    if (errorBlocks.length > 0) {
      this.messages.push({ role: 'user', content: errorBlocks });
    }
  }

  private *handleProviderEvent(
    event: ProviderEvent,
    acc: TurnAccumulator,
  ): Generator<EngineEvent> {
    switch (event.type) {
      case 'text_delta': {
        acc.text += event.text;
        yield { type: 'text_delta', text: event.text };
        break;
      }

      case 'tool_use_done': {
        acc.assistantBlocks.push({
          type: 'tool_use',
          id: event.id,
          name: event.name,
          input: event.input,
        });
        acc.pendingToolCalls.push({
          id: event.id,
          name: event.name,
          input: event.input,
        });
        break;
      }

      case 'usage': {
        this.costTracker.track(
          event.inputTokens,
          event.outputTokens,
          event.cacheReadTokens,
          event.cacheWriteTokens,
        );
        yield {
          type: 'usage',
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cacheReadTokens: event.cacheReadTokens,
          cacheWriteTokens: event.cacheWriteTokens,
        };
        break;
      }

      case 'stop': {
        acc.stopReason = event.reason;
        break;
      }

      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCorruptHistoryError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    (msg.includes('tool_use') && msg.includes('tool_result')) ||
    msg.includes('roles must alternate') ||
    (msg.includes('400') && msg.includes('invalid_request_error'))
  );
}

function sanitizeMessages(messages: Message[]): Message[] {
  const trimmed: Message[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const toolUseIds = msg.content
      .filter((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use')
      .map((b) => b.id);

    if (toolUseIds.length > 0) {
      const next = messages[i + 1];
      const toolResultIds = new Set(
        (next?.content ?? [])
          .filter((b): b is { type: 'tool_result'; toolUseId: string; content: string } => b.type === 'tool_result')
          .map((b) => b.toolUseId),
      );

      const allMatched = toolUseIds.every((id) => toolResultIds.has(id));
      if (!allMatched) {
        break;
      }
    }

    trimmed.push(msg);
  }

  const result: Message[] = [];
  let lastRole: 'user' | 'assistant' | null = null;

  for (const msg of trimmed) {
    if (msg.role === lastRole) {
      result.pop();
    }
    result.push(msg);
    lastRole = msg.role;
  }

  while (result.length > 0 && result[result.length - 1].role === 'user') {
    result.pop();
  }

  return result;
}

function describeAction(tool: Tool, call: PendingToolCall): string {
  const input = call.input as Record<string, unknown>;
  switch (tool.name) {
    case 'save_deposit':
      return `Save ${input.amount === 'all' ? 'all available' : `$${input.amount}`} into savings`;
    case 'withdraw':
      return `Withdraw ${input.amount === 'all' ? 'all' : `$${input.amount}`} from savings`;
    case 'send_transfer':
      return `Send $${input.amount} to ${input.to}`;
    case 'borrow':
      return `Borrow $${input.amount} against collateral`;
    case 'repay_debt':
      return `Repay ${input.amount === 'all' ? 'all' : `$${input.amount}`} of outstanding debt`;
    case 'claim_rewards':
      return 'Claim all pending protocol rewards';
    case 'pay_api':
      return `Pay for API call to ${input.url}${input.maxPrice ? ` (max $${input.maxPrice})` : ''}`;
    default:
      return `Execute ${tool.name}`;
  }
}
