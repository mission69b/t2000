import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SwapResult, SwapQuoteResult } from '../types.js';

const SWAP_RESULT_KEYS: (keyof SwapResult)[] = [
  'success', 'tx', 'fromToken', 'toToken',
  'fromAmount', 'toAmount', 'priceImpact', 'route',
  'gasCost',
];

const SWAP_QUOTE_KEYS: (keyof SwapQuoteResult)[] = [
  'fromToken', 'toToken', 'fromAmount', 'toAmount', 'priceImpact', 'route',
];

describe('SwapResult shape contract', () => {
  it('defines all required fields with correct types', () => {
    const mock: SwapResult = {
      success: true,
      tx: '0xabc123',
      fromToken: 'USDC',
      toToken: 'USDT',
      fromAmount: 1.0,
      toAmount: 0.999,
      priceImpact: 0.001,
      route: 'Cetus Aggregator',
      gasCost: 0.002,
    };

    for (const key of SWAP_RESULT_KEYS) {
      expect(mock).toHaveProperty(key);
      expect(mock[key]).toBeDefined();
    }

    expect(typeof mock.success).toBe('boolean');
    expect(typeof mock.tx).toBe('string');
    expect(typeof mock.fromToken).toBe('string');
    expect(typeof mock.toToken).toBe('string');
    expect(typeof mock.fromAmount).toBe('number');
    expect(typeof mock.toAmount).toBe('number');
    expect(typeof mock.priceImpact).toBe('number');
    expect(typeof mock.route).toBe('string');
    expect(typeof mock.gasCost).toBe('number');
  });

  it('SwapQuoteResult has the subset of fields needed for quoting', () => {
    const mock: SwapQuoteResult = {
      fromToken: 'USDC',
      toToken: 'USDT',
      fromAmount: 1.0,
      toAmount: 0.999,
      priceImpact: 0.001,
      route: 'Cetus',
    };

    for (const key of SWAP_QUOTE_KEYS) {
      expect(mock).toHaveProperty(key);
    }
  });
});

