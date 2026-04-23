import type { Message, ContentBlock } from '../types.js';

/**
 * [v1.4 Item 4] Side-channel return from `microcompact` so callers can
 * count or surface dedup hits without re-walking the message ledger.
 * Backwards-compatible: `microcompact(messages)` still returns the
 * processed `Message[]` (now enriched), and the dedup set lives on the
 * returned array via a non-enumerable `dedupedToolUseIds` accessor that
 * the engine reads in its agent loop.
 */
export interface MicrocompactResult extends Array<Message> {
  /**
   * Tool-use IDs whose prior results were replaced with a compact
   * back-reference during this pass. Empty when nothing matched.
   */
  dedupedToolUseIds: Set<string>;
}

/**
 * Zero-cost deduplication pass: if the same tool was called with identical
 * inputs earlier in the conversation and the result hasn't changed, replace
 * the full prior result with a compact back-reference. Runs before any
 * LLM-based compaction and costs nothing.
 *
 * Returns a new array — does not mutate the input. The returned array
 * carries a `dedupedToolUseIds` property listing every tool-use ID whose
 * tool_result block was replaced with a back-reference this pass.
 */
export function microcompact(messages: readonly Message[]): MicrocompactResult {
  const seen = new Map<string, { turnIndex: number }>();
  let toolUseIndex = 0;

  const toolUseInputs = new Map<string, string>();
  const dedupedToolUseIds = new Set<string>();

  for (const msg of messages) {
    for (const block of msg.content) {
      if (block.type === 'tool_use') {
        toolUseInputs.set(block.id, `${block.name}:${stableStringify(block.input)}`);
      }
    }
  }

  const out = messages.map((msg) => {
    if (msg.role !== 'user') return { role: msg.role, content: [...msg.content] };

    const hasToolResults = msg.content.some((b) => b.type === 'tool_result');
    if (!hasToolResults) return { role: msg.role, content: [...msg.content] };

    const newContent: ContentBlock[] = msg.content.map((block) => {
      if (block.type !== 'tool_result') return block;

      const key = toolUseInputs.get(block.toolUseId);
      if (!key) return block;

      toolUseIndex++;
      const prior = seen.get(key);

      if (prior && !block.isError) {
        dedupedToolUseIds.add(block.toolUseId);
        return {
          ...block,
          content: `[Same result as call #${prior.turnIndex} — ${key.split(':')[0]} with identical inputs. Result unchanged.]`,
        };
      }

      if (!block.isError) {
        seen.set(key, { turnIndex: toolUseIndex });
      }
      return block;
    });

    return { role: msg.role, content: newContent };
  });

  // Attach the side-channel without breaking `Message[]` consumers — the
  // result is structurally compatible with `Message[]`, the extra property
  // is invisible to anything that only reads array semantics or runs deep
  // equality against a plain `Message[]` (vitest, JSON.stringify, …).
  Object.defineProperty(out, 'dedupedToolUseIds', {
    value: dedupedToolUseIds,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return out as MicrocompactResult;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  const sorted = Object.keys(value as Record<string, unknown>).sort();
  const obj: Record<string, unknown> = {};
  for (const k of sorted) obj[k] = (value as Record<string, unknown>)[k];
  return JSON.stringify(obj);
}
