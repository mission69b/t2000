// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 4 — 2026-05-26]
// `t2 limit set --per-tx <N>` / `--daily <N>` — opt in to spending caps.

import type { Command } from 'commander';
import pc from 'picocolors';
import { setLimits, getLimits, type LimitsConfig } from '@t2000/sdk';
import {
  printSuccess,
  printKeyValue,
  printBlank,
  printInfo,
  printJson,
  isJsonMode,
  handleError,
} from '../../output.js';

export interface LimitSetOptions {
  perTx?: string;
  daily?: string;
  /** Test injection — dir holding config.json; absent → `~/.t2000`. */
  configDir?: string;
}

/**
 * Pure parser — converts the raw CLI string flags to a typed
 * `LimitsConfig`. Throws on invalid input so the command action can
 * surface a clean error envelope.
 */
export function parseLimitSetArgs(opts: { perTx?: string; daily?: string }): LimitsConfig {
  const perTx = opts.perTx !== undefined ? parseUsdFlag('--per-tx', opts.perTx) : undefined;
  const daily = opts.daily !== undefined ? parseUsdFlag('--daily', opts.daily) : undefined;

  if (perTx === undefined && daily === undefined) {
    throw new Error(
      'Usage: t2 limit set [--per-tx <usd>] [--daily <usd>]\n  at least one flag must be provided',
    );
  }

  const limits: LimitsConfig = {};
  if (perTx !== undefined) limits.perTxUsd = perTx;
  if (daily !== undefined) limits.dailyUsd = daily;
  return limits;
}

function parseUsdFlag(flag: string, raw: string): number {
  const value = parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${flag} value: "${raw}". Must be a positive number (USD).`);
  }
  return value;
}

export function registerLimitSet(parent: Command) {
  parent
    .command('set')
    .description('Set spending limits (opt-in; either flag is optional)')
    .option('--per-tx <usd>', 'Max USD per single transaction (send | swap | pay)')
    .option('--daily <usd>', 'Max CUMULATIVE USD spend per day across all writes')
    .addHelpText(
      'after',
      `
Examples:
  $ t2 limit set --per-tx 50         Cap every write at $50
  $ t2 limit set --daily 100         Cap total spend at $100/day (cumulative)
  $ t2 limit set --per-tx 50 --daily 100   Set both
`,
    )
    .action(async (opts: LimitSetOptions) => {
      try {
        const limits = parseLimitSetArgs({ perTx: opts.perTx, daily: opts.daily });
        setLimits(limits, opts.configDir);
        const next = getLimits(opts.configDir);

        if (isJsonMode()) {
          printJson({ ok: true, limits: next });
          return;
        }

        printBlank();
        printSuccess('Spending limits updated.');
        if (next?.perTxUsd !== undefined) {
          printKeyValue('Per-transaction', pc.green(`$${next.perTxUsd}`));
        }
        if (next?.dailyUsd !== undefined) {
          printKeyValue('Daily (cumulative)', pc.green(`$${next.dailyUsd}`));
        }
        printBlank();
        printInfo('Use `t2 limit show` to view; `t2 limit reset` to clear.');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
