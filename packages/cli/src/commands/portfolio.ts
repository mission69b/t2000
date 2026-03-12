import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, formatUsd, formatAssetAmount } from '@t2000/sdk';
import type { InvestmentPosition } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError, printHeader, printSeparator, printInfo, printLine } from '../output.js';

function printPositionLine(pos: InvestmentPosition) {
  if (pos.currentPrice === 0 && pos.totalAmount > 0) {
    printKeyValue(
      pos.asset,
      `${formatAssetAmount(pos.totalAmount, pos.asset)}    Avg: ${formatUsd(pos.avgPrice)}    Now: ${pc.yellow('unavailable')}`,
    );
  } else {
    const pnlColor = pos.unrealizedPnL >= 0 ? pc.green : pc.red;
    const pnlSign = pos.unrealizedPnL >= 0 ? '+' : '';
    const yieldSuffix = pos.earning && pos.earningApy
      ? `    ${pc.cyan(`${pos.earningApy.toFixed(1)}% APY (${pos.earningProtocol})`)}`
      : '';
    printKeyValue(
      pos.asset,
      `${formatAssetAmount(pos.totalAmount, pos.asset)}    Avg: ${formatUsd(pos.avgPrice)}    Now: ${formatUsd(pos.currentPrice)}    ${pnlColor(`${pnlSign}${formatUsd(pos.unrealizedPnL)} (${pnlSign}${pos.unrealizedPnLPct.toFixed(1)}%)`)}${yieldSuffix}`,
    );
  }
}

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

        const hasDirectPositions = portfolio.positions.length > 0;
        const hasStrategyPositions = portfolio.strategyPositions && Object.keys(portfolio.strategyPositions).length > 0;

        if (!hasDirectPositions && !hasStrategyPositions) {
          printInfo('No investments yet. Try: t2000 invest buy 100 SUI');
          printBlank();
          return;
        }

        printHeader('Investment Portfolio');

        if (hasStrategyPositions) {
          for (const [key, positions] of Object.entries(portfolio.strategyPositions!)) {
            let stratLabel = key;
            try {
              const def = agent.strategies.get(key);
              stratLabel = def.name;
            } catch { /* use key */ }
            printLine(`  ${pc.bold(pc.cyan(`▸ ${stratLabel}`))}`);
            printSeparator();
            for (const pos of positions) {
              printPositionLine(pos);
            }
            const stratValue = positions.reduce((s, p) => s + p.currentValue, 0);
            printLine(`  ${pc.dim(`Subtotal: ${formatUsd(stratValue)}`)}`);
            printBlank();
          }
        }

        if (hasDirectPositions) {
          if (hasStrategyPositions) {
            printLine(`  ${pc.bold(pc.cyan('▸ Direct'))}`);
          }
          printSeparator();
          for (const pos of portfolio.positions) {
            printPositionLine(pos);
          }
          if (hasStrategyPositions) {
            const directValue = portfolio.positions.reduce((s, p) => s + p.currentValue, 0);
            printLine(`  ${pc.dim(`Subtotal: ${formatUsd(directValue)}`)}`);
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
