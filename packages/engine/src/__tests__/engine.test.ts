import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { QueryEngine } from '../engine.js';
import { buildTool } from '../tool.js';
import type {
  LLMProvider,
  ChatParams,
  ProviderEvent,
  EngineEvent,
  Tool,
} from '../types.js';

// ---------------------------------------------------------------------------
// Mock LLM provider — returns pre-scripted responses
// ---------------------------------------------------------------------------

type ScriptedTurn =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown };

function createMockProvider(turns: ScriptedTurn[][]): LLMProvider {
  let callIndex = 0;

  return {
    async *chat(_params: ChatParams): AsyncGenerator<ProviderEvent> {
      const turn = turns[callIndex] ?? [];
      callIndex++;

      yield {
        type: 'message_start',
        messageId: `msg-${callIndex}`,
        model: 'mock-model',
      };

      yield {
        type: 'usage',
        inputTokens: 100,
        outputTokens: 50,
      };

      const hasToolCalls = turn.some((t) => t.type === 'tool_call');

      for (const item of turn) {
        if (item.type === 'text') {
          yield { type: 'text_delta', text: item.text };
        } else if (item.type === 'tool_call') {
          yield { type: 'tool_use_start', id: item.id, name: item.name };
          yield {
            type: 'tool_use_done',
            id: item.id,
            name: item.name,
            input: item.input,
          };
        }
      }

      yield {
        type: 'stop',
        reason: hasToolCalls ? 'tool_use' : 'end_turn',
      };
    },
  };
}

