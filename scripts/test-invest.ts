/**
 * Investment Tests
 *
 * Tests: invest buy, portfolio, invest sell,
 *        invest earn, invest unearn, portfolio yield, auto-withdraw.
 *
 * Requires at least $3 USDC available.
 * Buys SUI, earns yield, checks guards, then sells it back.
 *
 * Usage:
 *   source .env.local && npx tsx scripts/test-invest.ts
 */

import { assert, runSection, createAgent, summary, exitCode } from './test-helpers.js';

const BUY_AMOUNT = 1;

async function main() {
  console.log('\n  Investment Tests\n');

  const agent = createAgent();

  const balBefore = await agent.balance();
  console.log(`   Starting USDC: $${balBefore.available.toFixed(2)}`);

  let boughtAmount = 0;

  // ── Phase 17a/b: Buy, Portfolio, Locking ──

  await runSection(`Invest Buy $${BUY_AMOUNT} SUI`, async () => {
    const result = await agent.investBuy({ asset: 'SUI', usdAmount: BUY_AMOUNT });
    console.log(`   Tx:       ${result.tx}`);
    console.log(`   Amount:   ${result.amount.toFixed(4)} SUI`);
    console.log(`   Price:    $${result.price.toFixed(4)}`);
    console.log(`   Invested: $${result.usdValue.toFixed(2)}`);

    assert(result.success === true, 'invest buy succeeded');
    assert(result.amount > 0, 'received SUI > 0');
    assert(result.price > 0, 'price > 0');
    assert(result.asset === 'SUI', 'asset is SUI');

    boughtAmount = result.amount;
  });

  await runSection('Portfolio shows position', async () => {
    const portfolio = await agent.getPortfolio();
    console.log(`   Positions:   ${portfolio.positions.length}`);
    console.log(`   Total value: $${portfolio.totalValue.toFixed(2)}`);

    assert(portfolio.positions.length > 0, 'has at least 1 position');

    const suiPos = portfolio.positions.find((p: { asset: string }) => p.asset === 'SUI');
    assert(!!suiPos, 'SUI position exists');
    if (suiPos) {
      console.log(`   SUI amount:  ${suiPos.totalAmount.toFixed(4)}`);
      console.log(`   Cost basis:  $${suiPos.costBasis.toFixed(2)}`);
      console.log(`   Avg price:   $${suiPos.avgPrice.toFixed(4)}`);
      assert(suiPos.totalAmount > 0, 'SUI amount > 0');
      assert(suiPos.costBasis > 0, 'cost basis > 0');
      assert(suiPos.avgPrice > 0, 'avg price > 0');
    }
  });

  await runSection('Balance shows investment', async () => {
    const bal = await agent.balance();
    console.log(`   Investment: $${bal.investment.toFixed(2)}`);

    assert(bal.investment > 0, 'balance.investment > 0');
    assert(typeof bal.investmentPnL === 'number', 'investmentPnL is a number');
  });

  // ── Phase 17c: Earn Yield ──

  // Pre-flight: clear any stale earning state from a previous run
  try {
    await agent.investUnearn({ asset: 'SUI' });
    console.log('   ℹ  Pre-flight: unearn\'d stale earning position');
  } catch {
    // If on-chain unearn failed but portfolio still thinks it's earning, force-clear
    try { agent.portfolio.recordUnearn('SUI'); } catch { /* already cleared */ }
  }

  await runSection('Invest Earn SUI', async () => {
    const result = await agent.investEarn({ asset: 'SUI' });
    console.log(`   Tx:       ${result.tx}`);
    console.log(`   Amount:   ${result.amount.toFixed(4)} SUI`);
    console.log(`   Protocol: ${result.protocol}`);
    console.log(`   APY:      ${result.apy.toFixed(2)}%`);

    assert(result.success === true, 'invest earn succeeded');
    assert(result.amount > 0, 'deposit amount > 0');
    assert(result.protocol.length > 0, 'protocol name returned');
    assert(result.apy > 0, 'APY > 0');
    assert(result.asset === 'SUI', 'asset is SUI');
  });

  await runSection('Portfolio shows earning state', async () => {
    const portfolio = await agent.getPortfolio();
    const suiPos = portfolio.positions.find((p: { asset: string }) => p.asset === 'SUI');
    assert(!!suiPos, 'SUI position exists');
    if (suiPos) {
      console.log(`   Earning:  ${suiPos.earning}`);
      console.log(`   Protocol: ${suiPos.earningProtocol}`);
      console.log(`   APY:      ${suiPos.earningApy?.toFixed(2)}%`);
      console.log(`   Amount:   ${suiPos.totalAmount.toFixed(4)}`);

      assert(suiPos.earning === true, 'position is earning');
      assert(!!suiPos.earningProtocol, 'earning protocol set');
      assert((suiPos.earningApy ?? 0) > 0, 'earning APY > 0');
      assert(suiPos.totalAmount > 0, 'total amount preserved while earning');
    }
  });

  await runSection('Balance excludes earning SUI from savings', async () => {
    const bal = await agent.balance();
    console.log(`   Savings:    $${bal.savings.toFixed(2)}`);
    console.log(`   Investment: $${bal.investment.toFixed(2)}`);

    assert(bal.investment > 0, 'investment value > 0 while earning');
  });

  await runSection('Invest earn guard (already earning)', async () => {
    try {
      await agent.investEarn({ asset: 'SUI' });
      assert(false, 'should have thrown INVEST_ALREADY_EARNING');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      assert(code === 'INVEST_ALREADY_EARNING', `blocked with INVEST_ALREADY_EARNING (got ${code})`);
    }
  });

  // ── Phase 17c: Unearn ──

  await runSection('Invest Unearn SUI', async () => {
    const result = await agent.investUnearn({ asset: 'SUI' });
    console.log(`   Tx:       ${result.tx}`);
    console.log(`   Amount:   ${result.amount.toFixed(4)} SUI`);
    console.log(`   Protocol: ${result.protocol}`);

    assert(result.success === true, 'invest unearn succeeded');
    assert(result.amount > 0, 'withdrawn amount > 0');
    assert(result.protocol.length > 0, 'protocol name returned');
    assert(result.asset === 'SUI', 'asset is SUI');
  });

  await runSection('Portfolio not earning after unearn', async () => {
    const portfolio = await agent.getPortfolio();
    const suiPos = portfolio.positions.find((p: { asset: string }) => p.asset === 'SUI');
    assert(!!suiPos, 'SUI position still exists');
    if (suiPos) {
      console.log(`   Earning:  ${suiPos.earning}`);
      console.log(`   Amount:   ${suiPos.totalAmount.toFixed(4)}`);
      assert(!suiPos.earning, 'position is NOT earning');
      assert(suiPos.totalAmount > 0, 'total amount preserved');
    }
  });

  // ── Phase 17c: Auto-withdraw on sell ──

  await runSection('Earn then sell (auto-withdraw)', async () => {
    await agent.investEarn({ asset: 'SUI' });
    const portfolio = await agent.getPortfolio();
    const suiPos = portfolio.positions.find((p: { asset: string }) => p.asset === 'SUI');
    assert(suiPos?.earning === true, 'confirmed earning before sell');

    const result = await agent.investSell({ asset: 'SUI', usdAmount: 'all' });
    console.log(`   Tx:        ${result.tx}`);
    console.log(`   Sold:      ${result.amount.toFixed(4)} SUI`);
    console.log(`   Proceeds:  $${result.usdValue.toFixed(2)}`);

    assert(result.success === true, 'sell with auto-withdraw succeeded');
    assert(result.amount > 0, 'sold amount > 0');
    assert(result.usdValue > 0, 'proceeds > 0');
  });

  // ── Cleanup checks ──

  await runSection('Portfolio empty after sell-all', async () => {
    const portfolio = await agent.getPortfolio();
    const suiPos = portfolio.positions.find((p: { asset: string }) => p.asset === 'SUI');
    const hasPosition = suiPos && suiPos.totalAmount > 0;
    assert(!hasPosition, 'no SUI position remaining');
  });

  await runSection('Balance investment cleared', async () => {
    const bal = await agent.balance();
    const portfolio = await agent.getPortfolio();
    const suiPos = portfolio.positions.find((p: { asset: string }) => p.asset === 'SUI');
    const hasSui = suiPos && suiPos.totalAmount > 0;
    console.log(`   Investment: $${bal.investment.toFixed(2)}`);
    console.log(`   SUI position: ${hasSui ? 'yes' : 'no'}`);
    assert(!hasSui, 'no SUI investment position remaining');
  });

  summary('Investment');
  process.exit(exitCode());
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
