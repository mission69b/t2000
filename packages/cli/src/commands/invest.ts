import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, formatUsd, formatAssetAmount, DEFAULT_STRATEGIES, INVESTMENT_ASSETS } from '@t2000/sdk';
import type { InvestmentAsset } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl, printHeader, printSeparator, printInfo, printLine } from '../output.js';

export function registerInvest(program: Command) {
  const investCmd = program
    .command('invest')
    .description('Buy or sell investment assets');

  investCmd
    .command('buy <amount> <asset>')
    .description('Invest USD amount in an asset')
    .option('--key <path>', 'Key file path')
    .option('--slippage <pct>', 'Max slippage percent', '3')
    .action(async (amount: string, asset: string, opts: { key?: string; slippage: string }) => {
      try {
        const parsed = parseFloat(amount);
        if (isNaN(parsed) || parsed <= 0 || !isFinite(parsed)) {
          console.error(pc.red('  ✗ Amount must be greater than $0'));
          process.exitCode = 1;
          return;
        }
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const result = await agent.investBuy({
          asset: asset.toUpperCase() as InvestmentAsset,
          usdAmount: parsed,
          maxSlippage: parseFloat(opts.slippage) / 100,
        });

        if (isJsonMode()) { printJson(result); return; }

        printBlank();
        const sym = asset.toUpperCase();
        printSuccess(`Bought ${formatAssetAmount(result.amount, sym)} ${sym} at ${formatUsd(result.price)}`);
        printKeyValue('Invested', formatUsd(result.usdValue));
        printKeyValue('Portfolio', `${formatAssetAmount(result.position.totalAmount, sym)} ${sym} (avg ${formatUsd(result.position.avgPrice)})`);
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) { handleError(error); }
    });

  investCmd
    .command('sell <amount> <asset>')
    .description('Sell USD amount of an asset (or "all")')
    .option('--key <path>', 'Key file path')
    .option('--slippage <pct>', 'Max slippage percent', '3')
    .action(async (amount: string, asset: string, opts: { key?: string; slippage: string }) => {
      try {
        const isAll = amount.toLowerCase() === 'all';
        if (!isAll) {
          const parsed = parseFloat(amount);
          if (isNaN(parsed) || parsed <= 0 || !isFinite(parsed)) {
            console.error(pc.red('  ✗ Amount must be greater than $0'));
            process.exitCode = 1;
            return;
          }
        }
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const usdAmount = isAll ? 'all' as const : parseFloat(amount);
        const result = await agent.investSell({
          asset: asset.toUpperCase() as InvestmentAsset,
          usdAmount,
          maxSlippage: parseFloat(opts.slippage) / 100,
        });

        if (isJsonMode()) { printJson(result); return; }

        printBlank();
        const sym = asset.toUpperCase();
        printSuccess(`Sold ${formatAssetAmount(result.amount, sym)} ${sym} at ${formatUsd(result.price)}`);
        printKeyValue('Proceeds', formatUsd(result.usdValue));
        if (result.realizedPnL !== undefined) {
          const pnlColor = result.realizedPnL >= 0 ? pc.green : pc.red;
          const pnlSign = result.realizedPnL >= 0 ? '+' : '';
          printKeyValue('Realized P&L', pnlColor(`${pnlSign}${formatUsd(result.realizedPnL)}`));
        }
        if (result.position.totalAmount > 0) {
          printKeyValue('Remaining', `${formatAssetAmount(result.position.totalAmount, sym)} ${sym} (avg ${formatUsd(result.position.avgPrice)})`);
        }
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) { handleError(error); }
    });

  investCmd
    .command('earn <asset>')
    .description('Deposit invested asset into best-rate lending protocol')
    .option('--key <path>', 'Key file path')
    .action(async (asset: string, opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const result = await agent.investEarn({
          asset: asset.toUpperCase() as InvestmentAsset,
        });

        if (isJsonMode()) { printJson(result); return; }

        printBlank();
        const sym = asset.toUpperCase();
        if (result.amount === 0 && !result.tx) {
          printSuccess(`${sym} is already fully earning via ${result.protocol} (${result.apy.toFixed(1)}% APY)`);
        } else {
          printSuccess(`${sym} deposited into ${result.protocol} (${result.apy.toFixed(1)}% APY)`);
          printKeyValue('Amount', `${formatAssetAmount(result.amount, sym)} ${sym}`);
          printKeyValue('Protocol', result.protocol);
          printKeyValue('APY', `${result.apy.toFixed(2)}%`);
          printKeyValue('Tx', explorerUrl(result.tx));
        }
        printBlank();
      } catch (error) { handleError(error); }
    });

  investCmd
    .command('unearn <asset>')
    .description('Withdraw invested asset from lending (keeps in portfolio)')
    .option('--key <path>', 'Key file path')
    .action(async (asset: string, opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const result = await agent.investUnearn({
          asset: asset.toUpperCase() as InvestmentAsset,
        });

        if (isJsonMode()) { printJson(result); return; }

        printBlank();
        const sym = asset.toUpperCase();
        printSuccess(`Withdrew ${formatAssetAmount(result.amount, sym)} ${sym} from ${result.protocol}`);
        printKeyValue('Status', `${sym} remains in investment portfolio (locked)`);
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) { handleError(error); }
    });

  // -- Strategy subcommands --

  const strategyCmd = investCmd
    .command('strategy')
    .description('Manage investment strategies');

  strategyCmd
    .command('list')
    .description('List available strategies')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const all = agent.strategies.getAll();

        if (isJsonMode()) { printJson(all); return; }

        printBlank();
        printHeader('Investment Strategies');
        printSeparator();
        for (const [key, def] of Object.entries(all)) {
          const allocs = Object.entries(def.allocations).map(([a, p]) => `${a} ${p}%`).join(', ');
          const tag = def.custom ? pc.dim(' (custom)') : '';
          printKeyValue(key, `${allocs}${tag}`);
          printLine(`    ${pc.dim(def.description)}`);
        }
        printSeparator();

        const hasPositions = Object.keys(all).some((k) => agent.portfolio.hasStrategyPositions(k));
        if (!hasPositions) {
          printInfo('Buy into a strategy: t2000 invest strategy buy bluechip 100');
        }
        printBlank();
      } catch (error) { handleError(error); }
    });

  strategyCmd
    .command('buy <name> <amount>')
    .description('Buy into a strategy')
    .option('--key <path>', 'Key file path')
    .option('--dry-run', 'Preview allocation without executing')
    .action(async (name: string, amount: string, opts: { key?: string; dryRun?: boolean }) => {
      try {
        const parsed = parseFloat(amount);
        if (isNaN(parsed) || parsed <= 0) {
          console.error(pc.red('  ✗ Amount must be greater than $0'));
          process.exitCode = 1;
          return;
        }
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const result = await agent.investStrategy({ strategy: name.toLowerCase(), usdAmount: parsed, dryRun: opts.dryRun });

        if (isJsonMode()) { printJson(result); return; }

        printBlank();
        if (opts.dryRun) {
          printHeader(`Strategy: ${name} — Dry Run (${formatUsd(parsed)})`);
          printSeparator();
          for (const buy of result.buys) {
            printKeyValue(buy.asset, `${formatUsd(buy.usdAmount)} → ~${formatAssetAmount(buy.amount, buy.asset)} ${buy.asset} @ ${formatUsd(buy.price)}`);
          }
          printSeparator();
          printInfo('Run without --dry-run to execute');
        } else {
          const txDigests = [...new Set(result.buys.map(b => b.tx))];
          const isSingleTx = txDigests.length === 1;
          printSuccess(`Invested ${formatUsd(parsed)} in ${name} strategy`);
          printSeparator();
          for (const buy of result.buys) {
            printKeyValue(buy.asset, `${formatAssetAmount(buy.amount, buy.asset)} @ ${formatUsd(buy.price)}`);
          }
          printSeparator();
          printKeyValue('Total invested', formatUsd(result.totalInvested));
          if (isSingleTx) {
            printKeyValue('Tx', explorerUrl(txDigests[0]));
          } else {
            for (const buy of result.buys) {
              printLine(`  ${pc.dim(`${buy.asset}: ${explorerUrl(buy.tx)}`)}`);
            }
          }
        }
        printBlank();
      } catch (error) { handleError(error); }
    });

  strategyCmd
    .command('sell <name>')
    .description('Sell all positions in a strategy')
    .option('--key <path>', 'Key file path')
    .action(async (name: string, opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const result = await agent.sellStrategy({ strategy: name.toLowerCase() });

        if (isJsonMode()) { printJson(result); return; }

        printBlank();
        printSuccess(`Sold all ${name} strategy positions`);
        printSeparator();
        for (const sell of result.sells) {
          const pnlColor = sell.realizedPnL >= 0 ? pc.green : pc.red;
          const pnlSign = sell.realizedPnL >= 0 ? '+' : '';
          printKeyValue(sell.asset, `${formatAssetAmount(sell.amount, sell.asset)} → ${formatUsd(sell.usdValue)}  ${pnlColor(`${pnlSign}${formatUsd(sell.realizedPnL)}`)}`);
        }
        if (result.failed && result.failed.length > 0) {
          for (const f of result.failed) {
            console.error(pc.yellow(`  ⚠ ${f.asset}: ${f.reason}`));
          }
        }
        printSeparator();
        printKeyValue('Total proceeds', formatUsd(result.totalProceeds));
        const rpnlColor = result.realizedPnL >= 0 ? pc.green : pc.red;
        const rpnlSign = result.realizedPnL >= 0 ? '+' : '';
        printKeyValue('Realized P&L', rpnlColor(`${rpnlSign}${formatUsd(result.realizedPnL)}`));
        printBlank();
      } catch (error) { handleError(error); }
    });

  strategyCmd
    .command('status <name>')
    .description('Show current status and weights of a strategy')
    .option('--key <path>', 'Key file path')
    .action(async (name: string, opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const status = await agent.getStrategyStatus(name.toLowerCase());

        if (isJsonMode()) { printJson(status); return; }

        printBlank();
        printHeader(`Strategy: ${status.definition.name}`);
        printSeparator();

        if (status.positions.length === 0) {
          printInfo('No positions yet. Buy in with: t2000 invest strategy buy ' + name + ' 100');
        } else {
          for (const pos of status.positions) {
            const target = status.definition.allocations[pos.asset] ?? 0;
            const actual = status.currentWeights[pos.asset] ?? 0;
            const drift = actual - target;
            const driftColor = Math.abs(drift) > 3 ? pc.yellow : pc.dim;
            const pnlColor = pos.unrealizedPnL >= 0 ? pc.green : pc.red;
            const pnlSign = pos.unrealizedPnL >= 0 ? '+' : '';
            printKeyValue(
              pos.asset,
              `${formatAssetAmount(pos.totalAmount, pos.asset)}  ${formatUsd(pos.currentValue)}  ${pnlColor(`${pnlSign}${formatUsd(pos.unrealizedPnL)}`)}  ${driftColor(`${actual.toFixed(0)}% / ${target}% target`)}`,
            );
          }
          printSeparator();
          printKeyValue('Total value', formatUsd(status.totalValue));
        }
        printBlank();
      } catch (error) { handleError(error); }
    });

  strategyCmd
    .command('rebalance <name>')
    .description('Rebalance a strategy to target weights')
    .option('--key <path>', 'Key file path')
    .action(async (name: string, opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const result = await agent.rebalanceStrategy({ strategy: name.toLowerCase() });

        if (isJsonMode()) { printJson(result); return; }

        printBlank();
        if (result.trades.length === 0) {
          printInfo(`Strategy '${name}' is already balanced (within 3% threshold)`);
        } else {
          printSuccess(`Rebalanced ${name} strategy`);
          printSeparator();
          for (const t of result.trades) {
            const action = t.action === 'buy' ? pc.green('BUY') : pc.red('SELL');
            printKeyValue(t.asset, `${action} ${formatUsd(t.usdAmount)} (${formatAssetAmount(t.amount, t.asset)})`);
          }
          printSeparator();
          printInfo('Weights: ' + Object.entries(result.afterWeights).map(([a, w]) => `${a} ${w.toFixed(0)}%`).join(', '));
        }
        printBlank();
      } catch (error) { handleError(error); }
    });

  strategyCmd
    .command('create <name>')
    .description('Create a custom strategy')
    .requiredOption('--alloc <pairs...>', 'Allocations e.g. SUI:40 BTC:20 ETH:20 GOLD:20')
    .option('--description <desc>', 'Strategy description')
    .action(async (name: string, opts: { alloc: string[]; description?: string }) => {
      try {
        const allocations: Record<string, number> = {};
        for (const pair of opts.alloc) {
          const [asset, pctStr] = pair.split(':');
          if (!asset || !pctStr) {
            console.error(pc.red(`  ✗ Invalid allocation: '${pair}'. Use ASSET:PCT format (e.g. SUI:60)`));
            process.exitCode = 1;
            return;
          }
          allocations[asset.toUpperCase()] = parseFloat(pctStr);
        }
        const pin = await resolvePin();
        const agent = await T2000.create({ pin });
        const definition = agent.strategies.create({ name, allocations, description: opts.description });

        if (isJsonMode()) { printJson(definition); return; }

        printBlank();
        printSuccess(`Created strategy '${name}'`);
        const allocs = Object.entries(definition.allocations).map(([a, p]) => `${a} ${p}%`).join(', ');
        printKeyValue('Allocations', allocs);
        printBlank();
      } catch (error) { handleError(error); }
    });

  strategyCmd
    .command('delete <name>')
    .description('Delete a custom strategy')
    .option('--key <path>', 'Key file path')
    .action(async (name: string, opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        if (agent.portfolio.hasStrategyPositions(name.toLowerCase())) {
          console.error(pc.red(`  ✗ Strategy '${name}' has open positions. Sell first: t2000 invest strategy sell ${name}`));
          process.exitCode = 1;
          return;
        }

        agent.strategies.delete(name.toLowerCase());

        if (isJsonMode()) { printJson({ deleted: name }); return; }

        printBlank();
        printSuccess(`Deleted strategy '${name}'`);
        printBlank();
      } catch (error) { handleError(error); }
    });

  // -- Auto-Invest subcommands --

  const autoCmd = investCmd
    .command('auto')
    .description('Dollar-cost averaging (DCA) schedules');

  autoCmd
    .command('setup <amount> <frequency> [target]')
    .description('Create a DCA schedule (target = strategy name or asset)')
    .option('--key <path>', 'Key file path')
    .option('--day <num>', 'Day of week (1-7) or month (1-28)')
    .action(async (amount: string, frequency: string, target: string | undefined, opts: { key?: string; day?: string }) => {
      try {
        const parsed = parseFloat(amount);
        if (isNaN(parsed) || parsed < 1) {
          console.error(pc.red('  ✗ Amount must be at least $1'));
          process.exitCode = 1;
          return;
        }
        if (!['daily', 'weekly', 'monthly'].includes(frequency)) {
          console.error(pc.red('  ✗ Frequency must be daily, weekly, or monthly'));
          process.exitCode = 1;
          return;
        }

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const allStrategies = agent.strategies.getAll();
        const isStrategy = target ? target.toLowerCase() in allStrategies : false;
        const isAsset = target ? target.toUpperCase() in INVESTMENT_ASSETS : false;

        if (target && !isStrategy && !isAsset) {
          console.error(pc.red(`  ✗ '${target}' is not a valid strategy or asset`));
          process.exitCode = 1;
          return;
        }

        const dayNum = opts.day ? parseInt(opts.day, 10) : undefined;
        const schedule = agent.setupAutoInvest({
          amount: parsed,
          frequency: frequency as 'daily' | 'weekly' | 'monthly',
          strategy: isStrategy ? target!.toLowerCase() : undefined,
          asset: isAsset ? target!.toUpperCase() : undefined,
          dayOfWeek: frequency === 'weekly' ? dayNum : undefined,
          dayOfMonth: frequency === 'monthly' ? dayNum : undefined,
        });

        if (isJsonMode()) { printJson(schedule); return; }

        printBlank();
        const targetLabel = schedule.strategy ?? schedule.asset ?? 'unknown';
        printSuccess(`Auto-invest created: ${formatUsd(schedule.amount)} ${schedule.frequency} → ${targetLabel}`);
        printKeyValue('Schedule ID', schedule.id);
        printKeyValue('Next run', new Date(schedule.nextRun).toLocaleDateString());
        printInfo('Run manually: t2000 invest auto run');
        printBlank();
      } catch (error) { handleError(error); }
    });

  autoCmd
    .command('status')
    .description('Show all DCA schedules')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const status = agent.getAutoInvestStatus();

        if (isJsonMode()) { printJson(status); return; }

        printBlank();
        if (status.schedules.length === 0) {
          printInfo('No auto-invest schedules. Set one up: t2000 invest auto setup 50 weekly bluechip');
          printBlank();
          return;
        }

        printHeader('Auto-Invest Schedules');
        printSeparator();
        for (const s of status.schedules) {
          const target = s.strategy ?? s.asset ?? '?';
          const statusTag = s.enabled ? pc.green('active') : pc.dim('paused');
          printKeyValue(s.id, `${formatUsd(s.amount)} ${s.frequency} → ${target}  ${statusTag}`);
          printLine(`    ${pc.dim(`Next: ${new Date(s.nextRun).toLocaleDateString()} · Runs: ${s.runCount} · Total: ${formatUsd(s.totalInvested)}`)}`);
        }
        printSeparator();

        if (status.pendingRuns.length > 0) {
          printInfo(`${status.pendingRuns.length} pending run(s). Execute: t2000 invest auto run`);
        } else {
          printInfo('All schedules up to date');
        }
        printBlank();
      } catch (error) { handleError(error); }
    });

  autoCmd
    .command('run')
    .description('Execute pending DCA purchases')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const status = agent.getAutoInvestStatus();
        if (status.pendingRuns.length === 0) {
          if (isJsonMode()) { printJson({ executed: [], skipped: [] }); return; }
          printBlank();
          printInfo('No pending auto-invest runs. All schedules are up to date.');
          printBlank();
          return;
        }

        const result = await agent.runAutoInvest();

        if (isJsonMode()) { printJson(result); return; }

        printBlank();
        if (result.executed.length > 0) {
          printSuccess(`Executed ${result.executed.length} auto-invest run(s)`);
          for (const exec of result.executed) {
            const target = exec.strategy ?? exec.asset ?? '?';
            printKeyValue(target, formatUsd(exec.amount));
          }
        }
        if (result.skipped.length > 0) {
          for (const skip of result.skipped) {
            printLine(`  ${pc.yellow('⚠')} Skipped ${skip.scheduleId}: ${skip.reason}`);
          }
        }
        printBlank();
      } catch (error) { handleError(error); }
    });

  autoCmd
    .command('stop <id>')
    .description('Stop an auto-invest schedule')
    .option('--key <path>', 'Key file path')
    .action(async (id: string, opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        agent.stopAutoInvest(id);

        if (isJsonMode()) { printJson({ stopped: id }); return; }

        printBlank();
        printSuccess(`Stopped auto-invest schedule ${id}`);
        printBlank();
      } catch (error) { handleError(error); }
    });
}
