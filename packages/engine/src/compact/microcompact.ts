import type { Message, ContentBlock, Tool } from '../types.js';

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
 * [v1.5.1] Tools may opt out of dedupe by setting `cacheable: false` on
 * their `Tool` definition. Non-cacheable tools (e.g. `balance_check`,
 * `savings_info`, `health_check`, `transaction_history`) are excluded
 * from the `seen` map entirely, so neither the current call nor any
 * later call with identical inputs gets replaced — necessary because
 * their results depend on mutable on-chain state that writes invalidate.
 *
 * [v1.24.6 / S.122] Tools whose `flags.mutating === true` are ALSO
 * implicitly non-cacheable. Each call to a write tool produces a NEW
 * on-chain transaction (different digest, different balance changes, real
 * state mutation) — replacing the second result with "[Same result as
 * call #N — identical inputs]" lies to the LLM, which then narrates
 * "transaction deduplicated" to the user even though the on-chain write
 * actually settled. Surfaced during S.121 smoke testing: a second
 * `send_transfer` with identical inputs produced a real on-chain tx but
 * the engine narrated as if it had been skipped. Explicit `cacheable`
 * still wins (a `cacheable: true` write would be a tool-author bug, but
 * we don't override it), so the rule is: mutating ⇒ default `false`.
 *
 * Returns a new array — does not mutate the input. The returned array
 * carries a `dedupedToolUseIds` property listing every tool-use ID whose
 * tool_result block was replaced with a back-reference this pass.
 *
 * @param messages — conversation ledger to compact.
 * @param tools    — optional tool registry consulted to resolve the
 *                   per-tool `cacheable` flag. Omit to dedupe every
 *                   tool (legacy behavior — back-compat).
 */
export function microcompact(
  messages: readonly Message[],
  tools?: readonly Tool[],
): MicrocompactResult {
  const seen = new Map<string, { turnIndex: number }>();
  let toolUseIndex = 0;

  const toolUseInputs = new Map<string, string>();
  // Map tool name → cacheable flag. Default behavior (no entry, or
  // `cacheable === undefined`) is `true` — back-compat with hosts that
  // don't pass a tools array. EXCEPT: write tools (`flags.mutating: true`)
  // default to `false` because each call produces a new on-chain tx
  // (S.122).
  const cacheableByName = new Map<string, boolean>();
  if (tools) {
    for (const t of tools) {
      const explicit = t.cacheable;
      const isMutating = t.flags?.mutating === true;
      // Resolve precedence: explicit `cacheable` > mutating-implied-false
      // > default true. A write tool that explicitly opts back in (rare,
      // arguably a bug) is honored — the rule is "don't surprise the
      // tool author," not "block them from doing it."
      cacheableByName.set(t.name, explicit ?? !isMutating);
    }
  }
  const dedupedToolUseIds = new Set<string>();

  // Resolve tool name from a tool_use_id — cached lookup so each result
  // pass stays linear.
  const toolNameById = new Map<string, string>();

  for (const msg of messages) {
    for (const block of msg.content) {
      if (block.type === 'tool_use') {
        toolUseInputs.set(block.id, `${block.name}:${stableStringify(block.input)}`);
        toolNameById.set(block.id, block.name);
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

      // [v1.5.1] Skip dedupe entirely for tools whose results depend on
      // mutable state. Don't write to `seen` either — otherwise a later
      // *cacheable* call with the same key would erroneously dedupe
      // against this fresh result.
      const toolName = toolNameById.get(block.toolUseId);
      if (toolName && cacheableByName.get(toolName) === false) {
        toolUseIndex++;
        return block;
      }

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
