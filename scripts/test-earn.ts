/**
 * Earn Tests
 *
 * Tests: fundStatus (the t2000 earn command).
 *
 * Usage:
 *   source .env.local && npx tsx scripts/test-earn.ts
 */

import { assert, runSection, createAgent, summary, exitCode } from './test-helpers.js';

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

  await runSection('Positions (multi-protocol)', async () => {
    const pos = await agent.positions();
    for (const p of pos.positions) {
      console.log(`   ${p.protocol}: ${p.type} $${p.amount.toFixed(2)} ${p.asset}`);
    }
    const protocols = new Set(pos.positions.map(p => p.protocol));
    console.log(`   Active protocols: ${[...protocols].join(', ') || 'none'}`);

    assert(Array.isArray(pos.positions), 'positions is an array');
    for (const p of pos.positions) {
      assert(typeof p.protocol === 'string' && p.protocol.length > 0, `position has protocol: ${p.protocol}`);
    }
  });

  summary('Earn');
  process.exit(exitCode());
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
