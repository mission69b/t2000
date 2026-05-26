// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 1 — 2026-05-26]
// `t2 balance` — top-level alias for `t2 wallet balance`. Symmetric
// with `t2 receive` + `t2 send` (the top-level wallet-shorthand verbs).

import { Command } from 'commander';
import { runWalletBalance } from './wallet/balance.js';
import { handleError } from '../output.js';

export interface BalanceOptions {
  key?: string;
}

export function registerBalance(program: Command) {
  program
    .command('balance')
    .description('Show wallet balance (alias for `t2 wallet balance`)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(async (opts: BalanceOptions) => {
      try {
        await runWalletBalance(opts);
      } catch (error) {
        handleError(error);
      }
    });
}
