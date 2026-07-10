import { describe, expect, it } from 'vitest';
import { signDelivery } from './sellers';

describe('signDelivery — the paid-delivery-leg auth header', () => {
  const now = 1_700_000_000_000;

  it('is deterministic for the same target + timestamp', () => {
    const a = signDelivery('https://api.example.com/v1/search', now);
    const b = signDelivery('https://api.example.com/v1/search', now);
    expect(a).toBe(b);
    expect(a.startsWith(`${now}.`)).toBe(true);
  });

  it('binds to origin + path (case-insensitive), excluding the query string', () => {
    const base = signDelivery('https://api.example.com/v1/search', now);
    expect(signDelivery('https://API.example.com/V1/Search', now)).toBe(base);
    expect(signDelivery('https://api.example.com/v1/search?q=sui', now)).toBe(base);
    expect(signDelivery('https://api.example.com/v1/other', now)).not.toBe(base);
    expect(signDelivery('https://other.example.com/v1/search', now)).not.toBe(base);
  });
});
