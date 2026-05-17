// ---------------------------------------------------------------------------
// memory/build-memory-block.ts — Phase 7 prepareStep layer-3 formatter
// ---------------------------------------------------------------------------
//
// Pure helper that renders an array of `MemoryRecord` into the
// `<memory_recall>` XML block that goes at layer 3 of the F-4 system
// prompt assembly. Extracted from `v2/engine.ts` so the format is:
//
//   - testable in isolation (no engine boot needed)
//   - independently iterable on (prompt-engineering tweaks land here)
//   - clearly versionable (any format change needs a new test row)
//
// **Format choice (minimal v1 per SPEC_PHASE_7_DRAFT §7 Q4).** Numbered
// list inside an XML wrapper:
//
//   <memory_recall>
//     1. user holds 100 USDC saved in NAVI
//     2. user borrowed 50 USDC against savings
//   </memory_recall>
//
// Distance scores + timestamps + source tags are deliberately NOT
// included in the v1 format — they're metadata for the engine / host,
// not signal the LLM benefits from at this stage. If prompt-engineering
// surfaces a need (e.g. "tell the LLM how confident the match is"),
// extend here and add a regression test pinning the new shape.
//
// **Empty handling.** Returns the empty string (`''`) rather than an
// empty `<memory_recall></memory_recall>` wrapper so the prepareStep
// layer joiner can `filter((l) => l.length > 0)` and skip the layer
// entirely. This keeps the system prompt clean when MemWal degrades or
// when there's no matching history.
// ---------------------------------------------------------------------------

import type { MemoryRecord } from './store.js';

/**
 * Render top-K memory records into the `<memory_recall>` XML block for
 * layer 3 of the F-4 system-prompt assembly. Returns `''` for empty
 * input so the prepareStep joiner can skip the layer entirely.
 */
export function buildMemoryBlock(records: MemoryRecord[]): string {
  if (records.length === 0) return '';
  const items = records
    .map((r, i) => `  ${i + 1}. ${r.text}`)
    .join('\n');
  return `<memory_recall>\n${items}\n</memory_recall>`;
}
