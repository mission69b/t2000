import { afterEach, describe, expect, it, vi } from 'vitest';
import { toBase64 } from '@mysten/sui/utils';
import type { TransactionSigner } from '../signer.js';
import type { SuiGrpcClient } from '@mysten/sui/grpc';

// --- Mocks for the dynamically-imported stacks -----------------------------
// payWithMpp probes with global fetch, then takes the x402 path
// (@suimpp/mpp/x402). We mock the dynamic deps so the pay loop is exercised
// without network / chain access.

const buildX402Mock = vi.fn(async (..._args: unknown[]) => ({ header: 'signed-x402-header', payment: {} }));
vi.mock('@suimpp/mpp/x402', () => ({
  buildX402SignedPayment: (...args: unknown[]) => buildX402Mock(...args),
  X402_PAYMENT_HEADER: 'X-PAYMENT',
  X402_PAYMENT_RESPONSE_HEADER: 'X-PAYMENT-RESPONSE',
}));

vi.mock('@mysten/sui/grpc', () => ({
  SuiGrpcClient: class {
    constructor(_: unknown) {}
  },
}));

// --- Legacy MPP header dialect mocks ---------------------------------------
// `mppx` (root) is NOT mocked — parseMppSuiChallenge exercises the real
// Challenge.fromResponseList against a realistic WWW-Authenticate header.
// `mppx/client` + `@suimpp/mpp/client` are mocked to simulate the pay loop:
// fetch → onChallenge → sui method execute → 200.
const mppxFetchMock = vi.fn();
let mppxChallengeAmount = '0.02'; // per-test override for the simulated challenge price
const mppxCreateMock = vi.fn((config: {
  onChallenge?: (c: unknown) => Promise<string | undefined>;
  methods: Array<{ __opts: { execute: (tx: unknown) => Promise<{ digest: string }> } }>;
}) => ({
  fetch: async (url: string, init: unknown) => {
    mppxFetchMock(url, init);
    // Simulate the mppx loop: probe hits 402 → parse challenge → hook → pay → retry.
    await config.onChallenge?.({
      id: 'cid',
      realm: 'seller.example',
      method: 'sui',
      intent: 'charge',
      request: { amount: mppxChallengeAmount, currency: USDC_TYPE, recipient: '0xseller' },
    });
    await config.methods[0].__opts.execute({ __tx: true });
    return mockResponse({ status: 200, body: { ok: true } });
  },
}));
vi.mock('mppx/client', () => ({
  Mppx: { create: (config: unknown) => mppxCreateMock(config as Parameters<typeof mppxCreateMock>[0]) },
}));
vi.mock('@suimpp/mpp/client', () => ({
  sui: (opts: unknown) => ({ __opts: opts }),
  USDC: { type: 'usdc-mainnet' },
  USDC_TESTNET: { type: 'usdc-testnet' },
}));

vi.mock('../token-registry.js', () => ({ getDecimalsForCoinType: () => 6 }));

// migration path deps — invoke the buildTx callback so the inner
// selectAndSplitCoin + moveCall run (matches the real executeTx).
const executeTxMock = vi.fn(
  async (_client: unknown, _signer: unknown, buildTx: () => Promise<unknown>, _opts?: unknown) => {
    await buildTx();
    return { digest: '0xmigration', gasCostSui: 0, effects: undefined };
  },
);
vi.mock('./executeTx.js', () => ({
  executeTx: (client: unknown, signer: unknown, buildTx: () => Promise<unknown>, opts: unknown) =>
    executeTxMock(client, signer, buildTx, opts),
}));
// The gasless coin→AB migration: whole-coin `coin::send_funds`, no merge/split.
const migrationMock = vi.fn((..._args: unknown[]) => ({
  tx: { setSender() {} },
  migratedRaw: 1_000_000n,
}));
vi.mock('./coinSelection.js', () => ({
  buildCoinToAddressBalanceMigration: (...args: unknown[]) => migrationMock(...args),
}));
vi.mock('@mysten/sui/transactions', () => ({
  Transaction: class {
    pure = { address: (_: string) => ({}) };
    moveCall(_: unknown) {}
    setSender(_: string) {}
    async build() {
      return new Uint8Array([1]);
    }
  },
}));

import { payWithMpp } from './pay.js';

const USDC_TYPE = '0xusdc::usdc::USDC';

