import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Partial-mock the x402 module: settlement submits on-chain, everything else
// (requirements builder, offline payment builder, structural verify, header
// codecs) runs REAL — the buyer↔seller contract is exercised for real.
const settleMock = vi.hoisted(() =>
  vi.fn(async () => ({
    success: true as const,
    network: 'sui:mainnet' as const,
    transaction: 'MOCKDIGEST123',
    payer: '0xpayer',
  })),
);
vi.mock('@suimpp/mpp/x402', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@suimpp/mpp/x402')>();
  return { ...actual, settleX402Payment: settleMock };
});

import { buildX402SignedPayment, X402_PAYMENT_HEADER } from '@suimpp/mpp/x402';
import { __resetChainCaches, __seedChainInfo } from './chain.js';
import { createServe, createServeFromEnv } from './serve.js';
import type { BuiltRoute } from './types.js';

const PAY_TO = '0x' + 'ab'.repeat(32);
const OTHER_ADDRESS = '0x' + 'cd'.repeat(32);

/** zod-free schema stub with the safeParse contract. */
const querySchema = {
  safeParse: (value: unknown) => {
    const v = value as { query?: unknown };
    if (typeof v?.query === 'string' && v.query.length > 0) {
      return { success: true as const, data: { query: v.query } };
    }
    return { success: false as const, error: { message: 'query must be a non-empty string' } };
  },
};

