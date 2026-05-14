import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('env.ts — boot-time validation gate (SPEC 30 D-14)', () => {
  it('throws when DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('AUDRIC_INTERNAL_KEY', 'k');
    vi.stubEnv('T2000_OVERLAY_FEE_WALLET', '0x1');
    vi.resetModules();
    await expect(import('./env.js')).rejects.toThrow(/DATABASE_URL.*non-empty/i);
  });

  it('throws when AUDRIC_INTERNAL_KEY is missing', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://t');
    vi.stubEnv('AUDRIC_INTERNAL_KEY', '');
    vi.stubEnv('T2000_OVERLAY_FEE_WALLET', '0x1');
    vi.resetModules();
    await expect(import('./env.js')).rejects.toThrow(/AUDRIC_INTERNAL_KEY.*non-empty/i);
  });

  it('throws when T2000_OVERLAY_FEE_WALLET is missing (no silent fallback)', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://t');
    vi.stubEnv('AUDRIC_INTERNAL_KEY', 'k');
    vi.stubEnv('T2000_OVERLAY_FEE_WALLET', '');
    vi.resetModules();
    await expect(import('./env.js')).rejects.toThrow(/T2000_OVERLAY_FEE_WALLET.*non-empty/i);
  });

  it('throws when a required var is whitespace-only (catches the empty-string-in-Vercel bug class)', async () => {
    vi.stubEnv('DATABASE_URL', '   ');
    vi.stubEnv('AUDRIC_INTERNAL_KEY', 'k');
    vi.stubEnv('T2000_OVERLAY_FEE_WALLET', '0x1');
    vi.resetModules();
    await expect(import('./env.js')).rejects.toThrow(/DATABASE_URL.*non-empty/i);
  });

  it('parses successfully with required vars set + applies defaults for optional vars', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://t');
    vi.stubEnv('AUDRIC_INTERNAL_KEY', 'k');
    vi.stubEnv('T2000_OVERLAY_FEE_WALLET', '0x1');
    vi.resetModules();
    const { env } = await import('./env.js');
    expect(env.DATABASE_URL).toBe('postgres://t');
    expect(env.AUDRIC_INTERNAL_KEY).toBe('k');
    expect(env.T2000_OVERLAY_FEE_WALLET).toBe('0x1');
    expect(env.AUDRIC_INTERNAL_URL).toBe('https://audric.ai');
    expect(env.CRON_GROUP).toBe('daily-intel');
    expect(env.PORT).toBe(3000);
    expect(env.INDEXER_POLL_INTERVAL_MS).toBe(2000);
    expect(env.INDEXER_BATCH_SIZE).toBe(10);
    expect(env.T2000_FIN_CTX_SHARD_COUNT).toBe(8);
  });

  it('respects vi.stubEnv on optional vars (live re-read via Proxy)', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://t');
    vi.stubEnv('AUDRIC_INTERNAL_KEY', 'k');
    vi.stubEnv('T2000_OVERLAY_FEE_WALLET', '0x1');
    vi.resetModules();
    const { env } = await import('./env.js');

    expect(env.PORT).toBe(3000);
    vi.stubEnv('PORT', '4000');
    expect(env.PORT).toBe(4000);

    expect(env.AUDRIC_INTERNAL_URL).toBe('https://audric.ai');
    vi.stubEnv('AUDRIC_INTERNAL_URL', 'https://test.audric.ai');
    expect(env.AUDRIC_INTERNAL_URL).toBe('https://test.audric.ai');
  });

  it('parses int defaults from string env vars', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://t');
    vi.stubEnv('AUDRIC_INTERNAL_KEY', 'k');
    vi.stubEnv('T2000_OVERLAY_FEE_WALLET', '0x1');
    vi.stubEnv('INDEXER_BATCH_SIZE', '50');
    vi.stubEnv('T2000_FIN_CTX_SHARD_COUNT', '16');
    vi.resetModules();
    const { env } = await import('./env.js');
    expect(env.INDEXER_BATCH_SIZE).toBe(50);
    expect(env.T2000_FIN_CTX_SHARD_COUNT).toBe(16);
  });

  it('falls back to default when an int var is non-numeric (corruption tolerance)', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://t');
    vi.stubEnv('AUDRIC_INTERNAL_KEY', 'k');
    vi.stubEnv('T2000_OVERLAY_FEE_WALLET', '0x1');
    vi.stubEnv('INDEXER_BATCH_SIZE', 'not-a-number');
    vi.resetModules();
    const { env } = await import('./env.js');
    expect(env.INDEXER_BATCH_SIZE).toBe(10);
  });
});
