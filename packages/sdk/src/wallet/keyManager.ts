// v4.0 wallet auth model: plain Bech32 secret in a versioned JSON file,
// 0o600 perms. Matches the Sui CLI convention. No AES, no PIN, no scrypt.
// Anything that isn't `{ version: 2, secret: "suiprivkey1..." }` throws
// `WALLET_CORRUPT` — the user moves/deletes the file and runs `t2 init`.

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
 * Save a Bech32 secret directly as a v2 plain wallet file. Used by any
 * path where the secret is supplied externally rather than freshly
 * generated. Kept exported because external tooling may still want it
 * even though the CLI no longer ships an `--import` flag.
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
 * - **Anything else** → throw `WALLET_CORRUPT`. The user moves or
 *   deletes the file and runs `t2 init` to create a fresh wallet.
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
    throw new T2000Error(
      'WALLET_CORRUPT',
      `Wallet file at ${filePath} is not a valid v4 wallet. Move or delete the file, then run \`t2 init\`.`,
    );
  }

  if (!isPlainKey(parsed)) {
    throw new T2000Error(
      'WALLET_CORRUPT',
      `Wallet file at ${filePath} is not a valid v4 wallet. Expected { version: 2, secret: "suiprivkey1..." }. Move or delete the file, then run \`t2 init\`.`,
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
