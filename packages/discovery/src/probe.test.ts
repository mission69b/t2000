import { describe, it, expect, vi, beforeEach } from 'vitest';
import { probe } from './probe.js';
import { VALIDATION_CODES, SUI_USDC_TYPE } from './constants.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function make402(body: Record<string, unknown>, headers?: Record<string, string>) {
  return {
    status: 402,
    headers: new Headers(headers ?? {}),
    json: () => Promise.resolve(body),
  };
}

describe('probe', () => {
  it('detects valid Sui 402 challenge from body', async () => {
    mockFetch.mockResolvedValue(
      make402({
        recipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        currency: SUI_USDC_TYPE,
        amount: '10000',
        realm: 'mpp.t2000.ai',
      }),
    );

    const result = await probe('https://mpp.t2000.ai/openai/v1/chat/completions', 'https://mpp.t2000.ai');
    expect(result.ok).toBe(true);
    expect(result.hasSuiPayment).toBe(true);
    expect(result.statusCode).toBe(402);
    expect(result.recipient).toContain('0x');
  });

  it('detects x402 accepts[] body with no WWW-Authenticate (t2000 serve dialect)', async () => {
    mockFetch.mockResolvedValue(
      make402({
        x402Version: 1,
        error: 'Payment required',
        accepts: [
          {
            scheme: 'exact',
            network: 'sui:mainnet',
            asset: SUI_USDC_TYPE,
            maxAmountRequired: '10000',
            payTo: '0xd437a1fb5d9f5f233687b0be58cfbf06b7d9a7589a56194978b8bdb4515b45d3',
            resource: 'https://market-scout-api.vercel.app/haiku',
          },
        ],
      }),
    );

    const result = await probe(
      'https://market-scout-api.vercel.app/haiku',
      'https://market-scout-api.vercel.app',
    );
    expect(result.ok).toBe(true);
    expect(result.hasSuiPayment).toBe(true);
    expect(result.recipient).toBe(
      '0xd437a1fb5d9f5f233687b0be58cfbf06b7d9a7589a56194978b8bdb4515b45d3',
    );
    expect(result.currency).toBe(SUI_USDC_TYPE);
    // maxAmountRequired is raw 6-decimal units; amount is the decimal string
    expect(result.amount).toBe('0.01');
    expect(result.realm).toBe('market-scout-api.vercel.app');
  });

  it('prefers sui:mainnet among multiple accepts entries', async () => {
    mockFetch.mockResolvedValue(
      make402({
        accepts: [
          { scheme: 'exact', network: 'sui:testnet', payTo: '0xaaa1', asset: SUI_USDC_TYPE, maxAmountRequired: '500' },
          { scheme: 'exact', network: 'sui:mainnet', payTo: '0xbbb2', asset: SUI_USDC_TYPE, maxAmountRequired: '20000' },
          { scheme: 'exact', network: 'base', payTo: '0xccc3' },
        ],
      }),
    );

    const result = await probe('https://example.com/api');
    expect(result.recipient).toBe('0xbbb2');
    expect(result.amount).toBe('0.02');
  });

  it('rejects garbage accepts[] (no sui exact entry / no payTo)', async () => {
    mockFetch.mockResolvedValue(
      make402({
        accepts: [
          { scheme: 'exact', network: 'base', payTo: '0x1' },
          { scheme: 'upto', network: 'sui:mainnet', payTo: '0x2' },
          { scheme: 'exact', network: 'sui:mainnet' },
          'not-an-object',
        ],
      }),
    );

    const result = await probe('https://example.com/api');
    expect(result.ok).toBe(false);
    expect(result.issues[0].code).toBe(VALIDATION_CODES.PROBE_FAILED);
  });

  it('keeps raw units when the asset is not a known USDC type', async () => {
    mockFetch.mockResolvedValue(
      make402({
        accepts: [
          { scheme: 'exact', network: 'sui:mainnet', payTo: '0xabc1', asset: '0xother::coin::COIN', maxAmountRequired: '10000' },
        ],
      }),
    );

    const result = await probe('https://example.com/api');
    expect(result.amount).toBe('10000');
    expect(result.issues.find(i => i.code === VALIDATION_CODES.PROBE_UNKNOWN_CURRENCY)).toBeDefined();
  });

  it('reports error for non-402 response', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({}),
    });

    const result = await probe('https://example.com/api');
    expect(result.ok).toBe(false);
    expect(result.issues[0].code).toBe(VALIDATION_CODES.PROBE_NOT_402);
  });

  it('warns about unknown currency', async () => {
    mockFetch.mockResolvedValue(
      make402({
        recipient: '0xabc123',
        currency: '0xunknown::coin::COIN',
        amount: '100',
      }),
    );

    const result = await probe('https://example.com/api');
    expect(result.issues.find(i => i.code === VALIDATION_CODES.PROBE_UNKNOWN_CURRENCY)).toBeDefined();
  });

  it('reports invalid Sui address', async () => {
    mockFetch.mockResolvedValue(
      make402({
        recipient: 'not-a-sui-address',
        currency: SUI_USDC_TYPE,
        amount: '100',
      }),
    );

    const result = await probe('https://example.com/api');
    expect(result.issues.find(i => i.code === VALIDATION_CODES.PROBE_INVALID_RECIPIENT)).toBeDefined();
  });

  it('detects realm mismatch', async () => {
    mockFetch.mockResolvedValue(
      make402({
        recipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        currency: SUI_USDC_TYPE,
        amount: '10000',
        realm: 'wrong-domain.vercel.app',
      }),
    );

    const result = await probe('https://mpp.t2000.ai/api/test', 'https://mpp.t2000.ai');
    expect(result.issues.find(i => i.code === VALIDATION_CODES.PROBE_REALM_MISMATCH)).toBeDefined();
  });

  it('handles fetch failure gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await probe('https://example.com/api');
    expect(result.ok).toBe(false);
    expect(result.issues[0].code).toBe(VALIDATION_CODES.PROBE_FAILED);
  });

  it('extracts challenge from www-authenticate header', async () => {
    mockFetch.mockResolvedValue({
      status: 402,
      headers: new Headers({
        'www-authenticate': `MPP realm="mpp.t2000.ai", recipient="0xabc123", currency="${SUI_USDC_TYPE}", amount="10000"`,
      }),
      json: () => Promise.reject(new Error('no body')),
    });

    const result = await probe('https://mpp.t2000.ai/api/test');
    expect(result.hasSuiPayment).toBe(true);
    expect(result.recipient).toBe('0xabc123');
  });

  it('extracts challenge from paymentRequirements wrapper', async () => {
    mockFetch.mockResolvedValue(
      make402({
        paymentRequirements: {
          recipient: '0x1234567890abcdef',
          currency: SUI_USDC_TYPE,
          amount: '5000',
        },
      }),
    );

    const result = await probe('https://example.com/api');
    expect(result.hasSuiPayment).toBe(true);
    expect(result.amount).toBe('5000');
  });
});
