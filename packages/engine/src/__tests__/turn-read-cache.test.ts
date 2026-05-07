import { describe, it, expect } from 'vitest';
import { TurnReadCache } from '../cache/turn-read.js';

describe('TurnReadCache.keyFor', () => {
  it('produces the same key for empty input regardless of representation', () => {
    expect(TurnReadCache.keyFor('balance_check', {})).toBe(
      TurnReadCache.keyFor('balance_check', {}),
    );
  });

  it('produces stable keys regardless of object key ordering', () => {
    const a = TurnReadCache.keyFor('rates_info', { stableOnly: true, topN: 5 });
    const b = TurnReadCache.keyFor('rates_info', { topN: 5, stableOnly: true });
    expect(a).toBe(b);
  });

  it('handles nested objects with stable key ordering', () => {
    const a = TurnReadCache.keyFor('q', { filter: { min: 1, max: 10 } });
    const b = TurnReadCache.keyFor('q', { filter: { max: 10, min: 1 } });
    expect(a).toBe(b);
  });

  it('different tool names produce different keys for identical inputs', () => {
    const a = TurnReadCache.keyFor('balance_check', {});
    const b = TurnReadCache.keyFor('health_check', {});
    expect(a).not.toBe(b);
  });

  it('different inputs produce different keys for the same tool', () => {
    const a = TurnReadCache.keyFor('rates_info', {});
    const b = TurnReadCache.keyFor('rates_info', { stableOnly: true });
    expect(a).not.toBe(b);
  });

  it('arrays preserve order in the key', () => {
    const a = TurnReadCache.keyFor('q', { assets: ['USDC', 'SUI'] });
    const b = TurnReadCache.keyFor('q', { assets: ['SUI', 'USDC'] });
    // Arrays are order-significant — different ordering is a different
    // semantic query, not equivalent.
    expect(a).not.toBe(b);
  });
});

describe('TurnReadCache lifecycle', () => {
  it('returns undefined for an unknown key', () => {
    const cache = new TurnReadCache();
    expect(cache.get('missing')).toBeUndefined();
    expect(cache.has('missing')).toBe(false);
  });

  it('stores and retrieves entries', () => {
    const cache = new TurnReadCache();
    const key = TurnReadCache.keyFor('balance_check', {});
    cache.set(key, { result: { total: 100 }, sourceToolUseId: 'tc-1' });
    expect(cache.has(key)).toBe(true);
    expect(cache.get(key)).toEqual({ result: { total: 100 }, sourceToolUseId: 'tc-1' });
  });

  it('overwrites prior entries when the same key is set again', () => {
    const cache = new TurnReadCache();
    const key = TurnReadCache.keyFor('balance_check', {});
    cache.set(key, { result: { total: 100 }, sourceToolUseId: 'tc-1' });
    cache.set(key, { result: { total: 200 }, sourceToolUseId: 'tc-2' });
    expect(cache.get(key)?.result).toEqual({ total: 200 });
    expect(cache.get(key)?.sourceToolUseId).toBe('tc-2');
  });

  it('clear() drops every entry', () => {
    const cache = new TurnReadCache();
    cache.set(TurnReadCache.keyFor('balance_check', {}), {
      result: 1, sourceToolUseId: 'a',
    });
    cache.set(TurnReadCache.keyFor('health_check', {}), {
      result: 2, sourceToolUseId: 'b',
    });
    expect(cache.size()).toBe(2);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.has(TurnReadCache.keyFor('balance_check', {}))).toBe(false);
  });
});
