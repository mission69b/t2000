// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 1 — 2026-05-26]
// `t2 wallet balance` — token list with USD values for wallet holdings
// only (USDC, USDsui, other stables, SUI gas reserve). NO savings/debt
// rollup — Agent Wallet is wallet-first; DeFi positions are an audric
// concern.
//
// Top-level `t2 balance` alias delegates to this handler via the
// shared `runWalletBalance` function.

import pc from 'picocolors';
import { Command } from 'commander';
import { formatUsd } from '@t2000/sdk';
import { withAgent } from '../../lib/with-agent.js';
import {
  printKeyValue,
  printBlank,
  printJson,
  isJsonMode,
  handleError,
  printSeparator,
} from '../../output.js';

export interface WalletBalanceOptions {
  key?: string;
}

export async function runWalletBalance(opts: WalletBalanceOptions): Promise<void> {
  const agent = await withAgent({ keyPath: opts.key });
  const bal = await agent.balance();

  if (isJsonMode()) {
    printJson({
      available: bal.available,
      stables: bal.stables,
      gasReserve: bal.gasReserve,
      walletTotal: walletTotal(bal),
    });
    return;
  }

  printBlank();

  const stables = bal.stables ?? {};
  const stableEntries = Object.entries(stables)
    .filter(([, v]) => v >= 0.01)
    .sort(([a], [b]) => (a === 'USDC' ? -1 : b === 'USDC' ? 1 : a.localeCompare(b)));

  if (stableEntries.length === 0) {
    printKeyValue('Stablecoins', `${pc.dim('none')}`);
  } else {
    for (const [symbol, amount] of stableEntries) {
      const label = symbol.padEnd(8);
      printKeyValue(label, formatUsd(amount));
    }
  }

  if (bal.gasReserve && bal.gasReserve.usdEquiv >= 0.001) {
    printKeyValue(
      'SUI',
      `${formatUsd(bal.gasReserve.usdEquiv)}  ${pc.dim(`(${bal.gasReserve.sui.toFixed(4)} SUI — gas)`)}`,
    );
  }

  printSeparator();
  printKeyValue('Wallet total', formatUsd(walletTotal(bal)));
  printBlank();
}

function walletTotal(bal: { available: number; gasReserve?: { usdEquiv: number } }): number {
  return bal.available + (bal.gasReserve?.usdEquiv ?? 0);
}

export function registerWalletBalance(parent: Command) {
  parent
    .command('balance')
    .description('Show stablecoin + SUI holdings (wallet only; not savings/debt)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(async (opts: WalletBalanceOptions) => {
      try {
        await runWalletBalance(opts);
      } catch (error) {
        handleError(error);
      }
    });
}
