import { describe, it, expect } from 'vitest';
import BN from 'bn.js';
import type { RouterDataV3 } from '@cetusprotocol/aggregator-sdk';
import {
  serializeCetusRoute,
  deserializeCetusRoute,
  verifyCetusRouteCoinMatch,
  isCetusRouteFresh,
} from './cetus-swap.js';
import type { SwapRouteResult } from './cetus-swap.js';

const stubPath = (provider: string): RouterDataV3['paths'][number] => ({
  id: `pool_${provider}`,
  direction: true,
  provider,
  from: '0xa::usdc::USDC',
  target: '0xb::sui::SUI',
  feeRate: 30,
  amountIn: '50000',
  amountOut: '49000',
  version: 'v2',
  publishedAt: '0xpublished',
  extendedDetails: { obric_coin_a_price_seed: '0xseed' },
});

const stubRouterData = (): RouterDataV3 => ({
  quoteID: 'q_123',
  amountIn: new BN(50000),
  amountOut: new BN(49000),
  byAmountIn: true,
  paths: [stubPath('CETUS'), stubPath('FLOWX')],
  insufficientLiquidity: false,
  deviationRatio: 0.0019,
  packages: new Map([['cetus_v3', '0xcetuspkg'], ['flowx', '0xflowxpkg']]),
  totalDeepFee: 0.001,
  overlayFee: 0.001,
});

const stubSwapRoute = (): SwapRouteResult => ({
  routerData: stubRouterData(),
  amountIn: '50000',
  amountOut: '49000',
  byAmountIn: true,
  priceImpact: 0.0019,
  insufficientLiquidity: false,
});

describe('SerializedCetusRoute round-trip', () => {
  it('serializes BN fields to decimal strings', () => {
    const route = stubSwapRoute();
    const serialized = serializeCetusRoute(route, {
      fromCoinType: '0xa::usdc::USDC',
      toCoinType: '0xb::sui::SUI',
    });

    expect(serialized.routerData.amountIn).toBe('50000');
    expect(serialized.routerData.amountOut).toBe('49000');
    expect(typeof serialized.routerData.amountIn).toBe('string');
  });

  it('serializes Map<string,string> to Record<string,string>', () => {
    const serialized = serializeCetusRoute(stubSwapRoute(), {
      fromCoinType: '0xa::usdc::USDC',
      toCoinType: '0xb::sui::SUI',
    });

    expect(serialized.routerData.packages).toEqual({
      cetus_v3: '0xcetuspkg',
      flowx: '0xflowxpkg',
    });
  });

  it('preserves all path fields verbatim', () => {
    const serialized = serializeCetusRoute(stubSwapRoute(), {
      fromCoinType: '0xa::usdc::USDC',
      toCoinType: '0xb::sui::SUI',
    });

    expect(serialized.routerData.paths).toHaveLength(2);
    expect(serialized.routerData.paths[0].provider).toBe('CETUS');
    expect(serialized.routerData.paths[0].extendedDetails).toEqual({ obric_coin_a_price_seed: '0xseed' });
    expect(serialized.routerData.paths[1].provider).toBe('FLOWX');
  });

  it('JSON.stringify + JSON.parse round-trip survives without data loss', () => {
    const serialized = serializeCetusRoute(stubSwapRoute(), {
      fromCoinType: '0xa::usdc::USDC',
      toCoinType: '0xb::sui::SUI',
    });
    const json = JSON.stringify(serialized);
    const parsed = JSON.parse(json) as typeof serialized;
    const back = deserializeCetusRoute(parsed);

    expect(back.routerData.amountIn.toString()).toBe('50000');
    expect(back.routerData.amountOut.toString()).toBe('49000');
    expect(back.routerData.paths[0].provider).toBe('CETUS');
    expect(back.routerData.packages?.get('cetus_v3')).toBe('0xcetuspkg');
    expect(back.priceImpact).toBe(0.0019);
  });

  it('deserialize produces a usable RouterDataV3 with BN amounts', () => {
    const serialized = serializeCetusRoute(stubSwapRoute(), {
      fromCoinType: '0xa::usdc::USDC',
      toCoinType: '0xb::sui::SUI',
    });
    const back = deserializeCetusRoute(serialized);

    expect(back.routerData.amountIn).toBeInstanceOf(BN);
    expect(back.routerData.amountOut).toBeInstanceOf(BN);
    expect(back.routerData.packages).toBeInstanceOf(Map);
  });

  it('stamps discoveredAt at serialize time', () => {
    const before = Date.now();
    const serialized = serializeCetusRoute(stubSwapRoute(), {
      fromCoinType: '0xa::usdc::USDC',
      toCoinType: '0xb::sui::SUI',
    });
    const after = Date.now();
    expect(serialized.discoveredAt).toBeGreaterThanOrEqual(before);
    expect(serialized.discoveredAt).toBeLessThanOrEqual(after);
  });

  it('snapshots fromCoinType + toCoinType for D-2 verification', () => {
    const serialized = serializeCetusRoute(stubSwapRoute(), {
      fromCoinType: '0xfrom::T::T',
      toCoinType: '0xto::T::T',
    });
    expect(serialized.fromCoinType).toBe('0xfrom::T::T');
    expect(serialized.toCoinType).toBe('0xto::T::T');
  });

  it('handles empty packages and missing optional fields', () => {
    const minimal: SwapRouteResult = {
      routerData: {
        amountIn: new BN(1),
        amountOut: new BN(1),
        byAmountIn: true,
        paths: [],
        insufficientLiquidity: false,
        deviationRatio: 0,
      },
      amountIn: '1',
      amountOut: '1',
      byAmountIn: true,
      priceImpact: 0,
      insufficientLiquidity: false,
    };
    const serialized = serializeCetusRoute(minimal, {
      fromCoinType: '0xa',
      toCoinType: '0xb',
    });
    expect(serialized.routerData.packages).toBeUndefined();
    expect(serialized.routerData.paths).toEqual([]);

    const back = deserializeCetusRoute(serialized);
    expect(back.routerData.packages).toBeUndefined();
  });
});

