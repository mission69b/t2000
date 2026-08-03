import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { describe, expect, it, vi } from 'vitest';
import { USDC } from './constants.js';
import {
  type X402EscrowRequirements,
  type X402PaymentPayload,
  buildX402SignedPayment,
  challengeNonce,
  createX402Requirements,
  encodeX402Header,
  isX402EscrowHeader,
  isX402EscrowRequirements,
  parseX402Header,
  settleX402Payment,
  verifyX402Payment,
} from './x402.js';

const CHAIN = '4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S'; // arbitrary digest-shaped chain id
const RECIPIENT =
  '0x7a8e9b2c4d6f1a3b5c7d9e0f2a4b6c8d0e1f3a5b7c9d1e3f5a7b9c0d2e4f6a8b';

function makeRequirements(challengeId = 'test-challenge-id') {
  return createX402Requirements({
    challengeId,
    amount: '0.02',
    currency: USDC,
    recipient: RECIPIENT,
    resource: 'https://gateway.test/openai/v1/chat/completions',
    network: 'mainnet',
    chain: CHAIN,
    currentEpoch: 100,
  });
}

const EXPECTED = {
  challengeId: 'test-challenge-id',
  amount: '0.02',
  currency: USDC,
  recipient: RECIPIENT,
  network: 'mainnet' as const,
};

describe('challengeNonce', () => {
  it('is deterministic and u32', () => {
    const a = challengeNonce('abc');
    expect(a).toBe(challengeNonce('abc'));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0xffffffff);
  });

  it('differs across challenge ids', () => {
    expect(challengeNonce('challenge-a')).not.toBe(
      challengeNonce('challenge-b'),
    );
  });
});

describe('createX402Requirements', () => {
  it('maps the challenge terms into an accepts[] entry', () => {
    const req = makeRequirements();
    expect(req.scheme).toBe('exact');
    expect(req.network).toBe('sui:mainnet');
    expect(req.asset).toBe(USDC.type);
    expect(req.maxAmountRequired).toBe('20000'); // 0.02 USDC @ 6dp
    expect(req.payTo).toBe(RECIPIENT);
    expect(req.extra.suimpp.nonce).toBe(challengeNonce('test-challenge-id'));
    expect(req.extra.suimpp.minEpoch).toBe('100');
    expect(req.extra.suimpp.maxEpoch).toBe('101');
  });
});

