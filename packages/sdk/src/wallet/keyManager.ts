import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { T2000Error } from '../errors.js';
import { DEFAULT_KEY_PATH } from '../constants.js';

const ALGORITHM = 'aes-256-gcm';
const SCRYPT_N = 2 ** 14; // 16384 — secure and fast enough
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_LENGTH = 32;
const IV_LENGTH = 16;

interface EncryptedKey {
  version: 1;
  algorithm: typeof ALGORITHM;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

function expandPath(p: string): string {
  if (p.startsWith('~')) return resolve(homedir(), p.slice(2));
  return resolve(p);
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
}

function encrypt(data: Buffer, passphrase: string): EncryptedKey {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(passphrase, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    algorithm: ALGORITHM,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  };
}

function decrypt(encrypted: EncryptedKey, passphrase: string): Buffer {
  const salt = Buffer.from(encrypted.salt, 'hex');
  const key = deriveKey(passphrase, salt);
  const iv = Buffer.from(encrypted.iv, 'hex');
  const tag = Buffer.from(encrypted.tag, 'hex');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new T2000Error('WALLET_LOCKED', 'Invalid PIN');
  }
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

export async function saveKey(
  keypair: Ed25519Keypair,
  passphrase: string,
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

  const bech32Key = keypair.getSecretKey();
  const encrypted = encrypt(Buffer.from(bech32Key, 'utf-8'), passphrase);

  await writeFile(filePath, JSON.stringify(encrypted, null, 2), { mode: 0o600 });

  return filePath;
}

export async function loadKey(passphrase: string, keyPath?: string): Promise<Ed25519Keypair> {
  const filePath = expandPath(keyPath ?? DEFAULT_KEY_PATH);

  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    throw new T2000Error('WALLET_NOT_FOUND', `No wallet found at ${filePath}`);
  }

  const encrypted: EncryptedKey = JSON.parse(content);
  const decrypted = decrypt(encrypted, passphrase);
  const bech32Key = decrypted.toString('utf-8');
  const decoded = decodeSuiPrivateKey(bech32Key);

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
