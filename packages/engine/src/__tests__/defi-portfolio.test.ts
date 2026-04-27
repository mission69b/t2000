import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchAddressDefiPortfolio,
  clearDefiCache,
  clearPriceMapCache,
} from '../blockvision-prices.js';

/**
 * [v0.50.1] DeFi portfolio aggregation regression suite.
 *
 * Phase 1 (v0.50) covered the top 6 protocols with bespoke normalisers.
 * v0.50.1 expands to all 26 BlockVision-supported protocols (everything
 * except NAVI, which is covered by `positionFetcher` / NAVI MCP) using
 * a generic walker that handles paired-LP and single-coin shapes plus
 * tiny bespoke shims for protocols with implied coin types (bluefin
 * vaults, haedal stakings, kai phantomType nesting, suistake/walrus/
 * suins-staking).
 */

const ADDRESS = '0xfeedface';
const SUI_TYPE_LONG =
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';
const USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const CETUS_TOKEN =
  '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS';
const WAL_TYPE =
  '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL';
const BLUE_TYPE =
  '0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE';
const NS_TYPE =
  '0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS';

const ALL_PROTOCOLS = [
  'aftermath',
  'alphafi',
  'alphalend',
  'bluefin',
  'bluemove',
  'bucket',
  'bucket2',
  'cetus',
  'deepbook',
  'ember',
  'ferra',
  'flowx',
  'haedal',
  'kai',
  'kriya',
  'magma',
  'momentum',
  'r25',
  'scallop',
  'steamm',
  'suilend',
  'suins-staking',
  'suistake',
  'turbos',
  'typus',
  'unihouse',
  'walrus',
];

const realFetch = globalThis.fetch;

beforeEach(() => {
  clearDefiCache();
  clearPriceMapCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

type FetchInput = Parameters<typeof fetch>[0];

function mockJsonResponse(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Response;
}

function urlOf(input: FetchInput): string {
  return typeof input === 'string' ? input : input.toString();
}

function paramOf(url: string, key: string): string | null {
  try {
    return new URL(url).searchParams.get(key);
  } catch {
    return null;
  }
}

describe('[v0.50] fetchAddressDefiPortfolio', () => {
  it('1) returns degraded summary with totalUsd=0 when apiKey is missing', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, undefined);
    expect(summary.totalUsd).toBe(0);
    expect(summary.source).toBe('degraded');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('2) fans out across all 26 BlockVision protocols, excluding NAVI', async () => {
    const seenProtocols: string[] = [];
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      if (url.includes('/account/defiPortfolio')) {
        const proto = paramOf(url, 'protocol');
        if (proto) seenProtocols.push(proto);
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(seenProtocols).not.toContain('navi');
    expect(seenProtocols.sort()).toEqual([...ALL_PROTOCOLS].sort());
  });

  it('3) sums Cetus LP raw amounts × prices correctly using priceHints + stables', async () => {
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'cetus') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            cetus: {
              lps: [
                {
                  // 1 SUI (raw 1e9, decimals=9) + 5 USDC (raw 5e6, decimals=6)
                  // SUI price hinted at $4 → contribution $4 + $5 = $9
                  coinTypeA: SUI_TYPE_LONG,
                  coinTypeADecimals: 9,
                  balanceA: '1000000000',
                  coinTypeB: USDC_TYPE,
                  coinTypeBDecimals: 6,
                  balanceB: '5000000',
                },
              ],
            },
          },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k', { [SUI_TYPE_LONG]: 4 });
    expect(summary.source).toBe('blockvision');
    expect(summary.totalUsd).toBeCloseTo(9, 5);
    expect(summary.perProtocol.cetus).toBeCloseTo(9, 5);
  });

  it('4) Suilend deposits add and borrows subtract', async () => {
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'suilend') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            suilend: {
              deposits: [
                { coinType: USDC_TYPE, decimals: 6, amount: '100000000' }, // $100
              ],
              borrows: [
                { coinType: USDC_TYPE, decimals: 6, amount: '40000000' }, // -$40
              ],
              strategies: [
                { coinType: USDC_TYPE, decimals: 6, amount: '20000000' }, // +$20
              ],
            },
          },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(summary.totalUsd).toBeCloseTo(80, 5);
    expect(summary.perProtocol.suilend).toBeCloseTo(80, 5);
  });

  it('5) Scallop reports pre-USD totals via totalSupplyValue/totalDebtValue', async () => {
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'scallop') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            scallop: {
              totalSupplyValue: 5000,
              totalCollateralValue: 1500,
              totalLockedScaValue: 100,
              totalDebtValue: 2000,
            },
          },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(summary.totalUsd).toBeCloseTo(4600, 2);
    expect(summary.perProtocol.scallop).toBeCloseTo(4600, 2);
  });

  it('6) one protocol 5xx → marks source=partial but other protocols still aggregate', async () => {
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'cetus') {
        return new Response('boom', { status: 503 }) as unknown as Response;
      }
      if (proto === 'scallop') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: { scallop: { totalSupplyValue: 250 } },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(summary.source).toBe('partial');
    expect(summary.totalUsd).toBeCloseTo(250, 5);
  });

  it('7) caches per-address — second call within TTL does not re-fan-out', async () => {
    let cetusCalls = 0;
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'cetus') cetusCalls++;
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchAddressDefiPortfolio(ADDRESS, 'k');
    await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(cetusCalls).toBe(1);
  });

  it('8) auto-fetches missing prices for non-stable LP partner tokens', async () => {
    let priceCallCount = 0;
    let lastPriceTokens: string | null = null;
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      if (url.includes('/coin/price/list')) {
        priceCallCount++;
        lastPriceTokens = paramOf(url, 'tokenIds');
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: { prices: { [CETUS_TOKEN]: '0.10' } },
        });
      }
      const proto = paramOf(url, 'protocol');
      if (proto === 'cetus') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            cetus: {
              lps: [
                {
                  coinTypeA: CETUS_TOKEN,
                  coinTypeADecimals: 9,
                  balanceA: '100000000000', // 100 CETUS @ $0.10 = $10
                  coinTypeB: USDC_TYPE,
                  coinTypeBDecimals: 6,
                  balanceB: '5000000', // $5
                },
              ],
            },
          },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(priceCallCount).toBe(1);
    expect(lastPriceTokens).toContain(CETUS_TOKEN);
    expect(summary.totalUsd).toBeCloseTo(15, 5);
  });
});

