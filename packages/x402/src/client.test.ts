import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./constants.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./constants.js')>();
  return {
    ...actual,
    T2000_PAYMENT_REGISTRY_ID: '0x' + 'b'.repeat(64),
  };
});

import { parsePaymentRequired, x402Client } from './client.js';
import type { X402Wallet } from './client.js';

const TEST_ADDRESS = '0x' + 'a'.repeat(64);

describe('parsePaymentRequired', () => {
  it('parses a valid PAYMENT-REQUIRED header', () => {
    const header = JSON.stringify({
      amount: '0.01',
      asset: 'USDC',
      network: 'sui',
      payTo: '0x8b3e1234d412',
      nonce: '550e8400-e29b-41d4-a716-446655440000',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });

    const result = parsePaymentRequired(header);
    expect(result.amount).toBe('0.01');
    expect(result.asset).toBe('USDC');
    expect(result.network).toBe('sui');
    expect(result.payTo).toBe('0x8b3e1234d412');
    expect(result.nonce).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('throws UNSUPPORTED_NETWORK for non-Sui network', () => {
    const header = JSON.stringify({
      amount: '0.01',
      asset: 'USDC',
      network: 'ethereum',
      payTo: '0xabc',
      nonce: 'test-nonce',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });

    expect(() => parsePaymentRequired(header)).toThrow('only Sui is supported');
  });

  it('throws PAYMENT_EXPIRED for past expiresAt', () => {
    const header = JSON.stringify({
      amount: '0.01',
      asset: 'USDC',
      network: 'sui',
      payTo: '0xabc',
      nonce: 'test-nonce',
      expiresAt: Math.floor(Date.now() / 1000) - 100,
    });

    expect(() => parsePaymentRequired(header)).toThrow('expired');
  });

  it('throws PRICE_EXCEEDS_LIMIT when amount exceeds maxPrice', () => {
    const header = JSON.stringify({
      amount: '5.00',
      asset: 'USDC',
      network: 'sui',
      payTo: '0xabc',
      nonce: 'test-nonce',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });

    expect(() => parsePaymentRequired(header, 1.0)).toThrow('exceeds max price');
  });

  it('throws for null header', () => {
    expect(() => parsePaymentRequired(null)).toThrow('missing PAYMENT-REQUIRED header');
  });

  it('throws for malformed JSON', () => {
    expect(() => parsePaymentRequired('not-json')).toThrow('invalid JSON');
  });

  it('throws for missing required fields', () => {
    const header = JSON.stringify({ amount: '0.01' });
    expect(() => parsePaymentRequired(header)).toThrow('missing required fields');
  });

  it('accepts price at exactly maxPrice', () => {
    const header = JSON.stringify({
      amount: '1.00',
      asset: 'USDC',
      network: 'sui',
      payTo: '0xabc',
      nonce: 'test-nonce',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });

    const result = parsePaymentRequired(header, 1.0);
    expect(result.amount).toBe('1.00');
  });

  it('throws for missing expiresAt', () => {
    const header = JSON.stringify({
      amount: '0.01',
      asset: 'USDC',
      network: 'sui',
      payTo: '0xabc',
      nonce: 'test-nonce',
    });

    expect(() => parsePaymentRequired(header)).toThrow('missing required fields');
  });

  it('throws for unsupported asset', () => {
    const header = JSON.stringify({
      amount: '0.01',
      asset: 'ETH',
      network: 'sui',
      payTo: '0xabc',
      nonce: 'test-nonce',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });

    expect(() => parsePaymentRequired(header)).toThrow('only USDC is supported');
  });
});

describe('x402Client', () => {
  let mockWallet: X402Wallet;

  beforeEach(() => {
    mockWallet = {
      client: {} as X402Wallet['client'],
      keypair: {} as X402Wallet['keypair'],
      address: () => '0xtest123',
      signAndExecute: vi.fn().mockResolvedValue({ digest: '0xtxhash' }),
    };
  });

  it('passes through non-402 responses unmodified', async () => {
    const mockResponse = new Response(JSON.stringify({ data: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new x402Client(mockWallet);
    const response = await client.fetch('https://api.example.com/data');

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.data).toBe('ok');
  });

  it('returns dry run info without paying when dryRun is true', async () => {
    const mockResponse = new Response('', {
      status: 402,
      headers: {
        'payment-required': JSON.stringify({
          amount: '0.01',
          asset: 'USDC',
          network: 'sui',
          payTo: TEST_ADDRESS,
          nonce: 'test-nonce',
          expiresAt: Math.floor(Date.now() / 1000) + 300,
        }),
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new x402Client(mockWallet);
    const response = await client.fetch('https://api.example.com/data', {
      dryRun: true,
    });

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.dryRun).toBe(true);
    expect(body.amount).toBe('0.01');

    expect(mockWallet.signAndExecute).not.toHaveBeenCalled();
  });

  it('throws PRICE_EXCEEDS_LIMIT when 402 price exceeds maxPrice', async () => {
    const mockResponse = new Response('', {
      status: 402,
      headers: {
        'payment-required': JSON.stringify({
          amount: '5.00',
          asset: 'USDC',
          network: 'sui',
          payTo: TEST_ADDRESS,
          nonce: 'test-nonce',
          expiresAt: Math.floor(Date.now() / 1000) + 300,
        }),
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new x402Client(mockWallet);
    await expect(
      client.fetch('https://api.example.com/expensive', { maxPrice: 1.0 }),
    ).rejects.toThrow('exceeds max price');
  });

  it('calls onPayment callback with payment details', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(
      new Response('', {
        status: 402,
        headers: {
          'payment-required': JSON.stringify({
            amount: '0.01',
            asset: 'USDC',
            network: 'sui',
            payTo: TEST_ADDRESS,
            nonce: 'test-nonce',
            expiresAt: Math.floor(Date.now() / 1000) + 300,
          }),
        },
      }),
    );

    mockWallet.client = {
      getCoins: vi.fn().mockResolvedValue({
        data: [{ coinObjectId: '0xcoin1' }],
      }),
    } as unknown as X402Wallet['client'];

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: 'premium' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const onPayment = vi.fn();
    const client = new x402Client(mockWallet);

    const response = await client.fetch('https://api.example.com/data', {
      onPayment,
    });

    expect(response.status).toBe(200);
    expect(onPayment).toHaveBeenCalledOnce();
    expect(onPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: '0.01',
        payTo: TEST_ADDRESS,
        nonce: 'test-nonce',
        txHash: '0xtxhash',
      }),
    );
  });

  it('retries with X-PAYMENT header after payment', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(
      new Response('', {
        status: 402,
        headers: {
          'payment-required': JSON.stringify({
            amount: '0.01',
            asset: 'USDC',
            network: 'sui',
            payTo: TEST_ADDRESS,
            nonce: 'test-nonce',
            expiresAt: Math.floor(Date.now() / 1000) + 300,
          }),
        },
      }),
    );

    mockWallet.client = {
      getCoins: vi.fn().mockResolvedValue({
        data: [{ coinObjectId: '0xcoin1' }],
      }),
    } as unknown as X402Wallet['client'];

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: 'paid' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = new x402Client(mockWallet);
    await client.fetch('https://api.example.com/data');

    const secondCall = fetchMock.mock.calls[1];
    expect(secondCall).toBeDefined();
    const headers = secondCall[1]?.headers as Record<string, string>;
    expect(headers['x-payment']).toBeDefined();

    const payment = JSON.parse(headers['x-payment']);
    expect(payment.txHash).toBe('0xtxhash');
    expect(payment.network).toBe('sui');
    expect(payment.nonce).toBe('test-nonce');
  });
});
