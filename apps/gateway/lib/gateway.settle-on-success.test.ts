/**
 * Unit tests for `chargeProxy` SPEC 26 settle-on-success mode.
 *
 * These exercise the 6 verdict paths from spec § 6.1 and the regression
 * bar from § 6.4 (every path with `settleOnSuccess` unset/false runs
 * through the legacy code branch byte-identically to pre-SPEC-26).
 *
 * ## Mocking strategy
 *
 * `chargeProxy` depends on:
 *   - `mppx.charge({ amount })(handler)(req)` — Sui USDC settlement
 *   - `global.fetch` — the upstream vendor call
 *   - `getDigestStore()` — Upstash digest store (replay defense)
 *   - `pendingReports` (module-internal Map) — captures the on-payment
 *     callback state so logPayment + reportToRegistry can fire
 *
 * We mock `mppx/nextjs` so `Mppx.create()` returns a charge function that
 * runs the handler and stamps a deterministic `Payment-Receipt` header.
 * The mock can also throw to exercise the charge-failure path.
 *
 * `getDigestStore()` is mocked to a no-op since it requires Upstash env
 * vars at module-load time. We don't exercise replay defense here — that's
 * mppx's own concern and is tested upstream by the suimpp project.
 *
 * `logPayment` and `reportToRegistry` are network-touching but already
 * `.catch(() => {})` in the source — failures don't bubble. We let them
 * fire as no-ops by mocking their dependencies.
 *
 * ## Why we don't use a real fetch / mppx
 *
 * Integration tests against the real gateway need real Sui sponsor funds
 * + real upstream vendor accounts. Out of scope for unit coverage. P4
 * ships a live smoke (spec § 6.3) that exercises the full stack.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

// Mock `mppx/nextjs` BEFORE importing gateway.ts so the mocked Mppx is
// captured by createMppx(). The mock's `charge` is a vi.fn so individual
// tests can override behavior.
const mockChargeImpl = vi.fn();

vi.mock('mppx/nextjs', () => ({
  Mppx: {
    create: () => ({
      charge: (opts: { amount: string }) =>
        (handler: (req: Request) => Promise<Response>) =>
          async (req: Request) => mockChargeImpl(opts, handler, req),
    }),
  },
}));

// Mock @suimpp/mpp/server's `sui` (just used by the `methods:` array in
// createMppx — never actually invoked in tests since our mocked Mppx
// doesn't read it).
vi.mock('@suimpp/mpp/server', () => ({
  sui: () => ({}),
}));

// Mock the digest store so we don't need Upstash env vars at module load.
vi.mock('./upstash-digest-store', () => ({
  getDigestStore: () => ({
    has: async () => false,
    set: async () => {},
  }),
}));

// Mock log-payment so we don't need Prisma or Neon.
vi.mock('./log-payment', () => ({
  logPayment: vi.fn(async () => {}),
}));

import {
  chargeProxy,
  setUpstreamResponseCache,
  type ClassifyVerdict,
  computeChargeAmount,
} from './gateway';
import { InMemoryUpstreamResponseCache } from './upstream-response-cache';

// ─── Default mock charge: stamps a Payment-Receipt and runs the handler ─

function defaultMockCharge(
  opts: { amount: string },
  handler: (req: Request) => Promise<Response>,
  req: Request,
): Promise<Response> {
  return handler(req).then((res) => {
    const headers = new Headers(res.headers);
    headers.set('Payment-Receipt', `mock-receipt-${opts.amount}-${Date.now()}`);
    return new Response(res.body, { status: res.status, headers });
  });
}

// ─── Test setup ───────────────────────────────────────────────────────

let fetchSpy: MockInstance<typeof fetch>;
let cache: InMemoryUpstreamResponseCache;

beforeEach(() => {
  cache = new InMemoryUpstreamResponseCache();
  setUpstreamResponseCache(cache);
  mockChargeImpl.mockReset();
  mockChargeImpl.mockImplementation(defaultMockCharge);
  fetchSpy = vi.spyOn(global, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
  cache.clear();
});

function makeRequest(body: object, url = 'https://mpp.t2000.ai/openai/v1/images/generations'): Request {
  // [SPEC 26 fix / 2026-05-14] Default to a stub Payment credential so the
  // probe-and-charge path runs. Tests that need to exercise the no-credential
  // short-circuit (audric prepare-phase shape) use `makeRequestNoCredential`.
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Payment dGVzdA==',
    },
    body: JSON.stringify(body),
  });
}

function makeRequestNoCredential(body: object, url = 'https://mpp.t2000.ai/openai/v1/images/generations'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function upstreamResponse(status: number, body: object | string): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ─── SPEC 26 fix [2026-05-14] — credential-presence guard ────────────
//
// Without this guard, every prepare-phase call from audric (no Authorization
// header — the host needs the 402 challenge to build the payment tx) would
// trigger an upstream probe whose result is immediately discarded when
// mppx.charge returns 402. Burns vendor cost, emits misleading
// `verdict=deliverable chargeAmount=X` logs, and triggers non-idempotent
// upstream side effects (image gen, TTS) for no user benefit. The legacy
// chargeProxy path doesn't have this problem because mppx wraps the handler
// — when no credential is present, mppx returns 402 before the handler runs.
// SPEC 26 inverted that order; this guard restores it.
describe('chargeProxy.settleOnSuccess — credential-presence guard (no Authorization header)', () => {
  it('does NOT probe upstream when no Payment credential is present', async () => {
    // Make mppx return 402 (the standard challenge response when no creds).
    mockChargeImpl.mockImplementationOnce(async () =>
      new Response(
        JSON.stringify({
          challenge: { id: 'stub', method: 'sui', intent: 'charge' },
        }),
        {
          status: 402,
          headers: {
            'content-type': 'application/json',
            'www-authenticate': 'Payment realm="mpp.t2000.ai"',
          },
        },
      ),
    );

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      { authorization: 'Bearer test-key' },
      { settleOnSuccess: true },
    );

    const res = await handler(makeRequestNoCredential({ prompt: 'a frog', model: 'gpt-image-1' }));

    // Critical assertion: NO upstream fetch happened (the probe was
    // skipped). This is the bug the guard fixes.
    expect(fetchSpy).not.toHaveBeenCalled();

    // mppx WAS called — it returned the 402 challenge directly.
    expect(mockChargeImpl).toHaveBeenCalledTimes(1);

    // Response is the 402 challenge, ready for audric to build the payment tx.
    expect(res.status).toBe(402);
  });

  it('passes through the mppx 402 challenge unchanged (preserves audric prepare semantics)', async () => {
    const challengeBody = JSON.stringify({ challenge: { id: 'cha-123', amount: '0.05' } });
    mockChargeImpl.mockImplementationOnce(async () =>
      new Response(challengeBody, {
        status: 402,
        headers: {
          'content-type': 'application/json',
          'www-authenticate': 'Payment realm="mpp.t2000.ai"',
        },
      }),
    );

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      { settleOnSuccess: true },
    );

    const res = await handler(makeRequestNoCredential({ prompt: 'x' }));

    expect(res.status).toBe(402);
    expect(await res.text()).toBe(challengeBody);
    expect(res.headers.get('www-authenticate')).toContain('Payment');

    // Specifically: NO `X-Settle-Verdict` header — this is the legacy mppx
    // challenge path, not the SPEC 26 settle-no-delivery path.
    expect(res.headers.get('x-settle-verdict')).toBeNull();
  });

  it('case-insensitive Authorization scheme detection (Payment / payment / PAYMENT)', async () => {
    fetchSpy.mockResolvedValue(upstreamResponse(200, { ok: true }));

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      { settleOnSuccess: true },
    );

    // Lowercase "payment" should also be accepted as a credentialed call
    // and trigger the probe path.
    const req = new Request('https://mpp.t2000.ai/openai/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'payment dGVzdA==' },
      body: JSON.stringify({ prompt: 'x' }),
    });

    await handler(req);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('credentialed request DOES probe upstream (probe + classify + charge runs)', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(200, { data: [{ url: 'https://img.example/1.png' }] }));

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      { authorization: 'Bearer test-key' },
      { settleOnSuccess: true },
    );

    const res = await handler(makeRequest({ prompt: 'a frog', model: 'gpt-image-1' }));

    // With credentials, the full settle-on-success path runs as designed.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.headers.get('Payment-Receipt')).toMatch(/^mock-receipt-0\.05/);
  });
});

// ─── Spec § 6.1 path 1: probe-classify-charge happy path ──────────────

describe('chargeProxy.settleOnSuccess — happy path (deliverable verdict)', () => {
  it('probes upstream, classifies as deliverable, charges, returns body + Payment-Receipt', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(200, { data: [{ url: 'https://img.example/1.png' }] }));

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      { authorization: 'Bearer test-key' },
      { settleOnSuccess: true },
    );

    const res = await handler(makeRequest({ prompt: 'a frog', model: 'gpt-image-1' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('Payment-Receipt')).toMatch(/^mock-receipt-0\.05/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockChargeImpl).toHaveBeenCalledTimes(1);

    const body = await res.json();
    expect(body.data[0].url).toBe('https://img.example/1.png');
  });

  it('does NOT invoke the upstream a second time for the charge phase (stub handler)', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(200, { ok: true }));

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      { authorization: 'Bearer test-key' },
      { settleOnSuccess: true },
    );

    await handler(makeRequest({ prompt: 'x' }));

    // Only ONE upstream fetch — the probe. The charge phase uses the
    // stub handler that returns the captured probe body.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── Spec § 6.1 path 2: refundable verdict (upstream 4xx → no charge) ─

describe('chargeProxy.settleOnSuccess — refundable verdict (no charge)', () => {
  it('returns HTTP 402 with X-Settle-Verdict: refundable when upstream 400s', async () => {
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse(400, { error: { code: 'invalid_size', message: 'Invalid size 256x256' } }),
    );

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      { settleOnSuccess: true },
    );

    const res = await handler(makeRequest({ prompt: 'x', size: '256x256' }));

    expect(res.status).toBe(402);
    expect(res.headers.get('X-Settle-Verdict')).toBe('refundable');
    expect(res.headers.get('X-Settle-Reason')).toMatch(/upstream 400/);
    expect(res.headers.get('Payment-Receipt')).toBeNull();
    // The original error body is preserved verbatim.
    const body = await res.json();
    expect(body.error.code).toBe('invalid_size');
    // mppx.charge never invoked.
    expect(mockChargeImpl).not.toHaveBeenCalled();
  });

  it('forwards a custom classifier reason in the X-Settle-Reason header', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(200, { data: [] }));

    const customClassifier: ClassifyVerdict = { kind: 'refundable', reason: 'all-images-failed' };

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      {
        settleOnSuccess: true,
        classifyResponse: async () => customClassifier,
      },
    );

    const res = await handler(makeRequest({ prompt: 'x' }));

    expect(res.status).toBe(402);
    expect(res.headers.get('X-Settle-Reason')).toBe('all-images-failed');
    expect(mockChargeImpl).not.toHaveBeenCalled();
  });
});

// ─── Spec § 6.1 path 3: mixed verdict (n=4 partial → fractional charge) ─

describe('chargeProxy.settleOnSuccess — mixed verdict (fractional charge)', () => {
  it('charges amount × chargedFraction when classifier returns mixed', async () => {
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse(200, {
        data: [
          { url: 'https://img/1' },
          { url: 'https://img/2' },
          { url: 'https://img/3' },
          { error: { code: 'rate_limit' } },
        ],
      }),
    );

    const handler = chargeProxy(
      '0.20',
      'https://api.openai.com/v1/images/generations',
      {},
      {
        settleOnSuccess: true,
        classifyResponse: async () => ({
          kind: 'mixed',
          chargedFraction: 3 / 4,
          reason: '3/4 delivered',
        }),
      },
    );

    const res = await handler(makeRequest({ prompt: 'x', n: 4 }));

    expect(res.status).toBe(200);
    expect(mockChargeImpl).toHaveBeenCalledTimes(1);
    // Charged amount is $0.20 × 0.75 = $0.15 (floored to USDC's 6 decimals).
    expect(mockChargeImpl.mock.calls[0][0]).toEqual({ amount: '0.150000' });
  });

  it('full body (including the failed leg) is forwarded to the client', async () => {
    const partialBody = {
      data: [{ url: 'https://img/1' }, { error: { code: 'rate_limit' } }],
    };
    fetchSpy.mockResolvedValueOnce(upstreamResponse(200, partialBody));

    const handler = chargeProxy(
      '0.10',
      'https://api.openai.com/v1/images/generations',
      {},
      {
        settleOnSuccess: true,
        classifyResponse: async () => ({
          kind: 'mixed',
          chargedFraction: 1 / 2,
          reason: '1/2 delivered',
        }),
      },
    );

    const res = await handler(makeRequest({ prompt: 'x', n: 2 }));
    const body = await res.json();
    // Both entries surface — the user can see what failed.
    expect(body.data).toHaveLength(2);
    expect(body.data[0].url).toBe('https://img/1');
    expect(body.data[1].error.code).toBe('rate_limit');
  });
});

// ─── Spec § 6.1 path 4: transform throws → refundable ─────────────────

describe('chargeProxy.settleOnSuccess — transformUpstreamResponse throws → refundable', () => {
  it('returns 402 (no charge) when the transform throws AND it produces a 502 body', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(200, { ok: true }));

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      {
        settleOnSuccess: true,
        transformUpstreamResponse: async () => {
          throw new Error('Blob upload failed');
        },
      },
    );

    const res = await handler(makeRequest({ prompt: 'x' }));

    // The shared transform helper catches the throw and turns it into a
    // 502 response. The default classifier sees res.ok === false → refundable.
    // Status is coerced to 402 by the settle path so the client gets the
    // explicit "no-charge-can-retry" signal.
    expect(res.status).toBe(402);
    expect(res.headers.get('X-Settle-Verdict')).toBe('refundable');
    expect(res.headers.get('X-Settle-Reason')).toMatch(/upstream 502/);

    const body = await res.json();
    expect(body.error).toMatch(/transform failed/);
    expect(mockChargeImpl).not.toHaveBeenCalled();
  });
});

// ─── Spec § 6.1 path 5: idempotency — same fingerprint within TTL ─────

describe('chargeProxy.settleOnSuccess — idempotency cache hit', () => {
  it('replays the cached body + Payment-Receipt without re-probing or re-charging', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(200, { id: 'first' }));

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      { settleOnSuccess: true },
    );

    // First call — populates the cache.
    const res1 = await handler(makeRequest({ prompt: 'same' }));
    const receipt1 = res1.headers.get('Payment-Receipt');
    expect(res1.status).toBe(200);
    expect(receipt1).toBeTruthy();

    // Second call with IDENTICAL body — cache hit. NO new fetch, NO new charge.
    const res2 = await handler(makeRequest({ prompt: 'same' }));
    const receipt2 = res2.headers.get('Payment-Receipt');

    expect(res2.status).toBe(200);
    expect(receipt2).toBe(receipt1); // same digest preserved (true idempotency)
    expect(fetchSpy).toHaveBeenCalledTimes(1); // probe only fired once
    expect(mockChargeImpl).toHaveBeenCalledTimes(1); // charge only fired once

    // Body identity preserved.
    const body2 = await res2.json();
    expect(body2.id).toBe('first');
  });

  it('different bodies produce cache misses (no false-positive collisions)', async () => {
    fetchSpy
      .mockResolvedValueOnce(upstreamResponse(200, { id: 'a' }))
      .mockResolvedValueOnce(upstreamResponse(200, { id: 'b' }));

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      { settleOnSuccess: true },
    );

    await handler(makeRequest({ prompt: 'aaa' }));
    await handler(makeRequest({ prompt: 'bbb' }));

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(mockChargeImpl).toHaveBeenCalledTimes(2);
  });
});

// ─── Spec § 6.1 path 6: charge throws after probe → no double-charge ─

describe('chargeProxy.settleOnSuccess — charge fails after successful probe', () => {
  it('returns 402 with X-Settle-Verdict: charge-failed, absorbing the upstream cost', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(200, { data: [{ url: 'https://img/1' }] }));
    mockChargeImpl.mockRejectedValueOnce(new Error('Sui chain congestion'));

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      { settleOnSuccess: true },
    );

    const res = await handler(makeRequest({ prompt: 'x' }));

    expect(res.status).toBe(402);
    expect(res.headers.get('X-Settle-Verdict')).toBe('charge-failed');
    expect(res.headers.get('X-Settle-Reason')).toMatch(/Sui chain congestion/);
    expect(res.headers.get('Payment-Receipt')).toBeNull();
    // No cache entry written — a retry SHOULD re-probe (the upstream cost
    // was absorbed; we don't want to double-absorb on retry by trusting a
    // half-completed probe).
    const body = await res.json();
    expect(body.data[0].url).toBe('https://img/1');
  });

  it('does not write the failed-charge response to the cache', async () => {
    fetchSpy
      .mockResolvedValueOnce(upstreamResponse(200, { id: 'first' }))
      .mockResolvedValueOnce(upstreamResponse(200, { id: 'second' }));
    mockChargeImpl
      .mockRejectedValueOnce(new Error('Sui congestion'))
      .mockImplementation(defaultMockCharge);

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      { settleOnSuccess: true },
    );

    // First call — probe succeeds, charge fails.
    await handler(makeRequest({ prompt: 'same' }));

    // Second call with IDENTICAL body — must re-probe, not return cached
    // failed-charge response.
    const res2 = await handler(makeRequest({ prompt: 'same' }));
    const body2 = await res2.json();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(body2.id).toBe('second'); // proves the second probe ran
    expect(res2.headers.get('Payment-Receipt')).toBeTruthy(); // succeeded the 2nd time
  });
});

// ─── Bonus: regression bar from spec § 6.4 ────────────────────────────

describe('chargeProxy — regression bar (settleOnSuccess: false is byte-identical to legacy)', () => {
  it('legacy path with settleOnSuccess unset goes through mppx.charge BEFORE upstream fetch', async () => {
    // Sequence trap: track the order of calls. Under legacy mode, mppx.charge
    // must be invoked before fetch (charge wraps the handler that does the
    // fetch). Under settleOnSuccess: true, fetch fires first.
    const callOrder: string[] = [];
    fetchSpy.mockImplementation(async () => {
      callOrder.push('fetch');
      return upstreamResponse(200, { ok: true });
    });
    mockChargeImpl.mockImplementation(async (opts, handler, req) => {
      callOrder.push('charge:start');
      const res = await handler(req);
      callOrder.push('charge:end');
      const headers = new Headers(res.headers);
      headers.set('Payment-Receipt', `mock-receipt-${opts.amount}`);
      return new Response(res.body, { status: res.status, headers });
    });

    const legacyHandler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      // settleOnSuccess intentionally UNSET to trigger legacy branch
    );

    await legacyHandler(makeRequest({ prompt: 'x' }));

    // Legacy: charge starts, then fetch fires inside the handler, then charge ends.
    expect(callOrder).toEqual(['charge:start', 'fetch', 'charge:end']);
  });

  it('settle-on-success path inverts the order: fetch BEFORE charge', async () => {
    const callOrder: string[] = [];
    fetchSpy.mockImplementation(async () => {
      callOrder.push('fetch');
      return upstreamResponse(200, { ok: true });
    });
    mockChargeImpl.mockImplementation(async (opts, handler, req) => {
      callOrder.push('charge:start');
      const res = await handler(req);
      callOrder.push('charge:end');
      const headers = new Headers(res.headers);
      headers.set('Payment-Receipt', `mock-receipt-${opts.amount}`);
      return new Response(res.body, { status: res.status, headers });
    });

    const settleHandler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      { settleOnSuccess: true },
    );

    await settleHandler(makeRequest({ prompt: 'x' }));

    // Settle: fetch (probe) fires FIRST, then charge wraps the stub handler
    // (which doesn't re-fetch — the stub returns the captured probe body).
    expect(callOrder).toEqual(['fetch', 'charge:start', 'charge:end']);
  });

  it('legacy path still respects pre-charge validate hook (no behavioral drift)', async () => {
    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      {
        validate: () => 'bad input',
      },
    );

    const res = await handler(makeRequest({ prompt: 'x' }));

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockChargeImpl).not.toHaveBeenCalled();
  });

  it('settle-on-success path also respects pre-charge validate hook', async () => {
    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      {
        settleOnSuccess: true,
        validate: () => 'bad input',
      },
    );

    const res = await handler(makeRequest({ prompt: 'x' }));

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockChargeImpl).not.toHaveBeenCalled();
  });
});

// ─── Helper math test ─────────────────────────────────────────────────

describe('computeChargeAmount — fractional charge math (D-6)', () => {
  it('returns the original amount when fraction >= 1', () => {
    expect(computeChargeAmount('0.05', 1)).toBe('0.05');
    expect(computeChargeAmount('0.20', 1.5)).toBe('0.20');
  });

  it('returns "0" when fraction <= 0 (refundable case shouldnt reach here, but defensive)', () => {
    expect(computeChargeAmount('0.05', 0)).toBe('0');
    expect(computeChargeAmount('0.05', -1)).toBe('0');
  });

  it('floors to 6 decimals (USDC native precision, never round up)', () => {
    // $0.05 × 0.7333... = $0.0366666... → floor to 6dp = 0.036666
    expect(computeChargeAmount('0.05', 0.7333333)).toBe('0.036666');
  });

  it('handles the canonical n=4 partial case from spec D-6', () => {
    // $0.20 × 3/4 = $0.15 exactly
    expect(computeChargeAmount('0.20', 3 / 4)).toBe('0.150000');
  });

  it('returns the input unchanged for non-numeric amounts (defensive)', () => {
    expect(computeChargeAmount('abc', 0.5)).toBe('abc');
  });
});

// ─── Anthropic Messages API shape (P6 default-classifier coverage) ───

/**
 * Anthropic doesn't ship a partial-success body shape, so the route uses
 * `chargeProxy(... { settleOnSuccess: true })` with NO custom classifier.
 * Pin the resulting behavior so anyone who later adds a custom classifier
 * (or accidentally regresses the default) sees a clear test failure.
 */
