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
import { estimatePayApiCost } from './tools/pay.js';

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
  private readonly temperature: number | undefined;
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
    this.temperature = config.temperature;
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

    const writeResult: ContentBlock = response.approved
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

    // Reconstruct the full turn atomically:
    // 1. Push the assistant message that was deferred during pending_action
    // 2. Push ALL tool_results (completed reads + write) in one user message
    if (action.assistantContent?.length) {
      this.messages.push({ role: 'assistant', content: action.assistantContent });
    }

    const allResults: ContentBlock[] = [
      ...(action.completedResults ?? []).map((r) => ({
        type: 'tool_result' as const,
        toolUseId: r.toolUseId,
        content: r.content,
        isError: r.isError,
      })),
      writeResult,
    ];

    this.messages.push({ role: 'user', content: allResults });

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
    this.messages = [...messages];
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
        this.messages = validateHistory(this.messages);

        if (process.env.NODE_ENV !== 'test') {
          const summary = this.messages.map((m, idx) => {
            const blocks = m.content.map((b) => {
              if (b.type === 'text') return `text(${b.text.slice(0, 40)}…)`;
              if (b.type === 'tool_use') return `tool_use:${b.id.slice(-8)}/${b.name}`;
              return `tool_result:${(b as { toolUseId: string }).toolUseId.slice(-8)}`;
            });
            return `  [${idx}] ${m.role}: [${blocks.join(', ')}]`;
          });
          console.log(`[engine] provider.chat turn=${turns} msgs=${this.messages.length}\n${summary.join('\n')}`);
        }

        const stream = this.provider.chat({
          messages: this.messages,
          systemPrompt: this.systemPrompt,
          tools: toolDefs,
          model: this.model,
          maxTokens: this.maxTokens,
          temperature: this.temperature,
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

      if (acc.pendingToolCalls.length === 0) {
        this.messages.push({ role: 'assistant', content: acc.assistantBlocks });
        yield { type: 'turn_complete', stopReason: acc.stopReason };
        return;
      }

      if (signal.aborted) {
        this.messages.push({ role: 'assistant', content: acc.assistantBlocks });
        this.addErrorResults(acc.pendingToolCalls, 'Aborted');
        yield { type: 'error', error: new Error('Aborted') };
        return;
      }

      // --- Permission gate ---
      const approved: PendingToolCall[] = [];
      const toolResultBlocks: ContentBlock[] = [];
      let pendingWrite: { call: PendingToolCall; tool: Tool } | null = null;

      for (const call of acc.pendingToolCalls) {
        const tool = findTool(this.tools, call.name);
        const needsConfirmation =
          tool && !tool.isReadOnly && tool.permissionLevel !== 'auto';

        if (!needsConfirmation) {
          approved.push(call);
          yield { type: 'tool_start', toolName: call.name, toolUseId: call.id, input: call.input };
          continue;
        }

        pendingWrite = { call, tool: tool! };
        break;
      }

      // Execute auto-approved tool calls (reads) even if a write is pending
      for await (const toolEvent of runTools(approved, this.tools, context, this.txMutex)) {
        if (toolEvent.type === 'tool_result' && !toolEvent.isError) {
          const warning = flagSuspiciousResult(toolEvent.toolName, toolEvent.result);
          if (warning) {
            const flagged = {
              ...toolEvent,
              result: typeof toolEvent.result === 'object' && toolEvent.result
                ? { ...toolEvent.result as Record<string, unknown>, _warning: warning }
                : { data: toolEvent.result, _warning: warning },
            };
            yield flagged;
            toolResultBlocks.push({
              type: 'tool_result',
              toolUseId: flagged.toolUseId,
              content: JSON.stringify(flagged.result),
              isError: flagged.isError,
            });
            continue;
          }
        }

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

      if (pendingWrite) {
        // Do NOT push assistant message to this.messages — session stays clean.
        // The full assistant content is stored in PendingAction so
        // resumeWithToolResult can reconstruct the turn atomically.
        yield {
          type: 'pending_action',
          action: {
            toolName: pendingWrite.call.name,
            toolUseId: pendingWrite.call.id,
            input: pendingWrite.call.input,
            description: describeAction(pendingWrite.tool, pendingWrite.call),
            assistantContent: acc.assistantBlocks,
            completedResults: toolResultBlocks.map((b) => ({
              toolUseId: (b as { toolUseId: string }).toolUseId,
              content: (b as { content: string }).content,
              isError: (b as { isError?: boolean }).isError ?? false,
            })),
          },
        };
        return;
      }

      // All tools auto-approved — push the complete turn (assistant + results)
      this.messages.push({ role: 'assistant', content: acc.assistantBlocks });
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
        // Flush accumulated text BEFORE the tool_use block to preserve
        // the original LLM output ordering (text → tool_use). Anthropic
        // rejects assistant messages where text follows tool_use blocks.
        if (acc.text) {
          acc.assistantBlocks.push({ type: 'text', text: acc.text });
          acc.text = '';
        }
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

/**
 * Pre-flight validation: ensures message history meets Anthropic's requirements
 * right before every API call. Anthropic requires that every tool_use in an
 * assistant message has a matching tool_result in the IMMEDIATELY NEXT user
 * message — not just anywhere in the history. This function strips any
 * tool_use/tool_result blocks that violate this positional constraint and
 * fixes role alternation. Single point of defense — no corrupt messages can
 * reach the API regardless of how they got into the session.
 */
export function validateHistory(messages: Message[]): Message[] {
  const result: Message[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    // For assistant messages with tool_use, verify the next message has ALL results
    const toolUseIds = msg.content
      .filter((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use')
      .map((b) => b.id);

    if (toolUseIds.length > 0 && msg.role === 'assistant') {
      const next = messages[i + 1];
      const nextResultIds = new Set(
        (next?.content ?? [])
          .filter((b): b is { type: 'tool_result'; toolUseId: string; content: string } => b.type === 'tool_result')
          .map((b) => b.toolUseId),
      );

      // Strip tool_use blocks that have no result in the next message
      const cleanAssistant = msg.content.filter((b) => {
        if (b.type === 'tool_use') return nextResultIds.has(b.id);
        return true;
      });

      // Strip tool_result blocks from next message whose tool_use was removed
      const keptToolUseIds = new Set(
        cleanAssistant
          .filter((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use')
          .map((b) => b.id),
      );
      const cleanNext = next?.content.filter((b) => {
        if (b.type === 'tool_result') return keptToolUseIds.has(b.toolUseId);
        return true;
      });

      if (cleanAssistant.length > 0) {
        result.push({ role: msg.role, content: cleanAssistant });
      }
      if (cleanNext && cleanNext.length > 0) {
        result.push({ role: next!.role, content: cleanNext });
      }
      i += 2;
      continue;
    }

    // For user messages: strip any tool_result blocks that reference a tool_use
    // not present in the immediately preceding assistant message
    if (msg.role === 'user' && msg.content.some((b) => b.type === 'tool_result')) {
      const prevAssistant = result[result.length - 1];
      const prevToolUseIds = new Set(
        (prevAssistant?.role === 'assistant' ? prevAssistant.content : [])
          .filter((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use')
          .map((b) => b.id),
      );
      const cleanContent = msg.content.filter((b) => {
        if (b.type === 'tool_result') return prevToolUseIds.has(b.toolUseId);
        return true;
      });
      if (cleanContent.length > 0) {
        result.push({ role: msg.role, content: cleanContent });
      }
      i++;
      continue;
    }

    result.push(msg);
    i++;
  }

  // Merge consecutive same-role messages (can happen after stripping)
  const merged: Message[] = [];
  for (const msg of result) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content = [...last.content, ...msg.content];
    } else {
      merged.push({ role: msg.role, content: [...msg.content] });
    }
  }

  // First message must be user
  while (merged.length > 0 && merged[0].role !== 'user') {
    merged.shift();
  }

  return merged;
}

function describeAction(tool: Tool, call: PendingToolCall): string {
  const input = call.input as Record<string, unknown>;
  switch (tool.name) {
    case 'save_deposit': {
      const asset = input.asset ?? 'USDC';
      return `Save ${input.amount} ${asset} into lending`;
    }
    case 'withdraw': {
      const wAsset = input.asset ?? '';
      return `Withdraw ${input.amount}${wAsset ? ' ' + wAsset : ''} from lending`;
    }
    case 'send_transfer':
      return `Send $${input.amount} to ${input.to}`;
    case 'borrow':
      return `Borrow $${input.amount} against collateral`;
    case 'repay_debt':
      return `Repay $${input.amount} of outstanding debt`;
    case 'claim_rewards':
      return 'Claim all pending protocol rewards';
    case 'pay_api': {
      const url = String(input.url ?? '');
      const cost = estimatePayApiCost(url);
      return `Pay for API call to ${url} (~$${cost})`;
    }
    case 'swap_execute': {
      const from = input.from ?? '?';
      const to = input.to ?? '?';
      const amt = input.amount ?? '?';
      const slippagePct = ((input.slippage as number) ?? 0.01) * 100;
      return `Swap ${amt} ${from} for ${to} (${slippagePct}% max slippage)`;
    }
    case 'volo_stake':
      return `Stake ${input.amount} SUI for vSUI`;
    case 'volo_unstake':
      return `Unstake ${input.amount === 'all' ? 'all' : input.amount} vSUI`;
    default:
      return `Execute ${tool.name}`;
  }
}

function flagSuspiciousResult(toolName: string, result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  if (toolName === 'swap_execute') {
    const outAmt = Number(r.toAmount ?? r.outputAmount ?? 0);
    const inAmt = Number(r.fromAmount ?? r.inputAmount ?? 1);
    if (inAmt > 0 && outAmt / inAmt > 1_000_000) {
      return '[Warning: This quote may contain inaccurate data. Verify on-chain before executing.]';
    }
  }
  const apy = Number(r.apy ?? r.APY ?? NaN);
  if (!isNaN(apy) && apy < 0) {
    return '[Warning: Negative APY detected — data may be stale.]';
  }
  return null;
}