function post(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function get402Requirements(route: BuiltRoute, body: unknown = {}) {
  const res = await route(post('https://seller.example/search', body));
  expect(res.status).toBe(402);
  const parsed = (await res.json()) as { accepts: Array<Record<string, unknown>> };
  return parsed.accepts[0] as unknown as Parameters<typeof buildX402SignedPayment>[0]['requirements'];
}

/** Sign the 402's requirements with a throwaway keypair — offline, no chain. */
async function signPayment(
  requirements: Parameters<typeof buildX402SignedPayment>[0]['requirements'],
) {
  const keypair = new Ed25519Keypair();
  const { header } = await buildX402SignedPayment({ requirements, signer: keypair });
  return { header, buyer: keypair.toSuiAddress() };
}

function makeRoute(
  handler: (ctx: { body: unknown; payer?: string }) => unknown = () => ({ ok: true }),
) {
  const serve = createServe({ payTo: PAY_TO, baseUrl: 'https://seller.example', report: false });
  return serve
    .route({ path: 'search' })
    .paid('0.01')
    .body(querySchema)
    .handler(handler);
}

// A syntactically valid chain identifier (32-byte base58) — the ValidDuring
// BCS struct rejects anything shorter (this is the Sui mainnet genesis digest).
const CHAIN_ID = '4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S';

beforeEach(() => {
  __resetChainCaches();
  __seedChainInfo('mainnet', CHAIN_ID, '100');
  settleMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('402 challenge (unpaid)', () => {
  it('answers 402 with a catalog-probeable x402 accepts[] envelope', async () => {
    const route = makeRoute();
    const res = await route(post('https://seller.example/search', {}));
    expect(res.status).toBe(402);
    const body = (await res.json()) as {
      x402Version: number;
      accepts: Array<{
        scheme: string;
        network: string;
        payTo: string;
        maxAmountRequired: string;
        resource: string;
      }>;
    };
    // Exactly what apps/gateway/lib/seller-probe.ts requires to list:
    const entry = body.accepts.find((a) => a.scheme === 'exact' && a.network === 'sui:mainnet');
    expect(entry).toBeDefined();
    expect(entry?.payTo).toBe(PAY_TO);
    expect(entry?.maxAmountRequired).toBe('10000'); // 0.01 USDC, 6dp atomic
    expect(entry?.resource).toBe('https://seller.example/search');
  });

  it('fires the 402 BEFORE body validation — the probe POSTs {} and must see the challenge', async () => {
    const route = makeRoute();
    const res = await route(post('https://seller.example/search', { wrong: 'shape' }));
    expect(res.status).toBe(402);
  });

  it('serves CORS headers so browser (Passport) buyers can pay without a relay', async () => {
    const route = makeRoute();
    const res = await route(post('https://seller.example/search', {}));
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-expose-headers')).toContain('X-PAYMENT-RESPONSE');

    const preflight = await route(
      new Request('https://seller.example/search', { method: 'OPTIONS' }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-headers')).toContain('X-PAYMENT');
  });

  it('returns 503 (not an unpayable 402) when chain info is unavailable', async () => {
    __resetChainCaches(); // drop the seed → getChainInfo must hit the network
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const serve = createServe({
      payTo: PAY_TO,
      report: false,
      rpcUrl: 'http://127.0.0.1:1', // unreachable on purpose
    });
    const route = serve
      .route({ path: 'search' })
      .paid('0.01')
      .handler(() => ({ ok: true }));
    const res = await route(post('https://seller.example/search', {}));
    expect(res.status).toBe(503);
  }, 20_000);
});

describe('paid request lifecycle (sign-then-settle, handler-then-settle)', () => {
  it('verifies, runs the handler, settles, and attaches the receipt', async () => {
    const handler = vi.fn(({ body, payer }: { body: unknown; payer?: string }) => ({
      echo: body,
      payer,
    }));
    const route = makeRoute(handler);
    const requirements = await get402Requirements(route);
    const { header, buyer } = await signPayment(requirements);

    const res = await route(
      post('https://seller.example/search', { query: 'sui' }, { [X402_PAYMENT_HEADER]: header }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('X-PAYMENT-RESPONSE')).toBeTruthy();
    expect(settleMock).toHaveBeenCalledTimes(1);
    const payload = (await res.json()) as { echo: { query: string }; payer: string };
    expect(payload.echo.query).toBe('sui');
    expect(payload.payer).toBe(buyer);
  });

  it('JMPR regression: invalid body with a VALID payment → 422, payment never settled', async () => {
    const route = makeRoute();
    const requirements = await get402Requirements(route);
    const { header } = await signPayment(requirements);

    const res = await route(
      post('https://seller.example/search', { wrong: 'shape' }, { [X402_PAYMENT_HEADER]: header }),
    );
    expect(res.status).toBe(422);
    expect(settleMock).not.toHaveBeenCalled(); // the buyer keeps their money
    // Charge honesty + self-correctable error: names the failing field and
    // states machine-readably that nothing was charged (founder × Funkii
    // Studio, 2026-07-20: bare "Invalid input" ×3 read as a paid failure).
    const body = (await res.json()) as { error: string; paid: boolean };
    expect(body.paid).toBe(false);
    expect(body.error).toMatch(/query/);
  });

  it('handler throws → 500, payment never settled (no-charge-on-failure)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const route = makeRoute(() => {
      throw new Error('upstream exploded');
    });
    const requirements = await get402Requirements(route);
    const { header } = await signPayment(requirements);

    const res = await route(
      post('https://seller.example/search', { query: 'sui' }, { [X402_PAYMENT_HEADER]: header }),
    );
    expect(res.status).toBe(500);
    expect(settleMock).not.toHaveBeenCalled();
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('not charged');
  });

  it('rejects a payment signed against the WRONG recipient (structural verify)', async () => {
    const route = makeRoute();
    const requirements = await get402Requirements(route);
    const forged = { ...requirements, payTo: OTHER_ADDRESS };
    const { header } = await signPayment(forged);

    const res = await route(
      post('https://seller.example/search', { query: 'sui' }, { [X402_PAYMENT_HEADER]: header }),
    );
    expect(res.status).toBe(402);
    expect(settleMock).not.toHaveBeenCalled();
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('invalid payment');
  });

  it('rejects a payment signed for the WRONG amount — enforced at settle (on-chain balance check), buyer gets 402 not the result', async () => {
    // Amount is NOT a structural check: settleX402Payment confirms the
    // on-chain balance change covers the terms and throws otherwise. Mirror
    // that here — the mock rejects the way the real settle does.
    settleMock.mockRejectedValueOnce(
      new Error('[suimpp/x402] Settled amount does not satisfy the terms'),
    );
    const route = makeRoute();
    const requirements = await get402Requirements(route);
    const forged = { ...requirements, maxAmountRequired: '1' }; // 0.000001 USDC
    const { header } = await signPayment(forged);

    const res = await route(
      post('https://seller.example/search', { query: 'sui' }, { [X402_PAYMENT_HEADER]: header }),
    );
    expect(res.status).toBe(402);
    expect(settleMock).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('settlement failed');
  });

  it('challenge-once: a settled payment header cannot be replayed', async () => {
    const route = makeRoute();
    const requirements = await get402Requirements(route);
    const { header } = await signPayment(requirements);
    const paidReq = () =>
      post('https://seller.example/search', { query: 'sui' }, { [X402_PAYMENT_HEADER]: header });

    const first = await route(paidReq());
    expect(first.status).toBe(200);

    const replay = await route(paidReq());
    expect(replay.status).toBe(402);
    expect(settleMock).toHaveBeenCalledTimes(1);
    const body = (await replay.json()) as { error: string };
    expect(body.error).toContain('already used');
  });

  it('handler 4xx responses are served without settling', async () => {
    const route = makeRoute(() => new Response(JSON.stringify({ error: 'no results' }), { status: 404 }));
    const requirements = await get402Requirements(route);
    const { header } = await signPayment(requirements);

    const res = await route(
      post('https://seller.example/search', { query: 'sui' }, { [X402_PAYMENT_HEADER]: header }),
    );
    expect(res.status).toBe(404);
    expect(settleMock).not.toHaveBeenCalled();
  });
});

describe('unprotected routes', () => {
  it('serves without any payment machinery', async () => {
    const serve = createServe({ payTo: PAY_TO, report: false });
    const route = serve
      .route({ path: 'health' })
      .unprotected()
      .handler(() => ({ ok: true }));
    const res = await route(new Request('https://seller.example/health', { method: 'GET' }));
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });
  });
});

describe('builder validation', () => {
  it('rejects invalid payTo at construction', () => {
    expect(() => createServe({ payTo: 'not-an-address' })).toThrow(/valid Sui address/);
  });

  it('rejects malformed prices', () => {
    const serve = createServe({ payTo: PAY_TO, report: false });
    expect(() => serve.route({ path: 'a' }).paid('0')).toThrow(/positive decimal/);
    expect(() => serve.route({ path: 'a' }).paid('-1')).toThrow(/positive decimal/);
    expect(() => serve.route({ path: 'a' }).paid('0.0000001')).toThrow(/positive decimal/); // 7dp > USDC 6dp
    expect(() => serve.route({ path: 'a' }).paid('abc')).toThrow(/positive decimal/);
  });

  it('warns (but allows) prices above the $5 catalog listing cap', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const serve = createServe({ payTo: PAY_TO, report: false });
    serve.route({ path: 'expensive' }).paid('10');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('listing cap'));
  });

  it('requires .paid() or .unprotected() before .handler()', () => {
    const serve = createServe({ payTo: PAY_TO, report: false });
    expect(() => serve.route({ path: 'a' }).handler(() => ({}))).toThrow(/\.paid\(/);
  });

  it('registers built routes on the serve instance', () => {
    const serve = createServe({ payTo: PAY_TO, report: false });
    serve.route({ path: '/search/' }).paid('0.01').handler(() => ({}));
    expect(serve.routes.has('search')).toBe(true);
    expect(serve.routes.get('search')?.meta.priceUsdc).toBe('0.01');
  });
});

