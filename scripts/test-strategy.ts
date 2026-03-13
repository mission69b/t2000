/**
 * Strategy & Auto-Invest Tests
 *
 * Tests: strategy list, buy (dry-run + real), status, sell, create/delete,
 *        auto-invest setup/status/run, portfolio grouping, balance aggregation.
 *
 * Requires at least $15 USDC available.
 * Buys into bluechip strategy, checks portfolio grouping, then sells.
 *
 * Usage:
 *   source .env.local && npx tsx scripts/test-strategy.ts
 */

import { assert, runSection, createAgent, summary, exitCode } from './test-helpers.js';

const BUY_AMOUNT = 10; // $10 — bluechip needs $5 min (SUI at 20% needs $1 each), buffer for safety

async function main() {
  console.log('\n  Strategy & Auto-Invest Tests\n');

  const agent = createAgent();

  const balBefore = await agent.balance();
  console.log(`   Starting USDC: $${balBefore.available.toFixed(2)}`);

  // Pre-flight: sell any stale bluechip positions from previous runs
  try {
    await agent.sellStrategy({ strategy: 'bluechip' });
    console.log('   ℹ  Pre-flight: sold stale bluechip positions');
  } catch {
    if (agent.portfolio.hasStrategyPositions('bluechip')) {
      agent.portfolio.clearStrategy('bluechip');
      console.log('   ℹ  Pre-flight: cleared stale bluechip tracking (sell failed)');
    }
  }

  // ── Strategy Defaults ──

  await runSection('Strategy list shows defaults', async () => {
    const all = agent.strategies.getAll();
    const keys = Object.keys(all);
    console.log(`   Strategies: ${keys.join(', ')}`);

    assert(keys.includes('bluechip'), 'bluechip strategy exists');
    assert(keys.includes('layer1'), 'layer1 strategy exists');
    assert(keys.includes('sui-heavy'), 'sui-heavy strategy exists');

    const bc = all['bluechip'];
    assert(bc.allocations.BTC === 50, 'bluechip BTC = 50%');
    assert(bc.allocations.ETH === 30, 'bluechip ETH = 30%');
    assert(bc.allocations.SUI === 20, 'bluechip SUI = 20%');
    assert(bc.custom === false, 'bluechip is built-in');
  });

  // ── Strategy Buy (dry-run) ──

  await runSection('Strategy buy dry-run', async () => {
    const result = await agent.investStrategy({ strategy: 'bluechip', usdAmount: BUY_AMOUNT, dryRun: true });

    console.log(`   Buys: ${result.buys.length}`);
    for (const b of result.buys) {
      console.log(`   ${b.asset}: $${b.usdAmount.toFixed(2)} → ~${b.amount.toFixed(6)}`);
    }

    assert(result.success === true, 'dry-run succeeded');
    assert(result.buys.length === 3, 'dry-run has 3 assets');
    assert(result.gasCost === 0, 'dry-run has zero gas cost');

    const btcBuy = result.buys.find(b => b.asset === 'BTC');
    assert(!!btcBuy, 'BTC allocation present');
    if (btcBuy) {
      assert(Math.abs(btcBuy.usdAmount - BUY_AMOUNT * 0.5) < 0.01, 'BTC gets 50% allocation');
    }
  });

  // ── Strategy Buy (real) ──

  await runSection(`Strategy buy bluechip $${BUY_AMOUNT}`, async () => {
    const result = await agent.investStrategy({ strategy: 'bluechip', usdAmount: BUY_AMOUNT });

    console.log(`   Total invested: $${result.totalInvested.toFixed(2)}`);
    for (const b of result.buys) {
      console.log(`   ${b.asset}: ${b.amount.toFixed(6)} @ $${b.price.toFixed(4)} (tx: ${b.tx.slice(0, 16)}...)`);
    }

    assert(result.success === true, 'strategy buy succeeded');
    assert(result.buys.length === 3, 'bought 3 assets');
    assert(result.totalInvested > 0, 'total invested > 0');
    assert(result.gasCost > 0, 'gas was spent');

    for (const b of result.buys) {
      assert(b.tx.length > 0, `${b.asset} has tx digest`);
      assert(b.amount > 0, `${b.asset} amount > 0`);
    }
  });

  // ── Strategy Status ──

  await runSection('Strategy status shows positions + weights', async () => {
    const status = await agent.getStrategyStatus('bluechip');

    console.log(`   Total value: $${status.totalValue.toFixed(2)}`);
    console.log(`   Positions: ${status.positions.length}`);
    for (const p of status.positions) {
      const w = status.currentWeights[p.asset] ?? 0;
      console.log(`   ${p.asset}: ${p.totalAmount.toFixed(6)} ($${p.currentValue.toFixed(2)}) — ${w.toFixed(1)}% (target: ${status.definition.allocations[p.asset]}%)`);
    }

    assert(status.positions.length === 3, 'has 3 positions');
    assert(status.totalValue > 0, 'total value > 0');
    assert(status.definition.name.includes('Bluechip'), 'correct strategy name');

    const weightSum = Object.values(status.currentWeights).reduce((s, w) => s + w, 0);
    assert(Math.abs(weightSum - 100) < 1, `weights sum to ~100 (got ${weightSum.toFixed(1)})`);
  });

  // ── Portfolio Grouping ──

  await runSection('Portfolio includes strategy positions', async () => {
    const portfolio = await agent.getPortfolio();

    console.log(`   Direct positions: ${portfolio.positions.length}`);
    console.log(`   Strategy groups: ${portfolio.strategyPositions ? Object.keys(portfolio.strategyPositions).length : 0}`);

    assert(!!portfolio.strategyPositions, 'strategyPositions field exists');
    if (portfolio.strategyPositions) {
      assert('bluechip' in portfolio.strategyPositions, 'bluechip group exists');
      const bcPositions = portfolio.strategyPositions['bluechip'];
      assert(bcPositions.length === 3, 'bluechip has 3 positions');
    }

    assert(portfolio.totalValue > 0, 'total value > 0');
    assert(portfolio.totalInvested > 0, 'total invested > 0');
  });

  // ── Balance Includes Strategy Value ──

  await runSection('Balance includes strategy investment value', async () => {
    const bal = await agent.balance();
    console.log(`   Investment: $${bal.investment.toFixed(2)}`);

    assert(bal.investment > 0, 'balance.investment > 0 (includes strategy)');
  });

  // ── Custom Strategy ──

  await runSection('Create custom strategy', async () => {
    const def = agent.strategies.create({
      name: 'test-custom',
      allocations: { SUI: 70, ETH: 30 },
      description: 'Test strategy',
    });

    console.log(`   Created: ${def.name}`);
    console.log(`   Custom: ${def.custom}`);

    assert(def.custom === true, 'marked as custom');
    assert(def.allocations.SUI === 70, 'SUI = 70%');
    assert(def.allocations.ETH === 30, 'ETH = 30%');
  });

  await runSection('Delete custom strategy', async () => {
    agent.strategies.delete('test-custom');
    const all = agent.strategies.getAll();
    assert(!('test-custom' in all), 'custom strategy deleted');
  });

  await runSection('Cannot delete built-in strategy', async () => {
    try {
      agent.strategies.delete('bluechip');
      assert(false, 'should have thrown');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      assert(code === 'STRATEGY_BUILTIN', `blocked with STRATEGY_BUILTIN (got ${code})`);
    }
  });

  await runSection('Invalid allocations rejected', async () => {
    try {
      agent.strategies.create({ name: 'bad', allocations: { SUI: 50 } });
      assert(false, 'should have thrown');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      assert(code === 'STRATEGY_INVALID_ALLOCATIONS', `blocked with STRATEGY_INVALID_ALLOCATIONS (got ${code})`);
    }
  });

  // ── Auto-Invest ──

  await runSection('Auto-invest setup', async () => {
    const schedule = agent.setupAutoInvest({
      amount: 10,
      frequency: 'weekly',
      strategy: 'bluechip',
    });

    console.log(`   ID:        ${schedule.id}`);
    console.log(`   Frequency: ${schedule.frequency}`);
    console.log(`   Next run:  ${schedule.nextRun}`);

    assert(schedule.enabled === true, 'schedule is enabled');
    assert(schedule.amount === 10, 'amount is $10');
    assert(schedule.frequency === 'weekly', 'frequency is weekly');
    assert(schedule.strategy === 'bluechip', 'strategy is bluechip');
    assert(schedule.runCount === 0, 'run count starts at 0');
  });

  await runSection('Auto-invest status', async () => {
    const status = agent.getAutoInvestStatus();

    console.log(`   Schedules: ${status.schedules.length}`);
    console.log(`   Pending:   ${status.pendingRuns.length}`);

    assert(status.schedules.length >= 1, 'has at least 1 schedule');
  });

  await runSection('Auto-invest run (nothing pending)', async () => {
    const result = await agent.runAutoInvest();

    console.log(`   Executed: ${result.executed.length}`);
    console.log(`   Skipped:  ${result.skipped.length}`);

    assert(result.executed.length === 0, 'nothing executed (next run is in the future)');
  });

  await runSection('Auto-invest stop', async () => {
    const status = agent.getAutoInvestStatus();
    const id = status.schedules[status.schedules.length - 1].id;
    agent.stopAutoInvest(id);

    const after = agent.getAutoInvestStatus();
    const stopped = after.schedules.find(s => s.id === id);
    assert(stopped?.enabled === false, 'schedule is disabled');
  });

  // ── Strategy Sell ──

  await runSection('Strategy sell bluechip', async () => {
    const result = await agent.sellStrategy({ strategy: 'bluechip' });

    console.log(`   Total proceeds: $${result.totalProceeds.toFixed(2)}`);
    console.log(`   Realized P&L:   $${result.realizedPnL.toFixed(4)}`);
    for (const s of result.sells) {
      console.log(`   ${s.asset}: ${s.amount.toFixed(6)} → $${s.usdValue.toFixed(2)} (P&L: $${s.realizedPnL.toFixed(4)})`);
    }

    assert(result.success === true, 'strategy sell succeeded');
    assert(result.sells.length === 3, 'sold 3 assets');
    assert(result.totalProceeds > 0, 'total proceeds > 0');
  });

  // ── Cleanup Checks ──

  await runSection('Portfolio empty after strategy sell', async () => {
    const portfolio = await agent.getPortfolio();
    const hasBlue = portfolio.strategyPositions && 'bluechip' in portfolio.strategyPositions;
    assert(!hasBlue, 'no bluechip positions remaining');
  });

  await runSection('Balance reflects strategy sell', async () => {
    const bal = await agent.balance();
    const portfolio = await agent.getPortfolio();
    const hasBlue = portfolio.strategyPositions && 'bluechip' in portfolio.strategyPositions;
    console.log(`   Investment: $${bal.investment.toFixed(2)}`);
    console.log(`   Bluechip remaining: ${hasBlue ? 'yes' : 'no'}`);
    assert(!hasBlue, 'no bluechip strategy positions in portfolio');
  });

  summary('Strategy & Auto-Invest');
  process.exit(exitCode());
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
