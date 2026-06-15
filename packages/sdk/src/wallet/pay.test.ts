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
const selectMock = vi.fn(async (..._args: unknown[]) => ({ coin: {}, effectiveAmount: 20000n, swapAll: false }));
vi.mock('./coinSelection.js', () => ({ selectAndSplitCoin: (...args: unknown[]) => selectMock(...args) }));
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
    expect(selectMock).toHaveBeenCalledTimes(1);
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

  it('throws when a 402 carries no x402 payment requirement (no legacy fallback)', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 402, body: { detail: 'Payment required' } }));

    await expect(
      payWithMpp({
        signer: makeSigner(),
        client: makeClient(),
        options: { url: 'https://legacy.example/x', maxPrice: 0.05 },
      }),
    ).rejects.toThrow(/x402/i);
    expect(buildX402Mock).not.toHaveBeenCalled();
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
