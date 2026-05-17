// ───────────────────────────────────────────────────────────────────────────
// validate-history.test.ts — Anthropic message-shape safety net
//
// Restored from the deleted QueryEngine in v2.0.5 (2026-05-17) after
// production session s_1778993279816_47a9814c835d hit Anthropic's
// strict-shape rejection on a fast-path bundle resume:
//
//   "messages.12.content.0: unexpected `tool_use_id` found in
//   `tool_result` blocks: fastpath_9066d766-..._0. Each `tool_result`
//   block must have a corresponding `tool_use` block in the previous
//   message."
//
// The production trace is the canonical regression in this file
// ("strips orphaned fastpath_* tool_result on bundle resume").
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { validateHistory } from './validate-history.js';
import type { Message } from '../types.js';

describe('validateHistory — Anthropic strict-shape enforcement', () => {
  // ─────────────────────────────────────────────────────────────────────
  // Production regression — the bug that birthed v2.0.5
  // ─────────────────────────────────────────────────────────────────────
  describe('production regression — fast-path bundle resume orphan', () => {
    it('strips orphaned `fastpath_*` tool_result blocks when the prior assistant message has no matching tool_use (session s_1778993279816_47a9814c835d)', () => {
      const corrupted: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'swap 2 SUI to USDC then save it' }] },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Quote: 2 SUI → 2.139 USDC. Compiling swap + save into one atomic Payment Intent now.',
            },
          ],
        },
        { role: 'user', content: [{ type: 'text', text: 'Confirm' }] },
        // Audric's fast-path dispatch loads a synthetic text-only
        // assistant message. NO tool_use blocks — this is the bug.
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Compiling the swap+save into one atomic Payment Intent now.',
            },
          ],
        },
        // Engine's bundle resume then pushes user(tool_results) with
        // fastpath_* IDs. The prior assistant message has NO matching
        // tool_use blocks → Anthropic rejects.
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolUseId: 'fastpath_9066d766-b495-4dd2-a795-1516f9047b7d_0',
              content: JSON.stringify({ success: true, tx: '42MLpbCp...1iUYiD' }),
              isError: false,
            },
            {
              type: 'tool_result',
              toolUseId: 'fastpath_9066d766-b495-4dd2-a795-1516f9047b7d_1',
              content: JSON.stringify({ success: true, tx: '42MLpbCp...1iUYiD' }),
              isError: false,
            },
          ],
        },
        // User asks the next question. THIS turn would also fail
        // because the prior orphan poisoned the entire history.
        { role: 'user', content: [{ type: 'text', text: 'withdraw all USDC' }] },
      ];

      const clean = validateHistory(corrupted);

      // The user message that contained ONLY orphan tool_results should
      // be removed entirely.
      const hasFastpathToolResult = clean.some((m) =>
        m.content.some(
          (b) =>
            b.type === 'tool_result' && b.toolUseId.startsWith('fastpath_'),
        ),
      );
      expect(hasFastpathToolResult).toBe(false);

      // The valid surrounding history is preserved.
      const userTexts = clean
        .filter((m) => m.role === 'user')
        .flatMap((m) =>
          m.content
            .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
            .map((b) => b.text),
        );
      expect(userTexts).toContain('swap 2 SUI to USDC then save it');
      expect(userTexts).toContain('Confirm');
      expect(userTexts).toContain('withdraw all USDC');

      // After stripping, no two consecutive same-role messages.
      for (let i = 1; i < clean.length; i++) {
        expect(clean[i].role).not.toBe(clean[i - 1].role);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Anthropic invariant 1: every tool_use → tool_result in NEXT message
  // ─────────────────────────────────────────────────────────────────────
  describe('tool_use without matching tool_result in next message', () => {
    it('strips orphan tool_use blocks from the assistant message', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'hi' }] },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Looking up...' },
            { type: 'tool_use', id: 'toolu_001', name: 'balance_check', input: {} },
            { type: 'tool_use', id: 'toolu_002', name: 'rates_info', input: {} },
          ],
        },
        // next message only has a result for toolu_001 — toolu_002 is orphan
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolUseId: 'toolu_001',
              content: '{}',
              isError: false,
            },
          ],
        },
      ];

      const clean = validateHistory(messages);

      const assistant = clean.find((m) => m.role === 'assistant');
      const toolUseIds = (assistant?.content ?? [])
        .filter((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use')
        .map((b) => b.id);
      expect(toolUseIds).toEqual(['toolu_001']);

      // text block survives
      expect(
        (assistant?.content ?? []).some((b) => b.type === 'text'),
      ).toBe(true);
    });

    it('keeps the assistant message dropped entirely when its only content was orphan tool_uses', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'hi' }] },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu_001', name: 'balance_check', input: {} },
          ],
        },
        // no follow-up user message at all
      ];

      const clean = validateHistory(messages);
      // assistant message had ONLY the orphan tool_use → dropped.
      expect(clean.length).toBe(1);
      expect(clean[0].role).toBe('user');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Anthropic invariant 2: every tool_result → tool_use in PRIOR message
  // ─────────────────────────────────────────────────────────────────────
  describe('tool_result without matching tool_use in prior message', () => {
    it('strips orphan tool_result blocks from a user message', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'hi' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
        // user message has a tool_result but prior assistant has no tool_use
        {
          role: 'user',
          content: [
            { type: 'text', text: 'next question' },
            {
              type: 'tool_result',
              toolUseId: 'toolu_orphan',
              content: '{}',
              isError: false,
            },
          ],
        },
      ];

      const clean = validateHistory(messages);
      const lastUser = clean[clean.length - 1];
      expect(lastUser.role).toBe('user');
      const hasOrphanResult = lastUser.content.some(
        (b) => b.type === 'tool_result' && b.toolUseId === 'toolu_orphan',
      );
      expect(hasOrphanResult).toBe(false);
      // surrounding text is preserved
      expect(
        lastUser.content.some(
          (b) => b.type === 'text' && b.text === 'next question',
        ),
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Edge cases
  // ─────────────────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('returns empty array unchanged', () => {
      expect(validateHistory([])).toEqual([]);
    });

    it('returns valid history unchanged (idempotent on clean input)', () => {
      const valid: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'hi' }] },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Checking...' },
            { type: 'tool_use', id: 'toolu_001', name: 'balance_check', input: {} },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolUseId: 'toolu_001',
              content: '{"balance": 100}',
              isError: false,
            },
          ],
        },
        { role: 'assistant', content: [{ type: 'text', text: 'You have $100.' }] },
      ];

      const clean = validateHistory(valid);
      expect(clean).toEqual(valid);
    });

    it('merges consecutive same-role messages after stripping leaves them adjacent', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'A' }] },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu_orphan', name: 'foo', input: {} },
          ],
        },
        // No tool_result for the orphan → assistant fully dropped
        { role: 'user', content: [{ type: 'text', text: 'B' }] },
      ];

      const clean = validateHistory(messages);
      // The two user messages collapse into one after the assistant is dropped.
      expect(clean.length).toBe(1);
      expect(clean[0].role).toBe('user');
      const texts = clean[0].content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text);
      expect(texts).toEqual(['A', 'B']);
    });

    it('shifts off leading non-user messages', () => {
      const messages: Message[] = [
        { role: 'assistant', content: [{ type: 'text', text: 'orphaned lead' }] },
        { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      ];

      const clean = validateHistory(messages);
      expect(clean[0].role).toBe('user');
      expect(clean.length).toBe(1);
    });

    it('shifts off a leading user message that holds only orphan tool_results', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolUseId: 'toolu_orphan',
              content: '{}',
              isError: false,
            },
          ],
        },
        { role: 'user', content: [{ type: 'text', text: 'next question' }] },
      ];

      const clean = validateHistory(messages);
      expect(clean.length).toBe(1);
      expect(clean[0].role).toBe('user');
      const texts = clean[0].content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text);
      expect(texts).toEqual(['next question']);
    });
  });
});
