/**
 * NAVI Protocol Tests
 *
 * Tests: rates, save, positions, max withdraw, borrow, health factor,
 *        max borrow, repay, withdraw.
 *
 * Requires at least $3 USDC available + 0.05 SUI for gas.
 *
 * Usage:
 *   source .env.local && npx tsx scripts/test-navi.ts
 */

import { assert, runSection, createAgent, summary, exitCode } from './test-helpers.js';

const SAVE_AMOUNT = 2;
const BORROW_AMOUNT = 0.5;

async function main() {
  console.log('\n  NAVI Protocol Tests\n');

  const agent = createAgent();

  await runSection('NAVI Rates', async () => {
    const rates = await agent.rates();
    console.log(`   Save APY:   ${rates.USDC.saveApy.toFixed(2)}%`);
    console.log(`   Borrow APY: ${rates.USDC.borrowApy.toFixed(2)}%`);

    assert(rates.USDC.saveApy > 0, 'Save APY > 0');
    assert(rates.USDC.borrowApy > 0, 'Borrow APY > 0');
    assert(rates.USDC.borrowApy > rates.USDC.saveApy, 'Borrow APY > Save APY');

    const assets = Object.keys(rates);
    console.log(`   Assets with rates: ${assets.join(', ')}`);
    assert(assets.includes('USDC'), 'rates include USDC');
    assert(assets.length >= 2, `Multi-stable rates returned (${assets.length} assets)`);
    for (const asset of assets) {
      assert(typeof rates[asset].saveApy === 'number', `${asset} saveApy is a number`);
      assert(typeof rates[asset].borrowApy === 'number', `${asset} borrowApy is a number`);
    }
  });

  await runSection('Positions (baseline)', async () => {
    const pos = await agent.positions();
    for (const p of pos.positions) {
      console.log(`   ${p.type}: $${p.amount.toFixed(2)} ${p.asset} (${p.protocol})`);
    }
    if (pos.positions.length === 0) console.log('   No existing positions.');
    assert(Array.isArray(pos.positions), 'positions is an array');
  });

  await runSection(`Save $${SAVE_AMOUNT} USDC → NAVI`, async () => {
    const balBefore = await agent.balance();
    const result = await agent.save({ amount: SAVE_AMOUNT, protocol: 'navi' });
    console.log(`   Tx:  ${result.tx}`);
    console.log(`   APY: ${result.apy.toFixed(2)}%`);
    console.log(`   Fee: $${result.fee.toFixed(4)} USDC`);
    console.log(`   Gas: ${result.gasCost.toFixed(6)} SUI`);

    assert(result.success === true, 'save succeeded');
    assert(result.amount === SAVE_AMOUNT, 'save amount matches');
    assert(result.apy > 0, 'APY returned');
    assert(result.fee > 0, 'fee was charged');
    assert(result.gasCost > 0, 'gas was consumed');

    const balAfter = await agent.balance();
    assert(balAfter.available < balBefore.available, 'available decreased after save');
    const savingsDelta = balAfter.savings - balBefore.savings;
    assert(savingsDelta > SAVE_AMOUNT * 0.5, `savings increased after save (delta: $${savingsDelta.toFixed(2)})`);
  });

  await runSection('Positions (after save)', async () => {
    const pos = await agent.positions();
    const naviPos = pos.positions.find(p => p.type === 'save' && p.protocol === 'navi');
    console.log(`   NAVI save position: $${naviPos?.amount.toFixed(2) ?? '0.00'} ${naviPos?.asset ?? 'USDC'}`);
    assert(naviPos !== undefined, 'navi save position exists');
    assert((naviPos?.amount ?? 0) > 0, 'navi save position has value');
    assert(naviPos?.protocol === 'navi', 'protocol is navi');
  });

  await runSection('Max Withdraw', async () => {
    const max = await agent.maxWithdraw();
    console.log(`   Max: $${max.maxAmount.toFixed(2)} USDC`);
    console.log(`   Current HF: ${max.currentHF === Infinity ? '∞' : max.currentHF.toFixed(2)}`);

    assert(max.maxAmount > 0, 'maxWithdraw > 0');
    assert(typeof max.currentHF === 'number', 'currentHF is a number');
  });

  let didBorrow = false;

  await runSection(`Borrow $${BORROW_AMOUNT} USDC from NAVI`, async () => {
    const hfBefore = await agent.healthFactor();
    console.log(`   HF before: ${hfBefore.healthFactor === Infinity ? '∞' : hfBefore.healthFactor.toFixed(2)}`);
    console.log(`   Max borrow: $${hfBefore.maxBorrow.toFixed(2)}`);

    if (hfBefore.maxBorrow < BORROW_AMOUNT) {
      console.log(`   ⚠ Max borrow ($${hfBefore.maxBorrow.toFixed(2)}) < test amount ($${BORROW_AMOUNT}). Skipping.`);
      assert(true, 'borrow skipped — insufficient collateral');
      return;
    }

    const result = await agent.borrow({ amount: BORROW_AMOUNT });
    console.log(`   Tx:  ${result.tx}`);
    console.log(`   HF:  ${result.healthFactor.toFixed(2)}`);
    console.log(`   Fee: $${result.fee.toFixed(4)}`);
    console.log(`   Gas: ${result.gasCost.toFixed(6)} SUI`);

    assert(result.success === true, 'borrow succeeded');
    assert(result.amount === BORROW_AMOUNT, 'borrow amount matches');
    assert(result.healthFactor > 1.0, 'health factor > 1 after borrow');
    assert(result.fee >= 0, 'fee is non-negative');
    assert(result.gasCost > 0, 'gas was consumed');

    didBorrow = true;
  });

  await runSection('Health Factor', async () => {
    const hf = await agent.healthFactor();
    console.log(`   HF:       ${hf.healthFactor === Infinity ? '∞' : hf.healthFactor.toFixed(2)}`);
    console.log(`   Supplied: $${hf.supplied.toFixed(2)}`);
    console.log(`   Borrowed: $${hf.borrowed.toFixed(2)}`);

    assert(typeof hf.healthFactor === 'number', 'HF is a number');
    assert(hf.supplied >= 0, 'supplied >= 0');
    assert(typeof hf.maxBorrow === 'number', 'maxBorrow is a number');
    assert(typeof hf.liquidationThreshold === 'number', 'liquidationThreshold is a number');

    if (didBorrow) {
      assert(hf.borrowed > 0, 'borrowed > 0 after borrow');
      assert(hf.healthFactor < Infinity, 'HF is finite after borrow');
    }
  });

  await runSection('Max Borrow', async () => {
    const max = await agent.maxBorrow();
    console.log(`   Max: $${max.maxAmount.toFixed(2)} USDC`);
    console.log(`   Current HF: ${max.currentHF === Infinity ? '∞' : max.currentHF.toFixed(2)}`);

    assert(max.maxAmount >= 0, 'maxBorrow >= 0');
    assert(typeof max.currentHF === 'number', 'current HF is a number');
  });

  await runSection('Repay', async () => {
    if (!didBorrow) {
      console.log('   ⚠ Skipped — no borrow to repay');
      assert(true, 'repay skipped — no active borrow');
      return;
    }

    const result = await agent.repay({ amount: BORROW_AMOUNT });
    console.log(`   Tx:     ${result.tx}`);
    console.log(`   Amount: $${result.amount.toFixed(2)}`);
    console.log(`   Remaining debt: $${result.remainingDebt.toFixed(4)}`);
    console.log(`   Gas: ${result.gasCost.toFixed(6)} SUI`);

    assert(result.success === true, 'repay succeeded');
    assert(result.amount === BORROW_AMOUNT, 'repay amount matches');
    assert(result.remainingDebt >= 0, 'remaining debt >= 0');
    assert(result.gasCost > 0, 'gas was consumed');
  });

  // Clear any residual debt (accrued interest) before full withdrawal
  try {
    await agent.repay({ amount: 'all' });
    console.log('   ℹ  Cleared residual borrow interest');
  } catch { /* no debt — expected */ }

  await runSection('Withdraw All', async () => {
    const balBefore = await agent.balance();
    const result = await agent.withdraw({ amount: 'all' });
    console.log(`   Tx:     ${result.tx}`);
    console.log(`   Amount: $${result.amount.toFixed(2)} USDC`);
    console.log(`   Gas:    ${result.gasCost.toFixed(6)} SUI`);

    assert(result.success === true, 'withdraw succeeded');
    assert(result.amount > 0, 'withdrew amount > 0');

    const balAfter = await agent.balance();
    assert(balAfter.savings < 0.05, 'savings ≈ 0 after withdraw all (dust tolerance)');
    assert(balAfter.available > balBefore.available, 'available increased after withdraw');
  });

  summary('NAVI Protocol');
  process.exit(exitCode());
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
