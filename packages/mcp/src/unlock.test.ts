import { describe, it, expect, vi, beforeEach } from 'vitest';

// [v4.0 Phase B — 2026-05-26] `createAgent()` was simplified to a thin
// passthrough to `T2000.create({ keyPath })`. The PIN concept (env var
// + session file + decryption) was deleted with the v4 plain-Bech32
// wallet greenfield (S.328 Day 1).

vi.mock('@t2000/sdk', () => ({
  T2000: {
    create: vi.fn().mockResolvedValue({ address: () => '0xtest' }),
  },
}));

describe('createAgent (v4)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('delegates to T2000.create with no PIN', async () => {
    const { createAgent } = await import('./unlock.js');
    const { T2000 } = await import('@t2000/sdk');
    await createAgent();
    expect(T2000.create).toHaveBeenCalledWith({ keyPath: undefined });
  });

  it('forwards a custom keyPath', async () => {
    const { createAgent } = await import('./unlock.js');
    const { T2000 } = await import('@t2000/sdk');
    await createAgent('/custom/path/wallet.key');
    expect(T2000.create).toHaveBeenCalledWith({ keyPath: '/custom/path/wallet.key' });
  });

  it('does NOT read T2000_PIN / T2000_PASSPHRASE env vars', async () => {
    process.env.T2000_PIN = 'should-be-ignored';
    process.env.T2000_PASSPHRASE = 'also-ignored';
    const { createAgent } = await import('./unlock.js');
    const { T2000 } = await import('@t2000/sdk');
    await createAgent();
    const call = vi.mocked(T2000.create).mock.calls[0]?.[0] ?? {};
    expect((call as Record<string, unknown>).pin).toBeUndefined();
    expect((call as Record<string, unknown>).passphrase).toBeUndefined();
    delete process.env.T2000_PIN;
    delete process.env.T2000_PASSPHRASE;
  });
});
