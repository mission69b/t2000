/**
 * Mainnet wallet flow smoke tests — real transactions on Sui (gRPC).
 *
 * Run with:  SMOKE=1 E2E_TEST_PRIVATE_KEY=suiprivkey1... pnpm --filter @t2000/sdk test
 *
 * Requires a funded test wallet with some SUI for gas + amounts. Cost is
 * minimal (gas + the tiny SUI/USDC amounts swapped/sent).
 *
 * Surface: balance (wallet-only), swap quote, swap (real tx), send (real tx).
 * The DeFi flows (save / withdraw / borrow / repay) were removed with NAVI.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { T2000Error as T2000ErrorType } from '../errors.js';

const SMOKE = !!process.env.SMOKE;
const PRIVATE_KEY = process.env.E2E_TEST_PRIVATE_KEY;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let T2000Class: any;
let T2000Error: typeof T2000ErrorType;
let assertAllowedAsset: typeof import('../constants.js').assertAllowedAsset;

beforeAll(async () => {
  if (!SMOKE) return;
  const sdk = await import('../t2000.js');
  const errors = await import('../errors.js');
  const constants = await import('../constants.js');
  T2000Class = sdk.T2000;
  T2000Error = errors.T2000Error;
  assertAllowedAsset = constants.assertAllowedAsset;
});

describe.skipIf(!SMOKE)('Smoke: send allow-list enforcement (no-cost)', () => {
  it('assertAllowedAsset rejects send("USDT") at SDK level', () => {
    expect(() => assertAllowedAsset('send', 'USDT')).toThrow(T2000Error);
  });

  it('assertAllowedAsset allows send("SUI")', () => {
    expect(() => assertAllowedAsset('send', 'SUI')).not.toThrow();
  });

  it('assertAllowedAsset allows swap("USDT") (wildcard)', () => {
    expect(() => assertAllowedAsset('swap', 'USDT')).not.toThrow();
  });
});

describe.skipIf(!SMOKE || !PRIVATE_KEY)('Smoke: balance check (read-only, gRPC)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let agent: any;

  beforeAll(() => {
    agent = T2000Class.fromPrivateKey(PRIVATE_KEY!);
  });

  it('returns a wallet-only balance response', async () => {
    const balance = await agent.balance();
    expect(balance.totalUsd).toBeGreaterThanOrEqual(0);
    expect(typeof balance.available).toBe('number');
    expect(typeof balance.sui.amount).toBe('number');
    expect(typeof balance.sui.usdValue).toBe('number');
    expect(balance.stables).toBeDefined();
    // DeFi fields are gone.
    expect('savings' in balance).toBe(false);
    expect('gasReserve' in balance).toBe(false);
  });
});

describe.skipIf(!SMOKE || !PRIVATE_KEY)('Smoke: history (read-only, GraphQL)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let agent: any;

  beforeAll(() => {
    agent = T2000Class.fromPrivateKey(PRIVATE_KEY!);
  });

  it('returns a transaction record array', async () => {
    const history = await agent.history({ limit: 5 });
    expect(Array.isArray(history)).toBe(true);
  });
});

describe.skipIf(!SMOKE || !PRIVATE_KEY)('Smoke: swap quote (read-only)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let agent: any;

  beforeAll(() => {
    agent = T2000Class.fromPrivateKey(PRIVATE_KEY!);
  });

  it('returns a valid quote for SUI -> USDC', async () => {
    const quote = await agent.swapQuote({ from: 'SUI', to: 'USDC', amount: 0.5 });
    expect(quote.fromToken).toBe('SUI');
    expect(quote.toToken).toBe('USDC');
    expect(quote.toAmount).toBeGreaterThan(0);
    expect(quote.route).toBeTruthy();
  });
});

describe.skipIf(!SMOKE || !PRIVATE_KEY)('Smoke: swap SUI -> USDC (real tx, gRPC execute)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let agent: any;

  beforeAll(() => {
    agent = T2000Class.fromPrivateKey(PRIVATE_KEY!);
  });

  it('executes a small swap and returns the SwapResult shape', async () => {
    const result = await agent.swap({ from: 'SUI', to: 'USDC', amount: 0.2 });
    expect(result.success).toBe(true);
    expect(result.tx).toBeTruthy();
    expect(result.fromToken).toBe('SUI');
    expect(result.toToken).toBe('USDC');
    expect(result.toAmount).toBeGreaterThan(0);
    expect(result.gasCost).toBeGreaterThanOrEqual(0);
  });
});

describe.skipIf(!SMOKE || !PRIVATE_KEY)('Smoke: send SUI (real tx, gRPC execute)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let agent: any;

  beforeAll(() => {
    agent = T2000Class.fromPrivateKey(PRIVATE_KEY!);
  });

  it('sends a tiny SUI transfer to self and returns the SendResult shape', async () => {
    const result = await agent.send({ to: agent.address(), amount: 0.01, asset: 'SUI' });
    expect(result.success).toBe(true);
    expect(result.tx).toBeTruthy();
    expect(result.amount).toBeGreaterThan(0);
  });
});
