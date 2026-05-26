// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 1 — 2026-05-26]
// v4.0 wallet auth model: plain Bech32 secret in a versioned JSON file,
// 0o600 perms. Matches the Sui CLI convention. No AES, no PIN, no scrypt.
//
// **Legacy v3.x wallets** (AES-256-GCM encrypted, PIN-derived key) are
// detected at load-time and rejected with `WALLET_LEGACY_AES` — the CLI
// translates that into actionable recovery instructions
// (`t2 init --import <bech32>` flow). No silent auto-migration: the
// affected user base is tiny (~5 founder + early-tester wallets) and
// the security delta of keeping AES code paths around isn't worth it.

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { T2000Error } from '../errors.js';
import { DEFAULT_KEY_PATH } from '../constants.js';

interface PlainKey {
  version: 2;
  secret: string;
}

interface LegacyEncryptedKey {
  version: 1;
  algorithm: string;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

function expandPath(p: string): string {
  if (p.startsWith('~')) return resolve(homedir(), p.slice(2));
  return resolve(p);
}

export function generateKeypair(): Ed25519Keypair {
  return Ed25519Keypair.generate();
}

export function keypairFromPrivateKey(privateKey: string): Ed25519Keypair {
  if (privateKey.startsWith('suiprivkey')) {
    const decoded = decodeSuiPrivateKey(privateKey);
    return Ed25519Keypair.fromSecretKey(decoded.secretKey);
  }
  const bytes = Buffer.from(privateKey.replace(/^0x/, ''), 'hex');
  return Ed25519Keypair.fromSecretKey(bytes);
}

/**
 * Save a keypair as a v2 plain Bech32 JSON file with `0o600` perms.
 *
 * `_passphrase` is accepted but IGNORED — kept in the signature for
 * back-compat with v3.x callers. Will be removed when all callers
 * are off PIN (Phase A Day 5+).
 */
export async function saveKey(
  keypair: Ed25519Keypair,
  _passphrase: string | undefined,
  keyPath?: string,
): Promise<string> {
  const filePath = expandPath(keyPath ?? DEFAULT_KEY_PATH);

  try {
    await access(filePath);
    throw new T2000Error('WALLET_EXISTS', `Wallet already exists at ${filePath}`);
  } catch (error) {
    if (error instanceof T2000Error) throw error;
  }

  await mkdir(dirname(filePath), { recursive: true });

  const payload: PlainKey = {
    version: 2,
    secret: keypair.getSecretKey(),
  };

  await writeFile(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });

  return filePath;
}

/**
 * Save a Bech32 secret directly as a v2 plain wallet file. Used by the
 * `t2 init --import` recovery flow and any other path where the secret
 * is supplied externally rather than freshly generated.
 */
export async function saveBech32(secret: string, keyPath?: string): Promise<string> {
  if (!secret.startsWith('suiprivkey')) {
    throw new T2000Error(
      'INVALID_KEY',
      `Secret must be a Bech32 suiprivkey1... string. Got: ${secret.slice(0, 12)}...`,
    );
  }
  decodeSuiPrivateKey(secret);

  const filePath = expandPath(keyPath ?? DEFAULT_KEY_PATH);

  try {
    await access(filePath);
    throw new T2000Error('WALLET_EXISTS', `Wallet already exists at ${filePath}`);
  } catch (error) {
    if (error instanceof T2000Error) throw error;
  }

  await mkdir(dirname(filePath), { recursive: true });

  const payload: PlainKey = { version: 2, secret };

  await writeFile(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });

  return filePath;
}

/**
 * Load a keypair from disk.
 *
 * `_passphrase` is accepted but IGNORED — kept for back-compat. The
 * actual file format determines the load path:
 *
 * - **v2 plain JSON** (`{ version: 2, secret: "suiprivkey1..." }`) →
 *   decode + return keypair.
 * - **v1 AES JSON** (legacy v3.x) → throw `WALLET_LEGACY_AES`. The CLI
 *   surfaces this as a recovery banner. No auto-migration.
 * - **Anything else** → throw `WALLET_CORRUPT`.
 */
export async function loadKey(
  _passphrase?: string,
  keyPath?: string,
): Promise<Ed25519Keypair> {
  const filePath = expandPath(keyPath ?? DEFAULT_KEY_PATH);

  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    throw new T2000Error('WALLET_NOT_FOUND', `No wallet found at ${filePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new T2000Error('WALLET_CORRUPT', `Wallet file at ${filePath} is not valid JSON`);
  }

  if (isLegacyEncryptedKey(parsed)) {
    throw new T2000Error(
      'WALLET_LEGACY_AES',
      `Legacy v3.x AES wallet detected at ${filePath}. v4.x dropped PIN encryption — recover via 'npm install -g @t2000/cli@3' + 't2000 export' + 't2 init --import <suiprivkey1...>'.`,
    );
  }

  if (!isPlainKey(parsed)) {
    throw new T2000Error(
      'WALLET_CORRUPT',
      `Wallet file at ${filePath} has unrecognised format. Expected { version: 2, secret: "suiprivkey1..." }.`,
    );
  }

  const decoded = decodeSuiPrivateKey(parsed.secret);
  return Ed25519Keypair.fromSecretKey(decoded.secretKey);
}

export async function walletExists(keyPath?: string): Promise<boolean> {
  const filePath = expandPath(keyPath ?? DEFAULT_KEY_PATH);
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect a legacy v3.x AES wallet WITHOUT trying to decrypt. Returns
 * `true` if the file exists AND parses as `{ version: 1, algorithm,
 * salt, iv, tag, ciphertext }`. Used by the CLI's pre-flight check
 * so we can fail fast with a recovery banner before any command runs.
 */
export async function isLegacyWalletPath(keyPath?: string): Promise<boolean> {
  const filePath = expandPath(keyPath ?? DEFAULT_KEY_PATH);

  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return false;
  }

  try {
    const parsed = JSON.parse(content);
    return isLegacyEncryptedKey(parsed);
  } catch {
    return false;
  }
}

export function exportPrivateKey(keypair: Ed25519Keypair): string {
  return keypair.getSecretKey();
}

export function getAddress(keypair: Ed25519Keypair): string {
  return keypair.getPublicKey().toSuiAddress();
}

function isPlainKey(value: unknown): value is PlainKey {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { version?: unknown }).version === 2 &&
    typeof (value as { secret?: unknown }).secret === 'string'
  );
}

function isLegacyEncryptedKey(value: unknown): value is LegacyEncryptedKey {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    typeof v.algorithm === 'string' &&
    typeof v.salt === 'string' &&
    typeof v.iv === 'string' &&
    typeof v.tag === 'string' &&
    typeof v.ciphertext === 'string'
  );
}
