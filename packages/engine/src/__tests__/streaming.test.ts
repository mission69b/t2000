import { describe, it, expect } from 'vitest';
import {
  serializeSSE,
  parseSSE,
  engineToSSE,
} from '../streaming.js';
import type { EngineEvent, SSEEvent } from '../index.js';

describe('serializeSSE', () => {
  it('serialises a text_delta event', () => {
    const sse = serializeSSE({ type: 'text_delta', text: 'Hello' });
    expect(sse).toBe('event: text_delta\ndata: {"type":"text_delta","text":"Hello"}\n\n');
  });

  it('serialises a pending_action event', () => {
    const sse = serializeSSE({
      type: 'pending_action',
      action: {
        toolName: 'send_transfer',
        toolUseId: 'tc-1',
        input: { to: '0xabc', amount: 50 },
        description: 'Send $50 to 0xabc',
        assistantContent: [{ type: 'tool_use', id: 'tc-1', name: 'send_transfer', input: { to: '0xabc', amount: 50 } }],
        turnIndex: 0,
        attemptId: '00000000-0000-4000-8000-000000000001',
      },
    });
    expect(sse).toContain('event: pending_action');
    expect(sse).toContain('"toolName":"send_transfer"');
  });

  it('serialises an error event with message string', () => {
    const sse = serializeSSE({ type: 'error', message: 'Something broke' });
    expect(sse).toContain('"message":"Something broke"');
  });
});

describe('parseSSE', () => {
  it('parses a serialised SSE event', () => {
    const raw = 'event: text_delta\ndata: {"type":"text_delta","text":"Hi"}\n\n';
    const parsed = parseSSE(raw);
    expect(parsed).toEqual({ type: 'text_delta', text: 'Hi' });
  });

  it('returns null for malformed input', () => {
    expect(parseSSE('garbage')).toBeNull();
    expect(parseSSE('data: not-json')).toBeNull();
  });

  it('roundtrips through serialize → parse', () => {
    const event: SSEEvent = {
      type: 'tool_result',
      toolName: 'balance_check',
      toolUseId: 'tc-1',
      result: { available: 100 },
      isError: false,
    };
    const parsed = parseSSE(serializeSSE(event));
    expect(parsed).toEqual(event);
  });
});

describe('engineToSSE', () => {
  it('converts engine events to SSE strings', async () => {
    async function* fakeEngine(): AsyncGenerator<EngineEvent> {
      yield { type: 'text_delta', text: 'Hello' };
      yield { type: 'turn_complete', stopReason: 'end_turn' };
    }

    const chunks: string[] = [];
    for await (const chunk of engineToSSE(fakeEngine())) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain('text_delta');
    expect(chunks[1]).toContain('turn_complete');
  });

  it('serialises pending_action events directly', async () => {
    async function* fakeEngine(): AsyncGenerator<EngineEvent> {
      yield {
        type: 'pending_action',
        action: {
          toolName: 'send_transfer',
          toolUseId: 'tc-1',
          input: { to: '0x1', amount: 10 },
          description: 'Send $10',
          assistantContent: [{ type: 'tool_use', id: 'tc-1', name: 'send_transfer', input: { to: '0x1', amount: 10 } }],
          turnIndex: 0,
          attemptId: '00000000-0000-4000-8000-000000000002',
        },
      };
    }

    const chunks: string[] = [];
    for await (const chunk of engineToSSE(fakeEngine())) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('pending_action');
    expect(chunks[0]).toContain('send_transfer');
  });

  it('passes through usage events', async () => {
    async function* fakeEngine(): AsyncGenerator<EngineEvent> {
      yield { type: 'usage', inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5 };
    }

    const chunks: string[] = [];
    for await (const chunk of engineToSSE(fakeEngine())) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    const parsed = parseSSE(chunks[0]);
    expect(parsed).toEqual({
      type: 'usage',
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
    });
  });

  it('passes through tool_start and tool_result events', async () => {
    async function* fakeEngine(): AsyncGenerator<EngineEvent> {
      yield { type: 'tool_start', toolName: 'balance_check', toolUseId: 'tc-1', input: {} };
      yield { type: 'tool_result', toolName: 'balance_check', toolUseId: 'tc-1', result: { balance: 100 }, isError: false };
    }

    const chunks: string[] = [];
    for await (const chunk of engineToSSE(fakeEngine())) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(parseSSE(chunks[0])?.type).toBe('tool_start');
    expect(parseSSE(chunks[1])?.type).toBe('tool_result');
  });

  it('converts Error objects to message strings', async () => {
    async function* fakeEngine(): AsyncGenerator<EngineEvent> {
      yield { type: 'error', error: new Error('Network failure') };
    }

    const chunks: string[] = [];
    for await (const chunk of engineToSSE(fakeEngine())) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    const parsed = parseSSE(chunks[0]);
    expect(parsed?.type).toBe('error');
    if (parsed?.type === 'error') {
      expect(parsed.message).toBe('Network failure');
    }
  });

  it('passes through proactive_text events with all fields preserved', async () => {
    async function* fakeEngine(): AsyncGenerator<EngineEvent> {
      yield {
        type: 'proactive_text',
        proactiveType: 'idle_balance',
        subjectKey: 'USDC',
        body: 'You have $120 USDC sitting idle.',
        suppressed: false,
        markerCount: 1,
      };
    }

    const chunks: string[] = [];
    for await (const chunk of engineToSSE(fakeEngine())) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    const parsed = parseSSE(chunks[0]);
    expect(parsed).toEqual({
      type: 'proactive_text',
      proactiveType: 'idle_balance',
      subjectKey: 'USDC',
      body: 'You have $120 USDC sitting idle.',
      suppressed: false,
      markerCount: 1,
    });
  });

  it('passes through suppressed proactive_text events (cooldown hit)', async () => {
    async function* fakeEngine(): AsyncGenerator<EngineEvent> {
      yield {
        type: 'proactive_text',
        proactiveType: 'hf_warning',
        subjectKey: '1.45',
        body: 'Your HF dropped below 1.5.',
        suppressed: true,
        markerCount: 1,
      };
    }

    const chunks: string[] = [];
    for await (const chunk of engineToSSE(fakeEngine())) {
      chunks.push(chunk);
    }
    const parsed = parseSSE(chunks[0]);
    if (parsed?.type === 'proactive_text') {
      expect(parsed.suppressed).toBe(true);
      expect(parsed.proactiveType).toBe('hf_warning');
    }
  });
});
