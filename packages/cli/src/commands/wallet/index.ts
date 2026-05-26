// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 1 — 2026-05-26]
// `t2 wallet` command group — explicit help on bare invocation (NOT
// auto-aliased to `balance`; explicit is better than surprise).
// Subcommands: address, balance.

import { Command } from 'commander';
import { registerWalletAddress } from './address.js';
import { registerWalletBalance } from './balance.js';

export function registerWallet(program: Command) {
  const wallet = program
    .command('wallet')
    .description('Wallet management — address, balance');

  registerWalletAddress(wallet);
  registerWalletBalance(wallet);
}
