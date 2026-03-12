/**
 * Investment Tests
 *
 * Tests: invest buy, portfolio, invest sell, investment locking guard.
 *
 * Requires at least $2 USDC available.
 * Buys $1 of SUI, checks portfolio, then sells it back.
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

  await runSection('Investment locking guard (send)', async () => {
    const totalSui = boughtAmount + 10;
    try {
      await agent.send({ to: agent.address(), amount: totalSui, asset: 'SUI' });
      assert(false, 'send should have been blocked');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      assert(code === 'INVESTMENT_LOCKED', `send blocked with INVESTMENT_LOCKED (got ${code})`);
    }
  });

  await runSection('Invest Sell all SUI', async () => {
    const result = await agent.investSell({ asset: 'SUI', usdAmount: 'all' });
    console.log(`   Tx:        ${result.tx}`);
    console.log(`   Sold:      ${result.amount.toFixed(4)} SUI`);
    console.log(`   Proceeds:  $${result.usdValue.toFixed(2)}`);
    console.log(`   P&L:       $${result.realizedPnL.toFixed(2)}`);

    assert(result.success === true, 'invest sell succeeded');
    assert(result.amount > 0, 'sold amount > 0');
    assert(result.usdValue > 0, 'proceeds > 0');
    assert(typeof result.realizedPnL === 'number', 'realizedPnL is a number');
  });

  await runSection('Portfolio empty after sell-all', async () => {
    const portfolio = await agent.getPortfolio();
    const suiPos = portfolio.positions.find((p: { asset: string }) => p.asset === 'SUI');
    const hasPosition = suiPos && suiPos.totalAmount > 0;
    assert(!hasPosition, 'no SUI position remaining');
  });

  await runSection('Balance investment cleared', async () => {
    const bal = await agent.balance();
    console.log(`   Investment: $${bal.investment.toFixed(2)}`);
    assert(bal.investment < 0.01, 'investment near $0 after sell-all');
  });

  summary('Investment');
  process.exit(exitCode());
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
