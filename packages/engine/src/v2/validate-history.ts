// ───────────────────────────────────────────────────────────────────────────
// validateHistory — Anthropic message-shape safety net for v2.
//
// Restored from the deleted QueryEngine (commit f87d7329, v2.0.0 cleanup).
// v2.0.0 removed this defensively-load-bearing function without porting it,
// and it surfaced in production 2026-05-17 (audric session
// s_1778993279816_47a9814c835d) as soon as bundle resume started landing
// successfully on-chain:
//
//   "messages.12.content.0: unexpected `tool_use_id` found in
//   `tool_result` blocks: fastpath_9066d766-b495-4dd2-a795-1516f9047b7d_0.
//   Each `tool_result` block must have a corresponding `tool_use` block
//   in the previous message."
//
// Root trigger: audric's fast-path bundle dispatch loads a synthetic
// `assistant(text-only)` message into the engine ledger at chat-time. On
// resume, the engine pushes a `user([tool_results])` message keyed on
// `fastpath_*` toolUseIds — but the preceding assistant message has no
// matching `tool_use` blocks. Anthropic rejects the call. Worse, the
// rejection persists for every subsequent turn until the corrupt blocks
// are removed.
//
// Anthropic's contract:
//   - Every `tool_use` block in an assistant message MUST have a matching
//     `tool_result` block in the IMMEDIATELY NEXT user message (not just
//     anywhere in history).
//   - Every `tool_result` block in a user message MUST have a matching
//     `tool_use` block in the IMMEDIATELY PRECEDING assistant message.
//   - Roles must alternate (no two assistant or two user messages in a
//     row).
//   - First message must be `user` (no orphan user-tool_results in lead
//     position).
//
// This function enforces all four invariants by:
//   1. Walking assistant-with-tool_use messages and stripping any tool_use
//      whose result is missing from the next message (and vice versa).
//   2. Walking standalone user-with-tool_results messages and stripping
//      orphan tool_results.
//   3. Merging consecutive same-role messages that result from step 1/2
//      removals.
//   4. Shifting off leading non-user messages and lead user-orphan-only
//      messages.
//
// Single point of defense — no corrupt messages can reach the Anthropic
// API regardless of how they got into the session.
// ───────────────────────────────────────────────────────────────────────────

import type { Message } from '../types.js';

export function validateHistory(messages: Message[]): Message[] {
  const result: Message[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    // For assistant messages with tool_use, verify the next message has ALL results
    const toolUseIds = msg.content
      .filter(
        (b): b is { type: 'tool_use'; id: string; name: string; input: unknown } =>
          b.type === 'tool_use',
      )
      .map((b) => b.id);

    if (toolUseIds.length > 0 && msg.role === 'assistant') {
      const next = messages[i + 1];
      const nextResultIds = new Set(
        (next?.content ?? [])
          .filter(
            (
              b,
            ): b is {
              type: 'tool_result';
              toolUseId: string;
              content: string;
            } => b.type === 'tool_result',
          )
          .map((b) => b.toolUseId),
      );

      // Strip tool_use blocks that have no result in the next message
      const cleanAssistant = msg.content.filter((b) => {
        if (b.type === 'tool_use') return nextResultIds.has(b.id);
        return true;
      });

      // Strip tool_result blocks from next message whose tool_use was removed
      const keptToolUseIds = new Set(
        cleanAssistant
          .filter(
            (
              b,
            ): b is {
              type: 'tool_use';
              id: string;
              name: string;
              input: unknown;
            } => b.type === 'tool_use',
          )
          .map((b) => b.id),
      );
      const cleanNext = next?.content.filter((b) => {
        if (b.type === 'tool_result') return keptToolUseIds.has(b.toolUseId);
        return true;
      });

      if (cleanAssistant.length > 0) {
        result.push({ role: msg.role, content: cleanAssistant });
      }
      if (cleanNext && cleanNext.length > 0) {
        result.push({ role: next!.role, content: cleanNext });
      }
      i += 2;
      continue;
    }

    // For user messages: strip any tool_result blocks that reference a tool_use
    // not present in the immediately preceding assistant message.
    if (msg.role === 'user' && msg.content.some((b) => b.type === 'tool_result')) {
      const prevAssistant = result[result.length - 1];
      const prevToolUseIds = new Set(
        (prevAssistant?.role === 'assistant' ? prevAssistant.content : [])
          .filter(
            (
              b,
            ): b is {
              type: 'tool_use';
              id: string;
              name: string;
              input: unknown;
            } => b.type === 'tool_use',
          )
          .map((b) => b.id),
      );
      const cleanContent = msg.content.filter((b) => {
        if (b.type === 'tool_result') return prevToolUseIds.has(b.toolUseId);
        return true;
      });
      if (cleanContent.length > 0) {
        result.push({ role: msg.role, content: cleanContent });
      }
      i++;
      continue;
    }

    result.push(msg);
    i++;
  }

  // Merge consecutive same-role messages (can happen after stripping)
  const merged: Message[] = [];
  for (const msg of result) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content = [...last.content, ...msg.content];
    } else {
      merged.push({ role: msg.role, content: [...msg.content] });
    }
  }

  // First message must be user, AND it must not consist solely of
  // orphan `tool_result` blocks whose matching `tool_use` lived in an
  // assistant turn we're about to shift off. Anthropic rejects any
  // user message containing a tool_result that doesn't reference a
  // preceding assistant tool_use.
  //
  // The most common trigger is host code that seeds the conversation
  // with prefetched tool calls (see audric's `buildSyntheticPrefetch`):
  // `[assistant tool_uses, user tool_results, assistant text]`. After
  // shifting off the leading assistant, the user message's tool_results
  // are now orphaned. Strip them; if that empties the user message,
  // shift it off too — the next message may be assistant, in which
  // case we loop again.
  while (merged.length > 0) {
    if (merged[0].role !== 'user') {
      merged.shift();
      continue;
    }
    const cleaned = merged[0].content.filter((b) => b.type !== 'tool_result');
    if (cleaned.length === 0) {
      merged.shift();
      continue;
    }
    if (cleaned.length !== merged[0].content.length) {
      merged[0] = { role: 'user', content: cleaned };
    }
    break;
  }

  return merged;
}
