// Live x402 e2e against the production gateway (prove-then-propose, S.414).
// Run: node scripts/e2e-x402.mjs — pays ~$0.02 USDC from ~/.t2000/wallet.key.
// Steps: 402+accepts[] → offline sign → X-PAYMENT settle-then-serve →
// receipt → replay-rejection → on-chain balance-change verification.

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { buildX402SignedPayment, X402_PAYMENT_HEADER, X402_PAYMENT_RESPONSE_HEADER } from '@suimpp/mpp/x402';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const URL_ = 'https://mpp.t2000.ai/serper/v1/search';
const BODY = JSON.stringify({ q: 'sui x402 e2e' });
const { secret } = JSON.parse(readFileSync(`${homedir()}/.t2000/wallet.key`, 'utf8'));
const signer = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(secret).secretKey);
console.log('payer:', signer.toSuiAddress());

// Step 1 — unpaid request → 402 with accepts[]
const r1 = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: BODY });
console.log('step1 status:', r1.status);
const challenge = await r1.json();
const requirements = challenge.accepts?.[0];
if (!requirements) throw new Error('no accepts[] in 402');
console.log('step1 challengeId:', requirements.extra.suimpp.challengeId, '| amount:', requirements.maxAmountRequired, '| epoch:', requirements.extra.suimpp.minEpoch);

// Step 2 — sign offline (no RPC)
const t0 = Date.now();
const { header } = await buildX402SignedPayment({ requirements, signer });
console.log('step2 signed offline in', Date.now() - t0, 'ms; header bytes:', header.length);

// Step 3 — retry WITH X-PAYMENT → expect paid 200
const t1 = Date.now();
const r2 = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json', [X402_PAYMENT_HEADER]: header }, body: BODY });
const settleMs = Date.now() - t1;
console.log('step3 status:', r2.status, `(${settleMs}ms settle+serve)`);
const receiptB64 = r2.headers.get(X402_PAYMENT_RESPONSE_HEADER);
if (!receiptB64) { console.log('step3 BODY:', (await r2.text()).slice(0, 400)); throw new Error('no X-PAYMENT-RESPONSE header'); }
const receipt = JSON.parse(Buffer.from(receiptB64, 'base64').toString('utf8'));
console.log('step3 receipt:', JSON.stringify(receipt));
const data = await r2.json();
console.log('step3 upstream organic results:', Array.isArray(data.organic) ? data.organic.length : 'n/a');

// Step 4 — replay the SAME header → must be rejected
const r3 = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json', [X402_PAYMENT_HEADER]: header }, body: BODY });
console.log('step4 replay status:', r3.status, r3.status === 402 ? '(rejected ✓)' : '(NOT REJECTED ✗)');

// Step 5 — on-chain verification
const c = new SuiGrpcClient({ baseUrl: 'https://fullnode.mainnet.sui.io:443', network: 'mainnet' });
const tx = await c.core.getTransaction({ digest: receipt.transaction, include: { balanceChanges: true } });
const resolved = tx.Transaction ?? tx.FailedTransaction;
console.log('step5 on-chain success:', resolved?.status?.success);
for (const bc of resolved?.balanceChanges ?? []) {
  if (bc.coinType.includes('usdc')) console.log('  USDC delta:', bc.address.slice(0, 10), bc.amount);
}