describe('createServeFromEnv', () => {
  it('throws a pointed error when T2000_PAY_TO is missing or empty (the Vercel empty-env class)', () => {
    expect(() => createServeFromEnv({})).toThrow(/T2000_PAY_TO/);
    expect(() => createServeFromEnv({ T2000_PAY_TO: '   ' })).toThrow(/T2000_PAY_TO/);
  });

  it('builds from a minimal env and warns about the in-memory store', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const serve = createServeFromEnv({ T2000_PAY_TO: PAY_TO });
    expect(serve.payTo).toBe(PAY_TO);
    expect(serve.network).toBe('mainnet');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('in-memory replay store'));
  });

  it('rejects unknown networks', () => {
    expect(() => createServeFromEnv({ T2000_PAY_TO: PAY_TO, T2000_NETWORK: 'devnet' })).toThrow(
      /mainnet.*testnet/,
    );
  });
});

describe('activity-feed reporting', () => {
  it('fires a best-effort report to mpp.t2000.ai after settle', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const serve = createServe({ payTo: PAY_TO, baseUrl: 'https://seller.example' }); // report defaults ON
    const route = serve
      .route({ path: 'search' })
      .paid('0.01')
      .handler(() => ({ ok: true }));

    const requirements = await get402Requirements(route);
    const { header } = await signPayment(requirements);
    const res = await route(
      post('https://seller.example/search', {}, { [X402_PAYMENT_HEADER]: header }),
    );
    expect(res.status).toBe(200);

    const reportCall = fetchSpy.mock.calls.find(
      (c) => String(c[0]) === 'https://mpp.t2000.ai/api/mpp/report',
    );
    expect(reportCall).toBeDefined();
    const reportBody = JSON.parse(String((reportCall?.[1] as RequestInit).body)) as {
      digest: string;
      url: string;
    };
    expect(reportBody.digest).toBe('MOCKDIGEST123');
    expect(reportBody.url).toBe('https://seller.example/search');
  });
});