describe('findSwapRoute', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns null when no route is found', async () => {
    vi.doMock('@cetusprotocol/aggregator-sdk', () => ({
      AggregatorClient: class {
        async findRouters() { return null; }
      },
      Env: { Mainnet: 'mainnet' },
    }));

    const { findSwapRoute } = await import('./cetus-swap.js');
    const result = await findSwapRoute({
      walletAddress: '0x' + 'a'.repeat(64),
      from: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      to: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
      amount: 1000000n,
      byAmountIn: true,
    });

    expect(result).toBeNull();
  });

  it('returns route data with amountIn/amountOut when route exists', async () => {
    vi.doMock('@cetusprotocol/aggregator-sdk', () => ({
      AggregatorClient: class {
        async findRouters() {
          return {
            amountIn: '1000000',
            amountOut: '999000',
            insufficientLiquidity: false,
            deviationRatio: 0.001,
            paths: [{ provider: 'Cetus' }],
          };
        }
      },
      Env: { Mainnet: 'mainnet' },
    }));

    const { findSwapRoute } = await import('./cetus-swap.js');
    const result = await findSwapRoute({
      walletAddress: '0x' + 'a'.repeat(64),
      from: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      to: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
      amount: 1000000n,
      byAmountIn: true,
    });

    expect(result).not.toBeNull();
    expect(result!.amountIn).toBe('1000000');
    expect(result!.amountOut).toBe('999000');
    expect(result!.priceImpact).toBe(0.001);
    expect(result!.insufficientLiquidity).toBe(false);
  });

  it('flags insufficient liquidity', async () => {
    vi.doMock('@cetusprotocol/aggregator-sdk', () => ({
      AggregatorClient: class {
        async findRouters() {
          return {
            amountIn: '0',
            amountOut: '0',
            insufficientLiquidity: true,
            deviationRatio: 0,
          };
        }
      },
      Env: { Mainnet: 'mainnet' },
    }));

    const { findSwapRoute } = await import('./cetus-swap.js');
    const result = await findSwapRoute({
      walletAddress: '0x' + 'a'.repeat(64),
      from: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      to: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
      amount: 1000000n,
      byAmountIn: true,
    });

    expect(result).not.toBeNull();
    expect(result!.insufficientLiquidity).toBe(true);
  });

  it('forwards providers allow-list to Cetus findRouters', async () => {
    const findRoutersSpy = vi.fn().mockResolvedValue({
      amountIn: '1000000', amountOut: '999000', insufficientLiquidity: false, deviationRatio: 0.001,
    });
    vi.doMock('@cetusprotocol/aggregator-sdk', () => ({
      AggregatorClient: class {
        findRouters = findRoutersSpy;
      },
      Env: { Mainnet: 'mainnet' },
    }));

    const { findSwapRoute } = await import('./cetus-swap.js');
    await findSwapRoute({
      walletAddress: '0x' + 'a'.repeat(64),
      from: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      to: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
      amount: 1000000n,
      byAmountIn: true,
      providers: ['CETUS', 'BLUEFIN', 'KRIYAV3'],
    });

    expect(findRoutersSpy).toHaveBeenCalledWith(
      expect.objectContaining({ providers: ['CETUS', 'BLUEFIN', 'KRIYAV3'] }),
    );
  });

  it('omits providers field when not specified (default = all DEXes)', async () => {
    const findRoutersSpy = vi.fn().mockResolvedValue({
      amountIn: '1000000', amountOut: '999000', insufficientLiquidity: false, deviationRatio: 0.001,
    });
    vi.doMock('@cetusprotocol/aggregator-sdk', () => ({
      AggregatorClient: class {
        findRouters = findRoutersSpy;
      },
      Env: { Mainnet: 'mainnet' },
    }));

    const { findSwapRoute } = await import('./cetus-swap.js');
    await findSwapRoute({
      walletAddress: '0x' + 'a'.repeat(64),
      from: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      to: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
      amount: 1000000n,
      byAmountIn: true,
    });

    const callArgs = findRoutersSpy.mock.calls[0][0];
    expect(callArgs.providers).toBeUndefined();
  });
});

