/**
 * x402 Pay Tests
 *
 * Tests: x402 client setup, wallet bridge, dry-run flow.
 * A live test requires a 402-protected endpoint — use --live with a URL.
 *
 * Usage:
 *   source .env.local && npx tsx scripts/test-pay.ts
 *   source .env.local && npx tsx scripts/test-pay.ts --live https://your-402-endpoint.com/data
 */

import { assert, section, runSection, createAgent, summary, exitCode } from './test-helpers.js';
import { x402Client } from '../packages/x402/src/index.js';
import type { X402Wallet } from '../packages/x402/src/types.js';

const LIVE = process.argv.includes('--live');
const LIVE_URL = process.argv[process.argv.indexOf('--live') + 1] ?? '';

function createX402Wallet(agent: ReturnType<typeof createAgent>): X402Wallet {
  return {
    client: agent.suiClient,
    keypair: agent.signer,
    address: () => agent.address(),
    signAndExecute: async (tx) => {
      const result = await agent.suiClient.signAndExecuteTransaction({
        signer: agent.signer,
        transaction: tx as Parameters<typeof agent.suiClient.signAndExecuteTransaction>[0]['transaction'],
      });
      return { digest: result.digest };
    },
  };
}

async function main() {
  console.log('\n  x402 Pay Tests\n');

  const agent = createAgent();

  await runSection('x402 Client Setup', async () => {
    const wallet = createX402Wallet(agent);
    assert(typeof wallet.address() === 'string', 'wallet.address() returns string');
    assert(wallet.address().startsWith('0x'), 'wallet address starts with 0x');
    assert(typeof wallet.client === 'object', 'wallet.client is an object');
    assert(typeof wallet.signAndExecute === 'function', 'wallet.signAndExecute is a function');

    const client = new x402Client(wallet);
    assert(typeof client.fetch === 'function', 'x402Client has fetch method');
  });

  await runSection('Facilitator Health Check', async () => {
    const response = await fetch('https://api.t2000.ai/x402');
    assert(response.ok, 'facilitator endpoint responds 200');

    const data = await response.json() as Record<string, unknown>;
    assert(data.service === 't2000 x402 facilitator', 'facilitator identifies correctly');
    assert(typeof data.endpoints === 'object', 'facilitator lists endpoints');
  });

  await runSection('Non-402 URL (passthrough)', async () => {
    const wallet = createX402Wallet(agent);
    const client = new x402Client(wallet);

    const response = await client.fetch('https://httpbin.org/get', {
      maxPrice: 0.01,
      timeout: 10000,
    });

    assert(response.status === 200, 'non-402 URL passes through with 200');
    const body = await response.json() as Record<string, unknown>;
    assert(typeof body.url === 'string', 'response body has url field');
  });

  if (LIVE && LIVE_URL) {
    await runSection(`Live x402 Payment: ${LIVE_URL}`, async () => {
      const wallet = createX402Wallet(agent);
      const client = new x402Client(wallet);

      let paymentMade = false;
      const response = await client.fetch(LIVE_URL, {
        maxPrice: 0.05,
        timeout: 30000,
        onPayment: (details) => {
          console.log(`   Payment: $${details.amount} USDC (tx: ${details.txHash.slice(0, 12)}...)`);
          paymentMade = true;
        },
      });

      assert(response.status === 200, 'paid request returns 200');
      assert(paymentMade, 'onPayment callback fired');
    });
  } else if (LIVE) {
    console.log('\n   ⚠ --live requires a URL: npx tsx scripts/test-pay.ts --live https://your-endpoint.com');
  } else {
    section('Live Payment');
    console.log('   ⏭  Skipped — run with --live <url> to test real payment');
  }

  summary('x402 Pay');
  process.exit(exitCode());
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
