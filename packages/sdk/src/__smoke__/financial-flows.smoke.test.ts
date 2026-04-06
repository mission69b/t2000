/**
 * Mainnet financial flow smoke tests — real transactions on Sui.
 *
 * Run with:  SMOKE=1 E2E_TEST_PRIVATE_KEY=suiprivkey1... pnpm --filter @t2000/sdk test
 *
 * Requires a funded test wallet with:
 *   - At least 0.1 USDC
 *   - Some SUI for gas (if not sponsored)
 *
 * Cost: ~$0.02-0.05 per run (gas only, amounts are minimal).
 */
import { describe, it, expect, beforeAll } from 'vitest';

const SMOKE = !!process.env.SMOKE;
const PRIVATE_KEY = process.env.E2E_TEST_PRIVATE_KEY;

let T2000: typeof import('../t2000.js').T2000;
let T2000Error: typeof import('../errors.js').T2000Error;
let assertAllowedAsset: typeof import('../constants.js').assertAllowedAsset;

beforeAll(async () => {
  if (!SMOKE) return;
  const sdk = await import('../t2000.js');
  const errors = await import('../errors.js');
  const constants = await import('../constants.js');
  T2000 = sdk.T2000;
  T2000Error = errors.T2000Error;
  assertAllowedAsset = constants.assertAllowedAsset;
});

describe.skipIf(!SMOKE)('Smoke: USDC enforcement (no-cost)', () => {
  it('assertAllowedAsset rejects save("USDT") at SDK level', () => {
    expect(() => assertAllowedAsset('save', 'USDT')).toThrow(T2000Error);
  });

  it('assertAllowedAsset rejects borrow("SUI") at SDK level', () => {
    expect(() => assertAllowedAsset('borrow', 'SUI')).toThrow(T2000Error);
  });

  it('assertAllowedAsset allows swap("USDT")', () => {
    expect(() => assertAllowedAsset('swap', 'USDT')).not.toThrow();
  });
});

describe.skipIf(!SMOKE || !PRIVATE_KEY)('Smoke: balance check (read-only)', () => {
  let agent: InstanceType<typeof T2000>;

  beforeAll(() => {
    agent = T2000.fromPrivateKey(PRIVATE_KEY!);
  });

  it('returns a valid balance response', async () => {
    const balance = await agent.balance();
    expect(balance.totalUsd).toBeGreaterThanOrEqual(0);
    expect(balance.available).toBeDefined();
    expect(Array.isArray(balance.holdings)).toBe(true);
    expect(balance.available.totalUsd).toBeGreaterThanOrEqual(0);
  });

  it('holdings include USDC if the wallet has any', async () => {
    const balance = await agent.balance();
    // Test wallet should have at least some USDC
    const usdc = balance.holdings.find(h => h.symbol === 'USDC');
    if (usdc) {
      expect(usdc.amount).toBeGreaterThan(0);
      expect(usdc.decimals).toBe(6);
    }
  });
});

describe.skipIf(!SMOKE || !PRIVATE_KEY)('Smoke: swap quote (read-only)', () => {
  let agent: InstanceType<typeof T2000>;

  beforeAll(() => {
    agent = T2000.fromPrivateKey(PRIVATE_KEY!);
  });

  it('returns a valid quote for USDC -> USDT', async () => {
    const quote = await agent.swapQuote({
      from: 'USDC',
      to: 'USDT',
      amount: 1,
    });
    expect(quote.fromToken).toBe('USDC');
    expect(quote.toToken).toBe('USDT');
    expect(quote.fromAmount).toBeGreaterThan(0);
    expect(quote.toAmount).toBeGreaterThan(0);
    expect(quote.priceImpact).toBeGreaterThanOrEqual(0);
    expect(quote.route).toBeTruthy();
  });

  it('returns a valid quote for SUI -> USDC', async () => {
    const quote = await agent.swapQuote({
      from: 'SUI',
      to: 'USDC',
      amount: 0.5,
    });
    expect(quote.fromToken).toBe('SUI');
    expect(quote.toToken).toBe('USDC');
    expect(quote.toAmount).toBeGreaterThan(0);
  });
});

describe.skipIf(!SMOKE || !PRIVATE_KEY)('Smoke: swap USDC -> USDT (real tx)', () => {
  let agent: InstanceType<typeof T2000>;

  beforeAll(() => {
    agent = T2000.fromPrivateKey(PRIVATE_KEY!);
  });

  it('executes a small swap and returns correct SwapResult shape', async () => {
    const result = await agent.swap({
      from: 'USDC',
      to: 'USDT',
      amount: 0.01,
    });

    expect(result.success).toBe(true);
    expect(result.tx).toBeTruthy();
    expect(result.tx.startsWith('0x') || result.tx.length > 10).toBe(true);
    expect(result.fromToken).toBe('USDC');
    expect(result.toToken).toBe('USDT');
    expect(result.fromAmount).toBeGreaterThan(0);
    expect(result.toAmount).toBeGreaterThan(0);
    expect(typeof result.priceImpact).toBe('number');
    expect(result.route).toBeTruthy();
    expect(result.gasCost).toBeGreaterThanOrEqual(0);
    expect(['self', 'gasStation', 'autoTopUp']).toContain(result.gasMethod);
  });
});

describe.skipIf(!SMOKE || !PRIVATE_KEY)('Smoke: save + withdraw USDC (real tx)', () => {
  let agent: InstanceType<typeof T2000>;

  beforeAll(() => {
    agent = T2000.fromPrivateKey(PRIVATE_KEY!);
  });

  it('deposits USDC into savings', async () => {
    const result = await agent.save({ amount: 0.01 });
    expect(result.success).toBe(true);
    expect(result.tx).toBeTruthy();
    expect(result.amount).toBeGreaterThan(0);
    expect(result.apy).toBeGreaterThanOrEqual(0);
  });

  it('rejects save("USDT") even with funds', async () => {
    await expect(
      agent.save({ amount: 0.01, asset: 'USDT' as 'USDC' }),
    ).rejects.toThrow(T2000Error);
  });

  it('withdraws USDC from savings', async () => {
    const result = await agent.withdraw({ amount: 0.01 });
    expect(result.success).toBe(true);
    expect(result.tx).toBeTruthy();
    expect(result.amount).toBeGreaterThan(0);
  });
});
