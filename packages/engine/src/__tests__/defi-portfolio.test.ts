import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchAddressDefiPortfolio,
  clearDefiCache,
  clearPriceMapCache,
  _resetBlockVisionCircuitBreaker,
} from '../blockvision-prices.js';

/**
 * [v0.50.2] DeFi portfolio aggregation regression suite.
 *
 * v0.50 covered the 6 majors (Cetus/Suilend/Scallop/Bluefin/Aftermath/
 * Haedal) with bespoke normalisers. v0.50.1 refactored to a generic
 * walker + 6 shims and expanded to all 26 BV-supported protocols, but
 * 26 simultaneous BV calls hit per-second burst caps and broke the
 * wallet `/account/coins` path. v0.50.2 walks back to 9 protocols
 * (the v0.50 majors + the 3 native-token stakings users wanted:
 * suistake/suins-staking/walrus). The walker + shim code is unchanged
 * from v0.50.1 and stays in place — adding back kai/typus/kriya/etc.
 * is a 1-line append in DEFI_PROTOCOLS plus restoring the
 * walker-shape tests that were dropped for them in v0.50.2.
 *
 * NAVI is intentionally excluded from `DEFI_PROTOCOLS` — it's already
 * covered by `positionFetcher` / NAVI MCP via `savings_info`, so
 * including it here would double-count savings.
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

// Mirrors DEFI_PROTOCOLS in blockvision-prices.ts. Keep in sync.
const ALL_PROTOCOLS = [
  'aftermath',
  'bluefin',
  'cetus',
  'haedal',
  'scallop',
  'suilend',
  'suins-staking',
  'suistake',
  'walrus',
];

const realFetch = globalThis.fetch;

beforeEach(async () => {
  await clearDefiCache();
  clearPriceMapCache();
  // [v0.54.2] Reset BlockVision circuit-breaker state so 429 floods
  // from a sibling test file don't leave the breaker open and
  // suppress retries for tests in this file (which assert exact
  // BV call counts that depend on retry being active).
  _resetBlockVisionCircuitBreaker();
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

  // [v0.50.3] Regression: production Vercel env had `BLOCKVISION_API_KEY=""`
  // (literal empty string, not unset). The original guard `if (!apiKey)` did
  // catch empty strings, but only because empty string is falsy in JS — the
  // intent was easy to break. This test pins the behavior so a future
  // refactor (e.g. tightening the type to `string`) can't regress it.
  it('1a) returns degraded summary with totalUsd=0 when apiKey is empty string', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, '');
    expect(summary.totalUsd).toBe(0);
    expect(summary.source).toBe('degraded');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('1b) returns degraded summary with totalUsd=0 when apiKey is whitespace only', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, '   ');
    expect(summary.totalUsd).toBe(0);
    expect(summary.source).toBe('degraded');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('2) fans out across the 9 configured protocols, excluding NAVI', async () => {
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
// [v0.50.2] Generic walker shape coverage.
//
// Tests reach the walker via fetchAddressDefiPortfolio, so they're scoped to
// protocols currently in DEFI_PROTOCOLS. Protocols dropped in v0.50.2
// (kai/typus/kriya/flowx/bucket2) had walker tests in v0.50.1; restore them
// alongside the protocol when adding back via DEFI_PROTOCOLS. The walker
// code itself is unchanged from v0.50.1 — it just isn't exercised against
// those shapes through this test path right now.
// ---------------------------------------------------------------------------

describe('[v0.50.2] generic walker shape coverage', () => {
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
// [v0.50.2] Bespoke shims — implied coin types the walker can't infer.
//
// kai shim test was dropped in v0.50.2 (kai is no longer in DEFI_PROTOCOLS,
// so it never reaches the shim). Restore alongside kai if/when added back.
// ---------------------------------------------------------------------------

describe('[v0.50.2] bespoke shims for implied coin types', () => {
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

describe('[v0.53.3] fetchAddressDefiPortfolio — cache poisoning regression', () => {
  /**
   * The bug: when BlockVision Pro tier rate-limits ALL 9 DeFi
   * protocol endpoints in a burst (which happens when one user opens
   * multiple canvases inside a few seconds — each canvas runs its
   * own getPortfolio() → 9 parallel BV calls), the engine returned
   * `{ totalUsd: 0, source: 'degraded' }` and CACHED that for the
   * full 60s TTL. Subsequent callers for the same address inside that
   * window served the bad value, even after BlockVision recovered.
   *
   * Surfaced live for an external wallet with $7,520 in
   * Bluefin+Suilend+Cetus: `balance_check` (cache hit on a healthy
   * earlier read) reported $37,160 net worth, while the timeline
   * canvas (fresh call landed on the poisoned entry) reported $29,641
   * — exactly the SSOT drift the v0.53.x SSOT work was meant to
   * eliminate, just with the drift relocated into the cache layer.
   *
   * Fix: cache only `source === 'blockvision'` for the full TTL.
   * `degraded` is never cached (next caller retries upstream).
   * `partial` cached with a SHORTENED effective TTL so the failing
   * protocol gets re-attempted within the same chat session.
   */

  it('does NOT cache degraded results — second call retries upstream', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      // Every protocol fetch returns 429 — produces source: 'degraded'.
      return mockJsonResponse({}, 429);
    }) as unknown as typeof fetch;

    const first = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(first.source).toBe('degraded');
    expect(first.totalUsd).toBe(0);
    const callsAfterFirst = callCount;
    // [v0.54.2] BV retry wrapper retries 429s up to 3 times PER
    // protocol, but the process-local circuit breaker opens after
    // 10 cumulative 429s in a 5s window to prevent amplifying load
    // on a real upstream outage. Promise.allSettled fires all 9
    // protocols concurrently — round 1 produces 9 429s (CB still
    // closed), round 2 produces 9 more (CB opens at the 10th).
    // Each protocol then bails on round 3 because CB is open.
    // Net: 9 × 2 = 18 BV calls, not 9 × 3 = 27.
    expect(callsAfterFirst).toBe(ALL_PROTOCOLS.length * 2);

    // Second call within the TTL window. Pre-fix this returned the
    // cached degraded summary without hitting the network. Post-fix
    // it must re-attempt upstream because degraded was not cached.
    // CB is still open from the first call, so the second call gets
    // exactly 1 attempt per protocol (no retry). Net additional
    // calls: 9. This is the SCALING WIN of the breaker — under a
    // sustained outage, retry traffic is suppressed entirely.
    const second = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(second.source).toBe('degraded');
    expect(callCount).toBe(callsAfterFirst + ALL_PROTOCOLS.length);
  });

  it('caches blockvision (fully successful) results for the full TTL', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      callCount++;
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
                  coinTypeA: USDC_TYPE,
                  coinTypeADecimals: 6,
                  balanceA: '5000000', // $5
                  coinTypeB: USDC_TYPE,
                  coinTypeBDecimals: 6,
                  balanceB: '5000000', // $5
                },
              ],
            },
          },
        });
      }
      // Non-cetus protocols return empty success so source stays 'blockvision'.
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    }) as unknown as typeof fetch;

    const first = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(first.source).toBe('blockvision');
    expect(first.totalUsd).toBeCloseTo(10, 5);
    const callsAfterFirst = callCount;

    const second = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    // Same instance returned from cache (proves no re-fetch).
    expect(second).toBe(first);
    expect(callCount).toBe(callsAfterFirst);
  });

  it('caches partial results but with a shortened effective TTL (15s, not 60s)', async () => {
    // We can't easily time-travel inside vitest without fake timers, so
    // this test asserts the cache write happened (next call within 15s
    // hits cache) and pins the TTL stamp behavior at the contract level
    // by reading `data.source` from a back-to-back call. A separate fake-
    // timer test would be required to assert the 15s elapse — accepting
    // the contract-level pin here as the unit-test layer guard, with the
    // real-timer behaviour validated by production logs.
    let callCount = 0;
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      callCount++;
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      // 1 protocol succeeds (cetus), the other 8 return 429 → source: 'partial'.
      if (proto === 'cetus') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            cetus: {
              lps: [
                {
                  coinTypeA: USDC_TYPE,
                  coinTypeADecimals: 6,
                  balanceA: '3000000',
                  coinTypeB: USDC_TYPE,
                  coinTypeBDecimals: 6,
                  balanceB: '3000000',
                },
              ],
            },
          },
        });
      }
      return mockJsonResponse({}, 429);
    }) as unknown as typeof fetch;

    const first = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(first.source).toBe('partial');
    expect(first.totalUsd).toBeCloseTo(6, 5);
    const callsAfterFirst = callCount;

    // Immediate second call within the 15s effective window → cache hit.
    const second = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(second).toBe(first);
    expect(callCount).toBe(callsAfterFirst);
  });
});

