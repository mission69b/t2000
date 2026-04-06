import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SwapResult, SwapQuoteResult } from '../types.js';

const SWAP_RESULT_KEYS: (keyof SwapResult)[] = [
  'success', 'tx', 'fromToken', 'toToken',
  'fromAmount', 'toAmount', 'priceImpact', 'route',
  'gasCost', 'gasMethod',
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
      gasMethod: 'self',
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
    expect(typeof mock.gasMethod).toBe('string');
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
});
