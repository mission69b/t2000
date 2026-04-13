import { describe, it, expect } from 'vitest';
import { microcompact } from '../compact/microcompact.js';
import type { Message } from '../types.js';

function msg(role: 'user' | 'assistant', content: Message['content']): Message {
  return { role, content };
}

describe('microcompact', () => {
  it('replaces duplicate tool_result with back-reference', () => {
    const messages: Message[] = [
      msg('user', [{ type: 'text', text: 'check balance' }]),
      msg('assistant', [
        { type: 'tool_use', id: 'tu1', name: 'balance_check', input: { asset: 'USDC' } },
      ]),
      msg('user', [
        { type: 'tool_result', toolUseId: 'tu1', content: '{"balance":100}' },
      ]),
      msg('assistant', [{ type: 'text', text: 'You have 100 USDC' }]),
      msg('user', [{ type: 'text', text: 'check again' }]),
      msg('assistant', [
        { type: 'tool_use', id: 'tu2', name: 'balance_check', input: { asset: 'USDC' } },
      ]),
      msg('user', [
        { type: 'tool_result', toolUseId: 'tu2', content: '{"balance":100}' },
      ]),
    ];

    const result = microcompact(messages);
    const lastToolResult = result[6].content[0];
    expect(lastToolResult.type).toBe('tool_result');
    if (lastToolResult.type === 'tool_result') {
      expect(lastToolResult.content).toContain('Same result as call #1');
      expect(lastToolResult.content).toContain('balance_check');
    }
  });

  it('keeps both results when inputs differ', () => {
    const messages: Message[] = [
      msg('assistant', [
        { type: 'tool_use', id: 'tu1', name: 'balance_check', input: { asset: 'USDC' } },
      ]),
      msg('user', [
        { type: 'tool_result', toolUseId: 'tu1', content: '{"balance":100}' },
      ]),
      msg('assistant', [
        { type: 'tool_use', id: 'tu2', name: 'balance_check', input: { asset: 'SUI' } },
      ]),
      msg('user', [
        { type: 'tool_result', toolUseId: 'tu2', content: '{"balance":50}' },
      ]),
    ];

    const result = microcompact(messages);
    const r1 = result[1].content[0];
    const r2 = result[3].content[0];
    if (r1.type === 'tool_result') expect(r1.content).toBe('{"balance":100}');
    if (r2.type === 'tool_result') expect(r2.content).toBe('{"balance":50}');
  });

  it('does not modify non-tool messages', () => {
    const messages: Message[] = [
      msg('user', [{ type: 'text', text: 'hello' }]),
      msg('assistant', [{ type: 'text', text: 'hi there' }]),
    ];

    const result = microcompact(messages);
    expect(result).toEqual(messages);
  });

  it('is idempotent', () => {
    const messages: Message[] = [
      msg('assistant', [
        { type: 'tool_use', id: 'tu1', name: 'balance_check', input: {} },
      ]),
      msg('user', [
        { type: 'tool_result', toolUseId: 'tu1', content: '{"balance":100}' },
      ]),
      msg('assistant', [
        { type: 'tool_use', id: 'tu2', name: 'balance_check', input: {} },
      ]),
      msg('user', [
        { type: 'tool_result', toolUseId: 'tu2', content: '{"balance":100}' },
      ]),
    ];

    const once = microcompact(messages);
    const twice = microcompact(once);
    expect(twice).toEqual(once);
  });

  it('does not replace error results', () => {
    const messages: Message[] = [
      msg('assistant', [
        { type: 'tool_use', id: 'tu1', name: 'balance_check', input: {} },
      ]),
      msg('user', [
        { type: 'tool_result', toolUseId: 'tu1', content: '{"error":"timeout"}', isError: true },
      ]),
      msg('assistant', [
        { type: 'tool_use', id: 'tu2', name: 'balance_check', input: {} },
      ]),
      msg('user', [
        { type: 'tool_result', toolUseId: 'tu2', content: '{"balance":100}' },
      ]),
    ];

    const result = microcompact(messages);
    const r1 = result[1].content[0];
    const r2 = result[3].content[0];
    if (r1.type === 'tool_result') expect(r1.content).toBe('{"error":"timeout"}');
    if (r2.type === 'tool_result') expect(r2.content).toBe('{"balance":100}');
  });

  it('does not mutate original messages', () => {
    const original: Message[] = [
      msg('assistant', [
        { type: 'tool_use', id: 'tu1', name: 'balance_check', input: {} },
      ]),
      msg('user', [
        { type: 'tool_result', toolUseId: 'tu1', content: '{"balance":100}' },
      ]),
      msg('assistant', [
        { type: 'tool_use', id: 'tu2', name: 'balance_check', input: {} },
      ]),
      msg('user', [
        { type: 'tool_result', toolUseId: 'tu2', content: '{"balance":100}' },
      ]),
    ];

    const contentBefore = original[3].content[0];
    microcompact(original);
    expect(original[3].content[0]).toBe(contentBefore);
  });

  it('handles input key ordering differences', () => {
    const messages: Message[] = [
      msg('assistant', [
        { type: 'tool_use', id: 'tu1', name: 'history', input: { limit: 10, asset: 'USDC' } },
      ]),
      msg('user', [
        { type: 'tool_result', toolUseId: 'tu1', content: '{"txs":[]}' },
      ]),
      msg('assistant', [
        { type: 'tool_use', id: 'tu2', name: 'history', input: { asset: 'USDC', limit: 10 } },
      ]),
      msg('user', [
        { type: 'tool_result', toolUseId: 'tu2', content: '{"txs":[]}' },
      ]),
    ];

    const result = microcompact(messages);
    const r2 = result[3].content[0];
    if (r2.type === 'tool_result') {
      expect(r2.content).toContain('Same result as call #1');
    }
  });

  it('returns empty array for empty input', () => {
    expect(microcompact([])).toEqual([]);
  });
});
