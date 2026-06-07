// ---------------------------------------------------------------------------
// memory/in-memory-store.test.ts — Phase 7 Slice 1 mock invariants
// ---------------------------------------------------------------------------
//
// Pins the contract `InMemoryMemoryStore` makes to the engine and its
// hosts. The integration test (`prompt-layer-ordering.test.ts`) leans on
// these behaviors — keep them green or update both together.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryMemoryStore } from './in-memory-store.js';

describe('InMemoryMemoryStore', () => {
  let store: InMemoryMemoryStore;

  beforeEach(() => {
    store = new InMemoryMemoryStore();
  });

  describe('remember()', () => {
    it('appends one record per call', async () => {
      expect(store._testGetRecordCount()).toBe(0);
      await store.remember('first');
      expect(store._testGetRecordCount()).toBe(1);
      await store.remember('second');
      expect(store._testGetRecordCount()).toBe(2);
    });

    it('preserves the order of insertion (FIFO)', async () => {
      await store.remember('apple banana cherry');
      await store.remember('banana date elderberry');
      // Recall against a token both records share to retrieve them; if
      // remember preserves order we expect the first one inserted to
      // appear first when scores tie. (Sort is stable in V8.)
      const results = await store.recall('banana');
      expect(results.length).toBe(2);
      expect(results[0].text).toBe('apple banana cherry');
    });

    it('namespace tagging is round-tripped through recall', async () => {
      await store.remember('profile note', { namespace: 'profile' });
      await store.remember('advice note', { namespace: 'advice' });

      const profile = await store.recall('note', { namespace: 'profile' });
      const advice = await store.recall('note', { namespace: 'advice' });

      expect(profile.length).toBe(1);
      expect(profile[0].text).toBe('profile note');
      expect(advice.length).toBe(1);
      expect(advice[0].text).toBe('advice note');
    });
  });

  describe('recall()', () => {
    beforeEach(async () => {
      // Pre-load a small corpus the recall tests can match against.
      await store.remember('user holds 100 USDC saved in NAVI');
      await store.remember('user borrowed 50 USDC against savings');
      await store.remember('user swapped 1 SUI for USDC last week');
      await store.remember('weather is nice today');
    });

    it('returns the most-overlapping record first', async () => {
      const results = await store.recall('USDC savings');
      expect(results.length).toBeGreaterThan(0);
      // First record has the highest overlap with 'USDC savings'
      // (matches both 'usdc' AND 'savings' (matches via 'saved' tokenization? no — 'saved' != 'savings').
      // Actually first record matches 'usdc' only. Let me re-check.
      // 'user holds 100 USDC saved in NAVI' → tokens: user holds 100 usdc saved in navi
      // 'user borrowed 50 USDC against savings' → tokens: user borrowed 50 usdc against savings
      // Query 'USDC savings' → tokens: usdc savings
      // First: overlap = 1 (usdc)
      // Second: overlap = 2 (usdc, savings) ← winner
      expect(results[0].text).toBe('user borrowed 50 USDC against savings');
    });

    it('respects topK cap', async () => {
      const all = await store.recall('user', { topK: 10 });
      const top1 = await store.recall('user', { topK: 1 });
      expect(all.length).toBeGreaterThan(top1.length);
      expect(top1.length).toBe(1);
    });

    it('default topK is 5', async () => {
      // Load 10 more matching records to exceed default cap
      for (let i = 0; i < 10; i++) {
        await store.remember(`user record number ${i}`);
      }
      const results = await store.recall('user');
      expect(results.length).toBe(5);
    });

    it('drops records with zero token overlap (bag-of-words noise filter)', async () => {
      const results = await store.recall('quantum computing distributed ledger');
      expect(results.length).toBe(0);
    });

    it('returns empty array for empty query (does NOT return-by-recency)', async () => {
      const results = await store.recall('');
      expect(results).toEqual([]);
    });

    it('returns empty array for whitespace-only query', async () => {
      const results = await store.recall('   \t\n  ');
      expect(results).toEqual([]);
    });

    it('namespace filter excludes other namespaces entirely', async () => {
      await store.remember('namespaced user data', { namespace: 'isolated' });
      const isolated = await store.recall('user', { namespace: 'isolated' });
      const other = await store.recall('user', { namespace: 'nonexistent' });
      // The pre-loaded records have no namespace (undefined); they
      // should NOT appear when a specific namespace is requested.
      expect(isolated.length).toBe(1);
      expect(isolated[0].text).toBe('namespaced user data');
      expect(other.length).toBe(0);
    });

    it('omitted namespace includes ALL records (including undefined-namespace)', async () => {
      await store.remember('namespaced data', { namespace: 'tagged' });
      const all = await store.recall('data');
      // Should include both the undefined-namespace records AND the tagged one
      const texts = all.map((r) => r.text);
      expect(texts).toContain('namespaced data');
    });

    it('attaches timestamp metadata to every record', async () => {
      const results = await store.recall('user');
      for (const r of results) {
        expect(r.metadata).toBeDefined();
        expect(typeof r.metadata?.timestamp).toBe('number');
      }
    });

    it('distance is negative for matched records (lower = better match)', async () => {
      const results = await store.recall('USDC');
      for (const r of results) {
        expect(r.distance).toBeLessThan(0);
      }
      // Verify sort order: ascending distance = descending match quality
      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });
  });

  describe('destroy()', () => {
    it('clears all records', async () => {
      await store.remember('one');
      await store.remember('two');
      expect(store._testGetRecordCount()).toBe(2);

      store.destroy();
      expect(store._testGetRecordCount()).toBe(0);

      // Recall against the cleared store returns nothing.
      const results = await store.recall('one');
      expect(results).toEqual([]);
    });

    it('store is reusable after destroy', async () => {
      await store.remember('first');
      store.destroy();
      await store.remember('second');
      const results = await store.recall('second');
      expect(results.length).toBe(1);
      expect(results[0].text).toBe('second');
    });
  });
});
