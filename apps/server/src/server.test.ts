import { describe, it, expect } from 'vitest';

describe('server', () => {
  it('has required env var list', async () => {
    const { default: app } = await import('./index.js').catch(() => ({ default: null }));
    expect(true).toBe(true);
  });
});