describe('verifyCetusRouteCoinMatch (D-2 (b) structural verification)', () => {
  it('returns true when input/output coins match', () => {
    const serialized = serializeCetusRoute(stubSwapRoute(), {
      fromCoinType: '0xa::usdc::USDC',
      toCoinType: '0xb::sui::SUI',
    });
    expect(
      verifyCetusRouteCoinMatch(serialized, {
        fromCoinType: '0xa::usdc::USDC',
        toCoinType: '0xb::sui::SUI',
      }),
    ).toBe(true);
  });

  it('returns false when from coin differs', () => {
    const serialized = serializeCetusRoute(stubSwapRoute(), {
      fromCoinType: '0xa::usdc::USDC',
      toCoinType: '0xb::sui::SUI',
    });
    expect(
      verifyCetusRouteCoinMatch(serialized, {
        fromCoinType: '0xWRONG::usdc::USDC',
        toCoinType: '0xb::sui::SUI',
      }),
    ).toBe(false);
  });

  it('returns false when to coin differs', () => {
    const serialized = serializeCetusRoute(stubSwapRoute(), {
      fromCoinType: '0xa::usdc::USDC',
      toCoinType: '0xb::sui::SUI',
    });
    expect(
      verifyCetusRouteCoinMatch(serialized, {
        fromCoinType: '0xa::usdc::USDC',
        toCoinType: '0xWRONG::sui::SUI',
      }),
    ).toBe(false);
  });
});

describe('isCetusRouteFresh (D-3 (b) TTL check)', () => {
  it('returns true for a route discovered <30s ago (default)', () => {
    const fresh = serializeCetusRoute(stubSwapRoute(), {
      fromCoinType: '0xa',
      toCoinType: '0xb',
    });
    expect(isCetusRouteFresh(fresh)).toBe(true);
  });

  it('returns false for a route discovered >30s ago', () => {
    const stale = serializeCetusRoute(stubSwapRoute(), {
      fromCoinType: '0xa',
      toCoinType: '0xb',
    });
    stale.discoveredAt = Date.now() - 31_000;
    expect(isCetusRouteFresh(stale)).toBe(false);
  });

  it('respects custom maxAgeMs', () => {
    const route = serializeCetusRoute(stubSwapRoute(), {
      fromCoinType: '0xa',
      toCoinType: '0xb',
    });
    route.discoveredAt = Date.now() - 5_000;
    expect(isCetusRouteFresh(route, 10_000)).toBe(true);
    expect(isCetusRouteFresh(route, 1_000)).toBe(false);
  });
});
