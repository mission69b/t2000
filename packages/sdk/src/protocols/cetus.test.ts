import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

const mockFindRouters = vi.fn();
const mockFastRouterSwap = vi.fn();

vi.mock('@cetusprotocol/aggregator-sdk', () => ({
  AggregatorClient: vi.fn().mockImplementation(() => ({
    findRouters: mockFindRouters,
    fastRouterSwap: mockFastRouterSwap,
  })),
  Env: { Mainnet: 0, Testnet: 1 },
}));

const { buildSwapTx, getSwapQuote, getPoolPrice } = await import('./cetus.js');
const { AggregatorClient } = await import('@cetusprotocol/aggregator-sdk');

function mockBN(value: string) {
  return { toString: () => value, toNumber: () => Number(value) };
}

function makeRouterResult(overrides: Record<string, unknown> = {}) {
  return {
    amountIn: mockBN('100000000'),
    amountOut: mockBN('28571428'),
    byAmountIn: true,
    paths: [{ id: 'pool-1', provider: 'CETUS', from: '0x...usdc', target: '0x2::sui::SUI', direction: true, feeRate: 0.003, amountIn: '100000000', amountOut: '28571428' }],
    insufficientLiquidity: false,
    deviationRatio: 0.001,
    ...overrides,
  };
}

