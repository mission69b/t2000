import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, ChatParams, LLMResponse, ChatMessage, ToolCall } from './types.js';

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';
  readonly model: string;
  private client: Anthropic;

  constructor(apiKey: string, model?: string) {
    this.model = model ?? 'claude-sonnet-4-20250514';
    this.client = new Anthropic({ apiKey, maxRetries: 3 });
  }

  async chat(params: ChatParams): Promise<LLMResponse> {
    const systemMessage = params.messages.find(m => m.role === 'system');
    const messages = params.messages
      .filter(m => m.role !== 'system')
      .map(m => this.toAnthropicMessage(m));

    const tools = params.tools?.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool['input_schema'],
    }));

    if (params.stream && params.onToken) {
      return this.streamChat(systemMessage?.content, messages, tools, params.onToken);
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemMessage?.content,
      messages,
      ...(tools?.length ? { tools } : {}),
    });

    return this.parseResponse(response);
  }

  private async streamChat(
    system: string | undefined,
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[] | undefined,
    onToken: (token: string) => void,
  ): Promise<LLMResponse> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      system,
      messages,
      ...(tools?.length ? { tools } : {}),
    });

    stream.on('text', onToken);
    const response = await stream.finalMessage();
    return this.parseResponse(response);
  }

  private parseResponse(response: Anthropic.Message): LLMResponse {
    let text: string | undefined;
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        text = (text ?? '') + block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  private toAnthropicMessage(msg: ChatMessage): Anthropic.MessageParam {
    if (msg.role === 'tool') {
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.toolCallId!,
          content: msg.content,
        }],
      };
    }

    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      const content: Anthropic.ContentBlockParam[] = [];
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      for (const tc of msg.toolCalls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
      return { role: 'assistant', content };
    }

    return {
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    };
  }
}
