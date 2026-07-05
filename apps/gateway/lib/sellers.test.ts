import { describe, expect, it } from 'vitest';
import { appendBuyerParams, signDelivery } from './sellers';

describe('appendBuyerParams (S.638 — GET upstreams take buyer input as query params)', () => {
  const base = 'https://api.example.com/v1/search?fixed=yes';

  it('appends top-level primitive fields', () => {
    const out = appendBuyerParams(base, JSON.stringify({ q: 'sui', limit: 5, fresh: true }));
    const u = new URL(out);
    expect(u.searchParams.get('q')).toBe('sui');
    expect(u.searchParams.get('limit')).toBe('5');
    expect(u.searchParams.get('fresh')).toBe('true');
    expect(u.searchParams.get('fixed')).toBe('yes');
  });

  it('NEVER overrides a seller-saved param', () => {
    const out = appendBuyerParams(base, JSON.stringify({ fixed: 'attacker' }));
    expect(new URL(out).searchParams.getAll('fixed')).toEqual(['yes']);
  });

  it('drops nested objects/arrays and oversized values', () => {
    const out = appendBuyerParams(
      base,
      JSON.stringify({ obj: { a: 1 }, arr: [1, 2], long: 'x'.repeat(600), ok: 'y' }),
    );
    const u = new URL(out);
    expect(u.searchParams.has('obj')).toBe(false);
    expect(u.searchParams.has('arr')).toBe(false);
    expect(u.searchParams.has('long')).toBe(false);
    expect(u.searchParams.get('ok')).toBe('y');
  });

  it('caps the number of buyer params at 8', () => {
    const many = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`k${i}`, `v${i}`]),
    );
    const out = appendBuyerParams(base, JSON.stringify(many));
    const buyerKeys = [...new URL(out).searchParams.keys()].filter((k) => k.startsWith('k'));
    expect(buyerKeys).toHaveLength(8);
  });

  it('returns the URL unchanged for empty/invalid/non-object input', () => {
    expect(appendBuyerParams(base, '')).toBe(base);
    expect(appendBuyerParams(base, 'not json')).toBe(base);
    expect(appendBuyerParams(base, JSON.stringify([1, 2]))).toBe(base);
    expect(appendBuyerParams(base, JSON.stringify('str'))).toBe(base);
  });

  it('does not change the delivery signature surface (query excluded from the bind)', () => {
    const withParams = appendBuyerParams(base, JSON.stringify({ q: 'sui' }));
    const now = 1_700_000_000_000;
    expect(signDelivery(withParams, now)).toBe(signDelivery(base, now));
  });
});
