import { describe, it, expect } from 'vitest';
import {
  serializeSSE,
  parseSSE,
  PermissionBridge,
  engineToSSE,
} from '../streaming.js';
import type { EngineEvent, SSEEvent } from '../index.js';

describe('serializeSSE', () => {
  it('serialises a text_delta event', () => {
    const sse = serializeSSE({ type: 'text_delta', text: 'Hello' });
    expect(sse).toBe('event: text_delta\ndata: {"type":"text_delta","text":"Hello"}\n\n');
  });

  it('serialises a permission_request with permissionId', () => {
    const sse = serializeSSE({
      type: 'permission_request',
      permissionId: 'perm_1',
      toolName: 'send_transfer',
      toolUseId: 'tc-1',
      input: { to: '0xabc', amount: 50 },
      description: 'Send $50 to 0xabc',
    });
    expect(sse).toContain('event: permission_request');
    expect(sse).toContain('"permissionId":"perm_1"');
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

describe('PermissionBridge', () => {
  it('registers and resolves permissions', () => {
    const bridge = new PermissionBridge();
    let result: boolean | null = null;

    const id = bridge.register((approved) => { result = approved; });
    expect(bridge.size).toBe(1);

    const found = bridge.resolve(id, true);
    expect(found).toBe(true);
    expect(result).toBe(true);
    expect(bridge.size).toBe(0);
  });

  it('returns false for unknown permission IDs', () => {
    const bridge = new PermissionBridge();
    expect(bridge.resolve('nonexistent', true)).toBe(false);
  });

  it('rejects all pending permissions on rejectAll', () => {
    const bridge = new PermissionBridge();
    const results: boolean[] = [];

    bridge.register((v) => results.push(v));
    bridge.register((v) => results.push(v));
    bridge.register((v) => results.push(v));

    expect(bridge.size).toBe(3);
    bridge.rejectAll();

    expect(results).toEqual([false, false, false]);
    expect(bridge.size).toBe(0);
  });

  it('generates unique permission IDs', () => {
    const bridge = new PermissionBridge();
    const id1 = bridge.register(() => {});
    const id2 = bridge.register(() => {});
    expect(id1).not.toBe(id2);
  });
});

describe('engineToSSE', () => {
  it('converts engine events to SSE strings', async () => {
    async function* fakeEngine(): AsyncGenerator<EngineEvent> {
      yield { type: 'text_delta', text: 'Hello' };
      yield { type: 'turn_complete', stopReason: 'end_turn' };
    }

    const bridge = new PermissionBridge();
    const chunks: string[] = [];
    for await (const chunk of engineToSSE(fakeEngine(), bridge)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain('text_delta');
    expect(chunks[1]).toContain('turn_complete');
  });

  it('routes permission_request through the bridge', async () => {
    let _capturedResolve: ((v: boolean) => void) | null = null;

    async function* fakeEngine(): AsyncGenerator<EngineEvent> {
      yield {
        type: 'permission_request',
        toolName: 'send_transfer',
        toolUseId: 'tc-1',
        input: { to: '0x1', amount: 10 },
        description: 'Send $10',
        resolve: (v: boolean) => { _capturedResolve = () => v; },
      };
    }

    const bridge = new PermissionBridge();
    const chunks: string[] = [];
    for await (const chunk of engineToSSE(fakeEngine(), bridge)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('permission_request');
    expect(chunks[0]).toContain('perm_');
    expect(bridge.size).toBe(1);
  });

  it('passes through usage events', async () => {
    async function* fakeEngine(): AsyncGenerator<EngineEvent> {
      yield { type: 'usage', inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5 };
    }

    const bridge = new PermissionBridge();
    const chunks: string[] = [];
    for await (const chunk of engineToSSE(fakeEngine(), bridge)) {
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

    const bridge = new PermissionBridge();
    const chunks: string[] = [];
    for await (const chunk of engineToSSE(fakeEngine(), bridge)) {
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

    const bridge = new PermissionBridge();
    const chunks: string[] = [];
    for await (const chunk of engineToSSE(fakeEngine(), bridge)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    const parsed = parseSSE(chunks[0]);
    expect(parsed?.type).toBe('error');
    if (parsed?.type === 'error') {
      expect(parsed.message).toBe('Network failure');
    }
  });
});
