// ───────────────────────────────────────────────────────────────────────────
// SPEC 19 v1.24.13 / SPEC 21.2 v1.27.0 — strip-pseudo-thinking unit tests
//
// Pinned cases:
//   1.  Strips paired `<thinking>…</thinking>` (SPEC 19 baseline).
//   2.  Strips unterminated `<thinking>` running to EOF (truncated stream).
//   3.  Preserves text content with no thinking markup.
//   4.  Preserves non-text blocks (`thinking`, `tool_use`) untouched.
//   5.  Injects `[narration omitted]` placeholder when stripping empties
//       the only text block (so role-alternation stays valid).
//   6.  [SPEC 21.2 / S19-F5] Strips orphan `</thinking>` at start of text.
//   7.  [SPEC 21.2 / S19-F5] Strips orphan `</thinking>` mid-text after
//       legitimate paired-block removal in pass 1.
//   8.  [SPEC 21.2] Multiple orphan closers in a row all stripped.
//   9.  [SPEC 21.2] Case-insensitive orphan strip (`</Thinking>`,
//       `</THINKING >`, etc).
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { stripPseudoThinking } from './strip-pseudo-thinking.js';
import type { ContentBlock } from './types.js';

function txt(text: string): ContentBlock {
  return { type: 'text', text };
}

describe('stripPseudoThinking — SPEC 19 baseline', () => {
  it('strips paired <thinking>…</thinking>', () => {
    const out = stripPseudoThinking([
      txt('Before. <thinking>secret reasoning here</thinking> After.'),
    ]);
    expect(out).toHaveLength(1);
    expect((out[0] as { text: string }).text).toBe('Before.  After.');
  });

  it('strips unterminated <thinking> running to EOF', () => {
    const out = stripPseudoThinking([
      txt('Visible prefix. <thinking>truncated stream lost the closer'),
    ]);
    expect(out).toHaveLength(1);
    expect((out[0] as { text: string }).text).toBe('Visible prefix.');
  });

  it('preserves text with no thinking markup', () => {
    const out = stripPseudoThinking([txt('Just normal narration.')]);
    expect(out).toHaveLength(1);
    expect((out[0] as { text: string }).text).toBe('Just normal narration.');
  });

  it('preserves non-text blocks untouched', () => {
    const blocks: ContentBlock[] = [
      txt('hello'),
      // Native thinking block (should NEVER be stripped).
      { type: 'thinking', thinking: 'native reasoning', signature: 'sig123' } as ContentBlock,
      { type: 'tool_use', id: 'tu_1', name: 'foo', input: {} } as ContentBlock,
    ];
    const out = stripPseudoThinking(blocks);
    expect(out).toHaveLength(3);
    expect(out[1]).toEqual(blocks[1]);
    expect(out[2]).toEqual(blocks[2]);
  });

  it('injects [narration omitted] when stripping empties the only text block', () => {
    const out = stripPseudoThinking([txt('<thinking>only thinking, no narration</thinking>')]);
    expect(out).toHaveLength(1);
    expect((out[0] as { text: string }).text).toBe('[narration omitted]');
  });

  it('does NOT inject placeholder when other non-text blocks remain', () => {
    const out = stripPseudoThinking([
      txt('<thinking>only thinking</thinking>'),
      { type: 'tool_use', id: 'tu_1', name: 'foo', input: {} } as ContentBlock,
    ]);
    // The placeholder is only injected if `out.length === 0`. With a
    // surviving tool_use block, the assistant message is still valid.
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('tool_use');
  });
});

describe('stripPseudoThinking — SPEC 21.2 orphan </thinking> closer', () => {
  it('strips orphan </thinking> at start of text (S19-F5 reproducer)', () => {
    const out = stripPseudoThinking([
      txt('</thinking>Saved 10 USDC into NAVI.'),
    ]);
    expect(out).toHaveLength(1);
    expect((out[0] as { text: string }).text).toBe('Saved 10 USDC into NAVI.');
  });

  it('strips orphan </thinking> mid-text after pass 1 paired-block removal', () => {
    // Pass 1 removes <thinking>opener</thinking>. Pass 2 removes the
    // dangling </thinking> that was orphan from the start.
    const out = stripPseudoThinking([
      txt('Step 1: <thinking>plan</thinking> done.</thinking> Step 2.'),
    ]);
    expect(out).toHaveLength(1);
    expect((out[0] as { text: string }).text).toBe('Step 1:  done. Step 2.');
  });

  it('strips multiple orphan closers in a row', () => {
    const out = stripPseudoThinking([
      txt('</thinking></thinking></thinking>Final answer here.'),
    ]);
    expect(out).toHaveLength(1);
    expect((out[0] as { text: string }).text).toBe('Final answer here.');
  });

  it('strips orphan closers case-insensitively (</Thinking>, </THINKING >)', () => {
    const out = stripPseudoThinking([
      txt('</Thinking>Saved.</THINKING >Done.'),
    ]);
    expect(out).toHaveLength(1);
    expect((out[0] as { text: string }).text).toBe('Saved.Done.');
  });

  it('orphan-only text strips to placeholder', () => {
    const out = stripPseudoThinking([txt('</thinking>')]);
    expect(out).toHaveLength(1);
    expect((out[0] as { text: string }).text).toBe('[narration omitted]');
  });

  it('is idempotent — running twice produces the same result', () => {
    const blocks = [txt('</thinking><thinking>x</thinking>real text')];
    const once = stripPseudoThinking(blocks);
    const twice = stripPseudoThinking(once);
    expect(twice).toEqual(once);
  });
});
