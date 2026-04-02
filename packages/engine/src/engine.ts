import type {
  EngineConfig,
  EngineEvent,
  Message,
  ContentBlock,
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
   * Submit a user message and receive a stream of engine events.
   * Handles the full agent loop: LLM → permission check → tool execution → LLM → ...
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

    const context: ToolContext = {
      agent: this.agent,
      mcpManager: this.mcpManager,
      walletAddress: this.walletAddress,
      suiRpcUrl: this.suiRpcUrl,
      serverPositions: this.serverPositions,
      signal,
    };

    let turns = 0;

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

      // --- Permission gate: separate auto-approved from needs-confirmation ---
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

        // Two-phase confirmation: yield permission_request with a resolve callback,
        // then await the promise. The consumer calls resolve() in their loop body
        // before the generator advances to the await.
        // Race with abort signal to prevent deadlock if resolve is never called.
        let resolvePermission!: (v: PermissionResponse) => void;
        const permissionPromise = new Promise<PermissionResponse>((r) => {
          resolvePermission = r;
        });

        yield {
          type: 'permission_request',
          toolName: call.name,
          toolUseId: call.id,
          input: call.input,
          description: describeAction(tool!, call),
          resolve: resolvePermission,
        };

        let response: PermissionResponse;
        try {
          response = await Promise.race([
            permissionPromise,
            new Promise<never>((_, reject) => {
              if (signal.aborted) reject(new Error('Aborted'));
              signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
            }),
          ]);
        } catch {
          this.addErrorResults(acc.pendingToolCalls, 'Aborted');
          yield { type: 'error', error: new Error('Aborted') };
          return;
        }

        if (!response.approved) {
          toolResultBlocks.push({
            type: 'tool_result',
            toolUseId: call.id,
            content: JSON.stringify({ error: 'User declined this action' }),
            isError: true,
          });
          yield {
            type: 'tool_result',
            toolName: call.name,
            toolUseId: call.id,
            result: { error: 'User declined this action' },
            isError: true,
          };
        } else if (response.executionResult !== undefined) {
          // Client executed the action (e.g., signed a transaction) and
          // provided the result. Skip server-side execution entirely.
          const clientResult = response.executionResult;
          toolResultBlocks.push({
            type: 'tool_result',
            toolUseId: call.id,
            content: JSON.stringify(clientResult),
            isError: false,
          });
          yield {
            type: 'tool_start',
            toolName: call.name,
            toolUseId: call.id,
            input: call.input,
          };
          yield {
            type: 'tool_result',
            toolName: call.name,
            toolUseId: call.id,
            result: clientResult,
            isError: false,
          };
        } else {
          // Approved but no client result — execute server-side
          approved.push(call);
          yield { type: 'tool_start', toolName: call.name, toolUseId: call.id, input: call.input };
        }
      }

      // Execute approved tool calls (only those not already handled by client)
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

      // Budget check between turns
      if (this.costTracker.isOverBudget()) {
        yield { type: 'error', error: new Error('Session budget exceeded') };
        return;
      }
    }

    yield { type: 'turn_complete', stopReason: 'max_turns' };
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

/**
 * Ensure every tool_use in an assistant message has a matching tool_result
 * in the next user message. Strips trailing orphaned messages to prevent
 * Anthropic API 400 errors from corrupted session state.
 */
function sanitizeMessages(messages: Message[]): Message[] {
  const result: Message[] = [];

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

    result.push(msg);
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
