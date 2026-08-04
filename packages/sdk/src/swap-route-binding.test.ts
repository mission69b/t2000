import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import BN from 'bn.js';
import type { RouterDataV3 } from '@cetusprotocol/aggregator-sdk';

// S.902 A2 — quote→execute binding: when `serializedRoute` is passed to
// T2000.swap, the quoted route is BINDING (no silent re-discovery; the
// dogfood bug was quote FLOWXV3+AFTERMATH, execute OBRIC). Stale or
// mismatched routes fail loud with a re-quote instruction.

const findSwapRoute = vi.fn();
const buildSwapTx = vi.fn();

vi.mock('./protocols/cetus-swap.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./protocols/cetus-swap.js')>();
  return {
    ...actual,
    findSwapRoute: (...args: unknown[]) => findSwapRoute(...args),
    buildSwapTx: (...args: unknown[]) => buildSwapTx(...args),
  };
});

// Reaching executeTx proves route validation ACCEPTED the quoted route —
// the sentinel stops the test before any chain interaction.
const SENTINEL = 'SENTINEL_EXECUTE_REACHED';
vi.mock('./wallet/executeTx.js', () => ({
  executeTx: vi.fn(async () => {
    throw new Error(SENTINEL);
  }),
}));

import { T2000 } from './t2000.js';
import { T2000Error } from './errors.js';
import { serializeCetusRoute, type SwapRouteResult } from './protocols/cetus-swap.js';
import { USDC_TYPE } from './token-registry.js';

const SUI_TYPE = '0x2::sui::SUI';

const stubPath = (provider: string): RouterDataV3['paths'][number] => ({
  id: `pool_${provider}`,
  direction: true,
  provider,
  from: SUI_TYPE,
  target: USDC_TYPE,
  feeRate: 30,
  amountIn: '1000000000',
  amountOut: '3500000',
  version: 'v2',
});

function stubRoute(rawAmountIn: string): SwapRouteResult {
  return {
    routerData: {
      amountIn: new BN(rawAmountIn),
      amountOut: new BN('3500000'),
      byAmountIn: true,
      paths: [stubPath('FLOWXV3'), stubPath('AFTERMATH')],
      insufficientLiquidity: false,
      deviationRatio: 0.001,
    },
    amountIn: rawAmountIn,
    amountOut: '3500000',
    byAmountIn: true,
    priceImpact: 0.001,
    insufficientLiquidity: false,
  };
}

/** A quoted route for `1 SUI -> USDC` (1e9 raw), serialized as swapQuote
 *  returns it. `ageMs` back-dates discovery to simulate staleness. */
function quotedRoute(opts: { rawAmountIn?: string; ageMs?: number } = {}) {
  const s = serializeCetusRoute(stubRoute(opts.rawAmountIn ?? '1000000000'), {
    fromCoinType: SUI_TYPE,
    toCoinType: USDC_TYPE,
  });
  if (opts.ageMs) s.discoveredAt = Date.now() - opts.ageMs;
  return s;
}

function makeAgent(): T2000 {
  // SUI-side swaps gate ungated (approxUsdValue(SUI) = null) and SUI/USDC
  // decimals come from the registry — no config, no network before the
  // route-validation block under test.
  const kp = Ed25519Keypair.generate();
  return T2000.fromPrivateKey(kp.getSecretKey());
}

// The pre-swap balance snapshot (after validation, before executeTx) hits
// client.core.getBalance — stub it so the fresh-route test reaches the
// executeTx sentinel without a network read.
function stubBalance(agent: T2000) {
  (agent as unknown as { client: unknown }).client = {
    core: {
      getBalance: async () => ({ balance: { balance: '0' } }),
    },
  };
}

beforeEach(() => {
  findSwapRoute.mockReset();
  buildSwapTx.mockReset();
});

describe('T2000.swap serializedRoute binding', () => {
  it('a fresh matching quote executes WITHOUT re-discovery (findSwapRoute never called)', async () => {
    const agent = makeAgent();
    stubBalance(agent);
    await expect(
      agent.swap({ from: 'SUI', to: 'USDC', amount: 1, serializedRoute: quotedRoute() }),
    ).rejects.toThrow(SENTINEL);
    expect(findSwapRoute).not.toHaveBeenCalled();
  });

  it('a stale quote throws SWAP_QUOTE_STALE with re-quote guidance — no silent re-route', async () => {
    const agent = makeAgent();
    const err = await agent
      .swap({ from: 'SUI', to: 'USDC', amount: 1, serializedRoute: quotedRoute({ ageMs: 60_000 }) })
      .then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(T2000Error);
    expect((err as T2000Error).code).toBe('SWAP_QUOTE_STALE');
    expect((err as T2000Error).message).toMatch(/re-quote/i);
    expect(findSwapRoute).not.toHaveBeenCalled();
  });

  it('a coin-type mismatch throws SWAP_ROUTE_MISMATCH', async () => {
    const agent = makeAgent();
    const err = await agent
      // Quote was SUI->USDC; caller asks USDC->SUI.
      .swap({ from: 'USDC', to: 'SUI', amount: 1, serializedRoute: quotedRoute() })
      .then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(T2000Error);
    expect((err as T2000Error).code).toBe('SWAP_ROUTE_MISMATCH');
    expect(findSwapRoute).not.toHaveBeenCalled();
  });

  it('an amount mismatch throws SWAP_ROUTE_MISMATCH', async () => {
    const agent = makeAgent();
    const err = await agent
      // Quote was for 1 SUI (1e9 raw); caller executes 2 SUI.
      .swap({ from: 'SUI', to: 'USDC', amount: 2, serializedRoute: quotedRoute() })
      .then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(T2000Error);
    expect((err as T2000Error).code).toBe('SWAP_ROUTE_MISMATCH');
    expect(findSwapRoute).not.toHaveBeenCalled();
  });

  it('without serializedRoute the swap still discovers a route (back-compat)', async () => {
    const agent = makeAgent();
    stubBalance(agent);
    findSwapRoute.mockResolvedValueOnce(stubRoute('1000000000'));
    await expect(agent.swap({ from: 'SUI', to: 'USDC', amount: 1 })).rejects.toThrow(SENTINEL);
    expect(findSwapRoute).toHaveBeenCalledTimes(1);
  });
});
