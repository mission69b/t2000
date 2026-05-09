import { describe, it, expect } from 'vitest';
import { findMatchingCetusRoute, type SwapQuoteReadEntry } from './swap-route-matching.js';
import type { SerializedCetusRoute } from '@t2000/sdk';

const stubRoute = (id: string): SerializedCetusRoute => ({
  routerData: {
    amountIn: '100',
    amountOut: '100',
    byAmountIn: true,
    paths: [{ id, direction: true, provider: 'CETUS', from: '0xa', target: '0xb', feeRate: 30, amountIn: '100', amountOut: '100' }],
    insufficientLiquidity: false,
    deviationRatio: 0.001,
  },
  amountIn: '100',
  amountOut: '100',
  byAmountIn: true,
  priceImpact: 0.001,
  insufficientLiquidity: false,
  discoveredAt: Date.now(),
  fromCoinType: '0xa::usdc::USDC',
  toCoinType: '0xb::sui::SUI',
});

const makeEntry = (overrides: Partial<SwapQuoteReadEntry> = {}): SwapQuoteReadEntry => ({
  toolUseId: 'tu_1',
  input: { from: 'USDC', to: 'SUI', amount: 0.05 },
  result: { serializedRoute: stubRoute('default') },
  timestamp: Date.now(),
  ...overrides,
});

describe('findMatchingCetusRoute', () => {
  it('returns undefined when no swap_quote reads are present', () => {
    const route = findMatchingCetusRoute({ from: 'USDC', to: 'SUI', amount: 0.05 }, []);
    expect(route).toBeUndefined();
  });

  it('returns undefined when input is not a swap_execute shape', () => {
    expect(findMatchingCetusRoute(null, [makeEntry()])).toBeUndefined();
    expect(findMatchingCetusRoute({}, [makeEntry()])).toBeUndefined();
    expect(findMatchingCetusRoute({ amount: 1 }, [makeEntry()])).toBeUndefined();
  });

  it('matches on (from, to, amount) when byAmountIn is omitted', () => {
    const entry = makeEntry({ result: { serializedRoute: stubRoute('match') } });
    const route = findMatchingCetusRoute({ from: 'USDC', to: 'SUI', amount: 0.05 }, [entry]);
    expect(route?.routerData.paths[0].id).toBe('match');
  });

  it('is case-insensitive on token symbols', () => {
    const entry = makeEntry({
      input: { from: 'usdc', to: 'sui', amount: 0.05 },
      result: { serializedRoute: stubRoute('case') },
    });
    const route = findMatchingCetusRoute({ from: 'USDC', to: 'SUI', amount: 0.05 }, [entry]);
    expect(route?.routerData.paths[0].id).toBe('case');
  });

  it('returns the most recent matching quote when multiple match', () => {
    const reads: SwapQuoteReadEntry[] = [
      makeEntry({ toolUseId: 'tu_1', result: { serializedRoute: stubRoute('first') } }),
      makeEntry({ toolUseId: 'tu_2', result: { serializedRoute: stubRoute('second') } }),
      makeEntry({ toolUseId: 'tu_3', result: { serializedRoute: stubRoute('third') } }),
    ];
    const route = findMatchingCetusRoute({ from: 'USDC', to: 'SUI', amount: 0.05 }, reads);
    expect(route?.routerData.paths[0].id).toBe('third');
  });

  it('returns undefined when amount differs', () => {
    const route = findMatchingCetusRoute({ from: 'USDC', to: 'SUI', amount: 0.10 }, [makeEntry()]);
    expect(route).toBeUndefined();
  });

  it('returns undefined when from token differs', () => {
    const route = findMatchingCetusRoute({ from: 'SUI', to: 'USDC', amount: 0.05 }, [makeEntry()]);
    expect(route).toBeUndefined();
  });

  it('respects byAmountIn distinction', () => {
    const entry = makeEntry({ input: { from: 'USDC', to: 'SUI', amount: 0.05, byAmountIn: false } });
    const route = findMatchingCetusRoute(
      { from: 'USDC', to: 'SUI', amount: 0.05, byAmountIn: true },
      [entry],
    );
    expect(route).toBeUndefined();
  });

  it('skips entries without serializedRoute (legacy results)', () => {
    const reads: SwapQuoteReadEntry[] = [
      makeEntry({ toolUseId: 'tu_1', result: {} }),
    ];
    const route = findMatchingCetusRoute({ from: 'USDC', to: 'SUI', amount: 0.05 }, reads);
    expect(route).toBeUndefined();
  });
});