function makeSigner(): TransactionSigner {
  return {
    getAddress: () => '0xsender',
    signTransaction: vi.fn(async () => ({ signature: 'sig' })),
    signPersonalMessage: vi.fn(async () => ({ signature: 'psig', bytes: 'b64' })),
  } as unknown as TransactionSigner;
}

function makeClient(opts: { total?: string; coins?: Array<{ objectId: string; balance: string }> } = {}): SuiGrpcClient {
  const { total = '1000000', coins = [] } = opts;
  return {
    network: 'mainnet',
    core: {
      getBalance: vi.fn(async () => ({ balance: { balance: total } })),
      listCoins: vi.fn(async () => ({ objects: coins, cursor: null, hasNextPage: false })),
    },
  } as unknown as SuiGrpcClient;
}

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

interface MockResponseInit {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}
function mockResponse({ status, body, headers = {} }: MockResponseInit): Response {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const resp = {
    status,
    headers: {
      get: (k: string) => lower.get(k.toLowerCase()) ?? (k.toLowerCase() === 'content-type' ? 'application/json' : null),
      has: (k: string) => lower.has(k.toLowerCase()),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: () => resp,
  };
  return resp as unknown as Response;
}

function x402Accepts(amountRaw = '20000') {
  return {
    accepts: [
      {
        scheme: 'exact',
        network: 'sui:mainnet',
        asset: USDC_TYPE,
        maxAmountRequired: amountRaw,
        payTo: '0xtreasury',
        resource: 'https://mpp.t2000.ai/x',
        maxTimeoutSeconds: 60,
        extra: { suimpp: { challengeId: 'cid', nonce: 1, chain: 'c', minEpoch: '1', maxEpoch: '2' } },
      },
    ],
  };
}

function settleHeaderValue(digest = '0xsettled') {
  return toBase64(
    new TextEncoder().encode(JSON.stringify({ success: true, network: 'sui:mainnet', transaction: digest, payer: '0xsender' })),
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('payWithMpp — x402 sign-then-settle', () => {
  it('signs an X-PAYMENT and reports paid + cost + digest (address balance covers it)', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ status: 402, body: x402Accepts('20000') })) // probe
      .mockResolvedValueOnce(
        mockResponse({ status: 200, body: { ok: true }, headers: { 'X-PAYMENT-RESPONSE': settleHeaderValue('0xabc') } }),
      ); // paid re-request

    const result = await payWithMpp({
      // address balance fully covers (no coins) → no migration
      signer: makeSigner(),
      client: makeClient({ total: '1000000', coins: [] }),
      options: { url: 'https://mpp.t2000.ai/x', method: 'POST', body: '{}', maxPrice: 0.05 },
    });

    expect(buildX402Mock).toHaveBeenCalledTimes(1);
    expect(executeTxMock).not.toHaveBeenCalled(); // no migration
    expect(result.paid).toBe(true);
    expect(result.dialect).toBe('x402');
    expect(result.status).toBe(200);
    expect(result.cost).toBe(0.02); // 20000 / 10^6
    expect(result.receipt?.reference).toBe('0xabc');
    expect(result.gasCostSui).toBe(0);
  });

  it('migrates coin objects into the address balance when it is short', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ status: 402, body: x402Accepts('20000') }))
      .mockResolvedValueOnce(
        mockResponse({ status: 200, body: { ok: true }, headers: { 'X-PAYMENT-RESPONSE': settleHeaderValue() } }),
      );

    const result = await payWithMpp({
      // all funds in coin objects, address balance = 0 → migration runs
      signer: makeSigner(),
      client: makeClient({ total: '1000000', coins: [{ objectId: '0xc', balance: '1000000' }] }),
      options: { url: 'https://mpp.t2000.ai/x', maxPrice: 0.05 },
    });

    expect(executeTxMock).toHaveBeenCalledTimes(1); // the coin→AB migration tx
    expect(migrationMock).toHaveBeenCalledTimes(1); // gasless whole-coin migration
    expect(result.paid).toBe(true);
    expect(result.dialect).toBe('x402');
  });

  it('reports not-paid when settlement fails (no X-PAYMENT-RESPONSE)', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ status: 402, body: x402Accepts() }))
      .mockResolvedValueOnce(mockResponse({ status: 402, body: { error: 'settle failed' } })); // no receipt header

    const result = await payWithMpp({
      signer: makeSigner(),
      client: makeClient({ total: '1000000', coins: [] }),
      options: { url: 'https://mpp.t2000.ai/x', maxPrice: 0.05 },
    });

    expect(result.paid).toBe(false);
    expect(result.cost).toBeUndefined();
    expect(result.receipt).toBeUndefined();
  });

  it('throws INSUFFICIENT_BALANCE when the wallet cannot cover the amount', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 402, body: x402Accepts('20000') }));

    await expect(
      payWithMpp({
        signer: makeSigner(),
        client: makeClient({ total: '5000', coins: [] }), // 0.005 USDC < 0.02
        options: { url: 'https://mpp.t2000.ai/x', maxPrice: 0.05 },
      }),
    ).rejects.toThrow(/insufficient/i);
  });

  it('throws when a 402 carries neither an x402 envelope nor an MPP sui challenge', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 402, body: { detail: 'Payment required' } }));

    await expect(
      payWithMpp({
        signer: makeSigner(),
        client: makeClient(),
        options: { url: 'https://legacy.example/x', maxPrice: 0.05 },
      }),
    ).rejects.toThrow(/nothing this sdk can pay/i);
    expect(buildX402Mock).not.toHaveBeenCalled();
    expect(mppxCreateMock).not.toHaveBeenCalled();
  });

  it('throws PRICE_EXCEEDS_LIMIT when the x402 price exceeds maxPrice', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 402, body: x402Accepts('200000') })); // $0.20

    await expect(
      payWithMpp({
        signer: makeSigner(),
        client: makeClient({ total: '1000000', coins: [] }),
        options: { url: 'https://mpp.t2000.ai/x', maxPrice: 0.05 },
      }),
    ).rejects.toThrow(/exceeds maxPrice/i);
    expect(buildX402Mock).not.toHaveBeenCalled(); // rejected before signing
  });
});

