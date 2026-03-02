/**
 * Send Tests
 *
 * Tests: USDC send (self-transfer), gas method, balance update.
 *
 * Usage:
 *   source .env.local && npx tsx scripts/test-send.ts
 */

import { assert, runSection, createAgent, summary, exitCode } from './test-helpers.js';

const SEND_AMOUNT = 0.01;

async function main() {
  console.log('\n  Send Tests\n');

  const agent = createAgent();
  const address = agent.address();

  await runSection(`Send $${SEND_AMOUNT} USDC → own address`, async () => {
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

  summary('Send');
  process.exit(exitCode());
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
