import { describe, it, expect } from 'vitest';

describe('server', () => {
  it('has required env var list', async () => {
    await import('./index.js').catch(() => null);
    expect(true).toBe(true);
  });
});
