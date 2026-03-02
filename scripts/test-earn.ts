/**
 * Earn Tests
 *
 * Tests: fundStatus + listSentinels together (the t2000 earn combo).
 *
 * Usage:
 *   source .env.local && npx tsx scripts/test-earn.ts
 */

import { assert, runSection, createAgent, summary, exitCode } from './test-helpers.js';
import { listSentinels, MIST_PER_SUI } from '../packages/sdk/src/index.js';

async function main() {
  console.log('\n  Earn Tests\n');

  const agent = createAgent();

  await runSection('Fund Status (savings data)', async () => {
    const status = await agent.fundStatus();
    console.log(`   Supplied:  $${status.supplied.toFixed(2)} USDC`);
    console.log(`   APY:       ${status.apy.toFixed(2)}%`);
    console.log(`   Monthly:   $${status.projectedMonthly.toFixed(4)}`);

    assert(typeof status.supplied === 'number', 'supplied is a number');
    assert(typeof status.apy === 'number', 'apy is a number');
    assert(typeof status.projectedMonthly === 'number', 'projectedMonthly is a number');
  });

  await runSection('List Sentinels (bounty data)', async () => {
    const sentinels = await listSentinels();
    console.log(`   Active sentinels: ${sentinels.length}`);

    assert(Array.isArray(sentinels), 'sentinels is an array');
    assert(sentinels.length > 0, 'has active sentinels');

    const totalPool = sentinels.reduce((sum, s) => sum + s.prizePool, 0n);
    const totalPoolSui = Number(totalPool) / Number(MIST_PER_SUI);
    console.log(`   Total prize pools: ${totalPoolSui.toFixed(2)} SUI`);
    assert(totalPool >= 0n, 'total prize pool >= 0');

    const cheapest = sentinels.reduce((min, s) =>
      s.attackFee < min.attackFee ? s : min
    );
    const cheapestFee = Number(cheapest.attackFee) / Number(MIST_PER_SUI);
    console.log(`   Cheapest fee: ${cheapestFee.toFixed(2)} SUI (${cheapest.name})`);
    assert(cheapest.attackFee > 0n, 'cheapest fee > 0');

    const withPool = sentinels.filter(s => s.prizePool > 0n);
    if (withPool.length > 0) {
      const best = withPool.reduce((b, s) => {
        const ratio = Number(s.prizePool) / Number(s.attackFee);
        const bestRatio = Number(b.prizePool) / Number(b.attackFee);
        return ratio > bestRatio ? s : b;
      });
      const ratio = Number(best.prizePool) / Number(best.attackFee);
      console.log(`   Best target: ${best.name} — ${(Number(best.prizePool) / Number(MIST_PER_SUI)).toFixed(2)} SUI pool (${ratio.toFixed(1)}x ratio)`);
      assert(ratio > 0, 'best target has positive ratio');
    }
  });

  await runSection('Concurrent fetch (earn pattern)', async () => {
    const [fundResult, sentinelResult] = await Promise.allSettled([
      agent.fundStatus(),
      listSentinels(),
    ]);

    assert(fundResult.status === 'fulfilled', 'fundStatus resolved');
    assert(sentinelResult.status === 'fulfilled', 'listSentinels resolved');

    if (fundResult.status === 'fulfilled' && sentinelResult.status === 'fulfilled') {
      console.log(`   Savings: $${fundResult.value.supplied.toFixed(2)} @ ${fundResult.value.apy.toFixed(1)}% APY`);
      console.log(`   Sentinels: ${sentinelResult.value.length} active`);
    }
  });

  summary('Earn');
  process.exit(exitCode());
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
