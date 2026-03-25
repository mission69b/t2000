import { describe, it, expect, vi, beforeEach } from 'vitest';

let rateLimit: typeof import('./rate-limit').rateLimit;
let rateLimitResponse: typeof import('./rate-limit').rateLimitResponse;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('./rate-limit');
  rateLimit = mod.rateLimit;
  rateLimitResponse = mod.rateLimitResponse;
});

describe('rateLimit', () => {
  it('allows requests within the limit', () => {
    const r1 = rateLimit('test-allow', 3, 60_000);
    expect(r1.success).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = rateLimit('test-allow', 3, 60_000);
    expect(r2.success).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = rateLimit('test-allow', 3, 60_000);
    expect(r3.success).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('blocks requests beyond the limit', () => {
    for (let i = 0; i < 3; i++) {
      rateLimit('test-block', 3, 60_000);
    }

    const r4 = rateLimit('test-block', 3, 60_000);
    expect(r4.success).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfterMs).toBeGreaterThan(0);
  });

  it('tracks separate keys independently', () => {
    rateLimit('key-a', 1, 60_000);
    const ra2 = rateLimit('key-a', 1, 60_000);
    expect(ra2.success).toBe(false);

    const rb1 = rateLimit('key-b', 1, 60_000);
    expect(rb1.success).toBe(true);
  });
});

describe('rateLimitResponse', () => {
  it('returns 429 with Retry-After header', async () => {
    const res = rateLimitResponse(30_000);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(res.headers.get('Content-Type')).toBe('application/json');

    const body = await res.json();
    expect(body.error).toContain('Too many requests');
  });

  it('rounds Retry-After up to the next second', async () => {
    const res = rateLimitResponse(1_500);
    expect(res.headers.get('Retry-After')).toBe('2');
  });
});
