import OpenAI from 'openai';
import type { LLMProvider, ChatParams, LLMResponse, ChatMessage, ToolCall } from './types.js';

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai';
  readonly model: string;
  private client: OpenAI;

  constructor(apiKey: string, model?: string) {
    this.model = model ?? 'gpt-4o';
    this.client = new OpenAI({ apiKey, maxRetries: 3 });
  }

  async chat(params: ChatParams): Promise<LLMResponse> {
    const messages = params.messages.map(m => this.toOpenAIMessage(m));

    const tools = params.tools?.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    if (params.stream && params.onToken) {
      return this.streamChat(messages, tools, params.onToken);
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      ...(tools?.length ? { tools } : {}),
    });

    const choice = response.choices[0];
    return this.parseChoice(choice, response.usage);
  }

  private async streamChat(
    messages: OpenAI.ChatCompletionMessageParam[],
    tools: OpenAI.ChatCompletionTool[] | undefined,
    onToken: (token: string) => void,
  ): Promise<LLMResponse> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      ...(tools?.length ? { tools } : {}),
      stream: true,
      stream_options: { include_usage: true },
    });

    let text = '';
    const toolCallsMap = new Map<number, { id: string; name: string; args: string }>();
    let usage: { inputTokens: number; outputTokens: number } | undefined;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        text += delta.content;
        onToken(delta.content);
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCallsMap.get(tc.index) ?? { id: '', name: '', args: '' };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.args += tc.function.arguments;
          toolCallsMap.set(tc.index, existing);
        }
      }
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        };
      }
    }

    const toolCalls: ToolCall[] = [];
    for (const [, tc] of toolCallsMap) {
      toolCalls.push({
        id: tc.id,
        name: tc.name,
        arguments: JSON.parse(tc.args || '{}'),
      });
    }

    return {
      text: text || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
    };
  }

  private parseChoice(
    choice: OpenAI.ChatCompletion.Choice,
    usage?: OpenAI.CompletionUsage | null,
  ): LLMResponse {
    const toolCalls: ToolCall[] = [];
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        });
      }
    }

    return {
      text: choice.message.content ?? undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: usage ? {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
      } : undefined,
    };
  }

  private toOpenAIMessage(msg: ChatMessage): OpenAI.ChatCompletionMessageParam {
    if (msg.role === 'system') {
      return { role: 'system', content: msg.content };
    }
    if (msg.role === 'tool') {
      return { role: 'tool', tool_call_id: msg.toolCallId!, content: msg.content };
    }
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      return {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    return { role: msg.role as 'user' | 'assistant', content: msg.content };
  }
}
