/**
 * Misc Tests
 *
 * Tests: history, earnings, fund status, deposit info, export key,
 *        error handling, event emitter.
 *
 * Usage:
 *   source .env.local && npx tsx scripts/test-misc.ts
 */

import { assert, runSection, createAgent, getPrivateKey, summary, exitCode } from './test-helpers.js';

async function main() {
  console.log('\n  Misc Tests\n');

  const agent = createAgent();
  const address = agent.address();
  const privateKey = getPrivateKey();

  await runSection('Transaction History', async () => {
    const history = await agent.history({ limit: 5 });
    console.log(`   Recent transactions: ${history.length}`);
    for (const tx of history.slice(0, 3)) {
      console.log(`   - ${tx.action}: ${tx.digest.slice(0, 12)}...`);
    }
    assert(history.length > 0, 'history has entries');
    assert(history[0].digest.length > 10, 'digest is non-empty');
  });

  await runSection('Earnings', async () => {
    const earnings = await agent.earnings();
    console.log(`   Total yield:  $${earnings.totalYieldEarned.toFixed(4)}`);
    console.log(`   Daily earning: $${earnings.dailyEarning.toFixed(4)}`);
    console.log(`   Current APY:  ${earnings.currentApy.toFixed(2)}%`);

    assert(typeof earnings.totalYieldEarned === 'number', 'totalYieldEarned is a number');
    assert(typeof earnings.dailyEarning === 'number', 'dailyEarning is a number');
    assert(typeof earnings.currentApy === 'number', 'currentApy is a number');
  });

  await runSection('Fund Status', async () => {
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

  await runSection('Deposit Info', async () => {
    const deposit = await agent.deposit();
    console.log(`   Network: ${deposit.network}`);
    console.log(`   Assets:  ${deposit.supportedAssets.join(', ')}`);

    assert(deposit.address === address, 'deposit address matches wallet');
    assert(deposit.network.includes('Sui'), 'network mentions Sui');
    assert(deposit.supportedAssets.includes('USDC'), 'supports USDC');
    assert(deposit.instructions.length > 20, 'instructions are non-empty');
  });

  await runSection('Export Key', async () => {
    const exported = agent.exportKey();
    assert(exported.startsWith('suiprivkey1'), 'exported key is Bech32 suiprivkey');
    assert(exported === privateKey, 'exported key matches input');
  });

  await runSection('Error Handling', async () => {
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

  });

  await runSection('Event Emitter', async () => {
    let balanceEventFired = false;
    agent.on('balanceChange', () => { balanceEventFired = true; });

    await agent.send({ to: address, amount: 0.01 });
    assert(balanceEventFired, 'balanceChange event fired on send');
  });

  summary('Misc');
  process.exit(exitCode());
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
