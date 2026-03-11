import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('@t2000/sdk', () => ({
  T2000: {
    create: vi.fn().mockResolvedValue({ address: () => '0xtest' }),
  },
}));

describe('unlock', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.T2000_PIN;
    delete process.env.T2000_PASSPHRASE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should resolve PIN from T2000_PIN env var', async () => {
    process.env.T2000_PIN = 'env-pin-123';
    const { createAgent } = await import('./unlock.js');
    const { T2000 } = await import('@t2000/sdk');
    await createAgent();
    expect(T2000.create).toHaveBeenCalledWith({ pin: 'env-pin-123', keyPath: undefined });
  });

  it('should resolve PIN from T2000_PASSPHRASE env var', async () => {
    process.env.T2000_PASSPHRASE = 'passphrase-456';
    const { createAgent } = await import('./unlock.js');
    const { T2000 } = await import('@t2000/sdk');
    await createAgent();
    expect(T2000.create).toHaveBeenCalledWith({ pin: 'passphrase-456', keyPath: undefined });
  });

  it('should prefer T2000_PIN over T2000_PASSPHRASE', async () => {
    process.env.T2000_PIN = 'pin-wins';
    process.env.T2000_PASSPHRASE = 'passphrase-loses';
    const { createAgent } = await import('./unlock.js');
    const { T2000 } = await import('@t2000/sdk');
    await createAgent();
    expect(T2000.create).toHaveBeenCalledWith({ pin: 'pin-wins', keyPath: undefined });
  });

  it('should resolve PIN from session file when no env var', async () => {
    vi.mocked(readFile).mockResolvedValue('session-pin-789');
    const { createAgent } = await import('./unlock.js');
    const { T2000 } = await import('@t2000/sdk');
    await createAgent();
    expect(T2000.create).toHaveBeenCalledWith({ pin: 'session-pin-789', keyPath: undefined });
  });

  it('should throw when no PIN available', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    const { createAgent } = await import('./unlock.js');
    await expect(createAgent()).rejects.toThrow('No PIN available');
  });
});