describe('chargeProxy.settleOnSuccess — anthropic default-classifier shape (P6)', () => {
  it('charges full price on a 200 anthropic Messages response', async () => {
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse(200, {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-4',
        content: [{ type: 'text', text: 'hello world' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 3 },
      }),
    );

    const handler = chargeProxy(
      '0.01',
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': 'test', 'anthropic-version': '2023-06-01' },
      { settleOnSuccess: true },
    );

    const res = await handler(
      makeRequest(
        { model: 'claude-opus-4', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] },
        'https://mpp.t2000.ai/anthropic/v1/messages',
      ),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Payment-Receipt')).toMatch(/^mock-receipt-0\.01/);
    expect(mockChargeImpl).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.content[0].text).toBe('hello world');
    expect(body.stop_reason).toBe('end_turn');
  });

  it('refunds (402, no charge) on anthropic 400 invalid_request_error', async () => {
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse(400, {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'model: invalid model name' },
      }),
    );

    const handler = chargeProxy(
      '0.01',
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': 'test', 'anthropic-version': '2023-06-01' },
      { settleOnSuccess: true },
    );

    const res = await handler(
      makeRequest(
        { model: 'claude-9000', messages: [{ role: 'user', content: 'hi' }] },
        'https://mpp.t2000.ai/anthropic/v1/messages',
      ),
    );

    expect(res.status).toBe(402);
    expect(res.headers.get('X-Settle-Verdict')).toBe('refundable');
    expect(res.headers.get('X-Settle-Reason')).toMatch(/upstream 400/);
    expect(mockChargeImpl).not.toHaveBeenCalled();
    // Original anthropic error body preserved verbatim so the LLM sees
    // the actual error message (drives D-8 settleReason routing).
    const body = await res.json();
    expect(body.type).toBe('error');
    expect(body.error.message).toContain('invalid model');
  });

  it('refunds (402, no charge) on anthropic 429 rate-limit', async () => {
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse(429, {
        type: 'error',
        error: { type: 'rate_limit_error', message: 'rate limit exceeded' },
      }),
    );

    const handler = chargeProxy(
      '0.01',
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': 'test', 'anthropic-version': '2023-06-01' },
      { settleOnSuccess: true },
    );

    const res = await handler(
      makeRequest(
        { model: 'claude-opus-4', messages: [{ role: 'user', content: 'hi' }] },
        'https://mpp.t2000.ai/anthropic/v1/messages',
      ),
    );

    expect(res.status).toBe(402);
    expect(res.headers.get('X-Settle-Verdict')).toBe('refundable');
    expect(res.headers.get('X-Settle-Reason')).toMatch(/upstream 429/);
    expect(mockChargeImpl).not.toHaveBeenCalled();
  });

  it('charges on a 200 with stop_reason=max_tokens (still deliverable — user got tokens)', async () => {
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse(200, {
        id: 'msg_456',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'partial output...' }],
        stop_reason: 'max_tokens',
        usage: { input_tokens: 10, output_tokens: 100 },
      }),
    );

    const handler = chargeProxy(
      '0.01',
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': 'test', 'anthropic-version': '2023-06-01' },
      { settleOnSuccess: true },
    );

    const res = await handler(
      makeRequest(
        { model: 'claude-opus-4', max_tokens: 100, messages: [{ role: 'user', content: 'long' }] },
        'https://mpp.t2000.ai/anthropic/v1/messages',
      ),
    );

    // Truncation isn't a refund event — anthropic charges us, so we charge.
    expect(res.status).toBe(200);
    expect(res.headers.get('Payment-Receipt')).toMatch(/^mock-receipt-0\.01/);
    expect(mockChargeImpl).toHaveBeenCalledTimes(1);
  });
});

