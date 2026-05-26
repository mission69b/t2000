import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { generateKeypair, saveKey } from '@t2000/sdk';
import {
  checkForLegacyWallet,
  formatLegacyWalletBanner,
  legacyWalletErrorMessage,
} from './legacy-wallet-detect.js';

describe('legacy-wallet-detect', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 't2000-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns true for a v3.x AES wallet file', async () => {
    const keyPath = join(tempDir, 'wallet.key');
    const legacy = {
      version: 1,
      algorithm: 'aes-256-gcm',
      salt: 'a'.repeat(64),
      iv: 'b'.repeat(32),
      tag: 'c'.repeat(32),
      ciphertext: 'd'.repeat(128),
    };
    await writeFile(keyPath, JSON.stringify(legacy));
    expect(await checkForLegacyWallet(keyPath)).toBe(true);
  });

  it('returns false for a v4.0 plain wallet file', async () => {
    const keyPath = join(tempDir, 'wallet.key');
    const keypair = generateKeypair();
    await saveKey(keypair, undefined, keyPath);
    expect(await checkForLegacyWallet(keyPath)).toBe(false);
  });

  it('returns false when no wallet exists', async () => {
    expect(await checkForLegacyWallet(join(tempDir, 'absent.key'))).toBe(false);
  });

  it('banner mentions the path + recovery steps', () => {
    const banner = formatLegacyWalletBanner('/Users/x/.t2000/wallet.key');
    expect(banner).toContain('/Users/x/.t2000/wallet.key');
    expect(banner).toMatch(/npm install -g @t2000\/cli@3/);
    expect(banner).toMatch(/t2000 export/);
    expect(banner).toMatch(/t2 init --import/);
  });

  it('errorMessage is single-line + recoverable', () => {
    const msg = legacyWalletErrorMessage('/home/x/.t2000/wallet.key');
    expect(msg).toMatch(/Legacy v3\.x AES wallet/);
    expect(msg).toMatch(/t2 init --import/);
    expect(msg.split('\n')).toHaveLength(1);
  });
});
