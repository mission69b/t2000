import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { T2000 } from '@t2000/sdk';

const SESSION_PATH = resolve(homedir(), '.t2000', '.session');

async function resolvePin(): Promise<string> {
  const envPin = process.env.T2000_PIN ?? process.env.T2000_PASSPHRASE;
  if (envPin) return envPin;

  try {
    const session = await readFile(SESSION_PATH, 'utf-8');
    if (session.trim()) return session.trim();
  } catch { /* no session */ }

  throw new Error(
    'No PIN available. Either:\n' +
    '  1. Run `t2000 balance` first (creates session), or\n' +
    '  2. Set T2000_PIN environment variable',
  );
}

export async function createAgent(keyPath?: string): Promise<T2000> {
  const pin = await resolvePin();
  return T2000.create({ pin, keyPath });
}
