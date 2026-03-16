import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('openai', () => {
  const mockCreate = vi.fn();

  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
    __mockCreate: mockCreate,
  };
});

import { OpenAIProvider } from './openai.js';
import type { ChatMessage, ToolDefinition } from './types.js';

const { __mockCreate } = await import('openai') as any;

function createProvider(model?: string): OpenAIProvider {
  return new OpenAIProvider('sk-test-key', model);
}

function openaiResponse(
  content: string | null,
  toolCalls?: { id: string; function: { name: string; arguments: string } }[],
  usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content,
        tool_calls: toolCalls?.map(tc => ({
          id: tc.id,
          type: 'function',
          function: tc.function,
        })),
      },
      finish_reason: toolCalls ? 'tool_calls' : 'stop',
    }],
    usage,
  };
}

describe('OpenAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct id and default model', () => {
    const provider = createProvider();
    expect(provider.id).toBe('openai');
    expect(provider.model).toBe('gpt-4o');
  });

  it('accepts custom model', () => {
    const provider = createProvider('gpt-4o-mini');
    expect(provider.model).toBe('gpt-4o-mini');
  });

  it('parses text-only response', async () => {
    const provider = createProvider();
    __mockCreate.mockResolvedValueOnce(openaiResponse('Your balance is $100'));

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'balance' }],
    });

    expect(result.text).toBe('Your balance is $100');
    expect(result.toolCalls).toBeUndefined();
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('parses function call response into toolCalls', async () => {
    const provider = createProvider();
    __mockCreate.mockResolvedValueOnce(openaiResponse(null, [{
      id: 'call_abc',
      function: { name: 't2000_balance', arguments: '{}' },
    }]));

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'balance' }],
    });

    expect(result.text).toBeUndefined();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]).toEqual({
      id: 'call_abc',
      name: 't2000_balance',
      arguments: {},
    });
  });

  it('handles multiple tool calls', async () => {
    const provider = createProvider();
    __mockCreate.mockResolvedValueOnce(openaiResponse(null, [
      { id: 'call_1', function: { name: 't2000_balance', arguments: '{}' } },
      { id: 'call_2', function: { name: 't2000_rates', arguments: '{}' } },
    ]));

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'show all' }],
    });

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls![0].name).toBe('t2000_balance');
    expect(result.toolCalls![1].name).toBe('t2000_rates');
  });

  it('passes system messages as role=system', async () => {
    const provider = createProvider();
    __mockCreate.mockResolvedValueOnce(openaiResponse('ok'));

    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a financial advisor' },
      { role: 'user', content: 'hi' },
    ];

    await provider.chat({ messages });

    const callArgs = __mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'You are a financial advisor' });
    expect(callArgs.messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('converts tools to OpenAI function calling format', async () => {
    const provider = createProvider();
    __mockCreate.mockResolvedValueOnce(openaiResponse('ok'));

    const tools: ToolDefinition[] = [{
      name: 't2000_send',
      description: 'Send USDC',
      parameters: { type: 'object', properties: { to: { type: 'string' } } },
    }];

    await provider.chat({
      messages: [{ role: 'user', content: 'send' }],
      tools,
    });

    const callArgs = __mockCreate.mock.calls[0][0];
    expect(callArgs.tools).toEqual([{
      type: 'function',
      function: {
        name: 't2000_send',
        description: 'Send USDC',
        parameters: { type: 'object', properties: { to: { type: 'string' } } },
      },
    }]);
  });

  it('maps tool result messages to OpenAI tool role', async () => {
    const provider = createProvider();
    __mockCreate.mockResolvedValueOnce(openaiResponse('Done'));

    const messages: ChatMessage[] = [
      { role: 'user', content: 'balance' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 't2000_balance', arguments: {} }] },
      { role: 'tool', content: '{"balance": 100}', toolCallId: 'call_1' },
    ];

    await provider.chat({ messages });

    const callArgs = __mockCreate.mock.calls[0][0];
    const toolMsg = callArgs.messages.find((m: any) => m.role === 'tool');
    expect(toolMsg).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '{"balance": 100}',
    });
  });

  it('maps assistant messages with tool calls to OpenAI format', async () => {
    const provider = createProvider();
    __mockCreate.mockResolvedValueOnce(openaiResponse('ok'));

    const messages: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: 'Let me check',
        toolCalls: [{ id: 'call_1', name: 't2000_balance', arguments: { showLimits: true } }],
      },
      { role: 'tool', content: '{}', toolCallId: 'call_1' },
    ];

    await provider.chat({ messages });

    const callArgs = __mockCreate.mock.calls[0][0];
    const assistantMsg = callArgs.messages.find(
      (m: any) => m.role === 'assistant' && m.tool_calls,
    );
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content).toBe('Let me check');
    expect(assistantMsg.tool_calls[0]).toEqual({
      id: 'call_1',
      type: 'function',
      function: { name: 't2000_balance', arguments: '{"showLimits":true}' },
    });
  });

  it('omits tools param when no tools provided', async () => {
    const provider = createProvider();
    __mockCreate.mockResolvedValueOnce(openaiResponse('hi'));

    await provider.chat({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
    });

    const callArgs = __mockCreate.mock.calls[0][0];
    expect(callArgs.tools).toBeUndefined();
  });

  it('handles null content in response', async () => {
    const provider = createProvider();
    __mockCreate.mockResolvedValueOnce(openaiResponse(null));

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result.text).toBeUndefined();
  });
});
