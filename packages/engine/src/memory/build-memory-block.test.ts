// ---------------------------------------------------------------------------
// memory/build-memory-block.test.ts — Phase 7 layer-3 format invariants
// ---------------------------------------------------------------------------
//
// These tests pin the EXACT format of the `<memory_recall>` block so:
//
//   1. Prompt-engineering changes are intentional (drift fails CI).
//   2. The prompt-layer integration test can assert against a known shape.
//   3. Hosts inspecting prepareStep output for debugging see a stable
//      structure across engine versions.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { buildMemoryBlock } from './build-memory-block.js';
import type { MemoryRecord } from './store.js';

function rec(text: string, distance = -1): MemoryRecord {
  return { text, distance, metadata: { timestamp: 0 } };
}

describe('buildMemoryBlock', () => {
  it('returns empty string for empty input (NOT an empty wrapper)', () => {
    expect(buildMemoryBlock([])).toBe('');
  });

  it('renders a single record inside the wrapper', () => {
    const result = buildMemoryBlock([rec('first memory')]);
    expect(result).toBe(
      '<memory_recall>\n  1. first memory\n</memory_recall>',
    );
  });

  it('numbers entries 1-indexed in input order', () => {
    const result = buildMemoryBlock([
      rec('one'),
      rec('two'),
      rec('three'),
    ]);
    expect(result).toBe(
      '<memory_recall>\n  1. one\n  2. two\n  3. three\n</memory_recall>',
    );
  });

  it('does NOT include distance / metadata in v1 format', () => {
    const result = buildMemoryBlock([rec('test', -42)]);
    expect(result).not.toContain('-42');
    expect(result).not.toContain('distance');
    expect(result).not.toContain('timestamp');
    expect(result).not.toContain('metadata');
  });

  it('preserves multi-line text inside record (no escaping)', () => {
    // Memory records may contain newlines. Today we render them inline;
    // if this becomes a problem we can add escaping in a future format
    // version + new regression test row.
    const result = buildMemoryBlock([rec('line1\nline2')]);
    expect(result).toBe(
      '<memory_recall>\n  1. line1\nline2\n</memory_recall>',
    );
  });

  it('preserves XML-special characters verbatim (no encoding)', () => {
    // Anthropic / Claude tolerates raw `<` / `>` inside system prompt
    // XML blocks; we don't HTML-encode. If a backend ever needs encoding,
    // add it here + add a regression test pinning the encoded shape.
    const result = buildMemoryBlock([rec('user said <hello> & nope')]);
    expect(result).toContain('user said <hello> & nope');
  });
});
