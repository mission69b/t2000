/**
 * Claim Rewards Tests
 *
 * Tests: getPendingRewards, claimRewards (claim + auto-convert to USDC).
 *
 * Usage:
 *   source .env.local && npx tsx scripts/test-claim-rewards.ts
 */

import { assert, runSection, createAgent, summary, exitCode } from './test-helpers.js';

async function main() {
  console.log('\n  Claim Rewards Tests\n');

  const agent = createAgent();

  await runSection('getPendingRewards', async () => {
    const pending = await agent.getPendingRewards();
    console.log(`   Pending rewards: ${pending.length}`);

    assert(Array.isArray(pending), 'returns an array');

    for (const r of pending) {
      console.log(`   ${r.protocol}: ${r.asset} → ${r.symbol}`);
      assert(typeof r.protocol === 'string' && r.protocol.length > 0, `has protocol: ${r.protocol}`);
      assert(typeof r.asset === 'string' && r.asset.length > 0, `has asset: ${r.asset}`);
      assert(typeof r.coinType === 'string' && r.coinType.length > 0, `has coinType`);
      assert(typeof r.symbol === 'string' && r.symbol.length > 0, `has symbol: ${r.symbol}`);
    }

    if (pending.length > 0) {
      const protocols = [...new Set(pending.map(r => r.protocol))];
      console.log(`   Protocols with rewards: ${protocols.join(', ')}`);
      assert(protocols.length > 0, 'at least one protocol has rewards');
    }
  });

  await runSection('Reward-asset mapping (per-position)', async () => {
    const pending = await agent.getPendingRewards();

    const rewardKeys = new Set(pending.map(r => `${r.protocol}:${r.asset}`));
    console.log(`   Unique protocol:asset pairs: ${rewardKeys.size}`);
    for (const key of rewardKeys) {
      console.log(`   ${key}`);
    }

    for (const r of pending) {
      assert(!r.asset.includes('::'), `asset is a symbol, not a coin type: ${r.asset}`);
    }
  });

  await runSection('claimRewards', async () => {
    const balBefore = await agent.balance();
    console.log(`   Balance before: $${balBefore.available.toFixed(2)}`);

    const result = await agent.claimRewards();
    console.log(`   Success: ${result.success}`);
    console.log(`   Rewards claimed: ${result.rewards.length}`);
    console.log(`   Total value: $${result.totalValueUsd.toFixed(4)}`);
    console.log(`   Gas method: ${result.gasMethod}`);

    assert(result.success === true, 'claim succeeded');
    assert(typeof result.tx === 'string', 'has transaction digest');
    assert(Array.isArray(result.rewards), 'rewards is an array');
    assert(typeof result.usdcReceived === 'number', 'usdcReceived is a number');
    assert(result.usdcReceived >= 0, 'usdcReceived >= 0');

    if (result.tx) {
      console.log(`   Tx: https://suiscan.xyz/mainnet/tx/${result.tx}`);
    }

    if (result.rewards.length > 0) {
      const protocols = [...new Set(result.rewards.map(r => r.protocol))];
      console.log(`   Claimed from: ${protocols.join(', ')}`);
    }
  });

  await runSection('Balance shows rewards indicator', async () => {
    const bal = await agent.balance();
    console.log(`   pendingRewards field: ${bal.pendingRewards}`);

    const pending = await agent.getPendingRewards();
    console.log(`   getPendingRewards count: ${pending.length}`);

    assert(typeof bal.pendingRewards === 'number', 'pendingRewards is a number');
  });

  summary('Claim Rewards');
  process.exit(exitCode());
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
