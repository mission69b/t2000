// ---------------------------------------------------------------------------
// message-sanitization.ts — provider-agnostic conversation cleanup
// ---------------------------------------------------------------------------
//
// Shared by `providers/anthropic.ts` (legacy) and `providers/ai-sdk-anthropic.ts`
// (Phase 1 v0.7a). Operates on the engine's `Message[]` shape so both
// providers run the same cleanup before doing their provider-specific
// translation downstream.
//
// What it enforces (load-bearing — production has hit each one):
//
// 1. Every `tool_use` block in an assistant message MUST have a matching
//    `tool_result` (by id) in the immediately next user message. Stray
//    tool_use → drop. Stray tool_result with no matching tool_use → drop.
//    Anthropic's API rejects mismatched conversations with a 400, and
//    the SDK's surface error is opaque enough that the engine couldn't
//    recover. We strip orphans up front.
//
// 2. Consecutive same-role messages → merged. Some host code paths
//    (notably the post-write resume) push two user-role messages back
//    to back. Anthropic accepts this in v3 of their API but the AI SDK
//    v6 ModelMessage shape rejects it; the cleanup makes both providers
//    happy.
//
// 3. First message must be `user`. If we trimmed the head into an
//    assistant-first conversation, slice it down to start with the
//    next user message. Same root cause — both providers reject
//    assistant-first conversations.
//
// Why it lives here (not in `engine.ts`)
// --------------------------------------
// Sanitization is a provider-prep step, not engine logic. The engine
// produces logically-correct conversations; sanitization handles the
// pathological cases that arise from out-of-band history mutation
// (post-write resume, microcompact, error recovery). Putting it in the
// provider layer keeps `engine.ts` focused on the agent loop.
// ---------------------------------------------------------------------------

import type { ContentBlock, Message } from '../types.js';

/**
 * Strip orphaned tool_use / tool_result blocks, merge consecutive same-role
 * messages, and ensure the conversation starts with a user message.
 *
 * Pure — returns a new array, does not mutate the input.
 */
export function sanitizeMessages(messages: Message[]): Message[] {
  const result: Message[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const content = msg.content;

    const toolUseIds = content
      .filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
      .map((b) => b.id);

    if (msg.role === 'assistant' && toolUseIds.length > 0) {
      const next = messages[i + 1];
      const nextContent = next?.content ?? [];
      const nextResultIds = new Set(
        nextContent
          .filter((b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result')
          .map((b) => b.toolUseId),
      );

      const cleanContent = content.filter((b) => {
        if (b.type === 'tool_use') return nextResultIds.has(b.id);
        return true;
      });

      const keptIds = new Set(
        cleanContent
          .filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
          .map((b) => b.id),
      );
      const cleanNext = nextContent.filter((b) => {
        if (b.type === 'tool_result') return keptIds.has(b.toolUseId);
        return true;
      });

      if (cleanContent.length > 0) result.push({ role: 'assistant', content: cleanContent });
      if (cleanNext.length > 0 && next) result.push({ role: next.role, content: cleanNext });
      i++;

      if (cleanContent.length < content.length || cleanNext.length < nextContent.length) {
        console.warn(
          `[sanitize] stripped orphans: ${content.length - cleanContent.length} tool_use, ${nextContent.length - cleanNext.length} tool_result`,
        );
      }
      continue;
    }

    if (msg.role === 'user' && content.some((b) => b.type === 'tool_result')) {
      const prev = result[result.length - 1];
      const prevContent = prev?.role === 'assistant' ? prev.content : [];
      const prevToolUseIds = new Set(
        prevContent
          .filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
          .map((b) => b.id),
      );
      const cleanContent = content.filter((b) => {
        if (b.type === 'tool_result') return prevToolUseIds.has(b.toolUseId);
        return true;
      });
      if (cleanContent.length > 0) result.push({ role: msg.role, content: cleanContent });
      continue;
    }

    result.push(msg);
  }

  const merged: Message[] = [];
  for (const msg of result) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      merged[merged.length - 1] = {
        role: last.role,
        content: [...last.content, ...msg.content],
      };
    } else {
      merged.push({ ...msg, content: [...msg.content] });
    }
  }

  while (merged.length > 0 && merged[0].role !== 'user') {
    merged.shift();
  }

  return merged;
}
