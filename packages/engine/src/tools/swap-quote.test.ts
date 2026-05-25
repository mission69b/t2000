import { describe, expect, it } from 'vitest';
import { swapQuoteTool } from './swap-quote.js';
import { microcompact } from '../compact/microcompact.js';
import type { Message } from '../types.js';

import { legacyToolView } from '../__tests__/_helpers/call-tool-body.js';

const swapQuoteView = legacyToolView(swapQuoteTool, 'swap_quote');
function msg(role: 'user' | 'assistant', content: Message['content']): Message {
  return { role, content };
}

describe('swap_quote tool — cacheable: false contract', () => {
  // [SPEC 20.2 / D-1 (a) follow-on, 2026-05-10] Pin the cacheable flag.
  // The bundle fast-path in audric (lib/engine/fast-path-bundle.ts) reads
  // `swap_quote` results out of the persisted message ledger to thread
  // `step.cetusRoute` into the bundle PendingAction. If swap_quote ever
  // flips back to cacheable:true (or default), microcompact will replace
  // the bundle-turn quote's result with a back-reference placeholder; the
  // walker then can only recover the first-seen anchor (often the FIRST
  // single swap of the session, well past audric's 30s `isCetusRouteFresh`
  // gate) and the bundle fast path silently regresses to a fresh
  // `findSwapRoute()` round-trip at confirm time (~400-500ms penalty).
  //
  // Regression history: production smoke 2026-05-10, session
  // s_1778362657811_c0ed9009a5fb. See the comment block in swap-quote.ts.
  it('declares cacheable: false on the tool config', () => {
    expect(swapQuoteView.cacheable).toBe(false);
  });

  it('microcompact preserves every identical-input swap_quote tool_result', () => {
    // Reproduces the exact failure mode: the bundle plan's swap_quote runs
    // with identical input to the prior single swap's swap_quote. Without
    // cacheable:false on swap_quote, msg[3] (bundle plan quote) would be
    // replaced with a back-reference placeholder pointing at msg[1] (the
    // single swap's quote, ~52s older), and the audric walker would lose
    // the only fresh route in the ledger.
    // [P4.1 / v3.0.0 / 2026-05-25] microcompact() no longer takes a
    // tools arg — cacheability is resolved from the central
    // TOOL_POLICY by tool name. `swapQuoteTool` import is kept for
    // its side effect of registering the policy at module load.
    void swapQuoteTool;
    const messages: Message[] = [
      msg('assistant', [
        {
          type: 'tool_use',
          id: 'q1',
          name: 'swap_quote',
          input: { from: 'USDC', to: 'SUI', amount: 0.5 },
        },
      ]),
      msg('user', [
        {
          type: 'tool_result',
          toolUseId: 'q1',
          content: '{"serializedRoute":{"route":"OBRIC","discoveredAt":1000}}',
        },
      ]),
      msg('assistant', [
        {
          type: 'tool_use',
          id: 'q2',
          name: 'swap_quote',
          input: { from: 'USDC', to: 'SUI', amount: 0.5 },
        },
      ]),
      msg('user', [
        {
          type: 'tool_result',
          toolUseId: 'q2',
          content: '{"serializedRoute":{"route":"CETUS","discoveredAt":2000}}',
        },
      ]),
    ];

    const result = microcompact(messages);

    const r1 = result[1].content[0];
    const r2 = result[3].content[0];
    if (r1.type === 'tool_result') {
      expect(r1.content).toBe('{"serializedRoute":{"route":"OBRIC","discoveredAt":1000}}');
    }
    if (r2.type === 'tool_result') {
      expect(r2.content).toBe('{"serializedRoute":{"route":"CETUS","discoveredAt":2000}}');
    }
    expect(result.dedupedToolUseIds.has('q2')).toBe(false);
  });
});
