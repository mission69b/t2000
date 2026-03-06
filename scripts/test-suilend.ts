/**
 * Suilend Protocol Tests
 *
 * Tests: save --protocol suilend, positions (multi-protocol),
 *        withdraw --protocol suilend, earn (multi-protocol display).
 *
 * Requires at least $1 USDC available + 0.05 SUI for gas.
 *
 * Usage:
 *   source .env.local && npx tsx scripts/test-suilend.ts
 */

import { assert, runSection, createAgent, summary, exitCode } from './test-helpers.js';

const SAVE_AMOUNT = 0.5;

async function main() {
  console.log('\n  Suilend Protocol Tests\n');

  const agent = createAgent();

  await runSection('Rates (multi-protocol)', async () => {
    const rates = await agent.rates();
    console.log(`   NAVI   — Save: ${rates.USDC.saveApy.toFixed(2)}%  Borrow: ${rates.USDC.borrowApy.toFixed(2)}%`);

    assert(rates.USDC.saveApy > 0, 'Save APY > 0');
    assert(rates.USDC.borrowApy > 0, 'Borrow APY > 0');
  });

  await runSection('Balance (before)', async () => {
    const bal = await agent.balance();
    console.log(`   Available: $${bal.available.toFixed(2)} USDC`);
    console.log(`   Savings:   $${bal.savings.toFixed(2)} USDC`);
    console.log(`   Gas:       ${bal.gasReserve.sui.toFixed(2)} SUI`);

    assert(bal.available >= SAVE_AMOUNT, `available >= $${SAVE_AMOUNT} for test`);
  });

  await runSection(`Save $${SAVE_AMOUNT} USDC → Suilend`, async () => {
    const balBefore = await agent.balance();
    const result = await agent.save({ amount: SAVE_AMOUNT, protocol: 'suilend' });
    console.log(`   Tx:  ${result.tx}`);
    console.log(`   APY: ${result.apy.toFixed(2)}%`);
    console.log(`   Fee: $${result.fee.toFixed(4)} USDC`);
    console.log(`   Gas: ${result.gasCost.toFixed(6)} SUI (${result.gasMethod})`);

    assert(result.success === true, 'save succeeded');
    assert(result.amount === SAVE_AMOUNT, 'save amount matches');
    assert(result.apy > 0, 'APY returned');
    assert(result.gasCost > 0, 'gas was consumed');
    assert(['self-funded', 'sponsored', 'auto-topup'].includes(result.gasMethod), 'valid gasMethod');

    const balAfter = await agent.balance();
    assert(balAfter.available < balBefore.available, 'available decreased after save');
  });

  await runSection('Positions (after Suilend save)', async () => {
    const pos = await agent.positions();
    for (const p of pos.positions) {
      console.log(`   ${p.type}: $${p.amount.toFixed(2)} ${p.asset} (${p.protocol})`);
    }

    const suilendPos = pos.positions.find(p => p.protocol === 'suilend' && p.type === 'save');
    assert(suilendPos !== undefined, 'suilend save position exists');
    assert((suilendPos?.amount ?? 0) > 0, 'suilend save position has value');
    assert(suilendPos?.protocol === 'suilend', 'protocol is suilend');
  });

  await runSection('Earn (multi-protocol)', async () => {
    const pos = await agent.positions();
    const protocols = new Set(pos.positions.map(p => p.protocol));
    console.log(`   Protocols with positions: ${[...protocols].join(', ')}`);

    assert(protocols.has('suilend'), 'suilend appears in positions');
  });

  await runSection(`Withdraw $${SAVE_AMOUNT} from Suilend`, async () => {
    const balBefore = await agent.balance();
    const result = await agent.withdraw({ amount: SAVE_AMOUNT, protocol: 'suilend' });
    console.log(`   Tx:     ${result.tx}`);
    console.log(`   Amount: $${result.amount.toFixed(2)} USDC`);
    console.log(`   Gas:    ${result.gasCost.toFixed(6)} SUI (${result.gasMethod})`);

    assert(result.success === true, 'withdraw succeeded');
    assert(result.amount > 0, 'withdrew amount > 0');
    assert(['self-funded', 'sponsored', 'auto-topup'].includes(result.gasMethod), 'valid gasMethod');

    const balAfter = await agent.balance();
    assert(balAfter.available > balBefore.available, 'available increased after withdraw');
  });

  summary('Suilend Protocol');
  process.exit(exitCode());
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
