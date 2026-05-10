// ───────────────────────────────────────────────────────────────────────────
// [SPEC 19 v1.24.13 / SPEC 21.2 v1.27.0] strip pseudo-`<thinking>` markup
//
// Lives in its own module so the regex passes can be unit-tested without
// dragging in the entire `engine.ts` file. `engine.ts` imports and uses
// it on every assistant-message persist path.
// ───────────────────────────────────────────────────────────────────────────

import type { ContentBlock } from './types.js';

/**
 * Strip pseudo-`<thinking>` tags from text blocks before persisting an
 * assistant message.
 *
 * Why: Haiku-no-thinking (the post-write demoted narrate path) can't emit
 * native thinking blocks, so it improvises by writing literal
 * `<thinking>…</thinking>` markup inside text content. Production smoke
 * 2026-05-09 (S.134) recorded one bundle narrate turn producing 2271
 * output tokens — 2200+ of them inside a `<thinking>` block — driving
 * `anthropic.latency_ms` to 21938ms (~10× the expected 2s). The audric UI
 * already filters these tags before render, but they pollute persisted
 * history (cache_read context for every subsequent turn).
 *
 * Strategy:
 *   1. Lazy-match `<thinking>…</thinking>` (case-insensitive, multi-line)
 *      and remove. Handles unterminated tags (truncated stream) by
 *      stripping from `<thinking>` to end.
 *   2. [SPEC 21.2 / 2026-05-10] Strip orphan `</thinking>` closers that
 *      survived pass 1 (e.g. text starting with `</thinking>` because the
 *      LLM forgot to open). Pass 2 only fires after pass 1 has consumed
 *      every legitimate pair, so anything left is by definition orphan.
 *      The S19-F5 reproducer is text that begins with `</thinking>`
 *      because the LLM emitted only the closer.
 *
 * Idempotent. Native `thinking` content blocks (`type: 'thinking'`) are
 * NEVER touched — only `text`.
 *
 * Edge case: if stripping empties the only text block AND there are no
 * other blocks, inject a minimal placeholder so role-alternation stays
 * valid (Anthropic API rejects empty assistant content).
 */
export function stripPseudoThinking(blocks: ContentBlock[]): ContentBlock[] {
  const out: ContentBlock[] = [];
  for (const b of blocks) {
    if (b.type !== 'text') {
      out.push(b);
      continue;
    }
    const stripped = b.text
      .replace(/<thinking\b[^>]*>[\s\S]*?(?:<\/thinking>|$)/gi, '')
      // [SPEC 21.2] Pass 2: orphan `</thinking>` closers (no matching opener).
      .replace(/<\/thinking\s*>/gi, '')
      .trim();
    if (stripped.length > 0) {
      out.push({ ...b, text: stripped });
    }
  }
  if (out.length === 0 && blocks.length > 0) {
    out.push({ type: 'text', text: '[narration omitted]' });
  }
  return out;
}
