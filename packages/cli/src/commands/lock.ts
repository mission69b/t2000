import type { Command } from 'commander';
import { clearSession } from '../prompts.js';
import { printSuccess, printBlank, handleError } from '../output.js';

export function registerLock(program: Command) {
  program
    .command('lock')
    .description('Clear saved session (require PIN on next command)')
    .action(async () => {
      try {
        await clearSession();
        printBlank();
        printSuccess('Session cleared — PIN required on next command');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
