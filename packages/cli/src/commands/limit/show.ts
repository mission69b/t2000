// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 4 — 2026-05-26]
// `t2 limit show` — display current opt-in spending limits.

import type { Command } from 'commander';
import pc from 'picocolors';
import { readConfig } from '../../lib/config-store.js';
import {
  printKeyValue,
  printBlank,
  printInfo,
  printJson,
  isJsonMode,
  handleError,
} from '../../output.js';

export interface LimitShowOptions {
  /** Test injection; absent → uses default `~/.t2000/config.json`. */
  configPath?: string;
}

export function registerLimitShow(parent: Command) {
  parent
    .command('show')
    .description('Show current spending limits')
    .action(async (opts: LimitShowOptions) => {
      try {
        const config = await readConfig(opts.configPath);
        const limits = config.limits ?? {};
        const hasAny =
          limits.perTxUsd !== undefined || limits.dailySendUsd !== undefined;

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
        if (limits.dailySendUsd !== undefined) {
          printKeyValue('Daily send', pc.green(`$${limits.dailySendUsd}`));
        }
        printBlank();
        printInfo('Use `--force` on `t2 send` / `t2 swap` / `t2 pay` to override per-call.');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