describe('per-call overlay fee config (B5 v2)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('CLI / direct SDK swap (no overlayFee arg) does NOT pass overlay config to AggregatorClient', async () => {
    const ctorSpy = vi.fn();
    vi.doMock('@cetusprotocol/aggregator-sdk', () => ({
      AggregatorClient: class {
        constructor(opts: unknown) { ctorSpy(opts); }
        async findRouters() {
          return { amountIn: '1000000', amountOut: '999000', insufficientLiquidity: false, deviationRatio: 0.001 };
        }
      },
      Env: { Mainnet: 'mainnet' },
    }));

    const { findSwapRoute } = await import('./cetus-swap.js');
    await findSwapRoute({
      walletAddress: '0x' + 'a'.repeat(64),
      from: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      to: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
      amount: 1000000n,
      byAmountIn: true,
    });

    expect(ctorSpy).toHaveBeenCalledOnce();
    const opts = ctorSpy.mock.calls[0][0];
    expect(opts.overlayFeeRate).toBeUndefined();
    expect(opts.overlayFeeReceiver).toBeUndefined();
  });

  it('Audric-style swap (overlayFee provided) DOES pass overlay config to AggregatorClient', async () => {
    const ctorSpy = vi.fn();
    vi.doMock('@cetusprotocol/aggregator-sdk', () => ({
      AggregatorClient: class {
        constructor(opts: unknown) { ctorSpy(opts); }
        async findRouters() {
          return { amountIn: '1000000', amountOut: '999000', insufficientLiquidity: false, deviationRatio: 0.001 };
        }
      },
      Env: { Mainnet: 'mainnet' },
    }));

    const { findSwapRoute } = await import('./cetus-swap.js');
    await findSwapRoute({
      walletAddress: '0x' + 'a'.repeat(64),
      from: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      to: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
      amount: 1000000n,
      byAmountIn: true,
      overlayFee: {
        rate: 0.001,
        receiver: '0x5366efbf2b4fe5767fe2e78eb197aa5f5d138d88ac3333fbf3f80a1927da473a',
      },
    });

    expect(ctorSpy).toHaveBeenCalledOnce();
    const opts = ctorSpy.mock.calls[0][0];
    expect(opts.overlayFeeRate).toBe(0.001);
    expect(opts.overlayFeeReceiver).toBe('0x5366efbf2b4fe5767fe2e78eb197aa5f5d138d88ac3333fbf3f80a1927da473a');
  });

  it('client cache key includes overlay config — different overlay = different client instance', async () => {
    const ctorSpy = vi.fn();
    vi.doMock('@cetusprotocol/aggregator-sdk', () => ({
      AggregatorClient: class {
        constructor(opts: unknown) { ctorSpy(opts); }
        async findRouters() {
          return { amountIn: '1000000', amountOut: '999000', insufficientLiquidity: false, deviationRatio: 0.001 };
        }
      },
      Env: { Mainnet: 'mainnet' },
    }));

    const { findSwapRoute } = await import('./cetus-swap.js');
    const baseParams = {
      walletAddress: '0x' + 'a'.repeat(64),
      from: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      to: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
      amount: 1000000n,
      byAmountIn: true,
    };

    // First call — no overlay (CLI path)
    await findSwapRoute(baseParams);
    // Second call — same wallet but with overlay (Audric path)
    await findSwapRoute({ ...baseParams, overlayFee: { rate: 0.001, receiver: '0x' + 'b'.repeat(64) } });
    // Third call — same wallet, no overlay → should hit cache from call 1
    await findSwapRoute(baseParams);

    // Two distinct clients constructed (CLI variant + Audric variant); third call reused client 1
    expect(ctorSpy).toHaveBeenCalledTimes(2);
  });
});

