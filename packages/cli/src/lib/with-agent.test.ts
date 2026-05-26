import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { generateKeypair, saveKey } from '@t2000/sdk';
import { tryWithAgent } from './with-agent.js';

describe('with-agent', () => {
  let tempDir: string;
  let keyPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 't2000-test-'));
    keyPath = join(tempDir, 'wallet.key');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns { kind: "ok", agent } for a valid v2 wallet', async () => {
    const keypair = generateKeypair();
    await saveKey(keypair, undefined, keyPath);

    const result = await tryWithAgent({ keyPath });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.agent.address()).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it('returns { kind: "error", error: WALLET_CORRUPT } for a v3.x AES wallet', async () => {
    const legacy = {
      version: 1,
      algorithm: 'aes-256-gcm',
      salt: 'a'.repeat(64),
      iv: 'b'.repeat(32),
      tag: 'c'.repeat(32),
      ciphertext: 'd'.repeat(128),
    };
    await writeFile(keyPath, JSON.stringify(legacy));

    const result = await tryWithAgent({ keyPath });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect((result.error as { code?: string }).code).toBe('WALLET_CORRUPT');
    }
  });

  it('returns { kind: "error" } when no wallet exists', async () => {
    const result = await tryWithAgent({ keyPath });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect((result.error as { code?: string }).code).toBe('WALLET_NOT_FOUND');
    }
  });
});