async function collectEvents(gen: AsyncGenerator<EngineEvent>): Promise<EngineEvent[]> {
  const events: EngineEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QueryEngine', () => {
  const echoTool: Tool = buildTool({
    name: 'echo',
    description: 'Echoes a message',
    inputSchema: z.object({ msg: z.string() }),
    jsonSchema: {
      type: 'object',
      properties: { msg: { type: 'string' } },
      required: ['msg'],
    },
    isReadOnly: true,
    async call(input) {
      return { data: { echoed: input.msg } };
    },
  });

  it('streams a simple text response', async () => {
    const provider = createMockProvider([
      [{ type: 'text', text: 'Hello, ' }, { type: 'text', text: 'world!' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [],
      systemPrompt: 'Test',
    });

    const events = await collectEvents(engine.submitMessage('Hi'));

    const textDeltas = events.filter((e) => e.type === 'text_delta');
    expect(textDeltas).toHaveLength(2);

    const fullText = textDeltas
      .map((e) => (e.type === 'text_delta' ? e.text : ''))
      .join('');
    expect(fullText).toBe('Hello, world!');

    expect(events.at(-1)?.type).toBe('turn_complete');
  });

  it('executes a tool call and loops back to the LLM', async () => {
    const provider = createMockProvider([
      // Turn 1: LLM calls echo tool
      [{ type: 'tool_call', id: 'tc-1', name: 'echo', input: { msg: 'ping' } }],
      // Turn 2: LLM responds with text after seeing tool result
      [{ type: 'text', text: 'You said: ping' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [echoTool],
      systemPrompt: 'Test',
    });

    const events = await collectEvents(engine.submitMessage('Echo ping'));

    const toolStarts = events.filter((e) => e.type === 'tool_start');
    expect(toolStarts).toHaveLength(1);

    const toolResults = events.filter((e) => e.type === 'tool_result');
    expect(toolResults).toHaveLength(1);
    if (toolResults[0].type === 'tool_result') {
      expect(toolResults[0].result).toEqual({ echoed: 'ping' });
    }

    const textDeltas = events.filter((e) => e.type === 'text_delta');
    expect(textDeltas.length).toBeGreaterThan(0);

    expect(events.at(-1)?.type).toBe('turn_complete');
  });

  it('tracks cumulative token usage', async () => {
    const provider = createMockProvider([
      [{ type: 'text', text: 'Turn 1' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [],
      systemPrompt: 'Test',
    });

    await collectEvents(engine.submitMessage('First'));
    const usage = engine.getUsage();
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(50);
  });

  it('stores messages in conversation history', async () => {
    const provider = createMockProvider([
      [{ type: 'text', text: 'Response 1' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [],
      systemPrompt: 'Test',
    });

    await collectEvents(engine.submitMessage('Hello'));

    const messages = engine.getMessages();
    expect(messages).toHaveLength(2); // user + assistant
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('respects maxTurns limit with correct stop reason', async () => {
    const infiniteToolProvider = createMockProvider(
      Array.from({ length: 20 }, () => [
        { type: 'tool_call' as const, id: 'tc', name: 'echo', input: { msg: 'loop' } },
      ]),
    );

    const engine = new QueryEngine({
      provider: infiniteToolProvider,
      tools: [echoTool],
      systemPrompt: 'Test',
      maxTurns: 3,
    });

    const events = await collectEvents(engine.submitMessage('Loop'));

    const turnComplete = events.find((e) => e.type === 'turn_complete');
    expect(turnComplete).toBeDefined();
    if (turnComplete?.type === 'turn_complete') {
      expect(turnComplete.stopReason).toBe('max_turns');
    }
  });

  it('handles multiple tool calls in a single LLM turn', async () => {
    const toolA = buildTool({
      name: 'tool_a',
      description: 'Tool A',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      isReadOnly: true,
      async call() {
        return { data: { result: 'a' } };
      },
    });
    const toolB = buildTool({
      name: 'tool_b',
      description: 'Tool B',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      isReadOnly: true,
      async call() {
        return { data: { result: 'b' } };
      },
    });

    const provider = createMockProvider([
      // Turn 1: two tool calls in one response
      [
        { type: 'tool_call', id: 'tc-1', name: 'tool_a', input: {} },
        { type: 'tool_call', id: 'tc-2', name: 'tool_b', input: {} },
      ],
      // Turn 2: final text
      [{ type: 'text', text: 'Both tools returned results.' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [toolA, toolB],
      systemPrompt: 'Test',
    });

    const events = await collectEvents(engine.submitMessage('Call both'));

    const toolStarts = events.filter((e) => e.type === 'tool_start');
    expect(toolStarts).toHaveLength(2);

    const toolResults = events.filter((e) => e.type === 'tool_result');
    expect(toolResults).toHaveLength(2);

    // Results added to conversation as user message with tool_result blocks
    const messages = engine.getMessages();
    const toolResultMsg = messages.find((m) =>
      m.content.some((b) => b.type === 'tool_result'),
    );
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg?.content).toHaveLength(2);
  });

  it('propagates stopReason from the LLM provider', async () => {
    const provider: LLMProvider = {
      async *chat(): AsyncGenerator<ProviderEvent> {
        yield { type: 'message_start', messageId: 'msg-1', model: 'mock' };
        yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
        yield { type: 'text_delta', text: 'Truncated respon' };
        yield { type: 'stop', reason: 'max_tokens' };
      },
    };

    const engine = new QueryEngine({
      provider,
      tools: [],
      systemPrompt: 'Test',
    });

    const events = await collectEvents(engine.submitMessage('Tell me a story'));

    const turnComplete = events.find((e) => e.type === 'turn_complete');
    expect(turnComplete).toBeDefined();
    if (turnComplete?.type === 'turn_complete') {
      expect(turnComplete.stopReason).toBe('max_tokens');
    }
  });

  it('restores conversation with loadMessages', async () => {
    const provider = createMockProvider([
      [{ type: 'text', text: 'Continued conversation' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [],
      systemPrompt: 'Test',
    });

    engine.loadMessages([
      { role: 'user', content: [{ type: 'text', text: 'Previous message' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Previous response' }] },
    ]);

    await collectEvents(engine.submitMessage('Follow up'));

    const messages = engine.getMessages();
    // 2 loaded + 1 new user + 1 new assistant = 4
    expect(messages).toHaveLength(4);
    expect(messages[0].content[0]).toEqual({ type: 'text', text: 'Previous message' });
  });

  describe('invokeReadTool (v0.46.7)', () => {
    const readTool: Tool = buildTool({
      name: 'fake_read',
      description: 'A read-only tool',
      inputSchema: z.object({ q: z.string() }),
      jsonSchema: {
        type: 'object',
        properties: { q: { type: 'string' } },
        required: ['q'],
      },
      isReadOnly: true,
      async call(input) {
        return { data: { echoed: input.q, ts: 'fixed' } };
      },
    });

    const writeTool: Tool = buildTool({
      name: 'fake_write',
      description: 'A write tool',
      inputSchema: z.object({ amount: z.number() }),
      jsonSchema: {
        type: 'object',
        properties: { amount: { type: 'number' } },
        required: ['amount'],
      },
      isReadOnly: false,
      permissionLevel: 'confirm',
      async call(input) {
        return { data: { ok: true, amount: input.amount } };
      },
    });

    it('runs a read-only tool out-of-band and returns its data', async () => {
      const engine = new QueryEngine({
        provider: createMockProvider([]),
        tools: [readTool],
        systemPrompt: 'Test',
      });

      const result = await engine.invokeReadTool('fake_read', { q: 'hello' });
      expect(result.isError).toBe(false);
      expect(result.data).toEqual({ echoed: 'hello', ts: 'fixed' });
    });

    it('throws when the tool is not registered', async () => {
      const engine = new QueryEngine({
        provider: createMockProvider([]),
        tools: [readTool],
        systemPrompt: 'Test',
      });

      await expect(engine.invokeReadTool('does_not_exist', {})).rejects.toThrow(
        /tool not found/i,
      );
    });

    it('throws when the tool is not read-only', async () => {
      const engine = new QueryEngine({
        provider: createMockProvider([]),
        tools: [writeTool],
        systemPrompt: 'Test',
      });

      await expect(engine.invokeReadTool('fake_write', { amount: 1 })).rejects.toThrow(
        /not read-only/i,
      );
    });

    it('throws on input schema validation failure', async () => {
      const engine = new QueryEngine({
        provider: createMockProvider([]),
        tools: [readTool],
        systemPrompt: 'Test',
      });

      await expect(engine.invokeReadTool('fake_read', { q: 42 })).rejects.toThrow(
        /invalid input/i,
      );
    });

    it('returns isError=true when the tool throws at runtime', async () => {
      const throwingTool: Tool = buildTool({
        name: 'fake_throw',
        description: 'Throws',
        inputSchema: z.object({}),
        jsonSchema: { type: 'object', properties: {}, required: [] },
        isReadOnly: true,
        async call() {
          throw new Error('boom');
        },
      });

      const engine = new QueryEngine({
        provider: createMockProvider([]),
        tools: [throwingTool],
        systemPrompt: 'Test',
      });

      const result = await engine.invokeReadTool('fake_throw', {});
      expect(result.isError).toBe(true);
      expect(result.data).toEqual({ error: 'boom' });
    });
  });

  it('yields pending_action for write tools when no agent is configured', async () => {
    const writeTool: Tool = buildTool({
      name: 'save_deposit',
      description: 'Save USDC',
      inputSchema: z.object({ amount: z.number() }),
      jsonSchema: {
        type: 'object',
        properties: { amount: { type: 'number' } },
        required: ['amount'],
      },
      isReadOnly: false,
      permissionLevel: 'confirm',
      async call(input) {
        return { data: { success: true, amount: input.amount } };
      },
    });

    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'tc-1', name: 'save_deposit', input: { amount: 1 } }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [writeTool],
      systemPrompt: 'Test',
      priceCache: new Map([['SUI', 3.5], ['USDC', 1]]),
      permissionConfig: {
        globalAutoBelow: 10,
        autonomousDailyLimit: 200,
        rules: [{ operation: 'save' as const, autoBelow: 50, confirmBetween: 1000 }],
      },
    });

    const events = await collectEvents(engine.submitMessage('Save $1'));

    const pendingActions = events.filter((e) => e.type === 'pending_action');
    expect(pendingActions).toHaveLength(1);

    const toolResults = events.filter((e) => e.type === 'tool_result' && !e.isError);
    expect(toolResults).toHaveLength(0);
  });

  it('can reset conversation state', async () => {
    const provider = createMockProvider([
      [{ type: 'text', text: 'Hi' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [],
      systemPrompt: 'Test',
    });

    await collectEvents(engine.submitMessage('Hello'));
    expect(engine.getMessages().length).toBeGreaterThan(0);

    engine.reset();
    expect(engine.getMessages()).toHaveLength(0);
    expect(engine.getUsage().inputTokens).toBe(0);
  });
});
