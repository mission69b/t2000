import type { Command } from 'commander';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { SafeguardEnforcer } from '@t2000/sdk';
import { clearSession, resolvePin } from '../prompts.js';
import { printSuccess, printBlank, printJson, printInfo, isJsonMode, handleError } from '../output.js';

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
        const pin = await resolvePin();
        if (!pin) {
          throw new Error('PIN required to unlock agent');
        }

        const { T2000 } = await import('@t2000/sdk');
        await T2000.create({ pin });

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
