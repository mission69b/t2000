import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, formatUsd } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError, printHeader, printSeparator, printInfo } from '../output.js';

export function registerPortfolio(program: Command) {
  program
    .command('portfolio')
    .description('Show investment portfolio')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const portfolio = await agent.getPortfolio();

        if (isJsonMode()) { printJson(portfolio); return; }

        printBlank();

        if (portfolio.positions.length === 0) {
          printInfo('No investments yet. Try: t2000 invest buy 100 SUI');
          printBlank();
          return;
        }

        printHeader('Investment Portfolio');
        printSeparator();
        for (const pos of portfolio.positions) {
          if (pos.currentPrice === 0 && pos.totalAmount > 0) {
            printKeyValue(
              pos.asset,
              `${pos.totalAmount.toFixed(4)}    Avg: ${formatUsd(pos.avgPrice)}    Now: ${pc.yellow('unavailable')}`,
            );
          } else {
            const pnlColor = pos.unrealizedPnL >= 0 ? pc.green : pc.red;
            const pnlSign = pos.unrealizedPnL >= 0 ? '+' : '';
            printKeyValue(
              pos.asset,
              `${pos.totalAmount.toFixed(4)}    Avg: ${formatUsd(pos.avgPrice)}    Now: ${formatUsd(pos.currentPrice)}    ${pnlColor(`${pnlSign}${formatUsd(pos.unrealizedPnL)} (${pnlSign}${pos.unrealizedPnLPct.toFixed(1)}%)`)}`,
            );
          }
        }
        printSeparator();

        const hasPriceUnavailable = portfolio.positions.some(p => p.currentPrice === 0 && p.totalAmount > 0);
        if (hasPriceUnavailable) {
          printInfo(pc.yellow('⚠ Price data unavailable for some assets. Values may be inaccurate.'));
        }

        printKeyValue('Total invested', formatUsd(portfolio.totalInvested));
        printKeyValue('Current value', formatUsd(portfolio.totalValue));

        const upnlColor = portfolio.unrealizedPnL >= 0 ? pc.green : pc.red;
        const upnlSign = portfolio.unrealizedPnL >= 0 ? '+' : '';
        printKeyValue('Unrealized P&L', upnlColor(`${upnlSign}${formatUsd(portfolio.unrealizedPnL)} (${upnlSign}${portfolio.unrealizedPnLPct.toFixed(1)}%)`));

        if (portfolio.realizedPnL !== 0) {
          const rpnlColor = portfolio.realizedPnL >= 0 ? pc.green : pc.red;
          const rpnlSign = portfolio.realizedPnL >= 0 ? '+' : '';
          printKeyValue('Realized P&L', rpnlColor(`${rpnlSign}${formatUsd(portfolio.realizedPnL)}`));
        }
        printBlank();
      } catch (error) { handleError(error); }
    });
}
