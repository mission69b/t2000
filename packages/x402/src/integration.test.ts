/**
 * On-chain integration tests for x402 Payment Kit flow.
 *
 * These require a funded mainnet wallet with USDC and run real transactions.
 * Skip by default — run with: INTEGRATION=true pnpm --filter @t2000/x402 test
 *
 * Required env vars:
 *   T2000_PRIVATE_KEY — Sui private key (suiprivkey1... format)
 *   SUI_RPC_URL — optional, defaults to mainnet fullnode
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { buildPaymentTransaction } from './payment-kit.js';
import { verifyPayment } from './facilitator.js';
import { T2000_PAYMENT_REGISTRY_ID, PAYMENT_KIT_MODULE } from './constants.js';

const SKIP = !process.env.INTEGRATION;
const TEST_AMOUNT = '0.001';
const TEST_PAY_TO = '0x5366efbf2b4fe5767fe2e78eb197aa5f5d138d88ac3333fbf3f80a1927da473a';
const SHARED_NONCE = `integration-test-${Date.now()}`;

let client: SuiJsonRpcClient;
let keypair: Ed25519Keypair;
let senderAddress: string;
let paymentDigest: string;

function loadKeypair(): Ed25519Keypair {
  const key = process.env.T2000_PRIVATE_KEY;
  if (!key) throw new Error('T2000_PRIVATE_KEY env var required for integration tests');
  const decoded = decodeSuiPrivateKey(key);
  return Ed25519Keypair.fromSecretKey(decoded.secretKey);
}

describe.skipIf(SKIP)('x402 on-chain integration', () => {
  beforeAll(() => {
    const rpcUrl = process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl('mainnet');
    client = new SuiJsonRpcClient({ url: rpcUrl, network: 'mainnet' });
    keypair = loadKeypair();
    senderAddress = keypair.getPublicKey().toSuiAddress();
  });

  it('8.21: full payment flow — build, sign, execute, verify', async () => {
    expect(T2000_PAYMENT_REGISTRY_ID).toBeTruthy();

    const tx = await buildPaymentTransaction(client, senderAddress, {
      nonce: SHARED_NONCE,
      amount: TEST_AMOUNT,
      payTo: TEST_PAY_TO,
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      options: { showEffects: true, showEvents: true },
    });

    expect(result.digest).toBeTruthy();
    paymentDigest = result.digest;

    await client.waitForTransaction({ digest: result.digest });

    const receiptEvent = result.events?.find((e) =>
      e.type.includes(`${PAYMENT_KIT_MODULE}::PaymentReceipt`),
    );
    expect(receiptEvent).toBeDefined();

    const fields = receiptEvent?.parsedJson as Record<string, unknown>;
    expect(String(fields.nonce)).toBe(SHARED_NONCE);
    expect(fields.receiver).toBe(TEST_PAY_TO);
    expect(Number(fields.payment_amount)).toBe(1000);

    const verification = await verifyPayment(client, {
      txHash: result.digest,
      network: 'sui',
      amount: TEST_AMOUNT,
      asset: 'USDC',
      payTo: TEST_PAY_TO,
      nonce: SHARED_NONCE,
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });

    expect(verification.verified).toBe(true);
    expect(verification.txHash).toBe(result.digest);
  }, 30_000);

  it('8.22: duplicate nonce — second payment rejected on-chain', async () => {
    expect(paymentDigest).toBeTruthy();

    const tx = await buildPaymentTransaction(client, senderAddress, {
      nonce: SHARED_NONCE,
      amount: TEST_AMOUNT,
      payTo: TEST_PAY_TO,
    });

    await expect(
      client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: { showEffects: true },
      }),
    ).rejects.toThrow();
  }, 30_000);
});