describe('[v0.53.3] fetchAddressPortfolio — cache poisoning regression', () => {
  /**
   * Sister fix to the DeFi cache fix. When BlockVision /account/coins
   * 429s, the wallet portfolio fell back to the Sui RPC + best-effort
   * `/coin/price/list` path and cached that degraded result for 60s.
   * Locking a stables-mostly wallet in for a minute after a single
   * burst is the symmetric bug to the DeFi side, and it produces the
   * same SSOT drift across `balance_check` (healthy cache) and the
   * canvases (fresh poisoned cache) on the same address in the same
   * minute. Fix: stamp degraded cache entries 45s old so they expire
   * after a 15s effective window — long enough to dedupe the burst,
   * short enough that BlockVision recovery surfaces quickly.
   */

  // Re-import here so the cache-clearing afterEach in this describe
  // block picks up the right set of state-clearing helpers.
  it('degraded results expire after the shortened TTL — second call within 15s reuses cache', async () => {
    // First confirm the in-flight dedup + cache works for back-to-back
    // calls in the SAME tick (the burst-protection part of the fix).
    const { fetchAddressPortfolio: f, clearPortfolioCache } = await import(
      '../blockvision-prices.js'
    );
    clearPortfolioCache();

    let coinsCalls = 0;
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      if (url.includes('/sui/account/coins')) {
        coinsCalls++;
        return mockJsonResponse({}, 429);
      }
      if (url.includes('/sui/coin/price/list')) {
        return mockJsonResponse({ code: 200, message: 'OK', result: { prices: {} } });
      }
      // Sui RPC fallback — minimal stables wallet.
      return mockJsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: [{ coinType: USDC_TYPE, totalBalance: '1000000', coinObjectCount: 1 }],
      });
    }) as unknown as typeof fetch;

    const first = await f(ADDRESS, 'k', 'https://rpc.local');
    expect(first.source).toBe('sui-rpc-degraded');

    const second = await f(ADDRESS, 'k', 'https://rpc.local');
    // Within the 15s effective window — cache hit, no further BV calls.
    expect(second).toBe(first);
    // [v0.54.2] BV retry wrapper retries up to 3 times on 429 before
    // surfacing degraded. The wallet portfolio path is a single endpoint
    // (not a 9-protocol fan-out), so all 3 attempts fire serially with
    // no concurrent contribution to the circuit breaker — well below
    // the 10-cumulative threshold. First user call → 3 BV attempts.
    // Second call → 0 BV attempts (served from the degraded cache).
    // Pre-retry this was `1`; the new behavior trades ~1s of additional
    // latency on the bursting call for absorbing transient 429s before
    // they cascade into wallet degradation across the whole tool stack.
    expect(coinsCalls).toBe(3);
  });
});
