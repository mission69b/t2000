/**
 * Swap Tests
 *
 * Tests: USDC → SUI swap, swap quote (read-only).
 *
 * Requires at least $1 USDC available.
 *
 * Usage:
 *   source .env.local && npx tsx scripts/test-swap.ts
 */

import { assert, runSection, createAgent, summary, exitCode } from './test-helpers.js';

const SWAP_AMOUNT = 0.5;

async function main() {
  console.log('\n  Swap Tests\n');

  const agent = createAgent();

  await runSection(`Swap $${SWAP_AMOUNT} USDC → SUI`, async () => {
    const suiBefore = (await agent.balance()).gasReserve.sui;
    const result = await agent.swap({ from: 'USDC', to: 'SUI', amount: SWAP_AMOUNT });
    console.log(`   Tx:     ${result.tx}`);
    console.log(`   From:   ${result.fromAmount.toFixed(4)} ${result.fromAsset}`);
    console.log(`   To:     ${result.toAmount.toFixed(4)} ${result.toAsset}`);
    console.log(`   Impact: ${(result.priceImpact * 100).toFixed(4)}%`);
    console.log(`   Fee:    $${result.fee.toFixed(4)}`);
    console.log(`   Gas:    ${result.gasCost.toFixed(6)} SUI (${result.gasMethod})`);

    assert(result.success === true, 'swap succeeded');
    assert(result.fromAsset === 'USDC', 'from asset is USDC');
    assert(result.toAsset === 'SUI', 'to asset is SUI');
    assert(result.toAmount > 0, 'received SUI > 0');
    assert(result.fee >= 0, 'swap fee is non-negative');
    assert(result.priceImpact >= 0, 'priceImpact >= 0');
    assert(['self-funded', 'sponsored', 'auto-topup'].includes(result.gasMethod), 'valid gasMethod');

    const afterBal = await agent.balance();
    assert(afterBal.gasReserve.sui >= 0, 'SUI balance check after swap');
  });

  await runSection('Swap Quote (read-only)', async () => {
    const quote = await agent.swapQuote({ from: 'USDC', to: 'SUI', amount: 1 });
    console.log(`   Expected: ${quote.expectedOutput.toFixed(4)} SUI`);
    console.log(`   Impact:   ${(quote.priceImpact * 100).toFixed(4)}%`);
    console.log(`   Pool $:   ${quote.poolPrice.toFixed(4)}`);
    console.log(`   Fee:      $${quote.fee.amount.toFixed(4)} (${(quote.fee.rate * 100).toFixed(2)}%)`);

    assert(quote.expectedOutput > 0, 'quote output > 0');
    assert(quote.poolPrice > 0, 'pool price > 0');
    assert(quote.fee.rate >= 0, 'fee rate is non-negative');
  });

  summary('Swap');
  process.exit(exitCode());
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
