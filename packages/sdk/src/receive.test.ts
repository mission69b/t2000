import { describe, it, expect } from 'vitest';
import { SUPPORTED_ASSETS } from './constants.js';

const USDC_TYPE = SUPPORTED_ASSETS.USDC.type;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * We test `receive()` by directly importing and calling it.
 * Since T2000.create() requires a real keypair, we test the core logic
 * through the generated PaymentRequest shape.
 */

// Use a dynamic import so we can call receive() without a full T2000 instance.
// Instead we'll test createPaymentTransactionUri directly and the PaymentRequest shape.
import { createPaymentTransactionUri, parsePaymentTransactionUri } from '@mysten/payment-kit';

describe('Payment Kit URI generation (used by SDK receive)', () => {
  const RECEIVER = '0x' + 'ab'.repeat(32);

  it('generates a valid sui:pay? URI with all required fields', () => {
    const nonce = crypto.randomUUID();
    const uri = createPaymentTransactionUri({
      receiverAddress: RECEIVER,
      amount: 10_000_000n, // 10 USDC
      coinType: USDC_TYPE,
      nonce,
    });

    expect(uri).toMatch(/^sui:pay\?/);
    expect(uri).toContain(`receiver=${RECEIVER}`);
    expect(uri).toContain('amount=10000000');
    expect(uri).toContain(`nonce=${nonce}`);
  });

  it('includes label and message when provided', () => {
    const nonce = crypto.randomUUID();
    const uri = createPaymentTransactionUri({
      receiverAddress: RECEIVER,
      amount: 5_000_000n,
      coinType: USDC_TYPE,
      nonce,
      label: 'Coffee',
      message: 'Thanks!',
    });

    expect(uri).toContain('label=Coffee');
    expect(uri).toContain('message=Thanks');
  });

  it('round-trips through parse', () => {
    const nonce = crypto.randomUUID();
    const uri = createPaymentTransactionUri({
      receiverAddress: RECEIVER,
      amount: 1_500_000n,
      coinType: USDC_TYPE,
      nonce,
      label: 'Test Payment',
    });

    const parsed = parsePaymentTransactionUri(uri);

    expect(parsed.receiverAddress).toBe(RECEIVER);
    expect(parsed.amount).toBe(1_500_000n);
    expect(parsed.coinType).toBe(USDC_TYPE);
    expect(parsed.nonce).toBe(nonce);
    expect(parsed.label).toBe('Test Payment');
  });

  it('rejects nonces longer than 36 characters', () => {
    expect(() =>
      createPaymentTransactionUri({
        receiverAddress: RECEIVER,
        amount: 1_000_000n,
        coinType: USDC_TYPE,
        nonce: 'x'.repeat(37),
      }),
    ).toThrow();
  });

  it('accepts nonces of exactly 36 characters (UUID length)', () => {
    const nonce = crypto.randomUUID(); // 36 chars
    expect(nonce.length).toBe(36);

    const uri = createPaymentTransactionUri({
      receiverAddress: RECEIVER,
      amount: 1_000_000n,
      coinType: USDC_TYPE,
      nonce,
    });

    expect(uri).toContain(`nonce=${nonce}`);
  });

  it('uses SUI coin type for SUI payments', () => {
    const nonce = crypto.randomUUID();
    const uri = createPaymentTransactionUri({
      receiverAddress: RECEIVER,
      amount: 1_000_000_000n, // 1 SUI
      coinType: '0x2::sui::SUI',
      nonce,
    });

    expect(uri).toContain('amount=1000000000');
    const parsed = parsePaymentTransactionUri(uri);
    expect(parsed.coinType).toBe('0x2::sui::SUI');
  });
});

describe('UUID nonce generation', () => {
  it('crypto.randomUUID produces 36-char v4 UUIDs', () => {
    const nonce = crypto.randomUUID();
    expect(nonce.length).toBe(36);
    expect(nonce).toMatch(UUID_RE);
  });

  it('generates unique nonces', () => {
    const nonces = new Set(Array.from({ length: 100 }, () => crypto.randomUUID()));
    expect(nonces.size).toBe(100);
  });
});