describe('addSwapToTx (SPEC 7 P2.2.3 chain + wallet mode appender)', () => {
  const VALID_ADDRESS = '0x' + 'a'.repeat(64);
  const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
  const USDT_TYPE = '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT';

  beforeEach(() => {
    vi.resetModules();
  });

  function mockCetus(overrides: { findRouters?: unknown; routerSwap?: unknown } = {}) {
    const findRouters = overrides.findRouters ?? (async () => ({
      amountIn: '5000000',
      amountOut: '4995000',
      insufficientLiquidity: false,
      deviationRatio: 0.001,
      paths: [{ provider: 'Cetus' }],
    }));
    const routerSwap = overrides.routerSwap ?? (async () => {
      return { $kind: 'NestedResult', NestedResult: [99, 0] } as unknown;
    });

    vi.doMock('@cetusprotocol/aggregator-sdk', () => ({
      AggregatorClient: class {
        async findRouters(...args: unknown[]) { return (findRouters as (...a: unknown[]) => unknown)(...args); }
        async routerSwap(...args: unknown[]) { return (routerSwap as (...a: unknown[]) => unknown)(...args); }
      },
      Env: { Mainnet: 'mainnet' },
    }));
  }

  function mockClient(coins: Array<{ coinObjectId: string; balance: string }>) {
    const totalBalance = coins.reduce((acc, c) => acc + BigInt(c.balance), 0n);
    const getBalance = vi.fn().mockResolvedValue({
      coinType: 'unused',
      coinObjectCount: coins.length,
      totalBalance: totalBalance.toString(),
      lockedBalance: {},
    });
    const getCoins = vi.fn().mockResolvedValue({
      data: coins,
      nextCursor: null,
      hasNextPage: false,
    });
    return { getBalance, getCoins } as unknown as Parameters<typeof import('./cetus-swap.js').addSwapToTx>[1];
  }

  it('wallet mode (USDC → USDT): fetches coins, builds tx, returns expected shape', async () => {
    mockCetus();
    const { addSwapToTx } = await import('./cetus-swap.js');
    const { Transaction } = await import('@mysten/sui/transactions');

    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([
      { coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' },
    ]);

    const result = await addSwapToTx(tx, client, VALID_ADDRESS, {
      from: USDC_TYPE,
      to: USDT_TYPE,
      amount: 5,
    });

    expect(result.coin).toBeDefined();
    expect(result.effectiveAmountIn).toBeCloseTo(5, 6);
    expect(result.expectedAmountOut).toBeCloseTo(4.995, 6);
    expect(result.route.amountIn).toBe('5000000');
    expect(result.route.insufficientLiquidity).toBe(false);
  });

  it('chain mode (inputCoin provided): does NOT fetch coins, consumes the ref', async () => {
    mockCetus();
    const { addSwapToTx } = await import('./cetus-swap.js');
    const { Transaction } = await import('@mysten/sui/transactions');

    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([]);
    const [upstreamCoin] = tx.splitCoins(tx.gas, [5_000_000n]);

    const result = await addSwapToTx(tx, client, VALID_ADDRESS, {
      from: USDC_TYPE,
      to: USDT_TYPE,
      amount: 5,
      inputCoin: upstreamCoin,
    });

    expect(result.coin).toBeDefined();
    expect(result.effectiveAmountIn).toBeCloseTo(5, 6);
    expect((client as unknown as { getCoins: ReturnType<typeof vi.fn> }).getCoins).not.toHaveBeenCalled();
  });

  it('wallet mode swapAll: requested >= total balance → consumes the entire merged primary', async () => {
    mockCetus({
      findRouters: async () => ({
        amountIn: '3000000',
        amountOut: '2997000',
        insufficientLiquidity: false,
        deviationRatio: 0.001,
      }),
    });
    const { addSwapToTx } = await import('./cetus-swap.js');
    const { Transaction } = await import('@mysten/sui/transactions');

    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([
      { coinObjectId: '0x' + '1'.repeat(64), balance: '2000000' },
      { coinObjectId: '0x' + '2'.repeat(64), balance: '1000000' },
    ]);

    const result = await addSwapToTx(tx, client, VALID_ADDRESS, {
      from: USDC_TYPE,
      to: USDT_TYPE,
      amount: 999,
    });

    expect(result.effectiveAmountIn).toBeCloseTo(3, 6);
    // After address-balance migration, no MergeCoins command is emitted
    // at PTB construction — `coinWithBalance` defers merge/split into
    // the resolver at `tx.build()` time.
  });

  it('throws on same-token swap', async () => {
    mockCetus();
    const { addSwapToTx } = await import('./cetus-swap.js');
    const { Transaction } = await import('@mysten/sui/transactions');

    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([]);

    await expect(
      addSwapToTx(tx, client, VALID_ADDRESS, { from: USDC_TYPE, to: USDC_TYPE, amount: 1 }),
    ).rejects.toThrow('Cannot swap a token to itself');
  });

  it('throws on unknown token', async () => {
    mockCetus();
    const { addSwapToTx } = await import('./cetus-swap.js');
    const { Transaction } = await import('@mysten/sui/transactions');

    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([]);

    await expect(
      addSwapToTx(tx, client, VALID_ADDRESS, { from: 'NOT_A_TOKEN', to: USDT_TYPE, amount: 1 }),
    ).rejects.toThrow('Unknown token');
  });

  it('throws on zero amount', async () => {
    mockCetus();
    const { addSwapToTx } = await import('./cetus-swap.js');
    const { Transaction } = await import('@mysten/sui/transactions');

    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([{ coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' }]);

    await expect(
      addSwapToTx(tx, client, VALID_ADDRESS, { from: USDC_TYPE, to: USDT_TYPE, amount: 0 }),
    ).rejects.toThrow('greater than zero');
  });

  it('throws on insufficient liquidity from route', async () => {
    mockCetus({
      findRouters: async () => ({
        amountIn: '0', amountOut: '0', insufficientLiquidity: true, deviationRatio: 0,
      }),
    });
    const { addSwapToTx } = await import('./cetus-swap.js');
    const { Transaction } = await import('@mysten/sui/transactions');

    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([{ coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' }]);

    await expect(
      addSwapToTx(tx, client, VALID_ADDRESS, { from: USDC_TYPE, to: USDT_TYPE, amount: 5 }),
    ).rejects.toThrow('Insufficient liquidity');
  });

  it('throws when no coins found in wallet (wallet mode)', async () => {
    mockCetus();
    const { addSwapToTx } = await import('./cetus-swap.js');
    const { Transaction } = await import('@mysten/sui/transactions');

    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([]);

    await expect(
      addSwapToTx(tx, client, VALID_ADDRESS, { from: USDC_TYPE, to: USDT_TYPE, amount: 5 }),
    ).rejects.toThrow();
  });

  it('throws when route is null (no route found)', async () => {
    mockCetus({ findRouters: async () => null });
    const { addSwapToTx } = await import('./cetus-swap.js');
    const { Transaction } = await import('@mysten/sui/transactions');

    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([{ coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' }]);

    await expect(
      addSwapToTx(tx, client, VALID_ADDRESS, { from: USDC_TYPE, to: USDT_TYPE, amount: 5 }),
    ).rejects.toThrow('No swap route');
  });

  it('clamps slippage to [0.001, 0.05] range', async () => {
    let capturedSlippage: number | undefined;
    mockCetus({
      routerSwap: async ({ slippage }: { slippage: number }) => {
        capturedSlippage = slippage;
        return { $kind: 'NestedResult', NestedResult: [99, 0] } as unknown;
      },
    });
    const { addSwapToTx } = await import('./cetus-swap.js');
    const { Transaction } = await import('@mysten/sui/transactions');

    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([{ coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' }]);

    // Above max → clamped to 0.05
    await addSwapToTx(tx, client, VALID_ADDRESS, {
      from: USDC_TYPE, to: USDT_TYPE, amount: 5, slippage: 0.99,
    });
    expect(capturedSlippage).toBe(0.05);

    // Below min → clamped to 0.001
    const tx2 = new Transaction();
    tx2.setSender(VALID_ADDRESS);
    await addSwapToTx(tx2, client, VALID_ADDRESS, {
      from: USDC_TYPE, to: USDT_TYPE, amount: 5, slippage: 0.0001,
    });
    expect(capturedSlippage).toBe(0.001);
  });

  it('forwards providers allow-list to findSwapRoute (sponsored Pyth-exclusion)', async () => {
    const findRoutersSpy = vi.fn().mockResolvedValue({
      amountIn: '5000000', amountOut: '4995000', insufficientLiquidity: false,
      deviationRatio: 0.001, paths: [{ provider: 'CETUS' }],
    });
    vi.doMock('@cetusprotocol/aggregator-sdk', () => ({
      AggregatorClient: class {
        findRouters = findRoutersSpy;
        async routerSwap() { return { $kind: 'NestedResult', NestedResult: [99, 0] } as unknown; }
      },
      Env: { Mainnet: 'mainnet' },
    }));

    const { addSwapToTx } = await import('./cetus-swap.js');
    const { Transaction } = await import('@mysten/sui/transactions');

    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([
      { coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' },
    ]);

    await addSwapToTx(tx, client, VALID_ADDRESS, {
      from: USDC_TYPE,
      to: USDT_TYPE,
      amount: 5,
      providers: ['CETUS', 'BLUEFIN', 'KRIYAV3'],
    });

    expect(findRoutersSpy).toHaveBeenCalledWith(
      expect.objectContaining({ providers: ['CETUS', 'BLUEFIN', 'KRIYAV3'] }),
    );
  });

  // [Bug A defense-in-depth tests / 2026-05-10]
  // Asserts: a precomputed route whose paths walk an EXCLUDED provider
  // (Pyth-dependent, e.g. HAEDALPMM) MUST trigger fresh route discovery
  // even though amountIn/byAmountIn match. Without this fallback, a stale
  // `pending_action.cetusRoute` from an old engine version would slip
  // through to Cetus's `routerSwap`, which would insert the
  // `tx.splitCoins(tx.gas, ...)` Pyth fee call → Enoki rejects with
  // HTTP 400 "Cannot use GasCoin as a transaction argument".
  it('falls back to fresh discovery when precomputedRoute walks an excluded provider', async () => {
    const findRoutersSpy = vi.fn().mockResolvedValue({
      amountIn: '5000000', amountOut: '4995000', insufficientLiquidity: false,
      deviationRatio: 0.001, paths: [{ provider: 'CETUS' }],
    });
    vi.doMock('@cetusprotocol/aggregator-sdk', () => ({
      AggregatorClient: class {
        findRouters = findRoutersSpy;
        async routerSwap() { return { $kind: 'NestedResult', NestedResult: [99, 0] } as unknown; }
      },
      Env: { Mainnet: 'mainnet' },
    }));
    const { addSwapToTx } = await import('./cetus-swap.js');
    const { Transaction } = await import('@mysten/sui/transactions');

    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([
      { coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' },
    ]);

    // Precomputed route walks HAEDALPMM (Pyth-dependent, in the
    // SPONSORED_PYTH_DEPENDENT_PROVIDERS exclusion list).
    const stalePythRoute = {
      routerData: {
        amountIn: { toString: () => '5000000' },
        amountOut: { toString: () => '4995000' },
        byAmountIn: true,
        paths: [{ provider: 'HAEDALPMM', from: USDC_TYPE, target: USDT_TYPE }],
        insufficientLiquidity: false,
        deviationRatio: 0.001,
      },
      amountIn: '5000000',
      amountOut: '4995000',
      byAmountIn: true,
      priceImpact: 0.001,
      insufficientLiquidity: false,
    } as unknown as Parameters<typeof addSwapToTx>[3]['precomputedRoute'];

    const result = await addSwapToTx(tx, client, VALID_ADDRESS, {
      from: USDC_TYPE,
      to: USDT_TYPE,
      amount: 5,
      precomputedRoute: stalePythRoute,
      // Caller passes the sponsor-safe providers list (excludes HAEDALPMM).
      providers: ['CETUS', 'BLUEFIN', 'KRIYAV3', 'TURBOS'],
    });

    // Fresh discovery WAS invoked (precomputed route was rejected).
    expect(findRoutersSpy).toHaveBeenCalledTimes(1);
    expect(result.usedPrecomputedRoute).toBe(false);
  });

  it('uses precomputedRoute when all paths are in the providers allow-list', async () => {
    const findRoutersSpy = vi.fn();
    vi.doMock('@cetusprotocol/aggregator-sdk', () => ({
      AggregatorClient: class {
        findRouters = findRoutersSpy;
        async routerSwap() { return { $kind: 'NestedResult', NestedResult: [99, 0] } as unknown; }
      },
      Env: { Mainnet: 'mainnet' },
    }));
    const { addSwapToTx } = await import('./cetus-swap.js');
    const { Transaction } = await import('@mysten/sui/transactions');

    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([
      { coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' },
    ]);

    const safeRoute = {
      routerData: {
        amountIn: { toString: () => '5000000' },
        amountOut: { toString: () => '4995000' },
        byAmountIn: true,
        paths: [
          { provider: 'CETUS', from: USDC_TYPE, target: USDT_TYPE },
          { provider: 'BLUEFIN', from: USDC_TYPE, target: USDT_TYPE },
        ],
        insufficientLiquidity: false,
        deviationRatio: 0.001,
      },
      amountIn: '5000000',
      amountOut: '4995000',
      byAmountIn: true,
      priceImpact: 0.001,
      insufficientLiquidity: false,
    } as unknown as Parameters<typeof addSwapToTx>[3]['precomputedRoute'];

    const result = await addSwapToTx(tx, client, VALID_ADDRESS, {
      from: USDC_TYPE,
      to: USDT_TYPE,
      amount: 5,
      precomputedRoute: safeRoute,
      providers: ['CETUS', 'BLUEFIN', 'KRIYAV3', 'TURBOS'],
    });

    // Precomputed route was used (no fresh discovery call).
    expect(findRoutersSpy).not.toHaveBeenCalled();
    expect(result.usedPrecomputedRoute).toBe(true);
  });
});

describe('isPrecomputedRouteCompatibleWithProviders (Bug A helper)', () => {
  // Pure helper — no mocks required. Covers the matrix of:
  //   - undefined providers (non-sponsored caller → always compatible)
  //   - empty providers (treated same as undefined to keep the no-op
  //     semantics symmetric with `findSwapRoute`)
  //   - single-path route, all paths allowed → compatible
  //   - single-path route, path excluded → incompatible
  //   - multi-path route, one path excluded → incompatible (split routes
  //     fail-closed: ANY excluded path triggers fresh discovery, since
  //     each path leg can independently insert the Pyth update fee
  //     `tx.splitCoins(tx.gas, ...)` call inside Cetus's `routerSwap`).
  type RouteForTest = Parameters<typeof import('./cetus-swap.js').isPrecomputedRouteCompatibleWithProviders>[0];

  function makeRoute(providers: string[]): RouteForTest {
    return {
      routerData: {
        amountIn: { toString: () => '0' },
        amountOut: { toString: () => '0' },
        byAmountIn: true,
        paths: providers.map((provider) => ({ provider })),
        insufficientLiquidity: false,
        deviationRatio: 0,
      },
      amountIn: '0',
      amountOut: '0',
      byAmountIn: true,
      priceImpact: 0,
      insufficientLiquidity: false,
    } as unknown as RouteForTest;
  }

  it('returns true when providers is undefined (non-sponsored caller)', async () => {
    const { isPrecomputedRouteCompatibleWithProviders } = await import('./cetus-swap.js');
    expect(isPrecomputedRouteCompatibleWithProviders(makeRoute(['HAEDALPMM']), undefined)).toBe(true);
  });

  it('returns true when providers is empty (treated as no allow-list)', async () => {
    const { isPrecomputedRouteCompatibleWithProviders } = await import('./cetus-swap.js');
    expect(isPrecomputedRouteCompatibleWithProviders(makeRoute(['HAEDALPMM']), [])).toBe(true);
  });

  it('returns true when every path provider is in the allow-list', async () => {
    const { isPrecomputedRouteCompatibleWithProviders } = await import('./cetus-swap.js');
    expect(
      isPrecomputedRouteCompatibleWithProviders(
        makeRoute(['CETUS', 'BLUEFIN']),
        ['CETUS', 'BLUEFIN', 'TURBOS', 'KRIYAV3'],
      ),
    ).toBe(true);
  });

  it('returns false when any single path provider is excluded', async () => {
    const { isPrecomputedRouteCompatibleWithProviders } = await import('./cetus-swap.js');
    expect(
      isPrecomputedRouteCompatibleWithProviders(
        makeRoute(['HAEDALPMM']),
        ['CETUS', 'BLUEFIN', 'TURBOS'],
      ),
    ).toBe(false);
  });

  it('returns false when ANY path in a split route is excluded (multi-DEX safety)', async () => {
    const { isPrecomputedRouteCompatibleWithProviders } = await import('./cetus-swap.js');
    expect(
      isPrecomputedRouteCompatibleWithProviders(
        makeRoute(['CETUS', 'OBRIC', 'BLUEFIN']), // OBRIC is Pyth-dependent
        ['CETUS', 'BLUEFIN', 'TURBOS'],
      ),
    ).toBe(false);
  });
});