// ---------------------------------------------------------------------------
// [v0.50.1] Generic walker — coverage for the long-tail protocols that
// fall through to walkProtocolResponse instead of bespoke normalisers.
// ---------------------------------------------------------------------------

describe('[v0.50.1] generic walker shape coverage', () => {
  function mockProtocol(targetProto: string, payload: unknown) {
    return vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === targetProto) {
        return mockJsonResponse({ code: 200, message: 'OK', result: payload });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    });
  }

  it('Aftermath nested coins: walks lpPositions[*].coins[*] correctly', async () => {
    globalThis.fetch = mockProtocol('aftermath', {
      aftermath: {
        lpPositions: [
          {
            poolId: '0xabc',
            coins: [
              { coinType: SUI_TYPE_LONG, amount: '2000000000' }, // 2 SUI @ $4 = $8
              { coinType: USDC_TYPE, amount: '5000000' }, // $5
            ],
          },
        ],
      },
    }) as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k', { [SUI_TYPE_LONG]: 4 });
    expect(summary.perProtocol.aftermath).toBeCloseTo(13, 5);
    expect(summary.totalUsd).toBeCloseTo(13, 5);
  });

  it('Kriya tokenX/Y human-readable balances are NOT divided by decimals', async () => {
    globalThis.fetch = mockProtocol('kriya', {
      kriya: {
        lps: [
          {
            poolId: '0xpool',
            tokenXType: SUI_TYPE_LONG,
            tokenYType: USDC_TYPE,
            tokenXBalance: '1.25', // 1.25 SUI @ $4 = $5
            tokenYBalance: '350.75', // $350.75
            apy: 15.5,
          },
        ],
      },
    }) as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k', { [SUI_TYPE_LONG]: 4 });
    expect(summary.perProtocol.kriya).toBeCloseTo(355.75, 2);
  });

  it('Cetus vault shape: coinAAmount/coinBAmount + nested coinA.decimals', async () => {
    globalThis.fetch = mockProtocol('cetus', {
      cetus: {
        vaults: [
          {
            id: '0xvault',
            name: 'vSUI - SUI',
            coinTypeA: SUI_TYPE_LONG,
            coinTypeB: USDC_TYPE,
            coinAAmount: '1000000000', // 1 SUI @ $4 = $4
            coinBAmount: '5000000', // $5
            coinA: { decimals: 9 },
            coinB: { decimals: 6 },
          },
        ],
      },
    }) as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k', { [SUI_TYPE_LONG]: 4 });
    expect(summary.perProtocol.cetus).toBeCloseTo(9, 5);
  });

  it('Typus depositRes: human balance + unprefixed depositToken', async () => {
    globalThis.fetch = mockProtocol('typus', {
      typus: {
        depositRes: [
          {
            vault: 'SUI-Weekly-Call',
            // BlockVision returns Typus tokens WITHOUT the leading 0x — the
            // walker normalizes via ensure0xPrefix when computing prices.
            depositToken: SUI_TYPE_LONG.replace(/^0x/, ''),
            balance: 4.240927787, // human-readable, no decimals field
            depositAsset: 'SUI',
          },
        ],
      },
    }) as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k', { [SUI_TYPE_LONG]: 4 });
    // 4.240927787 SUI × $4 ≈ $16.96
    expect(summary.perProtocol.typus).toBeCloseTo(16.96, 1);
  });

  it('FlowX coinTypeX/Y aliasing works the same as A/B', async () => {
    globalThis.fetch = mockProtocol('flowx', {
      flowx: {
        liquidity: [
          {
            poolId: '0xpool',
            coinTypeX: SUI_TYPE_LONG,
            coinTypeY: USDC_TYPE,
            amountX: '1000000000', // 1 SUI @ $4 = $4
            amountY: '5000000', // $5
          },
        ],
      },
    }) as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k', { [SUI_TYPE_LONG]: 4 });
    expect(summary.perProtocol.flowx).toBeCloseTo(9, 5);
  });

  it('NAVI-style flat list with type:Borrow gets subtracted (debt detection)', async () => {
    // Simulate a protocol returning the NAVI-style flat shape under a
    // walker-handled key (e.g. bucket2.savings sometimes uses this style).
    globalThis.fetch = mockProtocol('bucket2', {
      bucket2: [
        { coinType: USDC_TYPE, balance: 100, decimals: 0, type: 'Supply' }, // +$100
        { coinType: USDC_TYPE, balance: 30, decimals: 0, type: 'Borrow' }, // -$30
      ],
    }) as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(summary.perProtocol.bucket2).toBeCloseTo(70, 5);
  });

  it('Walker skips rewards / fees branches to avoid double-counting incentives', async () => {
    globalThis.fetch = mockProtocol('cetus', {
      cetus: {
        lps: [
          {
            coinTypeA: SUI_TYPE_LONG,
            coinTypeADecimals: 9,
            balanceA: '1000000000', // $4
            coinTypeB: USDC_TYPE,
            coinTypeBDecimals: 6,
            balanceB: '5000000', // $5
            // Pending rewards must NOT contribute — they're informational.
            rewards: [
              { coinType: SUI_TYPE_LONG, amount: '5000000000' }, // would be $20
            ],
            fees: { amountA: '1000000000', amountB: '1000000' }, // would be $5
          },
        ],
      },
    }) as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k', { [SUI_TYPE_LONG]: 4 });
    expect(summary.perProtocol.cetus).toBeCloseTo(9, 5);
  });
});

