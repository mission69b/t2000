// ---------------------------------------------------------------------------
// memory/in-memory-store.ts — Phase 7 reference mock
// ---------------------------------------------------------------------------
//
// `InMemoryMemoryStore` is the engine's reference implementation of
// `MemoryStore`. It is the default for:
//
//   - Engine unit + integration tests (deterministic, zero infra).
//   - CLI / MCP examples + smoke harnesses (no MemWal dependency).
//   - Audric pre-production wiring (proves the 4-layer F-4 order works
//     end-to-end before swapping in `MemWalMemoryStore`).
//
// **Scoring.** Real MemWal uses cosine distance over embedding vectors.
// The mock approximates with negative bag-of-words overlap so that:
//
//   - Sort semantics match (lower `distance` = better match).
//   - Tests can hand-craft known overlaps without an embedding model.
//   - The prompt-layer ordering test (`prompt-layer-ordering.test.ts`)
//     gets deterministic recall results for assertion.
//
// **What this is NOT.** Not a production memory store. No embedding
// quality, no persistence, no concurrency safety. Production hosts MUST
// inject a real `MemoryStore` (e.g. `MemWalMemoryStore` in audric).
// ---------------------------------------------------------------------------

import type { MemoryRecord, MemoryStore } from './store.js';

interface StoredRecord {
  text: string;
  timestamp: number;
  namespace?: string;
}

/**
 * In-memory reference implementation of `MemoryStore` — see file header
 * for the scoring approximation and intended use cases.
 */
export class InMemoryMemoryStore implements MemoryStore {
  private records: StoredRecord[] = [];

  async remember(
    text: string,
    opts: { namespace?: string } = {},
  ): Promise<void> {
    this.records.push({
      text,
      timestamp: Date.now(),
      namespace: opts.namespace,
    });
  }

  async recall(
    query: string,
    opts: { topK?: number; namespace?: string } = {},
  ): Promise<MemoryRecord[]> {
    const topK = opts.topK ?? 5;
    const filterNamespace = opts.namespace;
    const queryTokens = tokenize(query);
    // Bail early if the query is empty — return-by-recency semantics
    // would surprise callers; an empty query yields zero matches.
    if (queryTokens.size === 0) return [];

    return this.records
      .filter((r) => filterNamespace === undefined || r.namespace === filterNamespace)
      .map((r) => {
        const overlap = countOverlap(tokenize(r.text), queryTokens);
        return {
          text: r.text,
          // Negative overlap so `distance` ascending = best match first
          // (matches MemWal's convention).
          distance: -overlap,
          metadata: { timestamp: r.timestamp },
        };
      })
      // Drop zero-overlap records — bag-of-words match returning a
      // record with no shared tokens is noise, not signal.
      .filter((r) => r.distance < 0)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, topK);
  }

  destroy(): void {
    this.records = [];
  }

  /**
   * Test-only escape hatch — count stored records without going through
   * recall (which filters zero-overlap matches). Not part of the public
   * `MemoryStore` interface. Used by `in-memory-store.test.ts` to assert
   * `remember()` side effects independently of recall behavior.
   */
  _testGetRecordCount(): number {
    return this.records.length;
  }
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0),
  );
}

function countOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count++;
  }
  return count;
}
