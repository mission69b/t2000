// ---------------------------------------------------------------------------
// v2/system-prompt-cache.ts — F-12 prompt-cache preservation helpers
// ---------------------------------------------------------------------------
//
// [F-12 / 2026-05-18] Phase 0 smoke (BENEFITS_SPEC_v07c §"Day 0e") confirmed
// the v2 `AISDKEngine` had been silently STRIPPING Anthropic `cache_control`
// markers when reducing `SystemBlock[]` → joined string since the v0.7a
// engine drain. Production cacheR=0 / cacheW=0 across all sampled turns;
// the legacy `AISDKAnthropicProvider` path preserved cache markers, the v2
// path's `sp.map((b) => b.text).join('\n\n')` did not.
//
// This module owns the small, pure transforms that convert engine
// `SystemPrompt` (string | SystemBlock[]) into the AI SDK
// `string | SystemModelMessage[]` shape, threading `cache_control` through
// `providerOptions.anthropic.cacheControl` so `@ai-sdk/anthropic` v3 emits
// the correct Anthropic native `cache_control` per block.
//
// Anthropic prompt-cache rule (for reference): "blocks are cached from the
// start of the prompt up to (and including) the last `cache_control`
// breakpoint." So a typical audric layout produced by
// `buildCachedSystemPrompt([STATIC_SYSTEM_PROMPT], dynamicPart)` —
//   [
//     { type: 'text', text: STATIC, cache_control: { type: 'ephemeral' } },
//     { type: 'text', text: dynamic },  // no cache_control
//   ]
// — correctly caches just the static prefix and lets the dynamic part vary
// per turn without invalidating the cache.
// ---------------------------------------------------------------------------

import type { SystemModelMessage } from 'ai';
import type { SystemBlock, SystemPrompt } from '../types.js';

/**
 * Convert one engine `SystemBlock` to an AI SDK `SystemModelMessage`,
 * preserving the `cache_control` marker (if any) as
 * `providerOptions.anthropic.cacheControl`. Pure transform; no side effects.
 */
export function systemBlockToModelMessage(block: SystemBlock): SystemModelMessage {
  const msg: SystemModelMessage = { role: 'system', content: block.text };
  if (block.cache_control) {
    msg.providerOptions = {
      anthropic: { cacheControl: { type: block.cache_control.type } },
    };
  }
  return msg;
}

/**
 * Convert engine `SystemPrompt` (the typed engine shape) to the AI SDK
 * `streamText({ system })` argument shape, preserving Anthropic
 * `cache_control` markers when the input is a typed `SystemBlock[]`.
 *
 *  - `undefined` → `undefined`
 *  - `string` → `string` (back-compat for hosts that haven't adopted
 *    typed SystemBlock[]; AI SDK passes the string through unchanged
 *    and Anthropic gets no cache hints to honor)
 *  - `SystemBlock[]` → `SystemModelMessage[]` (one message per block,
 *    cache_control threaded through providerOptions)
 */
export function buildSystemForStream(
  sp: SystemPrompt | undefined,
): string | SystemModelMessage[] | undefined {
  if (!sp) return undefined;
  if (typeof sp === 'string') return sp;
  if (Array.isArray(sp)) return sp.map(systemBlockToModelMessage);
  return undefined;
}

/**
 * Compose the `prepareStep` `system` return value for the memory-path
 * `AISDKEngine` flow. Takes the typed base system prompt + the three
 * per-turn volatile layers (financialContextBlock, memoryRecallBlock,
 * skillRecipeBlock — already rendered to strings by the caller; empty
 * strings are dropped) and returns either:
 *
 *  - `SystemModelMessage[]` when `baseSystem` is typed `SystemBlock[]`:
 *    base blocks preserve their cache_control; each non-empty volatile
 *    layer becomes its own un-cached `SystemModelMessage` appended after
 *    the base. Anthropic caches [1..LAST_CACHED] and lets volatile
 *    layers vary per turn without cache invalidation.
 *
 *  - `string` when `baseSystem` is a plain string (legacy hosts):
 *    falls back to the original join behavior; no cache hints to preserve.
 *
 * The boundary is structural — once you commit to typed SystemBlock[] for
 * the base, every layer assembled by this helper gets the typed treatment.
 */
export function buildPrepareStepSystem(
  baseSystem: string | SystemModelMessage[] | undefined,
  volatileLayers: string[],
): string | SystemModelMessage[] {
  const nonEmptyVolatile = volatileLayers.filter((l) => l.length > 0);

  if (Array.isArray(baseSystem)) {
    const messages: SystemModelMessage[] = [...baseSystem];
    for (const text of nonEmptyVolatile) {
      messages.push({ role: 'system', content: text });
    }
    return messages;
  }

  const stringLayers = [baseSystem ?? '', ...nonEmptyVolatile].filter((l) => l.length > 0);
  return stringLayers.join('\n\n');
}
