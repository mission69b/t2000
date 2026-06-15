// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 4 — 2026-05-26]
// `t2 limit show` — display current opt-in spending limits.

import type { Command } from 'commander';
import pc from 'picocolors';
import { getLimits } from '@t2000/sdk';
import {
  printKeyValue,
  printBlank,
  printInfo,
  printJson,
  isJsonMode,
  handleError,
} from '../../output.js';

export interface LimitShowOptions {
  /** Test injection — dir holding config.json; absent → `~/.t2000`. */
  configDir?: string;
}

export function registerLimitShow(parent: Command) {
  parent
    .command('show')
    .description('Show current spending limits')
    .action(async (opts: LimitShowOptions) => {
      try {
        const limits = getLimits(opts.configDir) ?? {};
        const hasAny =
          limits.perTxUsd !== undefined || limits.dailyUsd !== undefined;

        if (isJsonMode()) {
          printJson({
            limits: hasAny ? limits : null,
            configured: hasAny,
          });
          return;
        }

        if (!hasAny) {
          printBlank();
          printInfo(
            'No spending limits set. Use `t2 limit set --per-tx <usd>` or `--daily <usd>` to opt in.',
          );
          printBlank();
          return;
        }

        printBlank();
        if (limits.perTxUsd !== undefined) {
          printKeyValue('Per-transaction', pc.green(`$${limits.perTxUsd}`));
        }
        if (limits.dailyUsd !== undefined) {
          printKeyValue('Daily (cumulative)', pc.green(`$${limits.dailyUsd}`));
        }
        printBlank();
        printInfo('Use `--force` on `t2 send` / `t2 swap` / `t2 pay` to override per-call.');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
