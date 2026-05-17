// ---------------------------------------------------------------------------
// memory/extract-user-message.test.ts — Phase 7 query-source invariants
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { extractLatestUserMessage } from './extract-user-message.js';
import type { ModelMessage } from 'ai';

describe('extractLatestUserMessage', () => {
  it('returns empty string for empty messages array', () => {
    expect(extractLatestUserMessage([])).toBe('');
  });

  it('returns empty string when no user message exists', () => {
    const msgs: ModelMessage[] = [
      { role: 'system', content: 'you are a helpful agent' },
      { role: 'assistant', content: 'hello' },
    ];
    expect(extractLatestUserMessage(msgs)).toBe('');
  });

  it('returns the latest user message (string content)', () => {
    const msgs: ModelMessage[] = [
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'second question' },
    ];
    expect(extractLatestUserMessage(msgs)).toBe('second question');
  });

  it('returns the latest user message (parts array content)', () => {
    const msgs: ModelMessage[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'parts-shaped question' }],
      },
    ];
    expect(extractLatestUserMessage(msgs)).toBe('parts-shaped question');
  });

  it('concatenates multiple text parts with a space', () => {
    const msgs: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'first' },
          { type: 'text', text: 'second' },
          { type: 'text', text: 'third' },
        ],
      },
    ];
    expect(extractLatestUserMessage(msgs)).toBe('first second third');
  });

  it('filters out non-text parts (image / file)', () => {
    const msgs: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'visual query' },
          // Image part — AI SDK accepts the shape; we only extract text.
          { type: 'image', image: 'base64...' },
        ],
      },
    ];
    expect(extractLatestUserMessage(msgs)).toBe('visual query');
  });

  it('skips tool-role messages (those are engine results, not user queries)', () => {
    const msgs: ModelMessage[] = [
      { role: 'user', content: 'real query' },
      { role: 'assistant', content: 'thinking...' },
      // Tool messages are AI SDK v6 split-out results; not user-typed.
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tc1',
            toolName: 'fake',
            output: { type: 'text', value: 'ok' },
          },
        ],
      },
    ];
    expect(extractLatestUserMessage(msgs)).toBe('real query');
  });

  it('skips assistant-role messages even when they contain "user-like" text', () => {
    const msgs: ModelMessage[] = [
      { role: 'user', content: 'the real query' },
      { role: 'assistant', content: 'I think the user wants USDC' },
    ];
    expect(extractLatestUserMessage(msgs)).toBe('the real query');
  });

  it('returns empty string when latest user message has no text parts', () => {
    const msgs: ModelMessage[] = [
      {
        role: 'user',
        content: [{ type: 'image', image: 'base64...' }],
      },
    ];
    expect(extractLatestUserMessage(msgs)).toBe('');
  });

  it('trims surrounding whitespace from concatenated parts', () => {
    const msgs: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: '   ' },
          { type: 'text', text: 'core' },
          { type: 'text', text: '   ' },
        ],
      },
    ];
    expect(extractLatestUserMessage(msgs)).toBe('core');
  });
});