// ─── D-9 metric emission (P9 — verifies logSettleEvent is wired) ──────

/**
 * The `chargeProxySettleOnSuccess` flow MUST emit a `[mpp.settle]` event
 * at every D-9 measurement point. These tests verify the call sites are
 * actually wired (a regression where someone removes a `logSettleEvent`
 * call accidentally would silently break Vercel-side observability).
 */
describe('chargeProxy.settleOnSuccess — D-9 metric emission (P9)', () => {
  let consoleSpy: MockInstance<typeof console.log>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  function getSettleLines(): string[] {
    return consoleSpy.mock.calls
      .map((call) => call[0] as string)
      .filter((line) => typeof line === 'string' && line.startsWith('[mpp.settle]'));
  }

  it('emits classify+deliverable on the happy path', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(200, { ok: true }));

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      { settleOnSuccess: true },
    );

    await handler(makeRequest({ prompt: 'x' }));

    const lines = getSettleLines();
    const classify = lines.find((l) => l.includes('event=classify'));
    expect(classify).toBeDefined();
    expect(classify).toContain('verdict=deliverable');
    expect(classify).toContain('chargeAmount=0.05');
    expect(classify).toMatch(/durationMs=\d+/);
    expect(classify).toContain('route=openai/v1/images/generations');
  });

  it('emits classify+refundable (no chargeAmount) on upstream 4xx', async () => {
    fetchSpy.mockResolvedValueOnce(
      upstreamResponse(400, { error: { code: 'invalid_size' } }),
    );

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      { settleOnSuccess: true },
    );

    await handler(makeRequest({ prompt: 'x', size: '256x256' }));

    const lines = getSettleLines();
    const classify = lines.find((l) => l.includes('event=classify'));
    expect(classify).toBeDefined();
    expect(classify).toContain('verdict=refundable');
    // Refundable did NOT charge → no chargeAmount field.
    expect(classify).not.toContain('chargeAmount');
  });

  it('emits classify+mixed with chargedFraction on partial-success', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(200, { ok: true }));

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      {
        settleOnSuccess: true,
        classifyResponse: async (): Promise<ClassifyVerdict> => ({
          kind: 'mixed',
          chargedFraction: 0.5,
          reason: 'half',
        }),
      },
    );

    await handler(makeRequest({ prompt: 'x' }));

    const lines = getSettleLines();
    const classify = lines.find((l) => l.includes('event=classify'));
    expect(classify).toBeDefined();
    expect(classify).toContain('verdict=mixed');
    expect(classify).toContain('chargedFraction=0.5');
    expect(classify).toContain('chargeAmount=0.025000');
  });

  it('emits charge_failed with absorbedCostUsd when the charge fails after a successful probe', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(200, { ok: true }));
    mockChargeImpl.mockRejectedValueOnce(new Error('Sui congestion'));

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      { settleOnSuccess: true },
    );

    await handler(makeRequest({ prompt: 'x' }));

    const lines = getSettleLines();
    const failed = lines.find((l) => l.includes('event=charge_failed'));
    expect(failed).toBeDefined();
    expect(failed).toContain('absorbedCostUsd=0.05');
    expect(failed).toContain('reason=Sui congestion');
    expect(failed).toContain('route=openai/v1/images/generations');
  });

  it('emits idempotency_hit on cache replay (no second classify event fires)', async () => {
    fetchSpy.mockResolvedValueOnce(upstreamResponse(200, { ok: true }));

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      { settleOnSuccess: true },
    );

    await handler(makeRequest({ prompt: 'same' }));
    consoleSpy.mockClear();

    // Second identical request — cache hits, no new probe, no new charge.
    await handler(makeRequest({ prompt: 'same' }));

    const lines = getSettleLines();
    const hits = lines.filter((l) => l.includes('event=idempotency_hit'));
    const classifies = lines.filter((l) => l.includes('event=classify'));
    expect(hits.length).toBe(1);
    expect(classifies.length).toBe(0);
  });
});

