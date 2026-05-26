// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 4 — 2026-05-26]
// `t2 limit reset` — clear opt-in spending limits.

import type { Command } from 'commander';
import {
  readConfig,
  writeConfig,
  clearLimits,
  hasLimits,
} from '../../lib/config-store.js';
import {
  printSuccess,
  printBlank,
  printInfo,
  printJson,
  isJsonMode,
  handleError,
} from '../../output.js';

export interface LimitResetOptions {
  configPath?: string;
}

export function registerLimitReset(parent: Command) {
  parent
    .command('reset')
    .description('Clear all spending limits')
    .action(async (opts: LimitResetOptions) => {
      try {
        const current = await readConfig(opts.configPath);
        if (!hasLimits(current)) {
          if (isJsonMode()) {
            printJson({ ok: true, cleared: false, reason: 'no limits were set' });
            return;
          }
          printBlank();
          printInfo('No limits set; nothing to clear.');
          printBlank();
          return;
        }

        const next = clearLimits(current);
        const filePath = await writeConfig(next, opts.configPath);

        if (isJsonMode()) {
          printJson({ ok: true, cleared: true, configPath: filePath });
          return;
        }

        printBlank();
        printSuccess('Spending limits cleared.');
        printInfo('Use `t2 limit set` to opt in again.');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