describe('buildX402SignedPayment + verifyX402Payment (round-trip)', () => {
  it('builds offline, signs, and passes structural verification', async () => {
    const signer = new Ed25519Keypair();
    const req = makeRequirements();

    const { header, payment } = await buildX402SignedPayment({
      requirements: req,
      signer,
    });

    // Header round-trip
    const parsed = parseX402Header(header);
    expect(parsed.payload.txBytes).toBe(payment.payload.txBytes);
    expect(parsed.payload.senderAddress).toBe(signer.toSuiAddress());

    // Structural verification accepts the canonical build
    const { nonce } = verifyX402Payment({
      payment: parsed,
      expected: EXPECTED,
    });
    expect(nonce).toBe(challengeNonce('test-challenge-id'));
  });

  it('rejects a payment bound to a different challenge', async () => {
    const signer = new Ed25519Keypair();
    const { payment } = await buildX402SignedPayment({
      requirements: makeRequirements('other-challenge'),
      signer,
    });
    expect(() => verifyX402Payment({ payment, expected: EXPECTED })).toThrow(
      /different challenge/,
    );
  });

  it('rejects a payment whose nonce does not bind to the challenge', async () => {
    const signer = new Ed25519Keypair();
    const req = makeRequirements();
    // Tamper: claim our challengeId but sign a tx carrying another nonce.
    req.extra.suimpp.nonce = challengeNonce('attacker-nonce-source');
    const { payment } = await buildX402SignedPayment({
      requirements: req,
      signer,
    });
    expect(() => verifyX402Payment({ payment, expected: EXPECTED })).toThrow(
      /nonce does not bind/,
    );
  });

  it('rejects a non-framework package masquerading as 0x2 (package-spoof)', async () => {
    const signer = new Ed25519Keypair();
    // Forge a tx that calls send_funds on a MALICIOUS package, signed for
    // our challenge/terms. The structural check must reject on the package,
    // not be fooled by the matching module::function.
    const evil = `0x${'e'.repeat(64)}`;
    const tx = new Transaction();
    tx.setSender(signer.toSuiAddress());
    const [bal] = tx.moveCall({
      target: `${evil}::balance::redeem_funds`,
      typeArguments: [USDC.type],
      arguments: [tx.withdrawal({ amount: 20000n, type: USDC.type })],
    });
    tx.moveCall({
      target: `${evil}::balance::send_funds`,
      typeArguments: [USDC.type],
      arguments: [bal, tx.pure.address(RECIPIENT)],
    });
    tx.setGasPrice(0);
    tx.setGasBudget(0);
    tx.setGasPayment([]);
    tx.setExpiration({
      ValidDuring: {
        minEpoch: '100',
        maxEpoch: '101',
        minTimestamp: null,
        maxTimestamp: null,
        chain: CHAIN,
        nonce: challengeNonce('test-challenge-id'),
      },
    });
    const bytes = await tx.build();
    const { signature } = await signer.signTransaction(bytes);
    const forged: X402PaymentPayload = {
      x402Version: 1,
      scheme: 'exact',
      network: 'sui:mainnet',
      payload: {
        senderAddress: signer.toSuiAddress(),
        txBytes: toBase64(bytes),
        senderSignature: signature,
        challengeId: 'test-challenge-id',
      },
    };
    expect(() =>
      verifyX402Payment({ payment: forged, expected: EXPECTED }),
    ).toThrow(/Non-framework package/);
  });

  it('rejects a payment to the wrong recipient', async () => {
    const signer = new Ed25519Keypair();
    const req = makeRequirements();
    req.payTo = `0x${'9'.repeat(64)}`;
    const { payment } = await buildX402SignedPayment({
      requirements: req,
      signer,
    });
    expect(() => verifyX402Payment({ payment, expected: EXPECTED })).toThrow(
      /does not pay the expected recipient/,
    );
  });

  it('produces distinct tx bytes for distinct challenges (collision test)', async () => {
    const signer = new Ed25519Keypair();
    const a = await buildX402SignedPayment({
      requirements: makeRequirements('challenge-a'),
      signer,
    });
    const b = await buildX402SignedPayment({
      requirements: makeRequirements('challenge-b'),
      signer,
    });
    expect(a.payment.payload.txBytes).not.toBe(b.payment.payload.txBytes);
  });
});

describe('parseX402Header', () => {
  it('rejects garbage and missing fields', () => {
    expect(() => parseX402Header('not-base64-json!!')).toThrow(/base64 JSON/);
    const missing = encodeX402Header({
      x402Version: 1,
      scheme: 'exact',
      network: 'sui:mainnet',
      payload: { senderAddress: '0x1' },
    } as unknown as X402PaymentPayload);
    expect(() => parseX402Header(missing)).toThrow(/missing required fields/);
  });
});