// ─── Cache failure-tolerance (P5 review remediation Bug B) ────────────

/**
 * The cache (Upstash in prod, in-memory in tests) is a NICETY for
 * legitimate-retry idempotency, NOT load-bearing for any single request.
 * If Upstash has a transient failure, the request must still complete
 * cleanly:
 *   - cache.get throws → treat as a miss, fall through to fresh probe
 *   - cache.set throws → still return the paid response (don't error
 *     out a request the user has already paid for)
 */
describe('chargeProxy.settleOnSuccess — cache I/O failure tolerance (Bug B)', () => {
  it('cache.get throws → falls through to fresh probe + charge (no request error)', async () => {
    const flakyCache: InMemoryUpstreamResponseCache = new InMemoryUpstreamResponseCache();
    flakyCache.get = vi.fn().mockRejectedValue(new Error('Upstash 503'));
    setUpstreamResponseCache(flakyCache);

    fetchSpy.mockResolvedValueOnce(upstreamResponse(200, { ok: true, id: 'fresh' }));

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      { settleOnSuccess: true },
    );

    const res = await handler(makeRequest({ prompt: 'x' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('Payment-Receipt')).toMatch(/^mock-receipt-0\.05/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockChargeImpl).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.id).toBe('fresh');
  });

  it('cache.set throws → still returns the paid response (does not error out the user)', async () => {
    const flakyCache: InMemoryUpstreamResponseCache = new InMemoryUpstreamResponseCache();
    flakyCache.set = vi.fn().mockRejectedValue(new Error('Upstash write timeout'));
    setUpstreamResponseCache(flakyCache);

    fetchSpy.mockResolvedValueOnce(upstreamResponse(200, { ok: true, id: 'paid' }));

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      { settleOnSuccess: true },
    );

    const res = await handler(makeRequest({ prompt: 'x' }));

    // The user paid; the response must come back cleanly even though
    // the cache write blew up.
    expect(res.status).toBe(200);
    expect(res.headers.get('Payment-Receipt')).toMatch(/^mock-receipt-0\.05/);
    expect(mockChargeImpl).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.id).toBe('paid');
  });

  it('cache.get failure does not poison the second request (each call independent)', async () => {
    let getCalls = 0;
    const flakyCache: InMemoryUpstreamResponseCache = new InMemoryUpstreamResponseCache();
    const realGet = flakyCache.get.bind(flakyCache);
    flakyCache.get = vi.fn(async (fp: string) => {
      getCalls++;
      // First call throws; subsequent calls work normally.
      if (getCalls === 1) throw new Error('Upstash 503');
      return realGet(fp);
    });
    setUpstreamResponseCache(flakyCache);

    fetchSpy
      .mockResolvedValueOnce(upstreamResponse(200, { id: 'first' }))
      .mockResolvedValueOnce(upstreamResponse(200, { id: 'second' }));

    const handler = chargeProxy(
      '0.05',
      'https://api.openai.com/v1/images/generations',
      {},
      { settleOnSuccess: true },
    );

    const res1 = await handler(makeRequest({ prompt: 'x' }));
    const res2 = await handler(makeRequest({ prompt: 'y' })); // different body, different fingerprint

    expect((await res1.json()).id).toBe('first');
    expect((await res2.json()).id).toBe('second');
    expect(getCalls).toBe(2); // both calls hit the cache
    // Cache.set ran on both successful charges — second call's get
    // operates against the (working) cache as normal.
  });
});
