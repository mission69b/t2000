import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeSellerEndpoint } from './seller-probe';

// probeSellerEndpoint classifies a seller's 402 into a payer dialect. The
// load-bearing rule (JMPR incident, 2026-07-27): dialect 'x402' requires a
// COMPLETE accepts[] entry — extra.suimpp (instant) or extra.escrow terms
// (job-class). A decorative exact+sui:mainnet entry classified as x402 put
// an unpayable seller in the Passport catalog and crashed the payer SDK.

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  vi.clearAllMocks();
});

const SELLER = '0xAbCdEf1234567890aBcDeF1234567890abcdef1234567890abcdef1234567890';

function exactEntry(extra?: Record<string, unknown>) {
  return {
    scheme: 'exact',
    network: 'sui:mainnet',
    asset: '0xusdc::usdc::USDC',
    maxAmountRequired: '20000',
    payTo: SELLER,
    resource: 'https://seller.example/x',
    maxTimeoutSeconds: 60,
    ...(extra !== undefined ? { extra } : {}),
  };
}

const COMPLETE_SUIMPP = {
  suimpp: { challengeId: 'cid', nonce: 1, chain: 'genesis', minEpoch: '1', maxEpoch: '2' },
};

function mppHeaderValue(amount = '0.02'): string {
  const request = Buffer.from(
    JSON.stringify({ amount, currency: '0xusdc::usdc::USDC', recipient: SELLER }),
  ).toString('base64');
  return `Payment id="cid-sui", realm="seller.example", method="sui", intent="charge", request="${request}"`;
}

function respond402(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 402,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('probeSellerEndpoint — x402 completeness gate', () => {
  it('classifies x402 when accepts[] carries the full extra.suimpp challenge', async () => {
    fetchMock.mockResolvedValueOnce(respond402({ accepts: [exactEntry(COMPLETE_SUIMPP)] }));

    const res = await probeSellerEndpoint('https://seller.example/x');
    expect(res).toMatchObject({ ok: true, dialect: 'x402', priceUsdc: '0.02' });
    expect(res.payTo).toBe(SELLER.toLowerCase());
  });

  it('classifies x402 (job-class) when the entry carries valid escrow terms', async () => {
    fetchMock.mockResolvedValueOnce(
      respond402({
        accepts: [
          exactEntry({ escrow: { deliverWithinMs: 86_400_000, reviewWindowMs: 3_600_000, rejectSplitBps: 8000 } }),
        ],
      }),
    );

    const res = await probeSellerEndpoint('https://seller.example/x');
    expect(res).toMatchObject({ ok: true, dialect: 'x402' });
    expect(res.escrow).toEqual({ deliverWithinMs: 86_400_000, reviewWindowMs: 3_600_000, rejectSplitBps: 8000 });
  });

  it('JMPR shape: exact+sui:mainnet with NO extra + sui header → mpp-header, NEVER x402', async () => {
    fetchMock.mockResolvedValueOnce(
      respond402({ accepts: [exactEntry()] }, { 'WWW-Authenticate': mppHeaderValue('0.02') }),
    );

    const res = await probeSellerEndpoint('https://agent.jmpr.world/v1/hotels/search');
    expect(res.ok).toBe(true);
    expect(res.dialect).toBe('mpp-header'); // → fails the catalog's hard x402 gate, unlisted for Passport
  });

  it('incomplete exact entry (empty extra) with no header → fails naming extra.suimpp', async () => {
    fetchMock.mockResolvedValueOnce(respond402({ accepts: [exactEntry({})] }));

    const res = await probeSellerEndpoint('https://seller.example/x');
    expect(res.ok).toBe(false);
    expect(res.dialect).toBeUndefined();
    expect(res.issues.join(' ')).toMatch(/incomplete.*extra\.suimpp/i);
  });

  it('a partial suimpp block (missing epochs) is still incomplete', async () => {
    fetchMock.mockResolvedValueOnce(
      respond402({ accepts: [exactEntry({ suimpp: { challengeId: 'cid', nonce: 1 } })] }),
    );

    const res = await probeSellerEndpoint('https://seller.example/x');
    expect(res.ok).toBe(false);
    expect(res.issues.join(' ')).toMatch(/incomplete/i);
  });

  it('malformed escrow terms still fail closed (existing behavior)', async () => {
    fetchMock.mockResolvedValueOnce(
      respond402({ accepts: [exactEntry({ escrow: { deliverWithinMs: -1 } })] }),
    );

    const res = await probeSellerEndpoint('https://seller.example/x');
    expect(res.ok).toBe(false);
    expect(res.issues.join(' ')).toMatch(/escrow terms.*malformed/i);
  });

  it('header-only 402 (no accepts[]) still classifies mpp-header', async () => {
    fetchMock.mockResolvedValueOnce(
      respond402({ detail: 'Payment required' }, { 'WWW-Authenticate': mppHeaderValue('0.05') }),
    );

    const res = await probeSellerEndpoint('https://seller.example/x');
    expect(res).toMatchObject({ ok: true, dialect: 'mpp-header', priceUsdc: '0.05' });
  });

  it('non-402 fails the probe', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const res = await probeSellerEndpoint('https://seller.example/x');
    expect(res.ok).toBe(false);
    expect(res.issues.join(' ')).toMatch(/expected 402/i);
  });
});
