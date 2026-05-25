// [SPEC_AGENTIC_STACK P1 / CLI F2 — 2026-05-25]
// `fund` is the canonical command for showing how to deposit funds INTO the
// Agentic Wallet (i.e. the on-chain address to receive USDC from an exchange).
// Pre-Phase 1 the command was named `deposit` — confusing because "deposit"
// also means "deposit into NAVI lending" in DeFi. The `deposit` command stays
// registered as a deprecation alias for one release; it prints a one-line stderr
// hint and then runs the same action. The SDK method `agent.deposit()` keeps
// its name (back-compat); `agent.fund()` is a thin alias added alongside.
import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printHeader, printBlank, printJson, isJsonMode, handleError } from '../output.js';

type FundOpts = { key?: string };

async function runFund(opts: FundOpts): Promise<void> {
  try {
    const pin = await resolvePin();
    const agent = await T2000.create({ pin, keyPath: opts.key });

    const info = await agent.fund();

    if (isJsonMode()) {
      printJson(info);
      return;
    }

    printHeader('Fund your Agentic Wallet');
    console.log(info.instructions);
    printBlank();
  } catch (error) {
    handleError(error);
  }
}

export function registerFund(program: Command) {
  program
    .command('fund')
    .description('Show how to fund your Agentic Wallet (receive address + supported networks)')
    .option('--key <path>', 'Key file path')
    .action(runFund);

  program
    .command('deposit')
    .description('[deprecated] Use `t2000 fund` instead')
    .option('--key <path>', 'Key file path')
    .action(async (opts: FundOpts) => {
      console.error('Warning: `t2000 deposit` is deprecated. Use `t2000 fund` instead.');
      await runFund(opts);
    });
}
