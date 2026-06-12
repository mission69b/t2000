import { beforeEach, describe, expect, it, vi } from 'vitest';

// Short-circuit the prisma import chain (same pattern as gateway.test.ts).
vi.mock('./prisma', () => ({
  prisma: { mppPayment: { create: vi.fn() } },
}));

// In-memory digest store — the real one needs Upstash env vars. Mirrors
// the nx semantics (set throws on duplicate) so race assertions are honest.
const storeState = new Set<string>();
const memoryStore = {
  has: async (k: string) => storeState.has(k),
  set: async (k: string) => {
    if (storeState.has(k)) throw new Error(`Digest already used: ${k}`);
    storeState.add(k);
  },
};
vi.mock('./upstash-digest-store', () => ({
  getDigestStore: () => memoryStore,
  getX402DigestStore: () => memoryStore,
}));

// Mock ONLY settlement (needs a live chain); requirements/parse/encode stay real.
vi.mock('@suimpp/mpp/x402', async (importOriginal) => {
  const original = await importOriginal<typeof import('@suimpp/mpp/x402')>();
  return {
    ...original,
    settleX402Payment: vi.fn(async (options: { payment: { payload: { senderAddress: string } } }) => ({
      success: true,
      network: 'sui:mainnet',
      transaction: 'DIGEST123',
      payer: options.payment.payload.senderAddress,
    })),
  };
});

import { USDC } from '@suimpp/mpp/server';
import { challengeNonce, X402_PAYMENT_RESPONSE_HEADER } from '@suimpp/mpp/x402';
import { Challenge } from 'mppx';
import {
  __resetX402Caches,
  __seedChainInfo,
  hasX402Payment,
  settleX402Request,
  withX402Accepts,
  withX402Receipt,
} from './x402-dialect';

const TREASURY =
  '0x7d20dcdb2bca4f508ea9613994683eb4e76e9c4ed371169677c1be02aaf0b58e';

function legacy402(challengeId: string, amount: string): Response {
  const challenge = Challenge.from({
    id: challengeId,
    realm: 'mpp.t2000.ai',
    method: 'sui',
    intent: 'charge',
    request: { amount, currency: USDC.type, recipient: TREASURY },
  });
  return new Response(
    JSON.stringify({ title: 'Payment Required', detail: 'Payment required' }),
    {
      status: 402,
      headers: {
        'WWW-Authenticate': Challenge.serialize(challenge),
        'content-type': 'application/problem+json',
      },
    },
  );
}

function paymentHeader(challengeId: string, sender: string): string {
  return Buffer.from(
    JSON.stringify({
      x402Version: 1,
      scheme: 'exact',
      network: 'sui:mainnet',
      payload: {
        senderAddress: sender,
        txBytes: 'AAAA',
        senderSignature: 'sig',
        challengeId,
      },
    }),
  ).toString('base64');
}

const TERMS = {
  amount: '0.02',
  currency: USDC,
  recipient: TREASURY,
  network: 'mainnet' as const,
};

beforeEach(() => {
  __resetX402Caches();
  __seedChainInfo('4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S', '1156');
  storeState.clear();
});

describe('withX402Accepts — dual-dialect 402', () => {
  it('passes non-402 responses through untouched', async () => {
    const ok = Response.json({ data: 1 }, { status: 200 });
    const out = await withX402Accepts(ok, { ...TERMS, resource: 'https://x' });
    expect(out).toBe(ok);
  });

  it('appends a spec-correct accepts[] entry to the legacy challenge', async () => {
    const out = await withX402Accepts(legacy402('ch_test_1', '0.02'), {
      ...TERMS,
      resource: 'https://mpp.t2000.ai/openai/v1/chat/completions',
    });

    expect(out.status).toBe(402);
    // Legacy dialect preserved: header challenge intact.
    expect(out.headers.get('WWW-Authenticate')).toContain('id="ch_test_1"');

    const body = await out.json();
    expect(body.x402Version).toBe(1);
    expect(body.accepts).toHaveLength(1);
    const req = body.accepts[0];
    expect(req.scheme).toBe('exact');
    expect(req.network).toBe('sui:mainnet');
    expect(req.asset).toBe(USDC.type);
    expect(req.maxAmountRequired).toBe('20000'); // $0.02 at 6dp
    expect(req.payTo).toBe(TREASURY);
    expect(req.resource).toBe('https://mpp.t2000.ai/openai/v1/chat/completions');
    // Same challenge identity in both dialects + the on-chain nonce binding.
    expect(req.extra.suimpp.challengeId).toBe('ch_test_1');
    expect(req.extra.suimpp.nonce).toBe(challengeNonce('ch_test_1'));
    expect(req.extra.suimpp.chain).toBe(
      '4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S',
    );
    expect(req.extra.suimpp.minEpoch).toBe('1156');
    expect(req.extra.suimpp.maxEpoch).toBe('1157');
  });

  it('fails open to the legacy 402 when enrichment breaks', async () => {
    const broken = new Response('{}', {
      status: 402,
      headers: { 'WWW-Authenticate': 'NotAPaymentScheme' },
    });
    const out = await withX402Accepts(broken, {
      ...TERMS,
      resource: 'https://x',
    });
    expect(out.status).toBe(402);
    const body = await out.json();
    expect(body.accepts).toBeUndefined();
  });
});

describe('settleX402Request — X-PAYMENT settle path', () => {
  const SENDER =
    '0x32cf4eef3611ec173f9adba1a4a938fc81cc0ee01a3c54d9ec99dd78a18fc007';

  function requestWith(header: string): Request {
    return new Request('https://mpp.t2000.ai/serper/v1/search', {
      method: 'POST',
      headers: { 'X-PAYMENT': header },
    });
  }

  it('detects X-PAYMENT presence', () => {
    expect(hasX402Payment(requestWith('abc'))).toBe(true);
    expect(
      hasX402Payment(new Request('https://x', { method: 'POST' })),
    ).toBe(false);
  });

  it('settles and reports; consumes the challenge (challenge-once)', async () => {
    const outcome = await settleX402Request(
      requestWith(paymentHeader('ch_settle_1', SENDER)),
      TERMS,
    );
    expect(outcome.settle.success).toBe(true);
    expect(outcome.settle.transaction).toBe('DIGEST123');
    expect(outcome.report.sender).toBe(SENDER);
    expect(storeState.has('x402c:ch_settle_1')).toBe(true);

    // Same challenge again → rejected before settlement.
    await expect(
      settleX402Request(requestWith(paymentHeader('ch_settle_1', SENDER)), TERMS),
    ).rejects.toThrow(/Challenge already used/);
  });

  it('attaches the X-PAYMENT-RESPONSE receipt header', () => {
    const out = withX402Receipt(Response.json({ ok: true }), {
      success: true,
      network: 'sui:mainnet',
      transaction: 'DIGEST123',
      payer: SENDER,
    });
    const headerValue = out.headers.get(X402_PAYMENT_RESPONSE_HEADER);
    expect(headerValue).toBeTruthy();
    const decoded = JSON.parse(
      Buffer.from(headerValue as string, 'base64').toString('utf8'),
    );
    expect(decoded.transaction).toBe('DIGEST123');
    expect(decoded.success).toBe(true);
  });
});
