/**
 * Wallet & Balance Tests
 *
 * Tests: wallet loading, address format, balance retrieval.
 *
 * Usage:
 *   source .env.local && npx tsx scripts/test-wallet.ts
 */

import { assert, section, createAgent, summary, exitCode } from './test-helpers.js';

async function main() {
  console.log('\n  Wallet & Balance Tests\n');

  const agent = createAgent();

  section('Wallet Loading');
  const address = agent.address();
  console.log(`   Address: ${address}`);
  assert(address.startsWith('0x'), 'Address starts with 0x');
  assert(address.length === 66, 'Address is 66 chars');

  section('Balance');
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

  section('Stablecoins');
  assert(typeof b.stables === 'object', 'stables field exists');
  assert('USDC' in b.stables, 'stables contains USDC');
  console.log(`   Stables:`);
  for (const [asset, amount] of Object.entries(b.stables)) {
    console.log(`     ${asset}: $${amount.toFixed(2)}`);
    assert(typeof amount === 'number', `${asset} balance is a number`);
    assert(amount >= 0, `${asset} balance >= 0`);
  }

  summary('Wallet & Balance');
  process.exit(exitCode());
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
