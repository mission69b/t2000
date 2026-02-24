import { T2000 } from '../packages/sdk/src/index.js';

const PRIVATE_KEY = process.env.T2000_PASSPHRASE;
if (!PRIVATE_KEY) {
  console.error('Set T2000_PASSPHRASE in .env.local');
  process.exit(1);
}

const SAVE_AMOUNT = 1; // $1 USDC

async function main() {
  console.log('\n=== t2000 Integration Test (mainnet) ===\n');

  // Step 1: Create agent from private key
  console.log('1. Loading wallet...');
  const agent = T2000.fromPrivateKey(PRIVATE_KEY);
  const address = agent.address();
  console.log(`   Address: ${address}\n`);

  // Step 2: Check balance
  console.log('2. Checking balance...');
  const balance = await agent.balance();
  console.log(`   Available: $${balance.available.toFixed(2)} USDC`);
  console.log(`   Savings:   $${balance.savings.toFixed(2)} USDC`);
  console.log(`   Gas:       ${balance.gasReserve.sui.toFixed(4)} SUI (~$${balance.gasReserve.usdEquiv.toFixed(2)})`);
  console.log(`   Total:     $${balance.total.toFixed(2)}\n`);

  if (balance.gasReserve.sui < 0.01) {
    console.error('   ✗ Not enough SUI for gas. Send at least 0.05 SUI to this address.');
    process.exit(1);
  }

  // Step 3: Check rates
  console.log('3. Fetching Suilend rates...');
  try {
    const rates = await agent.rates();
    console.log(`   Save APY:   ${rates.USDC.saveApy.toFixed(2)}%`);
    console.log(`   Borrow APY: ${rates.USDC.borrowApy.toFixed(2)}%\n`);
  } catch (err) {
    console.log(`   ⚠ Rates unavailable: ${err instanceof Error ? err.message : err}\n`);
  }

  // Step 4: Check positions
  console.log('4. Checking positions...');
  try {
    const positions = await agent.positions();
    if (positions.positions.length === 0) {
      console.log('   No existing positions.\n');
    } else {
      for (const p of positions.positions) {
        console.log(`   ${p.type}: $${p.amount.toFixed(2)} ${p.asset} (${p.protocol})`);
      }
      console.log();
    }
  } catch (err) {
    console.log(`   ⚠ Positions unavailable: ${err instanceof Error ? err.message : err}\n`);
  }

  // Step 5: Save $1 USDC
  if (balance.available < SAVE_AMOUNT) {
    console.log(`5. ⚠ Skipping save — need $${SAVE_AMOUNT} USDC, have $${balance.available.toFixed(2)}`);
    console.log('\n=== Test complete (partial — need USDC to test save/withdraw) ===\n');
    return;
  }

  console.log(`5. Saving $${SAVE_AMOUNT} USDC to Suilend...`);
  try {
    const saveResult = await agent.save({ amount: SAVE_AMOUNT });
    console.log(`   ✓ Saved $${saveResult.amount.toFixed(2)} USDC`);
    console.log(`   APY: ${saveResult.apy.toFixed(2)}%`);
    console.log(`   Tx:  ${saveResult.tx}`);
    console.log(`   Gas: ${saveResult.gasCost.toFixed(6)} SUI (${saveResult.gasMethod})\n`);
  } catch (err) {
    console.error(`   ✗ Save failed: ${err instanceof Error ? err.message : err}\n`);
    console.log('\n=== Test complete (save failed) ===\n');
    return;
  }

  // Step 6: Check positions after save
  console.log('6. Checking positions after save...');
  const posAfter = await agent.positions();
  for (const p of posAfter.positions) {
    console.log(`   ${p.type}: $${p.amount.toFixed(2)} ${p.asset} (${p.protocol})`);
  }
  console.log();

  // Step 7: Check health factor
  console.log('7. Health factor...');
  const hf = await agent.healthFactor();
  const hfStr = hf.healthFactor === Infinity ? '∞' : hf.healthFactor.toFixed(2);
  console.log(`   HF: ${hfStr}`);
  console.log(`   Supplied: $${hf.supplied.toFixed(2)}, Borrowed: $${hf.borrowed.toFixed(2)}\n`);

  // Step 8: Withdraw all USDC
  console.log(`8. Withdrawing all USDC from Suilend...`);
  try {
    const withdrawResult = await agent.withdraw({ amount: 'all' });
    console.log(`   ✓ Withdrew $${withdrawResult.amount.toFixed(2)} USDC`);
    console.log(`   Tx:  ${withdrawResult.tx}`);
    console.log(`   Gas: ${withdrawResult.gasCost.toFixed(6)} SUI (${withdrawResult.gasMethod})\n`);
  } catch (err) {
    console.error(`   ✗ Withdraw failed: ${err instanceof Error ? err.message : err}\n`);
  }

  // Step 9: Final balance
  console.log('9. Final balance...');
  const finalBal = await agent.balance();
  console.log(`   Available: $${finalBal.available.toFixed(2)} USDC`);
  console.log(`   Savings:   $${finalBal.savings.toFixed(2)} USDC`);
  console.log(`   Gas:       ${finalBal.gasReserve.sui.toFixed(4)} SUI\n`);

  console.log('=== Integration test complete ===\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
