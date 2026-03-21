import { password, confirm } from '@inquirer/prompts';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const SESSION_PATH = resolve(homedir(), '.t2000', '.session');
const MIN_PIN_LENGTH = 4;

export async function askPin(message = 'Enter PIN:'): Promise<string> {
  const value = await password({ message });
  if (!value || value.length < MIN_PIN_LENGTH) {
    throw new Error(`PIN must be at least ${MIN_PIN_LENGTH} characters`);
  }
  return value;
}

export async function askPinConfirm(): Promise<string> {
  const pin = await password({ message: `Create PIN (min ${MIN_PIN_LENGTH} chars):` });
  if (!pin || pin.length < MIN_PIN_LENGTH) {
    throw new Error(`PIN must be at least ${MIN_PIN_LENGTH} characters`);
  }

  const confirm_ = await password({ message: 'Confirm PIN:' });
  if (pin !== confirm_) {
    throw new Error('PINs do not match');
  }

  return pin;
}

export async function askConfirm(message: string): Promise<boolean> {
  return confirm({ message });
}

export function getPinFromEnv(): string | undefined {
  return process.env.T2000_PIN ?? process.env.T2000_PASSPHRASE;
}

async function readSession(): Promise<string | undefined> {
  try {
    const content = await readFile(SESSION_PATH, 'utf-8');
    return content.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function saveSession(pin: string): Promise<void> {
  await mkdir(resolve(homedir(), '.t2000'), { recursive: true });
  await writeFile(SESSION_PATH, pin, { mode: 0o600 });
}

export async function clearSession(): Promise<void> {
  try {
    await unlink(SESSION_PATH);
  } catch {
    // already gone
  }
}

export async function resolvePin(opts?: { confirm?: boolean; skipSession?: boolean }): Promise<string> {
  const envPin = getPinFromEnv();
  if (envPin) return envPin;

  if (!opts?.skipSession) {
    const sessionPin = await readSession();
    if (sessionPin) return sessionPin;
  }

  const pin = opts?.confirm ? await askPinConfirm() : await askPin();

  if (!opts?.skipSession) {
    await saveSession(pin);
  }
  return pin;
}

/** @deprecated Use resolvePin() */
export const askPassphrase = askPin;
/** @deprecated Use resolvePin() */
export const askPassphraseConfirm = askPinConfirm;
/** @deprecated Use getPinFromEnv() */
export const getPassphraseFromEnv = getPinFromEnv;
