// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 3 — 2026-05-26]
// `t2 swap <amount> <from> <to> [--quote]` — v4 Agent Wallet surface.
//
// Contract changes vs. the pre-pivot legacy command:
//   - Drops the "for" filler keyword that the v3 parser tolerated
//     (`t2000 swap 100 USDC for SUI`). Greenfield syntax is strictly
//     `t2 swap <amount> <from> <to>`.
//   - Adds a top-level `--quote` flag that dry-runs the route
//     (Cetus aggregator quote without signing). Folds the legacy
//     `t2000 swap-quote` command into the same verb so users have one
//     thing to learn. The legacy `swap-quote` command is no longer
//     registered in `program.ts` (file gets deleted at Day 5).
//   - PIN flow removed. Uses `withAgent` from `lib/with-agent.ts`,
//     which also runs the legacy v3.x wallet pre-flight banner.
//
// Slippage cap stays at 5% (`Math.min(input, 0.05)`) — matches the SDK
// guardrail in `t2000.ts:swap()`.

import type { Command } from 'commander';
import pc from 'picocolors';
import {
  printSuccess,
  printKeyValue,
  printBlank,
  printJson,
  isJsonMode,
  handleError,
  explorerUrl,
} from '../output.js';
import { withAgent } from '../lib/with-agent.js';
import { assertWithinLimits, approxUsdValue } from './limit/enforce.js';

/**
 * Pure parser for the v4 `t2 swap` positional args. v4 is strictly
 * 3-positional — the "for" filler from the legacy parser is gone.
 */
export function parseSwapArgs(
  amountStr: string,
  from: string | undefined,
  to: string | undefined,
): { amount: number; from: string; to: string } {
  const amount = parseFloat(amountStr);
  if (Number.isNaN(amount) || amount <= 0) {
    throw new Error(`Amount must be a positive number (got "${amountStr}").`);
  }

  if (!from || !to) {
    throw new Error(
      'Usage: t2 swap <amount> <from> <to>\n  example: t2 swap 100 USDC SUI\n  add `--quote` to preview without executing',
    );
  }

  return { amount, from, to };
}

export function registerSwap(program: Command) {
  program
    .command('swap')
    .argument('<amount>', 'Amount of <from> to swap (denominated in <from> units)')
    .argument('<from>', 'Source token symbol (e.g. USDC, SUI, USDsui)')
    .argument('<to>', 'Destination token symbol (e.g. SUI, USDC, USDsui)')
    .description('Swap tokens via Cetus aggregator (20+ DEXs)')
    .option('--quote', 'Preview the swap (price, route, impact) without executing')
    .option('--slippage <pct>', 'Max slippage percentage (default: 1)', '1')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--force', 'Override opt-in spending limits (see `t2 limit`)')
    .addHelpText(
      'after',
      `
Examples:
  $ t2 swap 100 USDC SUI               Swap 100 USDC for SUI via best route
  $ t2 swap 0.5 SUI USDsui             Swap 0.5 SUI for USDsui
  $ t2 swap 100 USDC SUI --quote       Preview only (no signing, no execution)
  $ t2 swap 50 USDC SUI --slippage 2   Cap slippage at 2% (default 1%)
`,
    )
    .action(
      async (
        amountStr: string,
        from: string,
        to: string,
        opts: { key?: string; slippage?: string; quote?: boolean; force?: boolean },
      ) => {
        try {
          const parsed = parseSwapArgs(amountStr, from, to);

          if (!opts.quote) {
            const usdValue = approxUsdValue(parsed.from, parsed.amount);
            if (usdValue !== null) {
              await assertWithinLimits({
                operation: 'swap',
                amountUsd: usdValue,
                force: opts.force,
              });
            }
          }

          const agent = await withAgent({ keyPath: opts.key });

          if (opts.quote) {
            const quote = await agent.swapQuote({
              from: parsed.from,
              to: parsed.to,
              amount: parsed.amount,
            });

            if (isJsonMode()) {
              printJson(quote);
              return;
            }

            printBlank();
            printKeyValue('Input', `${quote.fromAmount} ${quote.fromToken}`);
            printKeyValue('Output', pc.green(`${quote.toAmount.toFixed(6)} ${quote.toToken}`));
            if (quote.priceImpact > 0.001) {
              printKeyValue('Price impact', pc.yellow(`${(quote.priceImpact * 100).toFixed(2)}%`));
            }
            printKeyValue('Route', `${quote.fromToken} → ${quote.toToken} (${quote.route})`);
            printBlank();
            return;
          }

          const slippage = Math.min(parseFloat(opts.slippage ?? '1') / 100, 0.05);
          const result = await agent.swap({
            from: parsed.from,
            to: parsed.to,
            amount: parsed.amount,
            slippage,
          });

          if (isJsonMode()) {
            printJson(result);
            return;
          }

          printBlank();
          printSuccess(
            `Swapped ${pc.yellow(String(result.fromAmount))} ${result.fromToken} → ${pc.green(result.toAmount.toFixed(6))} ${result.toToken}`,
          );
          if (result.priceImpact > 0.005) {
            printKeyValue('Price impact', pc.yellow(`${(result.priceImpact * 100).toFixed(2)}%`));
          }
          printKeyValue('Route', `${result.fromToken} → ${result.toToken} (${result.route})`);
          printKeyValue('Gas', `${result.gasCost.toFixed(6)} SUI`);
          printKeyValue('Tx', explorerUrl(result.tx));
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );
}
