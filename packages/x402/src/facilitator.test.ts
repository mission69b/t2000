import { describe, it, expect, vi } from 'vitest';
import { verifyPayment } from './facilitator.js';
import type { VerifyRequest } from './types.js';
import { PAYMENT_KIT_MODULE } from './constants.js';

function createMockClient(txResult: unknown) {
  return {
    getTransactionBlock: vi.fn().mockResolvedValue(txResult),
  } as unknown as Parameters<typeof verifyPayment>[0];
}

function createVerifyRequest(overrides: Partial<VerifyRequest> = {}): VerifyRequest {
  return {
    txHash: '0xabc123',
    network: 'sui',
    amount: '0.01',
    asset: 'USDC',
    payTo: '0xrecipient',
    nonce: '550e8400-e29b-41d4-a716-446655440000',
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  };
}

function createPaymentEvent(fields: Record<string, unknown> = {}) {
  return {
    type: `0xpackage::${PAYMENT_KIT_MODULE}::PaymentEvent`,
    parsedJson: {
      amount: '10000',
      receiver: '0xrecipient',
      nonce: '550e8400-e29b-41d4-a716-446655440000',
      receipt_id: '0xreceipt123',
      ...fields,
    },
  };
}

describe('verifyPayment', () => {
  it('verifies a valid Sui payment and returns receiptId', async () => {
    const client = createMockClient({
      events: [createPaymentEvent()],
    });

    const result = await verifyPayment(client, createVerifyRequest());

    expect(result.verified).toBe(true);
    expect(result.txHash).toBe('0xabc123');
    expect(result.settledAmount).toBe('0.01');
    expect(result.receiptId).toBe('0xreceipt123');
    expect(result.settledAt).toBeDefined();
  });

  it('rejects expired challenge', async () => {
    const client = createMockClient({});
    const req = createVerifyRequest({
      expiresAt: Math.floor(Date.now() / 1000) - 100,
    });

    const result = await verifyPayment(client, req);
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('rejects when transaction is not found', async () => {
    const client = createMockClient(null);
    (client.getTransactionBlock as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Transaction not found'),
    );

    const result = await verifyPayment(client, createVerifyRequest());
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('tx_not_found');
  });

  it('rejects when no PaymentEvent found (plain USDC transfer)', async () => {
    const client = createMockClient({
      events: [
        {
          type: '0x2::coin::CoinEvent',
          parsedJson: { amount: '10000' },
        },
      ],
    });

    const result = await verifyPayment(client, createVerifyRequest());
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('no_payment_event');
  });

  it('rejects when amount does not match', async () => {
    const client = createMockClient({
      events: [
        createPaymentEvent({ amount: '99999' }),
      ],
    });

    const result = await verifyPayment(client, createVerifyRequest());
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('amount_mismatch');
  });

  it('rejects when recipient does not match', async () => {
    const client = createMockClient({
      events: [
        createPaymentEvent({ receiver: '0xwrong' }),
      ],
    });

    const result = await verifyPayment(client, createVerifyRequest());
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('wrong_recipient');
  });

  it('rejects when nonce does not match', async () => {
    const client = createMockClient({
      events: [
        createPaymentEvent({ nonce: 'different-nonce' }),
      ],
    });

    const result = await verifyPayment(client, createVerifyRequest());
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('nonce_mismatch');
  });

  it('handles transaction with empty events array', async () => {
    const client = createMockClient({ events: [] });

    const result = await verifyPayment(client, createVerifyRequest());
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('no_payment_event');
  });

  it('handles transaction with no events property', async () => {
    const client = createMockClient({});

    const result = await verifyPayment(client, createVerifyRequest());
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('no_payment_event');
  });
});
