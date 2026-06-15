// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 4 — 2026-05-26]
// `t2 limit reset` — clear opt-in spending limits.

import type { Command } from 'commander';
import { clearLimits, hasLimits } from '@t2000/sdk';
import {
  printSuccess,
  printBlank,
  printInfo,
  printJson,
  isJsonMode,
  handleError,
} from '../../output.js';

export interface LimitResetOptions {
  /** Test injection — dir holding config.json; absent → `~/.t2000`. */
  configDir?: string;
}

export function registerLimitReset(parent: Command) {
  parent
    .command('reset')
    .description('Clear all spending limits')
    .action(async (opts: LimitResetOptions) => {
      try {
        if (!hasLimits(opts.configDir)) {
          if (isJsonMode()) {
            printJson({ ok: true, cleared: false, reason: 'no limits were set' });
            return;
          }
          printBlank();
          printInfo('No limits set; nothing to clear.');
          printBlank();
          return;
        }

        clearLimits(opts.configDir);

        if (isJsonMode()) {
          printJson({ ok: true, cleared: true });
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