describe('escrow intent (job-class 402) — kept discriminators', () => {
  // Builder helpers stayed in @suimpp/mpp (zero t2000 consumers) — this
  // package keeps only the two routing checks. Fixtures are hand-built to
  // the same wire shape those builders emit.
  const escrowEntry: X402EscrowRequirements = {
    scheme: 'exact',
    network: 'sui:mainnet',
    asset: USDC.type,
    maxAmountRequired: '5000000',
    payTo: RECIPIENT,
    resource: 'https://seller.test/jobs/research-report',
    maxTimeoutSeconds: 60,
    extra: {
      escrow: {
        deliverWithinMs: 86_400_000,
        reviewWindowMs: 3_600_000,
        rejectSplitBps: 8000,
        packageId: `0x${'a'.repeat(64)}`,
      },
    },
  };

  function encodeEscrowHeader(payload: Record<string, unknown>): string {
    return Buffer.from(
      JSON.stringify({
        x402Version: 1,
        scheme: 'exact',
        network: 'sui:mainnet',
        payload,
      }),
    ).toString('base64');
  }

  it('isX402EscrowRequirements discriminates job-class vs instant entries', () => {
    expect(isX402EscrowRequirements(escrowEntry)).toBe(true);
    expect(isX402EscrowRequirements(makeRequirements())).toBe(false);
    expect(isX402EscrowRequirements(null)).toBe(false);
    expect(isX402EscrowRequirements({ extra: {} })).toBe(false);
  });

  it('isX402EscrowHeader recognizes a Job-object credential', () => {
    const header = encodeEscrowHeader({
      jobId: `0x${'d'.repeat(64)}`,
      buyerAddress: `0x${'b'.repeat(64)}`,
    });
    expect(isX402EscrowHeader(header)).toBe(true);
    expect(isX402EscrowHeader('garbage!!')).toBe(false);
  });

  it('an instant X-PAYMENT is NOT an escrow header (and vice versa)', async () => {
    const signer = new Ed25519Keypair();
    const { header } = await buildX402SignedPayment({
      requirements: makeRequirements(),
      signer,
    });
    expect(isX402EscrowHeader(header)).toBe(false);
    const escrowHeader = encodeEscrowHeader({
      jobId: `0x${'d'.repeat(64)}`,
      buyerAddress: `0x${'b'.repeat(64)}`,
    });
    expect(() => parseX402Header(escrowHeader)).toThrow(
      /missing required fields/,
    );
  });
});

describe('settleX402Payment', () => {
  async function signedPayment() {
    const signer = new Ed25519Keypair();
    const { payment } = await buildX402SignedPayment({
      requirements: makeRequirements(),
      signer,
    });
    return { payment, sender: signer.toSuiAddress() };
  }

  function mockClient(result: unknown) {
    return {
      core: { executeTransaction: vi.fn().mockResolvedValue(result) },
    } as never;
  }

  function mockStore(used = false) {
    return { has: vi.fn().mockResolvedValue(used), set: vi.fn() };
  }

  it('settles, enforces the balance change, and records the digest', async () => {
    const { payment, sender } = await signedPayment();
    const store = mockStore();
    const client = mockClient({
      Transaction: {
        digest: 'DIGEST_1',
        status: { success: true },
        balanceChanges: [
          { coinType: USDC.type, address: RECIPIENT, amount: '20000' },
        ],
      },
    });

    const response = await settleX402Payment({
      payment,
      client,
      store,
      expected: EXPECTED,
    });

    expect(response).toEqual({
      success: true,
      network: 'sui:mainnet',
      transaction: 'DIGEST_1',
      payer: sender,
    });
    expect(store.set).toHaveBeenCalledWith('DIGEST_1');
  });

  it('throws when the settled amount is below the terms', async () => {
    const { payment } = await signedPayment();
    const client = mockClient({
      Transaction: {
        digest: 'DIGEST_2',
        status: { success: true },
        balanceChanges: [
          { coinType: USDC.type, address: RECIPIENT, amount: '100' },
        ],
      },
    });
    await expect(
      settleX402Payment({
        payment,
        client,
        store: mockStore(),
        expected: EXPECTED,
      }),
    ).rejects.toThrow(/does not satisfy the terms/);
  });

  it('throws on a replayed digest', async () => {
    const { payment } = await signedPayment();
    const client = mockClient({
      Transaction: {
        digest: 'DIGEST_3',
        status: { success: true },
        balanceChanges: [
          { coinType: USDC.type, address: RECIPIENT, amount: '20000' },
        ],
      },
    });
    await expect(
      settleX402Payment({
        payment,
        client,
        store: mockStore(true),
        expected: EXPECTED,
      }),
    ).rejects.toThrow(/already used/);
  });

  it('throws when execution fails on-chain (and never serves)', async () => {
    const { payment } = await signedPayment();
    const client = mockClient({
      FailedTransaction: {
        digest: 'DIGEST_4',
        status: { success: false, error: { message: 'insufficient balance' } },
        balanceChanges: [],
      },
    });
    const store = mockStore();
    await expect(
      settleX402Payment({ payment, client, store, expected: EXPECTED }),
    ).rejects.toThrow(/Settlement failed on-chain/);
    expect(store.set).not.toHaveBeenCalled();
  });
});
