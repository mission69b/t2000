import type { Message, ContentBlock } from '../types.js';

/**
 * Zero-cost deduplication pass: if the same tool was called with identical
 * inputs earlier in the conversation and the result hasn't changed, replace
 * the full prior result with a compact back-reference. Runs before any
 * LLM-based compaction and costs nothing.
 *
 * Returns a new array — does not mutate the input.
 */
export function microcompact(messages: readonly Message[]): Message[] {
  const seen = new Map<string, { turnIndex: number }>();
  let toolUseIndex = 0;

  const toolUseInputs = new Map<string, string>();

  for (const msg of messages) {
    for (const block of msg.content) {
      if (block.type === 'tool_use') {
        toolUseInputs.set(block.id, `${block.name}:${stableStringify(block.input)}`);
      }
    }
  }

  return messages.map((msg) => {
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
