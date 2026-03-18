/**
 * MPP Pay Tests
 *
 * Tests: MPP payment via agent.pay() SDK method.
 * A live test requires a 402-protected endpoint — use --live with a URL.
 *
 * Usage:
 *   source .env.local && npx tsx scripts/test-pay.ts
 *   source .env.local && npx tsx scripts/test-pay.ts --live https://your-402-endpoint.com/data
 */

import { assert, section, runSection, createAgent, summary, exitCode } from './test-helpers.js';

const LIVE = process.argv.includes('--live');
const LIVE_URL = process.argv[process.argv.indexOf('--live') + 1] ?? '';

async function main() {
  console.log('\n  MPP Pay Tests\n');

  const agent = createAgent();

  await runSection('MPP Agent Setup', async () => {
    assert(typeof agent.address() === 'string', 'agent.address() returns string');
    assert(agent.address().startsWith('0x'), 'agent address starts with 0x');
    assert(typeof agent.pay === 'function', 'agent.pay() method exists');
  });

  if (LIVE && LIVE_URL) {
    await runSection(`Live MPP Payment: ${LIVE_URL}`, async () => {
      const result = await agent.pay({
        url: LIVE_URL,
        maxPrice: 0.05,
      });

      assert(result.paid, 'paid request returns paid');
      assert(result.receipt != null, 'result has receipt');
      assert(typeof result.receipt!.reference === 'string', 'receipt has reference');
      assert(result.receipt!.reference.length > 0, 'receipt reference is non-empty');
      console.log(`   Payment: tx ${result.receipt!.reference.slice(0, 16)}...`);
    });
  } else if (LIVE) {
    console.log('\n   ⚠ --live requires a URL: npx tsx scripts/test-pay.ts --live https://your-endpoint.com');
  } else {
    section('Live Payment');
    console.log('   ⏭  Skipped — run with --live <url> to test real payment');
  }

  summary('MPP Pay');
  process.exit(exitCode());
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
