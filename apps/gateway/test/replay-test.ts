/**
 * MPP Digest Replay Protection — End-to-End Test
 *
 * Usage:
 *   DIGEST=<already-used-digest> pnpm tsx apps/gateway/test/replay-test.ts
 */
import { Challenge, Credential } from 'mppx';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'https://mpp.t2000.ai';
const DIGEST = process.env.DIGEST;

if (!DIGEST) {
  console.error('Usage: DIGEST=<tx-digest> pnpm tsx apps/gateway/test/replay-test.ts');
  process.exit(1);
}

async function main() {
  const endpoint = `${GATEWAY_URL}/brave/v1/web/search`;
  const body = JSON.stringify({ q: 'sui blockchain test' });

  console.log(`\n🔍 Testing digest replay protection`);
  console.log(`   Gateway:  ${GATEWAY_URL}`);
  console.log(`   Digest:   ${DIGEST}`);
  console.log(`   Endpoint: ${endpoint}\n`);

  // Step 1: Get a 402 challenge
  console.log('Step 1 — Request without payment (expect 402)...');
  const challengeRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

  if (challengeRes.status !== 402) {
    console.error(`   ❌ Expected 402, got ${challengeRes.status}`);
    process.exit(1);
  }

  const wwwAuth = challengeRes.headers.get('www-authenticate')!;
  const challenge = Challenge.deserialize(wwwAuth);
  console.log(`   ✅ Got 402 challenge (id: ${challenge.id.slice(0, 16)}...)\n`);

  // Step 2: Replay the digest as payment credential
  console.log('Step 2 — Replaying used digest as credential...');

  const authHeader = Credential.serialize({
    challenge,
    payload: { digest: DIGEST },
  });

  const replayRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': authHeader,
    },
    body,
  });

  console.log(`   Status: ${replayRes.status}`);
  const replayBody = await replayRes.text();

  if (replayRes.status === 402 && replayBody.includes('already used')) {
    console.log(`   ✅ REPLAY REJECTED — digest protection working!`);
    console.log(`\n   Response body:`);
    try { console.log(`   ${JSON.stringify(JSON.parse(replayBody), null, 2).replace(/\n/g, '\n   ')}`); }
    catch { console.log(`   ${replayBody.slice(0, 400)}`); }
  } else if (replayRes.status === 200) {
    console.error(`   ❌ REPLAY ACCEPTED — digest was NOT blocked!`);
    process.exit(1);
  } else {
    console.log(`   Response: ${replayBody.slice(0, 400)}`);
  }

  console.log('');
}

main().catch(console.error);