// ---------------------------------------------------------------------------
// [v0.50.1] Bespoke shims — implied coin types the walker can't infer.
// ---------------------------------------------------------------------------

describe('[v0.50.1] bespoke shims for implied coin types', () => {
  it('Bluefin usdcVault.amount → USDC (6dp)', async () => {
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'bluefin') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            bluefin: {
              usdcVault: { amount: '7640480000' }, // 7,640.48 USDC
            },
          },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    }) as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(summary.perProtocol.bluefin).toBeCloseTo(7640.48, 2);
  });

  it('Bluefin blueVault.amount → BLUE at hinted price', async () => {
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'bluefin') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            bluefin: {
              blueVault: { amount: '5000000000' }, // 5 BLUE @ $0.20 = $1
            },
          },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    }) as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k', { [BLUE_TYPE]: 0.2 });
    expect(summary.perProtocol.bluefin).toBeCloseTo(1, 5);
  });

  it('Haedal stakings.sui_amount → SUI', async () => {
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'haedal') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            haedal: {
              stakings: [{ sui_amount: '1000000000' }], // 1 SUI @ $4 = $4
            },
          },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    }) as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k', { [SUI_TYPE_LONG]: 4 });
    expect(summary.perProtocol.haedal).toBeCloseTo(4, 5);
  });

  it('Kai vault: coin.p.phantomType + equity (human readable)', async () => {
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'kai') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            kai: {
              vaults: [
                {
                  vaultId: '0xkai',
                  coin: {
                    p: { phantomType: SUI_TYPE_LONG, kind: 'PhantomReified' },
                    decimals: 9,
                  },
                  equity: '0.5', // 0.5 SUI @ $4 = $2 (human readable)
                  ytBalance: '0.486', // not counted
                },
              ],
            },
          },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    }) as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k', { [SUI_TYPE_LONG]: 4 });
    expect(summary.perProtocol.kai).toBeCloseTo(2, 5);
  });

  it('Walrus stakings → WAL', async () => {
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'walrus') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            walrus: {
              stakings: [{ amount: '10000000000' }], // 10 WAL @ $0.50 = $5
            },
          },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    }) as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k', { [WAL_TYPE]: 0.5 });
    expect(summary.perProtocol.walrus).toBeCloseTo(5, 5);
  });

  it('SuiNS-staking probes both kebab and camel response keys', async () => {
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'suins-staking') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            // BlockVision unknown response shape — try camel; bespoke shim
            // also probes 'suins-staking' and 'suins_staking'.
            suinsStaking: {
              stakings: [{ amount: '1000000' }], // 1 NS (6dp) @ $1 = $1
            },
          },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    }) as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k', { [NS_TYPE]: 1 });
    expect(summary.perProtocol['suins-staking']).toBeCloseTo(1, 5);
  });
});
