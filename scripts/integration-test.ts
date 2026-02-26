/**
 * t2000 Integration Test — Mainnet
 *
 * Requires T2000_PASSPHRASE or T2000_PIN env var set to a suiprivkey1... private key.
 * The wallet must have at least $5 USDC and 0.05 SUI for gas.
 *
 * All operations route through executeWithGas() which has a 3-step gas chain:
 *   1. Self-funded (enough SUI)
 *   2. Auto-topup (swap USDC→SUI via sponsored tx)
 *   3. Gas station sponsored (fallback)
 *
 * Each test asserts gasMethod ∈ {'self-funded', 'auto-topup', 'sponsored'}.
 *
 * Usage:
 *   source .env.local && pnpm dlx tsx scripts/integration-test.ts
 */

import { T2000 } from '../packages/sdk/src/index.js';

const PRIVATE_KEY = process.env.T2000_PASSPHRASE ?? process.env.T2000_PIN;
if (!PRIVATE_KEY) {
  console.error('Set T2000_PASSPHRASE or T2000_PIN in .env.local');
  process.exit(1);
}

const SEND_AMOUNT = 0.01;
const SAVE_AMOUNT = 2;
const BORROW_AMOUNT = 0.5;
const SWAP_AMOUNT = 0.5;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`   ✓ ${label}`);
    passed++;
  } else {
    const msg = detail ? `${label} — ${detail}` : label;
    console.log(`   ✗ ${msg}`);
    failed++;
    failures.push(msg);
  }
}

function section(name: string): void {
  console.log(`\n── ${name} ──`);
}

async function runSection<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  section(name);
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`   ✗ SECTION FAILED: ${msg.slice(0, 200)}`);
    failed++;
    failures.push(`${name}: ${msg.slice(0, 200)}`);
    return null;
  }
}

