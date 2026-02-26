import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import {
  generateKeypair,
  keypairFromPrivateKey,
  saveKey,
  loadKey,
  walletExists,
  exportPrivateKey,
  getAddress,
} from './keyManager.js';

describe('keyManager', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 't2000-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('generates a valid Ed25519 keypair', () => {
    const keypair = generateKeypair();
    const address = getAddress(keypair);
    expect(address).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('saves and loads an encrypted key', async () => {
    const keypair = generateKeypair();
    const passphrase = 'test-passphrase-12345';
    const keyPath = join(tempDir, 'wallet.key');

    await saveKey(keypair, passphrase, keyPath);
    expect(await walletExists(keyPath)).toBe(true);

    const loaded = await loadKey(passphrase, keyPath);
    expect(getAddress(loaded)).toBe(getAddress(keypair));
  });

  it('rejects wrong PIN', async () => {
    const keypair = generateKeypair();
    const keyPath = join(tempDir, 'wallet.key');

    await saveKey(keypair, 'correct-pin', keyPath);

    await expect(loadKey('wrong-pin', keyPath)).rejects.toThrow('Invalid PIN');
  });

  it('throws if wallet already exists', async () => {
    const keypair = generateKeypair();
    const keyPath = join(tempDir, 'wallet.key');

    await saveKey(keypair, 'passphrase123', keyPath);
    await expect(saveKey(keypair, 'passphrase123', keyPath)).rejects.toThrow('already exists');
  });

  it('throws if wallet not found', async () => {
    const keyPath = join(tempDir, 'nonexistent.key');
    await expect(loadKey('passphrase', keyPath)).rejects.toThrow('No wallet found');
  });

  it('exports and reimports private key (bech32)', () => {
    const original = generateKeypair();
    const bech32Key = exportPrivateKey(original);
    expect(bech32Key).toMatch(/^suiprivkey/);
    const reimported = keypairFromPrivateKey(bech32Key);

    expect(getAddress(reimported)).toBe(getAddress(original));
  });

  it('walletExists returns false for missing file', async () => {
    expect(await walletExists(join(tempDir, 'nope.key'))).toBe(false);
  });
});
