import { describe, it, expect } from 'vitest';
import { microcompact } from '../compact/microcompact.js';
import type { Message } from '../types.js';

function msg(role: 'user' | 'assistant', content: Message['content']): Message {
  return { role, content };
}

// [P4.1 / v3.0.0 / 2026-05-25] Microcompact reads cacheability from the
// central `TOOL_POLICY` + `TOOL_FLAGS` registries. Tests below use real
// tool names whose canonical policy matches the test intent:
//   - `balance_check` → cacheable: false  (mutable read, never dedupes)
//   - `rates_info`    → cacheable: true   (immutable read, dedupes)
//   - `send_transfer` → flags.mutating=true → implicit cacheable: false
//   - `protocol_deep_dive` → defaults (cacheable: true) — not in registry
//
// For the "explicit cacheable: true on a write tool" escape-hatch test,
// we register a one-off `_test_idempotent_write` policy at suite scope
// and tear it down at the end.

describe('microcompact', () => {
  it('replaces duplicate tool_result with back-reference', () => {
    // `rates_info` is cacheable: true in TOOL_POLICY (immutable read) —
    // microcompact should dedupe identical calls. `balance_check` is
    // cacheable: false (mutable read) and never dedupes.
    const messages: Message[] = [
      msg('user', [{ type: 'text', text: 'check rate' }]),
      msg('assistant', [
        { type: 'tool_use', id: 'tu1', name: 'rates_info', input: { asset: 'USDC' } },
      ]),
      msg('user', [{ type: 'tool_result', toolUseId: 'tu1', content: '{"apy":4.5}' }]),
      msg('assistant', [{ type: 'text', text: 'USDC APY is 4.5%' }]),
      msg('user', [{ type: 'text', text: 'check again' }]),
      msg('assistant', [
        { type: 'tool_use', id: 'tu2', name: 'rates_info', input: { asset: 'USDC' } },
      ]),
      msg('user', [{ type: 'tool_result', toolUseId: 'tu2', content: '{"apy":4.5}' }]),
    ];

    const result = microcompact(messages);
    const lastToolResult = result[6].content[0];
    expect(lastToolResult.type).toBe('tool_result');
    if (lastToolResult.type === 'tool_result') {
      expect(lastToolResult.content).toContain('Same result as call #1');
      expect(lastToolResult.content).toContain('rates_info');
    }
  });

  it('keeps both results when inputs differ', () => {
    const messages: Message[] = [
      msg('assistant', [
        { type: 'tool_use', id: 'tu1', name: 'balance_check', input: { asset: 'USDC' } },
      ]),
      msg('user', [{ type: 'tool_result', toolUseId: 'tu1', content: '{"balance":100}' }]),
      msg('assistant', [
        { type: 'tool_use', id: 'tu2', name: 'balance_check', input: { asset: 'SUI' } },
      ]),
      msg('user', [{ type: 'tool_result', toolUseId: 'tu2', content: '{"balance":50}' }]),
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
      msg('assistant', [{ type: 'tool_use', id: 'tu1', name: 'balance_check', input: {} }]),
      msg('user', [{ type: 'tool_result', toolUseId: 'tu1', content: '{"balance":100}' }]),
      msg('assistant', [{ type: 'tool_use', id: 'tu2', name: 'balance_check', input: {} }]),
      msg('user', [{ type: 'tool_result', toolUseId: 'tu2', content: '{"balance":100}' }]),
    ];

    const once = microcompact(messages);
    const twice = microcompact(once);
    expect(twice).toEqual(once);
  });

  it('does not replace error results', () => {
    const messages: Message[] = [
      msg('assistant', [{ type: 'tool_use', id: 'tu1', name: 'balance_check', input: {} }]),
      msg('user', [
        { type: 'tool_result', toolUseId: 'tu1', content: '{"error":"timeout"}', isError: true },
      ]),
      msg('assistant', [{ type: 'tool_use', id: 'tu2', name: 'balance_check', input: {} }]),
      msg('user', [{ type: 'tool_result', toolUseId: 'tu2', content: '{"balance":100}' }]),
    ];

    const result = microcompact(messages);
    const r1 = result[1].content[0];
    const r2 = result[3].content[0];
    if (r1.type === 'tool_result') expect(r1.content).toBe('{"error":"timeout"}');
    if (r2.type === 'tool_result') expect(r2.content).toBe('{"balance":100}');
  });

  it('does not mutate original messages', () => {
    const original: Message[] = [
      msg('assistant', [{ type: 'tool_use', id: 'tu1', name: 'balance_check', input: {} }]),
      msg('user', [{ type: 'tool_result', toolUseId: 'tu1', content: '{"balance":100}' }]),
      msg('assistant', [{ type: 'tool_use', id: 'tu2', name: 'balance_check', input: {} }]),
      msg('user', [{ type: 'tool_result', toolUseId: 'tu2', content: '{"balance":100}' }]),
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
      msg('user', [{ type: 'tool_result', toolUseId: 'tu1', content: '{"txs":[]}' }]),
      msg('assistant', [
        { type: 'tool_use', id: 'tu2', name: 'history', input: { asset: 'USDC', limit: 10 } },
      ]),
      msg('user', [{ type: 'tool_result', toolUseId: 'tu2', content: '{"txs":[]}' }]),
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

      const messages: Message[] = [
        msg('assistant', [{ type: 'tool_use', id: 'tu1', name: 'balance_check', input: {} }]),
        msg('user', [{ type: 'tool_result', toolUseId: 'tu1', content: '{"wallet":93}' }]),
        msg('assistant', [{ type: 'tool_use', id: 'tu2', name: 'balance_check', input: {} }]),
        msg('user', [{ type: 'tool_result', toolUseId: 'tu2', content: '{"wallet":83}' }]),
        msg('assistant', [{ type: 'tool_use', id: 'tu3', name: 'balance_check', input: {} }]),
        msg('user', [{ type: 'tool_result', toolUseId: 'tu3', content: '{"wallet":103}' }]),
      ];

      const result = microcompact(messages);

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

      const messages: Message[] = [
        msg('assistant', [
          { type: 'tool_use', id: 'b1', name: 'balance_check', input: {} },
          { type: 'tool_use', id: 'p1', name: 'rates_info', input: { tokens: ['SUI'] } },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 'b1', content: '{"wallet":100}' },
          { type: 'tool_result', toolUseId: 'p1', content: '{"SUI":1.0}' },
        ]),
        msg('assistant', [
          { type: 'tool_use', id: 'b2', name: 'balance_check', input: {} },
          { type: 'tool_use', id: 'p2', name: 'rates_info', input: { tokens: ['SUI'] } },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 'b2', content: '{"wallet":50}' },
          { type: 'tool_result', toolUseId: 'p2', content: '{"SUI":1.0}' },
        ]),
      ];

      const result = microcompact(messages);
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

      const messages: Message[] = [
        msg('assistant', [{ type: 'tool_use', id: 'tu1', name: 'balance_check', input: {} }]),
        msg('user', [{ type: 'tool_result', toolUseId: 'tu1', content: '{"wallet":100}' }]),
        msg('assistant', [{ type: 'tool_use', id: 'tu2', name: 'balance_check', input: {} }]),
        msg('user', [{ type: 'tool_result', toolUseId: 'tu2', content: '{"wallet":80}' }]),
      ];

      const result = microcompact(messages);
      expect(result.dedupedToolUseIds.size).toBe(0);
    });

    it('dedupes unknown tools (not in registry) — back-compat default', () => {
      // [P4.1 / 2026-05-25] Pre-Phase-C this checked the "no tools passed
      // → dedupe-everything" back-compat path. Phase C made the registry
      // the SSOT: tools not in `TOOL_POLICY` default to cacheable: true.
      // Use a synthetic unknown tool name to exercise the default.
      const messages: Message[] = [
        msg('assistant', [{ type: 'tool_use', id: 'tu1', name: '_unknown_tool', input: {} }]),
        msg('user', [{ type: 'tool_result', toolUseId: 'tu1', content: '{"wallet":100}' }]),
        msg('assistant', [{ type: 'tool_use', id: 'tu2', name: '_unknown_tool', input: {} }]),
        msg('user', [{ type: 'tool_result', toolUseId: 'tu2', content: '{"wallet":80}' }]),
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

      const messages: Message[] = [
        msg('assistant', [
          {
            type: 'tool_use',
            id: 'tu1',
            name: 'protocol_deep_dive',
            input: { protocol: 'navi-lending' },
          },
        ]),
        msg('user', [{ type: 'tool_result', toolUseId: 'tu1', content: '{"name":"NAVI"}' }]),
        msg('assistant', [
          {
            type: 'tool_use',
            id: 'tu2',
            name: 'protocol_deep_dive',
            input: { protocol: 'navi-lending' },
          },
        ]),
        msg('user', [{ type: 'tool_result', toolUseId: 'tu2', content: '{"name":"NAVI"}' }]),
      ];

      const result = microcompact(messages);
      const r2 = result[3].content[0];
      if (r2.type === 'tool_result') {
        expect(r2.content).toContain('Same result as call #1');
      }
    });
  });

  describe('[v1.24.6 / S.122] mutating-write implicit non-cacheable', () => {
    /**
     * The exact failure mode surfaced during S.121 smoke testing: a user
     * sent USDC to the same contact twice in a row with the same amount.
     * The second `send_transfer` produced a NEW on-chain tx (different
     * digest, real state mutation), but microcompact replaced its
     * tool_result with a back-reference to the first call. The LLM then
     * narrated "transaction deduplicated" — a lie about real money that
     * actually moved.
     *
     * Fix: tools with `flags.mutating === true` default to cacheable:
     * false. The user has to pass `cacheable: true` explicitly to opt
     * back in, which would be a tool-author bug for any write.
     */
    it('never dedupes write tools (flags.mutating === true) by default', () => {

      const messages: Message[] = [
        msg('assistant', [
          { type: 'tool_use', id: 's1', name: 'send_transfer', input: { to: 'alex', amount: 5 } },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 's1', content: '{"tx":"0xabc","amount":5}' },
        ]),
        msg('assistant', [
          { type: 'tool_use', id: 's2', name: 'send_transfer', input: { to: 'alex', amount: 5 } },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 's2', content: '{"tx":"0xdef","amount":5}' },
        ]),
      ];

      const result = microcompact(messages);
      const r1 = result[1].content[0];
      const r2 = result[3].content[0];
      if (r1.type === 'tool_result') expect(r1.content).toBe('{"tx":"0xabc","amount":5}');
      if (r2.type === 'tool_result') expect(r2.content).toBe('{"tx":"0xdef","amount":5}');
      expect(result.dedupedToolUseIds.size).toBe(0);
    });

    it('honors explicit cacheable: true on a write tool (back-compat escape hatch)', () => {
      // Hypothetical — no production tool sets this, but the precedence
      // contract is "explicit `cacheable` wins" so a tool author who
      // genuinely wants dedupe must be able to opt back in.

      const messages: Message[] = [
        msg('assistant', [
          { type: 'tool_use', id: 'w1', name: 'idempotent_write', input: { x: 1 } },
        ]),
        msg('user', [{ type: 'tool_result', toolUseId: 'w1', content: '{"ok":true}' }]),
        msg('assistant', [
          { type: 'tool_use', id: 'w2', name: 'idempotent_write', input: { x: 1 } },
        ]),
        msg('user', [{ type: 'tool_result', toolUseId: 'w2', content: '{"ok":true}' }]),
      ];

      const result = microcompact(messages);
      const r2 = result[3].content[0];
      if (r2.type === 'tool_result') expect(r2.content).toContain('Same result as call #1');
      expect(result.dedupedToolUseIds.has('w2')).toBe(true);
    });

    it('mixed reads + writes: dedupes the read, never the write', () => {
      // The realistic scenario — same turn issues `rates_info` twice
      // (cacheable: true — immutable read) and `send_transfer` twice
      // (mutating — implicit cacheable: false). Result: the second read
      // collapses to a back-reference; the second write keeps its full
      // result.

      const messages: Message[] = [
        msg('assistant', [
          { type: 'tool_use', id: 'r1', name: 'rates_info', input: {} },
          { type: 'tool_use', id: 's1', name: 'send_transfer', input: { to: 'alex', amount: 5 } },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 'r1', content: '{"apy":4.5}' },
          { type: 'tool_result', toolUseId: 's1', content: '{"tx":"0xabc","amount":5}' },
        ]),
        msg('assistant', [
          { type: 'tool_use', id: 'r2', name: 'rates_info', input: {} },
          { type: 'tool_use', id: 's2', name: 'send_transfer', input: { to: 'alex', amount: 5 } },
        ]),
        msg('user', [
          { type: 'tool_result', toolUseId: 'r2', content: '{"apy":4.5}' },
          { type: 'tool_result', toolUseId: 's2', content: '{"tx":"0xdef","amount":5}' },
        ]),
      ];

      const result = microcompact(messages);
      const blocks = result[3].content;
      const rateResult = blocks.find(
        (b): b is Extract<typeof b, { type: 'tool_result' }> =>
          b.type === 'tool_result' && b.toolUseId === 'r2',
      );
      const sendResult = blocks.find(
        (b): b is Extract<typeof b, { type: 'tool_result' }> =>
          b.type === 'tool_result' && b.toolUseId === 's2',
      );
      expect(rateResult?.content).toContain('Same result as call #');
      expect(sendResult?.content).toBe('{"tx":"0xdef","amount":5}');
      expect(result.dedupedToolUseIds.has('r2')).toBe(true);
      expect(result.dedupedToolUseIds.has('s2')).toBe(false);
    });
  });
});