// The MPP header dialect (WWW-Authenticate: Payment … method="sui") — the
// restored pre-S.452 fallback for header-only external sellers (JMPR shape).
function mppHeader402(amount = '0.02'): Response {
  const request = toBase64(
    new TextEncoder().encode(JSON.stringify({ amount, currency: USDC_TYPE, recipient: '0xseller' })),
  );
  return mockResponse({
    status: 402,
    body: { detail: 'Payment required', methods: ['tempo', 'sui'] },
    headers: {
      'WWW-Authenticate':
        `Payment id="cid-tempo", realm="seller.example", method="tempo", intent="charge", request="${request}", ` +
        `Payment id="cid-sui", realm="seller.example", method="sui", intent="charge", request="${request}"`,
    },
  });
}

describe('payWithMpp — MPP header dialect fallback', () => {
  it('pays a header-only 402 via the legacy digest dialect', async () => {
    mppxChallengeAmount = '0.02';
    fetchMock.mockResolvedValueOnce(mppHeader402('0.02')); // probe (mppx re-fetches internally via its own mock)

    const result = await payWithMpp({
      signer: makeSigner(),
      client: makeClient({ total: '1000000', coins: [] }),
      options: { url: 'https://seller.example/x', method: 'POST', body: '{}', maxPrice: 0.05 },
    });

    expect(buildX402Mock).not.toHaveBeenCalled();
    expect(mppxCreateMock).toHaveBeenCalledTimes(1);
    expect(executeTxMock).toHaveBeenCalledTimes(1); // the on-chain payment leg
    expect(result.paid).toBe(true);
    expect(result.dialect).toBe('legacy');
    expect(result.cost).toBe(0.02); // challenge price, not the maxPrice ceiling
    expect(result.receipt?.reference).toBe('0xmigration');
  });

  it('prefers x402 when a 402 carries BOTH the envelope and the header', async () => {
    const request = toBase64(
      new TextEncoder().encode(JSON.stringify({ amount: '0.02', currency: USDC_TYPE, recipient: '0xseller' })),
    );
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({
          status: 402,
          body: x402Accepts('20000'),
          headers: {
            'WWW-Authenticate': `Payment id="cid", realm="s", method="sui", intent="charge", request="${request}"`,
          },
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({ status: 200, body: { ok: true }, headers: { 'X-PAYMENT-RESPONSE': settleHeaderValue() } }),
      );

    const result = await payWithMpp({
      signer: makeSigner(),
      client: makeClient({ total: '1000000', coins: [] }),
      options: { url: 'https://mpp.t2000.ai/x', maxPrice: 0.05 },
    });

    expect(result.dialect).toBe('x402');
    expect(mppxCreateMock).not.toHaveBeenCalled();
  });

  it('throws PRICE_EXCEEDS_LIMIT from onChallenge BEFORE paying when the header price exceeds maxPrice', async () => {
    mppxChallengeAmount = '0.50';
    fetchMock.mockResolvedValueOnce(mppHeader402('0.50'));

    await expect(
      payWithMpp({
        signer: makeSigner(),
        client: makeClient({ total: '1000000', coins: [] }),
        options: { url: 'https://seller.example/x', maxPrice: 0.05 },
      }),
    ).rejects.toThrow(/exceeds maxPrice/i);
    expect(executeTxMock).not.toHaveBeenCalled(); // money never moved
  });
});

describe('payWithMpp — free / cached', () => {
  it('reports not-paid when the endpoint serves without a 402', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: { cached: true } }));

    const result = await payWithMpp({
      signer: makeSigner(),
      client: makeClient(),
      options: { url: 'https://mpp.t2000.ai/x', maxPrice: 0.05 },
    });

    expect(result.paid).toBe(false);
    expect(result.body).toEqual({ cached: true });
    expect(buildX402Mock).not.toHaveBeenCalled();
  });
});

