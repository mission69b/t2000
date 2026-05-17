// ---------------------------------------------------------------------------
// memory/extract-user-message.ts — Phase 7 prepareStep recall-query source
// ---------------------------------------------------------------------------
//
// Pure helper that extracts the latest USER message text from an AI SDK
// `ModelMessage[]`. Used by the `prepareStep` hook at `stepNumber === 0`
// to source the recall query.
//
// **Why "latest" and not "all"?** A multi-turn session sees many user
// messages; only the MOST RECENT one is the active query. Recalling
// against all-time user history would mostly retrieve noise from earlier
// (resolved) topics. The host (or a future topic-shift detector) can
// concatenate richer query context if signal is missing; v1 is "latest
// user message text."
//
// **Tool messages are NOT user messages.** AI SDK v6 splits tool results
// into a separate `role: 'tool'` message that comes from the user side
// of the conversation but represents the engine's tool execution, not a
// human-typed query. We skip these.
//
// **Empty extraction → empty query.** If no user message exists yet
// (rare; happens on initial system-only invocations) we return `''`. The
// `InMemoryMemoryStore.recall('')` and presumably any production store
// returns `[]` for empty queries, so the layer 3 block is empty and the
// turn proceeds without memory. No throw.
// ---------------------------------------------------------------------------

import type { ModelMessage } from 'ai';

/**
 * Pull the latest USER message text from an AI SDK `ModelMessage[]`.
 * Returns `''` if no user message exists.
 *
 * Iterates from the end of the array for O(1) common-case work (the
 * latest user message is almost always near the end of the history).
 */
export function extractLatestUserMessage(messages: ModelMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'user') continue;
    return userContentToText(msg.content);
  }
  return '';
}

/**
 * AI SDK `UserContent` can be a plain string OR an array of parts. The
 * array form supports text + image + file parts; for recall purposes we
 * only care about text. Concatenate text-only parts with spaces.
 */
function userContentToText(content: ModelMessage['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((p): p is { type: 'text'; text: string } => {
      return typeof p === 'object' && p !== null && 'type' in p && p.type === 'text';
    })
    .map((p) => p.text)
    .join(' ')
    .trim();
}
