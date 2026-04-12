import type { SystemBlock } from './types.js';

/**
 * Build a cacheable system prompt array from static and dynamic parts.
 *
 * Anthropic caches system prompt blocks marked with `cache_control: { type: 'ephemeral' }`.
 * Static blocks (identity, tool descriptions) are cached across turns. Dynamic blocks
 * (user profile, positions, state) change per-turn and are NOT cached.
 *
 * Cache breakpoints are placed at the end of each static block — Anthropic caches
 * from the start of the prompt up to the last cache_control marker.
 */
export function buildCachedSystemPrompt(
  staticParts: string[],
  dynamicPart?: string,
): SystemBlock[] {
  const blocks: SystemBlock[] = staticParts.map((text, i) => ({
    type: 'text' as const,
    text,
    ...(i === staticParts.length - 1 && { cache_control: { type: 'ephemeral' as const } }),
  }));

  if (dynamicPart) {
    blocks.push({ type: 'text', text: dynamicPart });
  }

  return blocks;
}
