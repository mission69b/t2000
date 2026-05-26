// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 1 — 2026-05-26]
// `t2 wallet address` — print the Sui address only. Machine-parseable
// in --json mode; bare address (no formatting) on stdout otherwise so
// it pipes cleanly into other tools (`t2 wallet address | qrencode`).

import { Command } from 'commander';
import { withAgent } from '../../lib/with-agent.js';
import { printJson, isJsonMode, handleError } from '../../output.js';

export interface WalletAddressOptions {
  key?: string;
}

export function registerWalletAddress(parent: Command) {
  parent
    .command('address')
    .description('Print the wallet Sui address')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(async (opts: WalletAddressOptions) => {
      try {
        const agent = await withAgent({ keyPath: opts.key });
        const address = agent.address();
        if (isJsonMode()) {
          printJson({ address });
          return;
        }
        process.stdout.write(`${address}\n`);
      } catch (error) {
        handleError(error);
      }
    });
}