async function main() {
  console.log('\n════════════════════════════════════════════');
  console.log('  t2000 Integration Test (mainnet + NAVI)');
  console.log('════════════════════════════════════════════');

  // ── 1. Wallet Loading ──

  section('1. Wallet Loading');
  const agent = T2000.fromPrivateKey(PRIVATE_KEY);
  const address = agent.address();
  console.log(`   Address: ${address}`);
  assert(address.startsWith('0x'), 'Address starts with 0x');
  assert(address.length === 66, 'Address is 66 chars');

  // ── 2. Balance ──

  const bal = await runSection('2. Balance', async () => {
    const b = await agent.balance();
    console.log(`   Available: $${b.available.toFixed(2)} USDC`);
    console.log(`   Savings:   $${b.savings.toFixed(2)} USDC`);
    console.log(`   Gas:       ${b.gasReserve.sui.toFixed(4)} SUI (~$${b.gasReserve.usdEquiv.toFixed(2)})`);
    console.log(`   Total:     $${b.total.toFixed(2)}`);

    assert(typeof b.available === 'number', 'available is a number');
    assert(typeof b.savings === 'number', 'savings is a number');
    assert(typeof b.gasReserve.sui === 'number', 'gasReserve.sui is a number');
    assert(typeof b.gasReserve.usdEquiv === 'number', 'gasReserve.usdEquiv is a number');
    assert(b.total >= 0, 'total >= 0');
    assert(b.gasReserve.sui > 0.01, 'Has enough SUI for gas');
    return b;
  });

  if (!bal || bal.available < SEND_AMOUNT + SAVE_AMOUNT + SWAP_AMOUNT + 1) {
    console.error(`\n   ✗ Insufficient balance for full test. Aborting.`);
    process.exit(1);
  }

  // ── 3. Rates ──

  await runSection('3. NAVI Rates', async () => {
    const rates = await agent.rates();
    console.log(`   Save APY:   ${rates.USDC.saveApy.toFixed(2)}%`);
    console.log(`   Borrow APY: ${rates.USDC.borrowApy.toFixed(2)}%`);

    assert(rates.USDC.saveApy > 0, 'Save APY > 0');
    assert(rates.USDC.borrowApy > 0, 'Borrow APY > 0');
    assert(rates.USDC.borrowApy > rates.USDC.saveApy, 'Borrow APY > Save APY');
  });

  // ── 4. Positions (baseline) ──

  await runSection('4. Positions (baseline)', async () => {
    const pos = await agent.positions();
    for (const p of pos.positions) {
      console.log(`   ${p.type}: $${p.amount.toFixed(2)} ${p.asset} (${p.protocol})`);
    }
    if (pos.positions.length === 0) console.log('   No existing positions.');
    assert(Array.isArray(pos.positions), 'positions is an array');
  });

  // ── 5. Send ──

  await runSection(`5. Send $${SEND_AMOUNT} USDC → own address`, async () => {
    const result = await agent.send({ to: address, amount: SEND_AMOUNT });
    console.log(`   Tx:  ${result.tx}`);
    console.log(`   Gas: ${result.gasCost.toFixed(6)} SUI (${result.gasMethod})`);

    assert(result.success === true, 'send succeeded');
    assert(result.tx.length > 10, 'tx hash is non-empty');
    assert(result.amount === SEND_AMOUNT, 'amount matches');
    assert(result.to === address, 'recipient matches');
    assert(result.gasCost > 0, 'gas was consumed');
    assert(['self-funded', 'sponsored', 'auto-topup'].includes(result.gasMethod), 'valid gasMethod');
    assert(typeof result.balance.available === 'number', 'balance returned with send');
  });

  // ── 6. Save (deposit into NAVI) ──

  await runSection(`6. Save $${SAVE_AMOUNT} USDC → NAVI`, async () => {
    const balBefore = await agent.balance();
    const result = await agent.save({ amount: SAVE_AMOUNT });
    console.log(`   Tx:  ${result.tx}`);
    console.log(`   APY: ${result.apy.toFixed(2)}%`);
    console.log(`   Fee: $${result.fee.toFixed(4)} USDC`);
    console.log(`   Gas: ${result.gasCost.toFixed(6)} SUI (${result.gasMethod})`);

    assert(result.success === true, 'save succeeded');
    assert(result.amount === SAVE_AMOUNT, 'save amount matches');
    assert(result.apy > 0, 'APY returned');
    assert(result.fee > 0, 'fee was charged');
    assert(result.gasCost > 0, 'gas was consumed');
    assert(['self-funded', 'sponsored', 'auto-topup'].includes(result.gasMethod), 'valid gasMethod');

    const balAfter = await agent.balance();
    assert(balAfter.available < balBefore.available, 'available decreased after save');
    assert(balAfter.savings > balBefore.savings, 'savings increased after save');
  });

  // ── 7. Positions (after save) ──

  await runSection('7. Positions (after save)', async () => {
    const pos = await agent.positions();
    const savePos = pos.positions.find(p => p.type === 'save');
    console.log(`   Save position: $${savePos?.amount.toFixed(2) ?? '0.00'} USDC`);
    assert(savePos !== undefined, 'save position exists');
    assert((savePos?.amount ?? 0) > 0, 'save position has value');
    assert(savePos?.protocol === 'navi', 'protocol is navi');
  });

  // ── 8. Max Withdraw ──

  await runSection('8. Max Withdraw', async () => {
    const max = await agent.maxWithdraw();
    console.log(`   Max: $${max.maxAmount.toFixed(2)} USDC`);
    console.log(`   Current HF: ${max.currentHF === Infinity ? '∞' : max.currentHF.toFixed(2)}`);

    assert(max.maxAmount > 0, 'maxWithdraw > 0');
    assert(typeof max.currentHF === 'number', 'currentHF is a number');
  });

  // ── 9. Borrow (NAVI same-asset borrowing) ──

  let didBorrow = false;

  await runSection(`9. Borrow $${BORROW_AMOUNT} USDC from NAVI`, async () => {
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
    console.log(`   Gas: ${result.gasCost.toFixed(6)} SUI (${result.gasMethod})`);

    assert(result.success === true, 'borrow succeeded');
    assert(result.amount === BORROW_AMOUNT, 'borrow amount matches');
    assert(result.healthFactor > 1.0, 'health factor > 1 after borrow');
    assert(result.fee >= 0, 'fee is non-negative');
    assert(result.gasCost > 0, 'gas was consumed');
    assert(['self-funded', 'sponsored', 'auto-topup'].includes(result.gasMethod), 'valid gasMethod');

    didBorrow = true;
  });

  // ── 10. Health Factor ──

  await runSection('10. Health Factor', async () => {
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

  // ── 11. Max Borrow ──

  await runSection('11. Max Borrow', async () => {
    const max = await agent.maxBorrow();
    console.log(`   Max: $${max.maxAmount.toFixed(2)} USDC`);
    console.log(`   Current HF: ${max.currentHF === Infinity ? '∞' : max.currentHF.toFixed(2)}`);

    assert(max.maxAmount >= 0, 'maxBorrow >= 0');
    assert(typeof max.currentHF === 'number', 'current HF is a number');
  });

  // ── 12. Repay ──

  await runSection('12. Repay', async () => {
    if (!didBorrow) {
      console.log('   ⚠ Skipped — no borrow to repay');
      assert(true, 'repay skipped — no active borrow');
      return;
    }

    const result = await agent.repay({ amount: BORROW_AMOUNT });
    console.log(`   Tx:     ${result.tx}`);
    console.log(`   Amount: $${result.amount.toFixed(2)}`);
    console.log(`   Remaining debt: $${result.remainingDebt.toFixed(4)}`);
    console.log(`   Gas: ${result.gasCost.toFixed(6)} SUI (${result.gasMethod})`);

    assert(result.success === true, 'repay succeeded');
    assert(result.amount === BORROW_AMOUNT, 'repay amount matches');
    assert(result.remainingDebt >= 0, 'remaining debt >= 0');
    assert(result.gasCost > 0, 'gas was consumed');
    assert(['self-funded', 'sponsored', 'auto-topup'].includes(result.gasMethod), 'valid gasMethod');
  });

  // ── 13. Swap (USDC → SUI) ──

  await runSection(`13. Swap $${SWAP_AMOUNT} USDC → SUI`, async () => {
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
    assert(result.fee > 0, 'swap fee charged');
    assert(result.priceImpact >= 0, 'priceImpact >= 0');
    assert(['self-funded', 'sponsored', 'auto-topup'].includes(result.gasMethod), 'valid gasMethod');

    const suiAfter = (await agent.balance()).gasReserve.sui;
    assert(suiAfter > suiBefore, 'SUI balance increased after swap');
  });

  // ── 14. Swap Quote ──

  await runSection('14. Swap Quote (read-only)', async () => {
    const quote = await agent.swapQuote({ from: 'USDC', to: 'SUI', amount: 1 });
    console.log(`   Expected: ${quote.expectedOutput.toFixed(4)} SUI`);
    console.log(`   Impact:   ${(quote.priceImpact * 100).toFixed(4)}%`);
    console.log(`   Pool $:   ${quote.poolPrice.toFixed(4)}`);
    console.log(`   Fee:      $${quote.fee.amount.toFixed(4)} (${(quote.fee.rate * 100).toFixed(2)}%)`);

    assert(quote.expectedOutput > 0, 'quote output > 0');
    assert(quote.poolPrice > 0, 'pool price > 0');
    assert(quote.fee.rate === 0.001, 'fee rate is 0.1%');
  });

  // ── 15. Withdraw All ──

  await runSection('15. Withdraw All', async () => {
    const balBefore = await agent.balance();
    const result = await agent.withdraw({ amount: 'all' });
    console.log(`   Tx:     ${result.tx}`);
    console.log(`   Amount: $${result.amount.toFixed(2)} USDC`);
    console.log(`   Gas:    ${result.gasCost.toFixed(6)} SUI (${result.gasMethod})`);

    assert(result.success === true, 'withdraw succeeded');
    assert(result.amount > 0, 'withdrew amount > 0');
    assert(['self-funded', 'sponsored', 'auto-topup'].includes(result.gasMethod), 'valid gasMethod');

    const balAfter = await agent.balance();
    assert(balAfter.savings < 0.01, 'savings ≈ 0 after withdraw all');
    assert(balAfter.available > balBefore.available, 'available increased after withdraw');
  });

  // ── 16. History ──

  await runSection('16. Transaction History', async () => {
    const history = await agent.history({ limit: 5 });
    console.log(`   Recent transactions: ${history.length}`);
    for (const tx of history.slice(0, 3)) {
      console.log(`   - ${tx.action}: ${tx.digest.slice(0, 12)}...`);
    }
    assert(history.length > 0, 'history has entries');
    assert(history[0].digest.length > 10, 'digest is non-empty');
  });

  // ── 17. Earnings ──

  await runSection('17. Earnings', async () => {
    const earnings = await agent.earnings();
    console.log(`   Total yield:  $${earnings.totalYieldEarned.toFixed(4)}`);
    console.log(`   Daily earning: $${earnings.dailyEarning.toFixed(4)}`);
    console.log(`   Current APY:  ${earnings.currentApy.toFixed(2)}%`);

    assert(typeof earnings.totalYieldEarned === 'number', 'totalYieldEarned is a number');
    assert(typeof earnings.dailyEarning === 'number', 'dailyEarning is a number');
    assert(typeof earnings.currentApy === 'number', 'currentApy is a number');
  });

  // ── 18. Fund Status ──

  await runSection('18. Fund Status', async () => {
    const status = await agent.fundStatus();
    console.log(`   Supplied:     $${status.supplied.toFixed(2)}`);
    console.log(`   APY:          ${status.apy.toFixed(2)}%`);
    console.log(`   Earned today: $${status.earnedToday.toFixed(4)}`);
    console.log(`   All time:     $${status.earnedAllTime.toFixed(4)}`);
    console.log(`   Monthly est:  $${status.projectedMonthly.toFixed(4)}`);

    assert(typeof status.supplied === 'number', 'supplied is a number');
    assert(typeof status.apy === 'number', 'apy is a number');
    assert(typeof status.earnedToday === 'number', 'earnedToday is a number');
    assert(typeof status.earnedAllTime === 'number', 'earnedAllTime is a number');
    assert(typeof status.projectedMonthly === 'number', 'projectedMonthly is a number');
  });

  // ── 19. Deposit Info ──

  await runSection('19. Deposit Info', async () => {
    const deposit = await agent.deposit();
    console.log(`   Network: ${deposit.network}`);
    console.log(`   Assets:  ${deposit.supportedAssets.join(', ')}`);

    assert(deposit.address === address, 'deposit address matches wallet');
    assert(deposit.network.includes('Sui'), 'network mentions Sui');
    assert(deposit.supportedAssets.includes('USDC'), 'supports USDC');
    assert(deposit.instructions.length > 20, 'instructions are non-empty');
  });

  // ── 20. Export Key ──

  await runSection('20. Export Key', async () => {
    const exported = agent.exportKey();
    assert(exported.startsWith('suiprivkey1'), 'exported key is Bech32 suiprivkey');
    assert(exported === PRIVATE_KEY, 'exported key matches input');
  });

  // ── 21. Error Handling ──

  await runSection('21. Error Handling', async () => {
    try {
      await agent.send({ to: 'invalid-address', amount: 1 });
      assert(false, 'Should throw for invalid address');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      assert(
        msg.toLowerCase().includes('address') || msg.toLowerCase().includes('invalid'),
        'Invalid address caught',
      );
    }

    try {
      await agent.swap({ from: 'USDC', to: 'USDC', amount: 1 });
      assert(false, 'Should throw for same-asset swap');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes('same') || msg.includes('INVALID'), 'Same-asset swap caught');
    }

    try {
      await agent.swap({ from: 'DOGE', to: 'SUI', amount: 1 });
      assert(false, 'Should throw for unsupported asset');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      assert(
        msg.includes('not supported') || msg.includes('ASSET_NOT_SUPPORTED'),
        'Unsupported asset caught',
      );
    }
  });

  // ── 22. Event Emitter ──

  await runSection('22. Event Emitter', async () => {
    let balanceEventFired = false;
    agent.on('balanceChange', () => { balanceEventFired = true; });

    await agent.send({ to: address, amount: 0.01 });
    assert(balanceEventFired, 'balanceChange event fired on send');
  });

  // ── 23. Final Balance ──

  await runSection('23. Final Balance', async () => {
    const final = await agent.balance();
    console.log(`   Available: $${final.available.toFixed(2)} USDC`);
    console.log(`   Savings:   $${final.savings.toFixed(2)} USDC`);
    console.log(`   Gas:       ${final.gasReserve.sui.toFixed(4)} SUI`);
    console.log(`   Total:     $${final.total.toFixed(2)}`);

    assert(final.savings < 0.01, 'no savings remaining');
  });

  // ── Summary ──

  console.log('\n════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('  Protocol: NAVI (same-asset borrow enabled)');
  console.log('════════════════════════════════════════════');

  if (failures.length > 0) {
    console.log('\n  Failures:');
    for (const f of failures) {
      console.log(`    ✗ ${f}`);
    }
  }

  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