describe('payWithMpp — direct-seller activity report', () => {
  const reportCalls = () =>
    fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/mpp/report'));

  it('reports a paid non-gateway call to the gateway (digest + url, best-effort)', async () => {
    mppxChallengeAmount = '0.02';
    fetchMock.mockResolvedValueOnce(mppHeader402('0.02')); // probe
    // Any subsequent fetch (the report) resolves harmlessly via the bare mock.

    await payWithMpp({
      signer: makeSigner(),
      client: makeClient({ total: '1000000', coins: [] }),
      options: { url: 'https://seller.example/x', method: 'POST', body: '{}', maxPrice: 0.05 },
    });

    const reports = reportCalls();
    expect(reports).toHaveLength(1);
    const [, init] = reports[0];
    expect(JSON.parse(init.body)).toEqual({ digest: '0xmigration', url: 'https://seller.example/x' });
  });

  it('does NOT report gateway-origin payments (the gateway logs its own)', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ status: 402, body: x402Accepts('20000') }))
      .mockResolvedValueOnce(
        mockResponse({ status: 200, body: { ok: true }, headers: { 'X-PAYMENT-RESPONSE': settleHeaderValue() } }),
      );

    await payWithMpp({
      signer: makeSigner(),
      client: makeClient({ total: '1000000', coins: [] }),
      options: { url: 'https://mpp.t2000.ai/x', maxPrice: 0.05 },
    });

    expect(reportCalls()).toHaveLength(0);
  });

  it('a failing report never fails the payment', async () => {
    mppxChallengeAmount = '0.02';
    fetchMock
      .mockResolvedValueOnce(mppHeader402('0.02')) // probe
      .mockRejectedValueOnce(new Error('gateway down')); // the report

    const result = await payWithMpp({
      signer: makeSigner(),
      client: makeClient({ total: '1000000', coins: [] }),
      options: { url: 'https://seller.example/x', method: 'POST', body: '{}', maxPrice: 0.05 },
    });

    expect(result.paid).toBe(true);
  });
});

describe('payWithMpp — content-type defaulting', () => {
  // Without the default, fetch stamps text/plain and strict servers (FastAPI)
  // 422 the string body before the 402 ever fires (live finding vs JMPR).
  it('defaults content-type: application/json when the body is JSON and none is set', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: { ok: true } }));

    await payWithMpp({
      signer: makeSigner(),
      client: makeClient(),
      options: { url: 'https://x.example/api', method: 'POST', body: '{"city":"Tokyo"}' },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('respects a caller-supplied Content-Type (any casing)', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: { ok: true } }));

    await payWithMpp({
      signer: makeSigner(),
      client: makeClient(),
      options: {
        url: 'https://x.example/api',
        method: 'POST',
        body: '{"a":1}',
        headers: { 'Content-Type': 'application/vnd.custom+json' },
      },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toEqual({ 'Content-Type': 'application/vnd.custom+json' });
  });

  it('leaves non-JSON bodies alone', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: { ok: true } }));

    await payWithMpp({
      signer: makeSigner(),
      client: makeClient(),
      options: { url: 'https://x.example/api', method: 'POST', body: 'plain text' },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toBeUndefined();
  });
});
