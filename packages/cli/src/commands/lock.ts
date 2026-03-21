import type { Command } from 'commander';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { SafeguardEnforcer } from '@t2000/sdk';
import { clearSession, resolvePin, saveSession } from '../prompts.js';
import { printSuccess, printBlank, printJson, printInfo, isJsonMode, handleError, printError } from '../output.js';

const CONFIG_DIR = join(homedir(), '.t2000');

export function registerLock(program: Command) {
  program
    .command('lock')
    .description('Lock agent — freeze all operations')
    .action(async () => {
      try {
        const enforcer = new SafeguardEnforcer(CONFIG_DIR);
        enforcer.load();
        enforcer.lock();
        await clearSession();

        if (isJsonMode()) {
          printJson({ locked: true });
          return;
        }

        printBlank();
        printSuccess('Agent locked. All operations frozen.');
        printInfo('Run: t2000 unlock  (requires PIN)');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command('unlock')
    .description('Unlock agent — resume operations')
    .action(async () => {
      try {
        const { T2000 } = await import('@t2000/sdk');
        const MAX_ATTEMPTS = 3;

        let pin: string | undefined;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          pin = await resolvePin({ skipSession: true });
          if (!pin) {
            throw new Error('PIN required to unlock agent');
          }

          try {
            await T2000.create({ pin });
            break;
          } catch (error) {
            const msg = error instanceof Error ? error.message : '';
            if (msg.includes('Invalid PIN')) {
              const remaining = MAX_ATTEMPTS - attempt;
              if (remaining > 0) {
                printError(`Invalid PIN. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`);
                pin = undefined;
                continue;
              }
              printError('Invalid PIN. No attempts remaining.');
              return;
            }
            throw error;
          }
        }

        if (!pin) return;

        await saveSession(pin);

        const enforcer = new SafeguardEnforcer(CONFIG_DIR);
        enforcer.load();
        enforcer.unlock();

        if (isJsonMode()) {
          printJson({ locked: false });
          return;
        }

        const config = enforcer.getConfig();
        printBlank();
        printSuccess('Agent unlocked. Operations resumed.');
        if (config.maxPerTx > 0 || config.maxDailySend > 0) {
          const limits: string[] = [];
          if (config.maxPerTx > 0) limits.push(`maxPerTx=$${config.maxPerTx}`);
          if (config.maxDailySend > 0) limits.push(`maxDailySend=$${config.maxDailySend}`);
          printInfo(`Active safeguards: ${limits.join(', ')}`);
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
