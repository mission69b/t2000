import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  const mockStream = vi.fn();

  return {
    default: class MockAnthropic {
      messages = {
        create: mockCreate,
        stream: mockStream,
      };
    },
    __mockCreate: mockCreate,
    __mockStream: mockStream,
  };
});

import { AnthropicProvider } from './anthropic.js';
import type { ChatMessage, ToolDefinition } from './types.js';

const { __mockCreate, __mockStream } = await import('@anthropic-ai/sdk') as any;

function createProvider(model?: string): AnthropicProvider {
  return new AnthropicProvider('sk-ant-test-key', model);
}

function anthropicResponse(content: Anthropic.ContentBlock[], usage = { input_tokens: 10, output_tokens: 5 }): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content,
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
    usage,
  } as Anthropic.Message;
}

describe('AnthropicProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct id and default model', () => {
    const provider = createProvider();
    expect(provider.id).toBe('anthropic');
    expect(provider.model).toBe('claude-sonnet-4-20250514');
  });

  it('accepts custom model', () => {
    const provider = createProvider('claude-3-haiku-20240307');
    expect(provider.model).toBe('claude-3-haiku-20240307');
  });

  it('extracts system message and passes separately', async () => {
    const provider = createProvider();
    const response = anthropicResponse([{ type: 'text', text: 'Hello' }]);
    __mockCreate.mockResolvedValueOnce(response);

    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a financial advisor' },
      { role: 'user', content: 'Hi' },
    ];

    await provider.chat({ messages });

    expect(__mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'You are a financial advisor',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    );
  });

  it('parses text-only response', async () => {
    const provider = createProvider();
    const response = anthropicResponse([
      { type: 'text', text: 'Your balance is $100' },
    ]);
    __mockCreate.mockResolvedValueOnce(response);

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'balance' }],
    });

    expect(result.text).toBe('Your balance is $100');
    expect(result.toolCalls).toBeUndefined();
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('parses tool_use blocks into toolCalls', async () => {
    const provider = createProvider();
    const response = anthropicResponse([
      { type: 'text', text: 'Checking...' },
      { type: 'tool_use', id: 'call_1', name: 't2000_balance', input: {} },
    ]);
    __mockCreate.mockResolvedValueOnce(response);

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'balance' }],
    });

    expect(result.text).toBe('Checking...');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]).toEqual({
      id: 'call_1',
      name: 't2000_balance',
      arguments: {},
    });
  });

  it('handles multiple tool calls', async () => {
    const provider = createProvider();
    const response = anthropicResponse([
      { type: 'tool_use', id: 'call_1', name: 't2000_balance', input: {} },
      { type: 'tool_use', id: 'call_2', name: 't2000_rates', input: {} },
    ]);
    __mockCreate.mockResolvedValueOnce(response);

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'show balance and rates' }],
    });

    expect(result.text).toBeUndefined();
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls![0].name).toBe('t2000_balance');
    expect(result.toolCalls![1].name).toBe('t2000_rates');
  });

  it('converts tools to Anthropic format', async () => {
    const provider = createProvider();
    __mockCreate.mockResolvedValueOnce(
      anthropicResponse([{ type: 'text', text: 'ok' }]),
    );

    const tools: ToolDefinition[] = [{
      name: 't2000_send',
      description: 'Send USDC',
      parameters: { type: 'object', properties: { to: { type: 'string' } } },
    }];

    await provider.chat({
      messages: [{ role: 'user', content: 'send' }],
      tools,
    });

    expect(__mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [{
          name: 't2000_send',
          description: 'Send USDC',
          input_schema: { type: 'object', properties: { to: { type: 'string' } } },
        }],
      }),
    );
  });

  it('maps tool result messages to Anthropic tool_result format', async () => {
    const provider = createProvider();
    __mockCreate.mockResolvedValueOnce(
      anthropicResponse([{ type: 'text', text: 'Done' }]),
    );

    const messages: ChatMessage[] = [
      { role: 'user', content: 'balance' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 't2000_balance', arguments: {} }] },
      { role: 'tool', content: '{"balance": 100}', toolCallId: 'call_1' },
    ];

    await provider.chat({ messages });

    const callArgs = __mockCreate.mock.calls[0][0];
    // Tool result should be mapped to user role with tool_result content
    const toolResultMsg = callArgs.messages.find(
      (m: any) => m.role === 'user' && Array.isArray(m.content) && m.content[0]?.type === 'tool_result',
    );
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.content[0].tool_use_id).toBe('call_1');
    expect(toolResultMsg.content[0].content).toBe('{"balance": 100}');
  });

  it('maps assistant messages with tool calls to Anthropic format', async () => {
    const provider = createProvider();
    __mockCreate.mockResolvedValueOnce(
      anthropicResponse([{ type: 'text', text: 'ok' }]),
    );

    const messages: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: 'Let me check',
        toolCalls: [{ id: 'call_1', name: 't2000_balance', arguments: {} }],
      },
      { role: 'tool', content: '{}', toolCallId: 'call_1' },
    ];

    await provider.chat({ messages });

    const callArgs = __mockCreate.mock.calls[0][0];
    const assistantMsg = callArgs.messages.find(
      (m: any) => m.role === 'assistant' && Array.isArray(m.content),
    );
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content[0]).toEqual({ type: 'text', text: 'Let me check' });
    expect(assistantMsg.content[1]).toEqual({
      type: 'tool_use',
      id: 'call_1',
      name: 't2000_balance',
      input: {},
    });
  });

  it('omits tools param when no tools provided', async () => {
    const provider = createProvider();
    __mockCreate.mockResolvedValueOnce(
      anthropicResponse([{ type: 'text', text: 'hi' }]),
    );

    await provider.chat({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
    });

    const callArgs = __mockCreate.mock.calls[0][0];
    expect(callArgs.tools).toBeUndefined();
  });

  it('uses streaming when stream=true and onToken provided', async () => {
    const provider = createProvider();
    const tokens: string[] = [];
    const finalMessage = anthropicResponse([{ type: 'text', text: 'Hello world' }]);

    const mockStreamObj = {
      on: vi.fn(),
      finalMessage: vi.fn().mockResolvedValueOnce(finalMessage),
    };
    __mockStream.mockReturnValueOnce(mockStreamObj);

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      onToken: (token) => tokens.push(token),
    });

    expect(__mockStream).toHaveBeenCalled();
    expect(mockStreamObj.on).toHaveBeenCalledWith('text', expect.any(Function));
    expect(result.text).toBe('Hello world');
  });
});
