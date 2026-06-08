import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TransactionSigner } from '../signer.js';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

// --- Mocks for the dynamically-imported MPP stack -------------------------
// payWithMpp dynamically imports mppx/client, @suimpp/mpp/client, and
// @mysten/sui/grpc. We mock all three so the pay loop is exercised without
// network / chain access.

const fetchMock = vi.fn();
const onChallengeRef: { current?: (c: unknown) => Promise<unknown> } = {};
const executeRef: { current?: (tx: unknown) => Promise<unknown> } = {};

vi.mock('mppx/client', () => ({
  Mppx: {
    create: (opts: {
      onChallenge?: (c: unknown) => Promise<unknown>;
      methods: Array<{ execute?: (tx: unknown) => Promise<unknown> }>;
    }) => {
      onChallengeRef.current = opts.onChallenge;
      executeRef.current = opts.methods[0]?.execute;
      return { fetch: fetchMock };
    },
  },
}));

vi.mock('@suimpp/mpp/client', () => ({
  USDC: { symbol: 'USDC' },
  // `sui(...)` returns the method object; payWithMpp only reads `.execute`
  // off it via methods[0], which our Mppx mock captures.
  sui: (cfg: { execute: (tx: unknown) => Promise<unknown> }) => cfg,
}));

vi.mock('@mysten/sui/grpc', () => ({
  SuiGrpcClient: class {
    constructor(_: unknown) {}
  },
}));

import { payWithMpp } from './pay.js';

function makeSigner(): TransactionSigner {
  return {
    getAddress: () => '0xsender',
    signTransaction: vi.fn(async () => ({ signature: 'sig' })),
    signPersonalMessage: vi.fn(async () => ({ signature: 'psig', bytes: 'b64' })),
  } as unknown as TransactionSigner;
}

function makeClient(): SuiJsonRpcClient {
  return {
    network: 'mainnet',
    executeTransactionBlock: vi.fn(async () => ({
      digest: '0xdigest',
      effects: { gasUsed: { computationCost: '1000', storageCost: '0', storageRebate: '0' } },
    })),
    waitForTransaction: vi.fn(async () => ({})),
  } as unknown as SuiJsonRpcClient;
}

// Minimal Transaction stand-in for the `execute` callback → executeTx path.
function makeTx() {
  return { setSender: vi.fn(), build: vi.fn(async () => new Uint8Array([1, 2, 3])) };
}

function jsonResponse(status: number, payload: unknown): Response {
  return {
    status,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

afterEach(() => {
  vi.clearAllMocks();
  onChallengeRef.current = undefined;
  executeRef.current = undefined;
});

describe('payWithMpp', () => {
  it('reports paid + the real charged amount from the 402 challenge', async () => {
    fetchMock.mockImplementation(async () => {
      // Simulate mppx parsing a 402 challenge, then executing the payment PTB.
      await onChallengeRef.current?.({ request: { amount: '0.02' } });
      await executeRef.current?.(makeTx());
      return jsonResponse(200, { ok: true });
    });

    const result = await payWithMpp({
      signer: makeSigner(),
      client: makeClient(),
      options: { url: 'https://mpp.t2000.ai/x', method: 'POST', body: '{}', maxPrice: 0.05 },
    });

    expect(result.paid).toBe(true);
    expect(result.status).toBe(200);
    expect(result.cost).toBe(0.02); // challenge amount, NOT the 0.05 ceiling
    expect(result.body).toEqual({ ok: true });
    expect(result.receipt?.reference).toBeTypeOf('string');
  });

  it('reports not-paid (no charge) when no payment executes', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { cached: true }));

    const result = await payWithMpp({
      signer: makeSigner(),
      client: makeClient(),
      options: { url: 'https://mpp.t2000.ai/x', maxPrice: 0.05 },
    });

    expect(result.paid).toBe(false);
    expect(result.cost).toBeUndefined();
    expect(result.gasCostSui).toBeUndefined();
    expect(result.receipt).toBeUndefined();
  });

  it('falls back to maxPrice for cost when the challenge amount is unparseable', async () => {
    fetchMock.mockImplementation(async () => {
      await onChallengeRef.current?.({ request: {} }); // no amount
      await executeRef.current?.(makeTx());
      return jsonResponse(200, {});
    });

    const result = await payWithMpp({
      signer: makeSigner(),
      client: makeClient(),
      options: { url: 'https://mpp.t2000.ai/x', maxPrice: 0.07 },
    });

    expect(result.paid).toBe(true);
    expect(result.cost).toBe(0.07);
  });
});
