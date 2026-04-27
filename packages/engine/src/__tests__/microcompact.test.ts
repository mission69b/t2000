import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { microcompact } from '../compact/microcompact.js';
import { buildTool } from '../tool.js';
import type { Message, Tool } from '../types.js';

function msg(role: 'user' | 'assistant', content: Message['content']): Message {
  return { role, content };
}

/**
 * [v1.5.1] Helper to spin up a minimal Tool for the cacheable-flag tests.
 * The `call` is never invoked — microcompact only inspects metadata.
 */
function fakeTool(name: string, cacheable?: boolean): Tool {
  return buildTool({
    name,
    description: `${name} (test)`,
    inputSchema: z.object({}).passthrough(),
    jsonSchema: { type: 'object', properties: {}, required: [] },
    cacheable,
    async call() {
      throw new Error('not invoked');
    },
  });
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

  describe('[v1.5.1] cacheable flag', () => {
    /**
     * The exact failure mode the user reported: three identical-input
     * `balance_check` calls (session prefetch + two post-write refreshes)
     * collapsing to a single back-reference, leaving the LLM with no
     * fresh state and forcing it to do snapshot-arithmetic.
     */
    it('never dedupes calls to a tool marked cacheable: false', () => {
      const tools = [fakeTool('balance_check', false)];
      const messages: Message[] = [
        msg('assistant', [
          { type: 'tool_use', id: 'tu1', name: 'balance_check', input: {} },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 'tu1', content: '{"wallet":93}' },
        ]),
        msg('assistant', [
          { type: 'tool_use', id: 'tu2', name: 'balance_check', input: {} },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 'tu2', content: '{"wallet":83}' },
        ]),
        msg('assistant', [
          { type: 'tool_use', id: 'tu3', name: 'balance_check', input: {} },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 'tu3', content: '{"wallet":103}' },
        ]),
      ];

      const result = microcompact(messages, tools);

      const r1 = result[1].content[0];
      const r2 = result[3].content[0];
      const r3 = result[5].content[0];
      if (r1.type === 'tool_result') expect(r1.content).toBe('{"wallet":93}');
      if (r2.type === 'tool_result') expect(r2.content).toBe('{"wallet":83}');
      if (r3.type === 'tool_result') expect(r3.content).toBe('{"wallet":103}');
      expect(result.dedupedToolUseIds.size).toBe(0);
    });

    it('still dedupes other tools when only some are non-cacheable', () => {
      // [v1.4 — Day 2] `balance_check` non-cacheable, `token_prices`
      // cacheable. The latter replaces the deleted `defillama_token_prices`
      // fixture used pre-v1.4 — same semantics (multi-token spot prices,
      // safe to dedupe inside a turn) just BlockVision-backed now.
      const tools = [
        fakeTool('balance_check', false),
        fakeTool('token_prices'),
      ];
      const messages: Message[] = [
        msg('assistant', [
          { type: 'tool_use', id: 'b1', name: 'balance_check', input: {} },
          { type: 'tool_use', id: 'p1', name: 'token_prices', input: { tokens: ['SUI'] } },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 'b1', content: '{"wallet":100}' },
          { type: 'tool_result', toolUseId: 'p1', content: '{"SUI":1.0}' },
        ]),
        msg('assistant', [
          { type: 'tool_use', id: 'b2', name: 'balance_check', input: {} },
          { type: 'tool_use', id: 'p2', name: 'token_prices', input: { tokens: ['SUI'] } },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 'b2', content: '{"wallet":50}' },
          { type: 'tool_result', toolUseId: 'p2', content: '{"SUI":1.0}' },
        ]),
      ];

      const result = microcompact(messages, tools);
      const blocks = result[3].content;
      const balanceResult = blocks.find(
        (b): b is Extract<typeof b, { type: 'tool_result' }> =>
          b.type === 'tool_result' && b.toolUseId === 'b2',
      );
      const priceResult = blocks.find(
        (b): b is Extract<typeof b, { type: 'tool_result' }> =>
          b.type === 'tool_result' && b.toolUseId === 'p2',
      );

      expect(balanceResult?.content).toBe('{"wallet":50}');
      expect(priceResult?.content).toContain('Same result as call #');
      expect(result.dedupedToolUseIds.has('b2')).toBe(false);
      expect(result.dedupedToolUseIds.has('p2')).toBe(true);
    });

    /**
     * Subtle correctness check: a non-cacheable call must not pollute
     * the `seen` map. Otherwise a later cacheable call with the same
     * key would dedupe against it and lose freshness.
     */
    it('non-cacheable calls do not register in the seen map', () => {
      // This scenario is hypothetical — same tool name appearing both
      // cacheable and not is unusual in practice — but it exercises the
      // contract that microcompact treats non-cacheable rows as
      // pass-through, never as dedupe anchors.
      const tools = [fakeTool('balance_check', false)];
      const messages: Message[] = [
        msg('assistant', [
          { type: 'tool_use', id: 'tu1', name: 'balance_check', input: {} },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 'tu1', content: '{"wallet":100}' },
        ]),
        msg('assistant', [
          { type: 'tool_use', id: 'tu2', name: 'balance_check', input: {} },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 'tu2', content: '{"wallet":80}' },
        ]),
      ];

      const result = microcompact(messages, tools);
      expect(result.dedupedToolUseIds.size).toBe(0);
    });

    it('falls back to dedupe-everything behavior when no tools array is passed (back-compat)', () => {
      // No tools registry — every tool is treated as cacheable, so the
      // pre-v1.5.1 dedupe behavior is preserved for legacy hosts.
      const messages: Message[] = [
        msg('assistant', [
          { type: 'tool_use', id: 'tu1', name: 'balance_check', input: {} },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 'tu1', content: '{"wallet":100}' },
        ]),
        msg('assistant', [
          { type: 'tool_use', id: 'tu2', name: 'balance_check', input: {} },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 'tu2', content: '{"wallet":80}' },
        ]),
      ];

      const result = microcompact(messages);
      const r2 = result[3].content[0];
      if (r2.type === 'tool_result') {
        expect(r2.content).toContain('Same result as call #');
      }
    });

    it('cacheable: true (explicit) behaves like default — dedupes', () => {
      // [v1.4 — Day 3] Was `defillama_yield_pools` pre-Day-3; that tool
      // is gone. `protocol_deep_dive` is the closest surviving stand-in
      // — same idempotent shape (slug → metadata snapshot), still
      // cacheable: true, kept across the deletion pass.
      const tools = [fakeTool('protocol_deep_dive', true)];
      const messages: Message[] = [
        msg('assistant', [
          { type: 'tool_use', id: 'tu1', name: 'protocol_deep_dive', input: { protocol: 'navi-lending' } },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 'tu1', content: '{"name":"NAVI"}' },
        ]),
        msg('assistant', [
          { type: 'tool_use', id: 'tu2', name: 'protocol_deep_dive', input: { protocol: 'navi-lending' } },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 'tu2', content: '{"name":"NAVI"}' },
        ]),
      ];

      const result = microcompact(messages, tools);
      const r2 = result[3].content[0];
      if (r2.type === 'tool_result') {
        expect(r2.content).toContain('Same result as call #1');
      }
    });
  });
});