describe('protocols/cetus - Aggregator V3', () => {
  const mockClient = {
    getObject: vi.fn(),
    getBalance: vi.fn(),
    signAndExecuteTransaction: vi.fn(),
    waitForTransaction: vi.fn(),
  } as unknown as SuiClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildSwapTx', () => {
    it('creates AggregatorClient with correct params', async () => {
      const routerResult = makeRouterResult();
      mockFindRouters.mockResolvedValue(routerResult);
      mockFastRouterSwap.mockResolvedValue(undefined);

      await buildSwapTx({
        client: mockClient,
        address: '0xuser123',
        fromAsset: 'USDC',
        toAsset: 'SUI',
        amount: 100,
      });

      expect(AggregatorClient).toHaveBeenCalledWith({
        client: mockClient,
        signer: '0xuser123',
        env: 0,
      });
    });

    it('calls findRouters with correct coin types and raw amount', async () => {
      const routerResult = makeRouterResult();
      mockFindRouters.mockResolvedValue(routerResult);
      mockFastRouterSwap.mockResolvedValue(undefined);

      await buildSwapTx({
        client: mockClient,
        address: '0xuser',
        fromAsset: 'USDC',
        toAsset: 'SUI',
        amount: 100,
      });

      expect(mockFindRouters).toHaveBeenCalledWith({
        from: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
        target: '0x2::sui::SUI',
        amount: 100_000_000n,
        byAmountIn: true,
      });
    });

    it('calls findRouters with SUI → USDC direction', async () => {
      const routerResult = makeRouterResult({ amountOut: mockBN('350000000') });
      mockFindRouters.mockResolvedValue(routerResult);
      mockFastRouterSwap.mockResolvedValue(undefined);

      await buildSwapTx({
        client: mockClient,
        address: '0xuser',
        fromAsset: 'SUI',
        toAsset: 'USDC',
        amount: 1,
      });

      expect(mockFindRouters).toHaveBeenCalledWith({
        from: '0x2::sui::SUI',
        target: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
        amount: 1_000_000_000n,
        byAmountIn: true,
      });
    });

    it('calls fastRouterSwap with correct slippage', async () => {
      const routerResult = makeRouterResult();
      mockFindRouters.mockResolvedValue(routerResult);
      mockFastRouterSwap.mockResolvedValue(undefined);

      await buildSwapTx({
        client: mockClient,
        address: '0xuser',
        fromAsset: 'USDC',
        toAsset: 'SUI',
        amount: 100,
        maxSlippageBps: 50,
      });

      expect(mockFastRouterSwap).toHaveBeenCalledWith(
        expect.objectContaining({
          router: routerResult,
          slippage: 0.005,
          txb: expect.any(Transaction),
        }),
      );
    });

    it('uses default 3% slippage when not specified', async () => {
      const routerResult = makeRouterResult();
      mockFindRouters.mockResolvedValue(routerResult);
      mockFastRouterSwap.mockResolvedValue(undefined);

      await buildSwapTx({
        client: mockClient,
        address: '0xuser',
        fromAsset: 'USDC',
        toAsset: 'SUI',
        amount: 100,
      });

      expect(mockFastRouterSwap).toHaveBeenCalledWith(
        expect.objectContaining({ slippage: 0.03 }),
      );
    });

    it('returns Transaction with correct estimatedOut and toDecimals', async () => {
      const routerResult = makeRouterResult({ amountOut: mockBN('28571428') });
      mockFindRouters.mockResolvedValue(routerResult);
      mockFastRouterSwap.mockResolvedValue(undefined);

      const result = await buildSwapTx({
        client: mockClient,
        address: '0xuser',
        fromAsset: 'USDC',
        toAsset: 'SUI',
        amount: 100,
      });

      expect(result.tx).toBeInstanceOf(Transaction);
      expect(result.estimatedOut).toBe(28571428);
      expect(result.toDecimals).toBe(9);
    });

    it('returns correct toDecimals for USDC output', async () => {
      const routerResult = makeRouterResult({ amountOut: mockBN('3500000') });
      mockFindRouters.mockResolvedValue(routerResult);
      mockFastRouterSwap.mockResolvedValue(undefined);

      const result = await buildSwapTx({
        client: mockClient,
        address: '0xuser',
        fromAsset: 'SUI',
        toAsset: 'USDC',
        amount: 1,
      });

      expect(result.toDecimals).toBe(6);
    });

    it('throws when findRouters returns null (no route)', async () => {
      mockFindRouters.mockResolvedValue(null);

      await expect(
        buildSwapTx({
          client: mockClient,
          address: '0xuser',
          fromAsset: 'USDC',
          toAsset: 'SUI',
          amount: 100,
        }),
      ).rejects.toThrow('No swap route found');
    });

    it('throws when insufficient liquidity', async () => {
      mockFindRouters.mockResolvedValue(
        makeRouterResult({ insufficientLiquidity: true }),
      );

      await expect(
        buildSwapTx({
          client: mockClient,
          address: '0xuser',
          fromAsset: 'USDC',
          toAsset: 'SUI',
          amount: 100,
        }),
      ).rejects.toThrow('No swap route found');
    });

    it('handles fractional amounts correctly', async () => {
      const routerResult = makeRouterResult();
      mockFindRouters.mockResolvedValue(routerResult);
      mockFastRouterSwap.mockResolvedValue(undefined);

      await buildSwapTx({
        client: mockClient,
        address: '0xuser',
        fromAsset: 'USDC',
        toAsset: 'SUI',
        amount: 0.5,
      });

      expect(mockFindRouters).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 500_000n }),
      );
    });

    it('handles large amounts correctly', async () => {
      const routerResult = makeRouterResult({ amountOut: mockBN('2857142857142') });
      mockFindRouters.mockResolvedValue(routerResult);
      mockFastRouterSwap.mockResolvedValue(undefined);

      const result = await buildSwapTx({
        client: mockClient,
        address: '0xuser',
        fromAsset: 'USDC',
        toAsset: 'SUI',
        amount: 1_000_000,
      });

      expect(mockFindRouters).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1_000_000_000_000n }),
      );
      expect(result.estimatedOut).toBe(2857142857142);
    });
  });

  describe('getSwapQuote', () => {
    it('returns expected output from aggregator', async () => {
      (mockClient as any).getObject = vi.fn().mockResolvedValue({
        data: { content: { dataType: 'moveObject', fields: { current_sqrt_price: '79228162514264337593543950336' } } },
      });
      mockFindRouters.mockResolvedValue(
        makeRouterResult({ amountOut: mockBN('28571428'), deviationRatio: 0.002 }),
      );

      const result = await getSwapQuote(mockClient, 'USDC', 'SUI', 100);

      expect(result.expectedOutput).toBeCloseTo(0.028571428, 6);
      expect(result.priceImpact).toBe(0.002);
      expect(typeof result.poolPrice).toBe('number');
    });

    it('returns USDC output with correct decimals', async () => {
      (mockClient as any).getObject = vi.fn().mockResolvedValue({ data: null });
      mockFindRouters.mockResolvedValue(
        makeRouterResult({ amountOut: mockBN('3500000') }),
      );

      const result = await getSwapQuote(mockClient, 'SUI', 'USDC', 1);

      expect(result.expectedOutput).toBe(3.5);
    });

    it('uses fallback when findRouters returns null', async () => {
      (mockClient as any).getObject = vi.fn().mockResolvedValue({ data: null });
      mockFindRouters.mockResolvedValue(null);

      const result = await getSwapQuote(mockClient, 'USDC', 'SUI', 100);

      expect(result.expectedOutput).toBeCloseTo(100 / 3.5, 1);
      expect(result.priceImpact).toBe(0);
      expect(result.poolPrice).toBe(3.5);
    });

    it('uses fallback when findRouters throws', async () => {
      (mockClient as any).getObject = vi.fn().mockResolvedValue({ data: null });
      mockFindRouters.mockRejectedValue(new Error('network error'));

      const result = await getSwapQuote(mockClient, 'SUI', 'USDC', 1);

      expect(result.expectedOutput).toBeCloseTo(3.5, 1);
      expect(result.priceImpact).toBe(0);
    });

    it('uses fallback when insufficient liquidity', async () => {
      (mockClient as any).getObject = vi.fn().mockResolvedValue({ data: null });
      mockFindRouters.mockResolvedValue(
        makeRouterResult({ insufficientLiquidity: true }),
      );

      const result = await getSwapQuote(mockClient, 'USDC', 'SUI', 100);

      expect(result.expectedOutput).toBeCloseTo(100 / 3.5, 1);
    });
  });

  describe('getPoolPrice', () => {
    it('calculates SUI price from on-chain sqrt price', async () => {
      const sqrtPriceForSUI3_5 = BigInt(Math.floor(Math.sqrt(1e3 / 3.5) * Number(2n ** 64n)));
      (mockClient as any).getObject = vi.fn().mockResolvedValue({
        data: {
          content: {
            dataType: 'moveObject',
            fields: { current_sqrt_price: sqrtPriceForSUI3_5.toString() },
          },
        },
      });

      const price = await getPoolPrice(mockClient);

      expect(price).toBeCloseTo(3.5, 0);
      expect(price).toBeGreaterThan(0.01);
      expect(price).toBeLessThan(1000);
    });

    it('returns fallback 3.5 when getObject fails', async () => {
      (mockClient as any).getObject = vi.fn().mockRejectedValue(new Error('rpc down'));

      const price = await getPoolPrice(mockClient);

      expect(price).toBe(3.5);
    });

    it('returns fallback 3.5 when pool object has no content', async () => {
      (mockClient as any).getObject = vi.fn().mockResolvedValue({ data: null });

      const price = await getPoolPrice(mockClient);

      expect(price).toBe(3.5);
    });

    it('returns fallback when sqrt price is zero', async () => {
      (mockClient as any).getObject = vi.fn().mockResolvedValue({
        data: {
          content: {
            dataType: 'moveObject',
            fields: { current_sqrt_price: '0' },
          },
        },
      });

      const price = await getPoolPrice(mockClient);

      expect(price).toBe(3.5);
    });

    it('returns fallback when calculated price is out of range', async () => {
      (mockClient as any).getObject = vi.fn().mockResolvedValue({
        data: {
          content: {
            dataType: 'moveObject',
            fields: { current_sqrt_price: '1' },
          },
        },
      });

      const price = await getPoolPrice(mockClient);

      expect(price).toBe(3.5);
    });
  });

  describe('public API surface - no breaking changes', () => {
    it('buildSwapTx returns {tx, estimatedOut, toDecimals}', async () => {
      mockFindRouters.mockResolvedValue(makeRouterResult());
      mockFastRouterSwap.mockResolvedValue(undefined);

      const result = await buildSwapTx({
        client: mockClient,
        address: '0xuser',
        fromAsset: 'USDC',
        toAsset: 'SUI',
        amount: 100,
      });

      expect(result).toHaveProperty('tx');
      expect(result).toHaveProperty('estimatedOut');
      expect(result).toHaveProperty('toDecimals');
      expect(result.tx).toBeInstanceOf(Transaction);
      expect(typeof result.estimatedOut).toBe('number');
      expect(typeof result.toDecimals).toBe('number');
    });

    it('getSwapQuote returns {expectedOutput, priceImpact, poolPrice}', async () => {
      (mockClient as any).getObject = vi.fn().mockResolvedValue({ data: null });
      mockFindRouters.mockResolvedValue(makeRouterResult());

      const result = await getSwapQuote(mockClient, 'USDC', 'SUI', 100);

      expect(result).toHaveProperty('expectedOutput');
      expect(result).toHaveProperty('priceImpact');
      expect(result).toHaveProperty('poolPrice');
      expect(typeof result.expectedOutput).toBe('number');
      expect(typeof result.priceImpact).toBe('number');
      expect(typeof result.poolPrice).toBe('number');
    });

    it('getPoolPrice returns a number', async () => {
      (mockClient as any).getObject = vi.fn().mockResolvedValue({ data: null });

      const price = await getPoolPrice(mockClient);

      expect(typeof price).toBe('number');
    });
  });
});
