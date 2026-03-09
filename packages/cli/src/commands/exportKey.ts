import type { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { T2000 } from '@t2000/sdk';
import { resolvePin, askConfirm } from '../prompts.js';
import { printSuccess, printBlank, printInfo, printJson, isJsonMode, handleError, printError } from '../output.js';

const LOCKFILE = resolve(homedir(), '.t2000', '.pin-lock');
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

interface LockState {
  attempts: number;
  lockedUntil: number;
}

async function getLockState(): Promise<LockState> {
  try {
    const data = JSON.parse(await readFile(LOCKFILE, 'utf-8'));
    return data as LockState;
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}

async function setLockState(state: LockState): Promise<void> {
  await mkdir(resolve(homedir(), '.t2000'), { recursive: true });
  await writeFile(LOCKFILE, JSON.stringify(state), { mode: 0o600 });
}

export function registerExport(program: Command) {
  program
    .command('export')
    .description('Export private key (raw Ed25519 hex)')
    .option('--key <path>', 'Key file path')
    .option('--yes', 'Skip confirmation')
    .action(async (opts) => {
      try {
        const lock = await getLockState();
        if (lock.lockedUntil > Date.now()) {
          const remainSec = Math.ceil((lock.lockedUntil - Date.now()) / 1000);
          printError(`Too many failed PIN attempts. Try again in ${remainSec}s.`);
          return;
        }

        if (!opts.yes && !isJsonMode()) {
          const proceed = await askConfirm(
            'WARNING: This will display your raw private key. Anyone with this key controls your wallet. Continue?',
          );
          if (!proceed) return;
        }

        const pin = await resolvePin();

        let agent;
        try {
          agent = await T2000.create({ pin, keyPath: opts.key });
        } catch (error) {
          const msg = error instanceof Error ? error.message : '';
          if (msg.includes('Invalid PIN')) {
            const newAttempts = lock.attempts + 1;
            if (newAttempts >= MAX_ATTEMPTS) {
              await setLockState({ attempts: newAttempts, lockedUntil: Date.now() + LOCKOUT_MS });
              printError(`Invalid PIN. Account locked for 5 minutes (${newAttempts} failed attempts).`);
            } else {
              await setLockState({ attempts: newAttempts, lockedUntil: 0 });
              printError(`Invalid PIN. ${MAX_ATTEMPTS - newAttempts} attempts remaining.`);
            }
            return;
          }
          throw error;
        }

        await setLockState({ attempts: 0, lockedUntil: 0 });

        const hex = agent.exportKey();

        if (isJsonMode()) {
          printJson({ privateKey: hex, format: 'ed25519_hex' });
          return;
        }

        printBlank();
        printSuccess('Private key (Ed25519, hex):');
        console.log(`  ${hex}`);
        printBlank();
        printInfo('Not a BIP39 mnemonic. Store securely and never share.');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
