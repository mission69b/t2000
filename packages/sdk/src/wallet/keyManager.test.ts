import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import {
  generateKeypair,
  keypairFromPrivateKey,
  saveKey,
  saveBech32,
  loadKey,
  walletExists,
  exportPrivateKey,
  getAddress,
} from './keyManager.js';

describe('keyManager (v4.0 plain Bech32)', () => {
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

  it('saves and loads a v2 plain Bech32 wallet (round-trip)', async () => {
    const keypair = generateKeypair();
    const keyPath = join(tempDir, 'wallet.key');

    await saveKey(keypair, undefined, keyPath);
    expect(await walletExists(keyPath)).toBe(true);

    const content = JSON.parse(await readFile(keyPath, 'utf-8'));
    expect(content.version).toBe(2);
    expect(content.secret).toMatch(/^suiprivkey/);

    const loaded = await loadKey(undefined, keyPath);
    expect(getAddress(loaded)).toBe(getAddress(keypair));
  });

  it('writes the wallet file with 0o600 perms', async () => {
    const keypair = generateKeypair();
    const keyPath = join(tempDir, 'wallet.key');
    await saveKey(keypair, undefined, keyPath);
    const mode = (await stat(keyPath)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('ignores the passphrase argument (back-compat shim)', async () => {
    const keypair = generateKeypair();
    const keyPath = join(tempDir, 'wallet.key');

    await saveKey(keypair, 'this-is-ignored', keyPath);
    const loaded = await loadKey('this-too-is-ignored', keyPath);
    expect(getAddress(loaded)).toBe(getAddress(keypair));
  });

  it('saveBech32 writes a v2 file from a raw secret', async () => {
    const original = generateKeypair();
    const secret = exportPrivateKey(original);
    const keyPath = join(tempDir, 'wallet.key');

    await saveBech32(secret, keyPath);
    const loaded = await loadKey(undefined, keyPath);
    expect(getAddress(loaded)).toBe(getAddress(original));
  });

  it('saveBech32 rejects non-Bech32 secrets', async () => {
    const keyPath = join(tempDir, 'wallet.key');
    await expect(saveBech32('0xdeadbeef', keyPath)).rejects.toThrow(/suiprivkey/);
  });

  it('throws WALLET_CORRUPT on a v3.x AES file (no longer special-cased)', async () => {
    const keyPath = join(tempDir, 'wallet.key');
    const legacyFile = {
      version: 1,
      algorithm: 'aes-256-gcm',
      salt: 'a'.repeat(64),
      iv: 'b'.repeat(32),
      tag: 'c'.repeat(32),
      ciphertext: 'd'.repeat(128),
    };
    await writeFile(keyPath, JSON.stringify(legacyFile));

    await expect(loadKey(undefined, keyPath)).rejects.toMatchObject({
      code: 'WALLET_CORRUPT',
    });
  });

  it('throws WALLET_CORRUPT on garbage JSON', async () => {
    const keyPath = join(tempDir, 'wallet.key');
    await writeFile(keyPath, 'not json at all');
    await expect(loadKey(undefined, keyPath)).rejects.toMatchObject({
      code: 'WALLET_CORRUPT',
    });
  });

  it('throws WALLET_CORRUPT on unrecognised JSON shape', async () => {
    const keyPath = join(tempDir, 'wallet.key');
    await writeFile(keyPath, JSON.stringify({ version: 99, mysteryField: 'x' }));
    await expect(loadKey(undefined, keyPath)).rejects.toMatchObject({
      code: 'WALLET_CORRUPT',
    });
  });

  it('throws if wallet already exists (saveKey)', async () => {
    const keypair = generateKeypair();
    const keyPath = join(tempDir, 'wallet.key');
    await saveKey(keypair, undefined, keyPath);
    await expect(saveKey(keypair, undefined, keyPath)).rejects.toThrow(/already exists/);
  });

  it('throws if wallet already exists (saveBech32)', async () => {
    const keypair = generateKeypair();
    const secret = exportPrivateKey(keypair);
    const keyPath = join(tempDir, 'wallet.key');
    await saveBech32(secret, keyPath);
    await expect(saveBech32(secret, keyPath)).rejects.toThrow(/already exists/);
  });

  it('throws WALLET_NOT_FOUND when file is missing', async () => {
    const keyPath = join(tempDir, 'nonexistent.key');
    await expect(loadKey(undefined, keyPath)).rejects.toMatchObject({
      code: 'WALLET_NOT_FOUND',
    });
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
