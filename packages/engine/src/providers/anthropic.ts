import Anthropic from '@anthropic-ai/sdk';
import type {
  ChatParams,
  LLMProvider,
  Message,
  ProviderEvent,
  StopReason,
  SystemPrompt,
  ThinkingConfig,
  ToolDefinition,
} from '../types.js';
import { parseEvalSummary } from '../eval-summary.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

// Anthropic occasionally returns 529 overloaded_error or 429 rate_limit_error
// when their infrastructure is over capacity. The SDK does NOT auto-retry
// streaming requests once the connection opens, so we wrap the stream call
// ourselves: if the stream errors before yielding any events, we retry with
// exponential backoff. Once tokens have started flowing we propagate, because
// retrying mid-stream would corrupt engine state (double-counted tokens, etc.).
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 8000;

export interface AnthropicProviderConfig {
  apiKey: string;
  defaultModel?: string;
  defaultMaxTokens?: number;
  /** Max retry attempts for retriable errors (overloaded, rate-limited, network). Default 3. */
  maxRetries?: number;
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private defaultModel: string;
  private defaultMaxTokens: number;
  private maxRetries: number;

  constructor(config: AnthropicProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.defaultModel = config.defaultModel ?? DEFAULT_MODEL;
    this.defaultMaxTokens = config.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  async *chat(params: ChatParams): AsyncGenerator<ProviderEvent> {
    let attempt = 0;
    while (true) {
      let yieldedAnything = false;
      const inner = this.streamOnce(params);
      try {
        for (;;) {
          const next = await inner.next();
          if (next.done) return;
          yieldedAnything = true;
          yield next.value;
        }
      } catch (err) {
        // Best-effort: tell the inner generator to release the underlying stream.
        try { await inner.return?.(undefined); } catch { /* noop */ }

        if (!yieldedAnything && isRetriableError(err) && attempt < this.maxRetries) {
          attempt++;
          const delayMs = computeBackoffMs(attempt);
          console.warn(
            `[anthropic] retriable error (attempt ${attempt}/${this.maxRetries}, retrying in ${delayMs}ms): ${rawErrorMessage(err)}`,
          );
          await sleep(delayMs);
          continue;
        }
        throw new Error(friendlyErrorMessage(err));
      }
    }
  }

  private async *streamOnce(params: ChatParams): AsyncGenerator<ProviderEvent> {
    const messages = sanitizeAnthropicMessages(
      params.messages.map(toAnthropicMessage),
    );
    const tools = params.tools.map(toAnthropicTool);

    let toolChoice: Anthropic.Messages.MessageCreateParams['tool_choice'] | undefined;
    if (params.toolChoice && tools.length > 0) {
      if (params.toolChoice === 'any') {
        toolChoice = { type: 'any' };
      } else if (params.toolChoice === 'auto') {
        toolChoice = { type: 'auto' };
      } else if (typeof params.toolChoice === 'object') {
        toolChoice = { type: 'tool', name: params.toolChoice.name };
      }
    }

    const thinkingParam = toAnthropicThinking(params.thinking);

    const systemParam = toAnthropicSystem(params.systemPrompt);

    const baseParams: Anthropic.Messages.MessageCreateParamsStreaming = {
      model: params.model ?? this.defaultModel,
      max_tokens: params.maxTokens ?? this.defaultMaxTokens,
      system: systemParam,
      messages,
      stream: true as const,
      tools: tools.length > 0 ? tools : undefined,
      ...(!thinkingParam && params.temperature !== undefined && { temperature: params.temperature }),
      ...(toolChoice && { tool_choice: toolChoice }),
    };

    const streamParams = {
      ...baseParams,
      ...(thinkingParam && { thinking: thinkingParam }),
      ...(params.outputConfig?.effort && { output_config: { effort: params.outputConfig.effort } }),
    };

    // Cast to satisfy SDK types — thinking/output_config may not be in the type defs yet
    const stream = params.signal
      ? this.client.messages.stream(streamParams as Anthropic.Messages.MessageCreateParamsStreaming, { signal: params.signal })
      : this.client.messages.stream(streamParams as Anthropic.Messages.MessageCreateParamsStreaming);

    const toolInputBuffers = new Map<number, { id: string; name: string; json: string }>();
    const thinkingBuffers = new Map<number, { type: 'thinking'; text: string; signature: string } | { type: 'redacted_thinking'; data: string }>();
    let outputTokensFromStart = 0;

    try {
      for await (const event of stream) {
        switch (event.type) {
          case 'message_start': {
            const msg = event.message;
            yield {
              type: 'message_start',
              messageId: msg.id,
              model: msg.model,
            };
            if (msg.usage) {
              const u = msg.usage as unknown as Record<string, number>;
              outputTokensFromStart = msg.usage.output_tokens;
              yield {
                type: 'usage',
                inputTokens: msg.usage.input_tokens,
                outputTokens: msg.usage.output_tokens,
                cacheReadTokens: u.cache_read_input_tokens,
                cacheWriteTokens: u.cache_creation_input_tokens,
              };
            }
            break;
          }

          case 'content_block_start': {
            const block = event.content_block as { type: string; id?: string; name?: string; data?: string };
            if (block.type === 'tool_use') {
              toolInputBuffers.set(event.index, {
                id: block.id!,
                name: block.name!,
                json: '',
              });
              yield {
                type: 'tool_use_start',
                id: block.id!,
                name: block.name!,
              };
            } else if (block.type === 'thinking') {
              thinkingBuffers.set(event.index, { type: 'thinking', text: '', signature: '' });
            } else if (block.type === 'redacted_thinking') {
              thinkingBuffers.set(event.index, { type: 'redacted_thinking', data: block.data ?? '' });
            }
            break;
          }

          case 'content_block_delta': {
            const delta = event.delta as { type: string; text?: string; partial_json?: string; thinking?: string; signature?: string };
            if (delta.type === 'text_delta') {
              yield { type: 'text_delta', text: delta.text! };
            } else if (delta.type === 'input_json_delta') {
              const buf = toolInputBuffers.get(event.index);
              if (buf) {
                buf.json += delta.partial_json!;
                yield {
                  type: 'tool_use_delta',
                  id: buf.id,
                  partialJson: delta.partial_json!,
                };
              }
            } else if (delta.type === 'thinking_delta') {
              const buf = thinkingBuffers.get(event.index);
              if (buf?.type === 'thinking') buf.text += delta.thinking ?? '';
              yield { type: 'thinking_delta', text: delta.thinking ?? '', blockIndex: event.index };
            } else if (delta.type === 'signature_delta') {
              const buf = thinkingBuffers.get(event.index);
              if (buf?.type === 'thinking') buf.signature = delta.signature ?? '';
            }
            break;
          }

          case 'content_block_stop': {
            const toolBuf = toolInputBuffers.get(event.index);
            if (toolBuf) {
              let input: unknown = {};
              try {
                input = JSON.parse(toolBuf.json || '{}');
              } catch {
                input = {};
              }
              yield {
                type: 'tool_use_done',
                id: toolBuf.id,
                name: toolBuf.name,
                input,
              };
              toolInputBuffers.delete(event.index);
            }
            const thinkBuf = thinkingBuffers.get(event.index);
            if (thinkBuf?.type === 'thinking') {
              // [SPEC 8 v0.5.1] Detect <eval_summary> marker in the
              // thinking buffer. When present + parseable, populate the
              // structured fields the host renders as HowIEvaluatedBlock.
              const summary = parseEvalSummary(thinkBuf.text);
              yield {
                type: 'thinking_done',
                blockIndex: event.index,
                thinking: thinkBuf.text,
                signature: thinkBuf.signature,
                ...(summary
                  ? { summaryMode: true, evaluationItems: summary.evaluationItems }
                  : {}),
              };
              thinkingBuffers.delete(event.index);
            } else if (thinkBuf?.type === 'redacted_thinking') {
              yield { type: 'redacted_thinking', data: thinkBuf.data };
              thinkingBuffers.delete(event.index);
            }
            break;
          }

          case 'message_delta': {
            const delta = event.delta as { stop_reason?: string };
            const usage = event.usage as { output_tokens?: number } | undefined;
            // message_delta.usage.output_tokens is cumulative — emit only the delta
            if (usage?.output_tokens && usage.output_tokens > outputTokensFromStart) {
              const increment = usage.output_tokens - outputTokensFromStart;
              outputTokensFromStart = usage.output_tokens;
              yield {
                type: 'usage',
                inputTokens: 0,
                outputTokens: increment,
              };
            }
            if (delta.stop_reason) {
              yield {
                type: 'stop',
                reason: mapStopReason(delta.stop_reason),
              };
            }
            break;
          }
        }
      }
    } finally {
      stream.abort();
    }
  }
}

// ---------------------------------------------------------------------------
// Error classification + retry helpers
// ---------------------------------------------------------------------------

// Exported for testing. Not part of the public provider API.
export const _internal = {
  isRetriableError: (err: unknown) => isRetriableError(err),
  friendlyErrorMessage: (err: unknown) => friendlyErrorMessage(err),
  computeBackoffMs: (attempt: number) => computeBackoffMs(attempt),
};

function isRetriableError(err: unknown): boolean {
  if (!err) return false;

  // Anthropic SDK error classes (status-based)
  if (err instanceof Anthropic.APIError) {
    // 529 overloaded, 408 timeout, 502/503/504 transient
    if (err.status === 529 || err.status === 408) return true;
    if (err.status === 502 || err.status === 503 || err.status === 504) return true;
    // 429 rate-limited — retry but the user may need to slow down regardless
    if (err.status === 429) return true;
    return false;
  }

  // Sometimes streaming errors arrive as plain Error with the JSON message
  // baked into err.message (e.g. {"type":"error","error":{"type":"overloaded_error",...}})
  const msg = rawErrorMessage(err).toLowerCase();
  if (
    msg.includes('overloaded_error') ||
    msg.includes('"overloaded"') ||
    msg.includes('rate_limit_error') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('fetch failed') ||
    msg.includes('network error')
  ) {
    return true;
  }

  return false;
}

function rawErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Map a raw provider error to a clean, user-facing message.
 *
 * Most users see this as the chat error bubble — never leak raw JSON or
 * stack traces. Any string returned here is safe to render verbatim in UI.
 */
function friendlyErrorMessage(err: unknown): string {
  const msg = rawErrorMessage(err).toLowerCase();

  if (
    msg.includes('overloaded_error') ||
    msg.includes('"overloaded"') ||
    (err instanceof Anthropic.APIError && err.status === 529)
  ) {
    return "Anthropic's servers are over capacity right now. Please try again in 30 seconds.";
  }
  if (
    msg.includes('rate_limit_error') ||
    (err instanceof Anthropic.APIError && err.status === 429)
  ) {
    return 'Too many requests in a short window. Please wait a moment and try again.';
  }
  if (
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('fetch failed') ||
    msg.includes('network error')
  ) {
    return "Couldn't reach Anthropic. Check your connection and try again.";
  }
  if (err instanceof Anthropic.APIError && err.status === 401) {
    return 'Authentication failed. Please check the Anthropic API key configuration.';
  }
  if (err instanceof Anthropic.APIError && err.status === 400) {
    return 'The request was rejected by Anthropic. This is likely a bug — please retry, and if it persists, contact support.';
  }
  if (err instanceof Anthropic.APIError && err.status >= 500) {
    return 'Anthropic returned a server error. Please try again in a moment.';
  }

  return 'Something went wrong. Please try again.';
}

function computeBackoffMs(attempt: number): number {
  const base = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

function toAnthropicSystem(prompt: SystemPrompt): string | Anthropic.Messages.TextBlockParam[] {
  if (typeof prompt === 'string') return prompt;
  return prompt.map((block) => ({
    type: 'text' as const,
    text: block.text,
    ...(block.cache_control && { cache_control: block.cache_control }),
  }));
}

function toAnthropicThinking(config?: ThinkingConfig): Record<string, unknown> | undefined {
  if (!config || config.type === 'disabled') return undefined;
  if (config.type === 'adaptive') return { type: 'adaptive' };
  return { type: 'enabled', budget_tokens: config.budgetTokens };
}

function toAnthropicMessage(msg: Message): Anthropic.MessageParam {
  const content: Anthropic.ContentBlockParam[] = msg.content
    .map((block): Anthropic.ContentBlockParam | null => {
      switch (block.type) {
        case 'text':
          return { type: 'text' as const, text: block.text };
        case 'thinking':
          return { type: 'thinking' as const, thinking: block.thinking, signature: block.signature } as unknown as Anthropic.ContentBlockParam;
        case 'redacted_thinking':
          return { type: 'redacted_thinking' as const, data: block.data } as unknown as Anthropic.ContentBlockParam;
        case 'tool_use':
          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          };
        case 'tool_result':
          return {
            type: 'tool_result' as const,
            tool_use_id: block.toolUseId,
            content: block.content,
            is_error: block.isError,
          };
      }
    })
    .filter((b): b is Anthropic.ContentBlockParam => b !== null);

  return { role: msg.role, content };
}

function toAnthropicTool(
  def: ToolDefinition,
): Anthropic.Messages.Tool {
  return {
    name: def.name,
    description: def.description,
    input_schema: def.input_schema as Anthropic.Messages.Tool.InputSchema,
  };
}

function mapStopReason(reason: string): StopReason {
  switch (reason) {
    case 'end_turn':
      return 'end_turn';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    default:
      return 'end_turn';
  }
}

/**
 * Last-line-of-defense sanitization operating directly on Anthropic-format messages.
 * Enforces the positional constraint: every tool_use in an assistant message must have
 * a matching tool_result (by tool_use_id) in the immediately next user message.
 * Strips orphans in both directions and fixes role alternation.
 */
function sanitizeAnthropicMessages(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const content = Array.isArray(msg.content) ? msg.content : [{ type: 'text' as const, text: msg.content }];

    // Collect tool_use ids in this assistant message
    const toolUseIds = content
      .filter((b): b is Anthropic.ToolUseBlockParam => (b as { type: string }).type === 'tool_use')
      .map((b) => b.id);

    if (msg.role === 'assistant' && toolUseIds.length > 0) {
      const next = messages[i + 1];
      const nextContent = next ? (Array.isArray(next.content) ? next.content : []) : [];
      const nextResultIds = new Set(
        nextContent
          .filter((b): b is Anthropic.ToolResultBlockParam => (b as { type: string }).type === 'tool_result')
          .map((b) => b.tool_use_id),
      );

      // Keep only tool_use blocks that have a result in the next message
      const cleanContent = content.filter((b) => {
        if ((b as { type: string }).type === 'tool_use') return nextResultIds.has((b as Anthropic.ToolUseBlockParam).id);
        return true;
      });

      // Keep only tool_result blocks in next whose tool_use survived
      const keptIds = new Set(
        cleanContent
          .filter((b): b is Anthropic.ToolUseBlockParam => (b as { type: string }).type === 'tool_use')
          .map((b) => b.id),
      );
      const cleanNext = nextContent.filter((b) => {
        if ((b as { type: string }).type === 'tool_result')
          return keptIds.has((b as Anthropic.ToolResultBlockParam).tool_use_id);
        return true;
      });

      if (cleanContent.length > 0) result.push({ role: 'assistant', content: cleanContent });
      if (cleanNext.length > 0 && next) result.push({ role: next.role, content: cleanNext });
      i++; // skip the next message (already processed)

      if (cleanContent.length < content.length || cleanNext.length < nextContent.length) {
        console.warn(
          `[anthropic] sanitized orphans: stripped ${content.length - cleanContent.length} tool_use, ${nextContent.length - cleanNext.length} tool_result`,
        );
      }
      continue;
    }

    // For user messages: strip tool_result referencing non-existent tool_use in prev assistant
    if (msg.role === 'user' && content.some((b) => (b as { type: string }).type === 'tool_result')) {
      const prev = result[result.length - 1];
      const prevContent = prev?.role === 'assistant' && Array.isArray(prev.content) ? prev.content : [];
      const prevToolUseIds = new Set(
        prevContent
          .filter((b): b is Anthropic.ToolUseBlockParam => (b as { type: string }).type === 'tool_use')
          .map((b) => b.id),
      );
      const cleanContent = content.filter((b) => {
        if ((b as { type: string }).type === 'tool_result')
          return prevToolUseIds.has((b as Anthropic.ToolResultBlockParam).tool_use_id);
        return true;
      });
      if (cleanContent.length > 0) result.push({ role: msg.role, content: cleanContent });
      continue;
    }

    result.push(msg);
  }

  // Merge consecutive same-role messages
  const merged: Anthropic.MessageParam[] = [];
  for (const msg of result) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      const lastContent = Array.isArray(last.content) ? last.content : [{ type: 'text' as const, text: last.content }];
      const msgContent = Array.isArray(msg.content) ? msg.content : [{ type: 'text' as const, text: msg.content }];
      last.content = [...lastContent, ...msgContent];
    } else {
      merged.push({ ...msg });
    }
  }

  // First message must be user
  while (merged.length > 0 && merged[0].role !== 'user') {
    merged.shift();
  }

  return merged;
}
