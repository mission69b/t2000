import Anthropic from '@anthropic-ai/sdk';
import type {
  ChatParams,
  LLMProvider,
  Message,
  ProviderEvent,
  StopReason,
  ToolDefinition,
} from '../types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

export interface AnthropicProviderConfig {
  apiKey: string;
  defaultModel?: string;
  defaultMaxTokens?: number;
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private defaultModel: string;
  private defaultMaxTokens: number;

  constructor(config: AnthropicProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.defaultModel = config.defaultModel ?? DEFAULT_MODEL;
    this.defaultMaxTokens = config.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async *chat(params: ChatParams): AsyncGenerator<ProviderEvent> {
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

    const streamParams = {
      model: params.model ?? this.defaultModel,
      max_tokens: params.maxTokens ?? this.defaultMaxTokens,
      system: params.systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      ...(params.temperature !== undefined && { temperature: params.temperature }),
      ...(toolChoice && { tool_choice: toolChoice }),
    };

    const stream = params.signal
      ? this.client.messages.stream(streamParams, { signal: params.signal })
      : this.client.messages.stream(streamParams);

    const toolInputBuffers = new Map<number, { id: string; name: string; json: string }>();
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
            const block = event.content_block;
            if (block.type === 'tool_use') {
              toolInputBuffers.set(event.index, {
                id: block.id,
                name: block.name,
                json: '',
              });
              yield {
                type: 'tool_use_start',
                id: block.id,
                name: block.name,
              };
            }
            break;
          }

          case 'content_block_delta': {
            const delta = event.delta;
            if (delta.type === 'text_delta') {
              yield { type: 'text_delta', text: delta.text };
            } else if (delta.type === 'input_json_delta') {
              const buf = toolInputBuffers.get(event.index);
              if (buf) {
                buf.json += delta.partial_json;
                yield {
                  type: 'tool_use_delta',
                  id: buf.id,
                  partialJson: delta.partial_json,
                };
              }
            }
            break;
          }

          case 'content_block_stop': {
            const buf = toolInputBuffers.get(event.index);
            if (buf) {
              let input: unknown = {};
              try {
                input = JSON.parse(buf.json || '{}');
              } catch {
                input = {};
              }
              yield {
                type: 'tool_use_done',
                id: buf.id,
                name: buf.name,
                input,
              };
              toolInputBuffers.delete(event.index);
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
// Conversion helpers
// ---------------------------------------------------------------------------

function toAnthropicMessage(msg: Message): Anthropic.MessageParam {
  const content: Anthropic.ContentBlockParam[] = msg.content.map((block) => {
    switch (block.type) {
      case 'text':
        return { type: 'text' as const, text: block.text };
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
  });

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
