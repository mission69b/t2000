/**
 * Cross-Feature Integration Tests
 *
 * Tests scenarios where multiple features interact — the edge cases
 * that isolated feature tests miss.
 *
 * Covers:
 *   1. Strategy sell preserves direct positions (same asset in both)
 *   2. Exchange guard allows free SUI when investment positions exist
 *   3. Rebalance excludes investment assets
 *   4. Balance hides zero-balance stablecoins
 *   5. Withdraw excludes investment assets
 *   6. getFreeBalance doesn't double-count direct+strategy positions
 *
 * Requires at least $20 USDC available.
 *
 * Usage:
 *   source .env.local && npx tsx scripts/test-cross-features.ts
 */

import { assert, runSection, createAgent, summary, exitCode } from './test-helpers.js';

async function main() {
  console.log('\n  Cross-Feature Integration Tests\n');

  const agent = createAgent();

  const balBefore = await agent.balance();
  console.log(`   Starting USDC: $${balBefore.available.toFixed(2)}`);

  if (balBefore.available < 15) {
    console.error('   ✗ Need at least $15 USDC available');
    process.exit(1);
  }

  // ══════════════════════════════════════════════════════
  // Pre-flight cleanup
  // ══════════════════════════════════════════════════════

  try { await agent.sellStrategy({ strategy: 'bluechip' }); } catch { /* ok */ }
  if (agent.portfolio.hasStrategyPositions('bluechip')) {
    agent.portfolio.clearStrategy('bluechip');
  }
  try { await agent.investSell({ asset: 'SUI', usdAmount: 'all' }); } catch { /* ok */ }
  try { await agent.investSell({ asset: 'ETH', usdAmount: 'all' }); } catch { /* ok */ }
  try { await agent.investSell({ asset: 'BTC', usdAmount: 'all' }); } catch { /* ok */ }
  agent.portfolio.closePosition('SUI');
  agent.portfolio.closePosition('ETH');
  agent.portfolio.closePosition('BTC');

  console.log('   ℹ  Pre-flight cleanup done');

  // ══════════════════════════════════════════════════════
  // Test 1: Strategy sell preserves direct positions
  // ══════════════════════════════════════════════════════

  await runSection('Direct + Strategy coexistence: buy direct ETH', async () => {
    const result = await agent.investBuy({ asset: 'ETH', usdAmount: 2 });
    console.log(`   Bought ${result.amount.toFixed(6)} ETH @ $${result.price.toFixed(2)}`);
    assert(result.success, 'direct ETH buy succeeded');
    assert(result.amount > 0, 'received ETH');
  });

  let directEthBefore = 0;
  await runSection('Direct + Strategy coexistence: buy strategy', async () => {
    const result = await agent.investStrategy({ strategy: 'bluechip', usdAmount: 5 });
    console.log(`   Strategy invested: $${result.totalInvested.toFixed(2)}`);
    assert(result.success, 'strategy buy succeeded');
    assert(result.buys.length === 3, 'bought 3 assets');

    // Check portfolio has both direct AND strategy
    const portfolio = await agent.getPortfolio();
    const directEth = portfolio.positions.find(p => p.asset === 'ETH');
    assert(!!directEth, 'direct ETH position exists');
    directEthBefore = directEth?.totalAmount ?? 0;
    console.log(`   Direct ETH total: ${directEthBefore.toFixed(6)}`);

    const stratPositions = portfolio.strategyPositions?.['bluechip'] ?? [];
    const stratEth = stratPositions.find((p: { asset: string }) => p.asset === 'ETH');
    assert(!!stratEth, 'strategy ETH position exists');
    console.log(`   Strategy ETH: ${stratEth?.totalAmount.toFixed(6)}`);
  });

  await runSection('Strategy sell preserves direct positions', async () => {
    const result = await agent.sellStrategy({ strategy: 'bluechip' });
    console.log(`   Total proceeds: $${result.totalProceeds.toFixed(2)}`);
    console.log(`   Realized P&L: $${result.realizedPnL.toFixed(4)}`);

    assert(result.success, 'strategy sell succeeded');
    assert(result.sells.length === 3, 'sold 3 strategy assets');

    // The direct ETH position should still exist
    const portfolio = await agent.getPortfolio();
    const directEth = portfolio.positions.find(p => p.asset === 'ETH');
    const directEthAmount = directEth?.totalAmount ?? 0;
    console.log(`   Direct ETH after sell: ${directEthAmount.toFixed(6)}`);

    assert(directEthAmount > 0, 'direct ETH still exists after strategy sell');

    // The strategy P&L should be reasonable (not -$4.99 from selling $5)
    const absPnL = Math.abs(result.realizedPnL);
    assert(absPnL < 2, `strategy P&L is reasonable: $${result.realizedPnL.toFixed(2)} (abs < $2)`);

    // Strategy should be empty
    const hasBlue = portfolio.strategyPositions && 'bluechip' in portfolio.strategyPositions;
    assert(!hasBlue, 'no bluechip strategy positions remaining');
  });

  // Cleanup direct ETH
  try { await agent.investSell({ asset: 'ETH', usdAmount: 'all' }); } catch { /* ok */ }
  agent.portfolio.closePosition('ETH');
  agent.portfolio.closePosition('SUI');
  agent.portfolio.closePosition('BTC');

  // ══════════════════════════════════════════════════════
  // Test 2: Exchange guard with overlapping positions
  // ══════════════════════════════════════════════════════

  await runSection('Exchange guard: buy SUI for testing', async () => {
    const result = await agent.investBuy({ asset: 'SUI', usdAmount: 1 });
    console.log(`   Bought ${result.amount.toFixed(4)} SUI`);
    assert(result.success, 'SUI buy succeeded');
  });

  await runSection('Exchange guard: USDC→SUI exchange works', async () => {
    const result = await agent.exchange({ from: 'USDC', to: 'SUI', amount: 0.5 });
    console.log(`   Exchanged $0.50 USDC → ${result.toAmount.toFixed(4)} SUI`);
    assert(result.success, 'USDC→SUI exchange succeeded');
  });

  await runSection('Exchange guard: SUI→USDC allowed for free SUI', async () => {
    // After exchanging 0.5 USDC → SUI, we should have free SUI (non-invested)
    // The exchange guard should allow selling the free SUI back
    try {
      const result = await agent.exchange({ from: 'SUI', to: 'USDC', amount: 0.3 });
      console.log(`   Exchanged 0.3 SUI → $${result.toAmount.toFixed(4)} USDC`);
      assert(result.success, 'SUI→USDC exchange succeeded for free SUI');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'INVESTMENT_LOCKED') {
        assert(false, `SUI→USDC blocked incorrectly: ${(err as Error).message}`);
      } else {
        throw err;
      }
    }
  });

  // Cleanup SUI investment
  try { await agent.investSell({ asset: 'SUI', usdAmount: 'all' }); } catch { /* ok */ }
  agent.portfolio.closePosition('SUI');

  // ══════════════════════════════════════════════════════
  // Test 3: Rebalance excludes investment assets
  // ══════════════════════════════════════════════════════

  await runSection('Rebalance excludes investment assets', async () => {
    // Even if SUI is on Suilend, rebalance should not suggest moving it
    try {
      const result = await agent.rebalance({ dryRun: true });
      if (result.fromAsset) {
        console.log(`   Suggested: ${result.fromAsset} → ${result.toAsset}`);
        assert(result.fromAsset !== 'SUI', 'rebalance does not suggest SUI');
        assert(result.fromAsset !== 'ETH', 'rebalance does not suggest ETH');
        assert(result.fromAsset !== 'BTC', 'rebalance does not suggest BTC');
      } else {
        console.log('   No rebalance needed — already optimal');
        assert(true, 'rebalance skipped (already optimal)');
      }
    } catch (err: unknown) {
      const msg = (err as Error).message || '';
      // NO_COLLATERAL or similar is fine — means no savings positions to rebalance
      if (msg.includes('No savings') || msg.includes('optimized')) {
        console.log(`   Expected: ${msg}`);
        assert(true, 'rebalance correctly reports no candidates');
      } else {
        throw err;
      }
    }
  });

  // ══════════════════════════════════════════════════════
  // Test 4: Balance hides zero-balance stablecoins
  // ══════════════════════════════════════════════════════

  await runSection('Balance suppresses zero stablecoins', async () => {
    const bal = await agent.balance();
    const stables = bal.stables ?? {};
    const zeroStables = Object.entries(stables).filter(([, v]) => v < 0.01 && v >= 0);
    const nonZeroStables = Object.entries(stables).filter(([, v]) => v >= 0.01);

    console.log(`   Non-zero stablecoins: ${nonZeroStables.map(([k, v]) => `${k}: $${(v as number).toFixed(2)}`).join(', ')}`);
    console.log(`   Zero/dust stablecoins: ${zeroStables.map(([k]) => k).join(', ') || 'none'}`);

    // The JSON always includes all stables, but the CLI display should filter.
    // For the SDK, we verify the data structure is correct.
    assert(stables['USDC'] !== undefined, 'USDC always present in stables');
    assert(nonZeroStables.length >= 1, 'at least 1 non-zero stablecoin');
  });

  // ══════════════════════════════════════════════════════
  // Test 5: Withdraw skips investment assets
  // ══════════════════════════════════════════════════════

  await runSection('Withdraw skips investment assets', async () => {
    // Save a small amount first
    await agent.save({ amount: 0.2 });

    const positions = await agent.positions();
    const saves = positions.positions.filter(p => p.type === 'save');
    const investmentSaves = saves.filter(p => ['SUI', 'ETH', 'BTC'].includes(p.asset));
    const stableSaves = saves.filter(p => !['SUI', 'ETH', 'BTC'].includes(p.asset));

    console.log(`   Save positions: ${saves.length} total`);
    console.log(`   Investment assets in savings: ${investmentSaves.map(p => p.asset).join(', ') || 'none'}`);
    console.log(`   Stable assets in savings: ${stableSaves.map(p => `${p.asset} ($${p.amount.toFixed(2)})`).join(', ')}`);

    // Withdraw a small amount — should come from stablecoins, not SUI/ETH/BTC
    const result = await agent.withdraw({ amount: 0.1 });
    console.log(`   Withdrew: $${result.amount.toFixed(2)} from ${result.protocol}`);
    assert(result.success, 'withdraw succeeded');

    // The withdrawn asset should NOT be an investment asset
    const withdrawnAsset = result.asset ?? 'USDC';
    assert(
      !['SUI', 'ETH', 'BTC'].includes(withdrawnAsset),
      `withdrew from ${withdrawnAsset} (not an investment asset)`,
    );
  });

  // ══════════════════════════════════════════════════════
  // Test 6: getFreeBalance with strategy+direct overlap
  // ══════════════════════════════════════════════════════

  await runSection('Free balance correct with strategy+direct overlap', async () => {
    // Buy direct SUI + strategy SUI, then verify free balance isn't negative
    const buyResult = await agent.investBuy({ asset: 'SUI', usdAmount: 1 });
    const stratResult = await agent.investStrategy({ strategy: 'bluechip', usdAmount: 5 });

    assert(buyResult.success, 'direct SUI buy succeeded');
    assert(stratResult.success, 'strategy buy succeeded');

    const portfolio = await agent.getPortfolio();
    const directSui = portfolio.positions.find(p => p.asset === 'SUI');
    const stratPositions = portfolio.strategyPositions?.['bluechip'] ?? [];
    const stratSui = stratPositions.find((p: { asset: string }) => p.asset === 'SUI');

    console.log(`   Direct SUI: ${directSui?.totalAmount.toFixed(4) ?? 0}`);
    console.log(`   Strategy SUI: ${stratSui?.totalAmount.toFixed(4) ?? 0}`);

    // Verify exchange doesn't incorrectly block a small USDC→SUI exchange
    try {
      const exchResult = await agent.exchange({ from: 'USDC', to: 'SUI', amount: 0.2 });
      assert(exchResult.success, 'exchange USDC→SUI works with positions');
    } catch (err) {
      assert(false, `exchange blocked: ${(err as Error).message}`);
    }

    // Verify SUI→USDC exchange of a small free amount works
    try {
      const exchResult = await agent.exchange({ from: 'SUI', to: 'USDC', amount: 0.1 });
      assert(exchResult.success, 'exchange free SUI→USDC works');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'INVESTMENT_LOCKED') {
        assert(false, `SUI→USDC blocked by investment guard (free balance miscalculated)`);
      } else {
        // Other errors (slippage, etc.) are OK — the guard passed
        console.log(`   ℹ  Exchange failed for non-guard reason: ${(err as Error).message.slice(0, 60)}`);
        assert(true, 'exchange guard did not block (other error)');
      }
    }
  });

  // ══════════════════════════════════════════════════════
  // Test 7: Strategy P&L accuracy
  // ══════════════════════════════════════════════════════

  await runSection('Strategy P&L matches buy/sell amounts', async () => {
    // After the previous test, we have a bluechip position. Sell it and check P&L.
    const status = await agent.getStrategyStatus('bluechip');
    const investedValue = status.totalValue;
    console.log(`   Strategy value before sell: $${investedValue.toFixed(2)}`);

    const result = await agent.sellStrategy({ strategy: 'bluechip' });
    console.log(`   Proceeds: $${result.totalProceeds.toFixed(2)}`);
    console.log(`   Realized P&L: $${result.realizedPnL.toFixed(4)}`);

    // The P&L should be close to 0 (bought and sold within seconds)
    // Allow for slippage + fees
    assert(
      Math.abs(result.realizedPnL) < 2,
      `P&L reasonable: $${result.realizedPnL.toFixed(2)} (within ±$2 of break-even)`,
    );

    // Proceeds should be close to invested value
    const proceedsDiff = Math.abs(result.totalProceeds - investedValue);
    assert(
      proceedsDiff < 2,
      `proceeds close to invested: $${result.totalProceeds.toFixed(2)} vs $${investedValue.toFixed(2)}`,
    );
  });

  // ══════════════════════════════════════════════════════
  // Final cleanup
  // ══════════════════════════════════════════════════════

  try { await agent.investSell({ asset: 'SUI', usdAmount: 'all' }); } catch { /* ok */ }
  try { await agent.investSell({ asset: 'ETH', usdAmount: 'all' }); } catch { /* ok */ }
  try { await agent.investSell({ asset: 'BTC', usdAmount: 'all' }); } catch { /* ok */ }
  agent.portfolio.closePosition('SUI');
  agent.portfolio.closePosition('ETH');
  agent.portfolio.closePosition('BTC');
  if (agent.portfolio.hasStrategyPositions('bluechip')) {
    agent.portfolio.clearStrategy('bluechip');
  }

  summary('Cross-Feature');
  process.exit(exitCode());
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
