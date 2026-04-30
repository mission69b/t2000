import { describe, it, expect, vi, beforeEach } from 'vitest';
import { balanceCheckTool } from '../tools/balance.js';
import type { ServerPositionData } from '../types.js';

/**
 * [v0.49] Regression suite for address-scoped balance_check.
 *
 * Pre-v0.49 the tool only ever queried `context.walletAddress`, so a
 * question like "what's funkii's balance?" silently returned the
 * signed-in user's balance instead. v0.49 adds an optional `address`
 * input and stamps `address` + `isSelfQuery` on the result so the host
 * UI can title cards correctly.
 *
 * The MCP path under test relies on:
 *   1. `loadPortfolio(address)` — through `fetchAddressPortfolio` mock
 *   2. `positionFetcher(address)` — host-provided
 * Both must be called with the *target* address, never the user's.
 */

const USER_ADDR = `0x${'a'.repeat(64)}`;
const FUNKII_ADDR = `0x${'b'.repeat(64)}`;

vi.mock('../blockvision-prices.js', () => ({
  fetchAddressPortfolio: vi.fn(async (address: string) => ({
    coins: [
      {
        coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
        symbol: 'USDC',
        decimals: 6,
        balance: '12345678', // 12.345678 USDC
        price: 1,
        usdValue: 12.345678,
      },
    ],
    totalUsd: 12.345678,
    pricedAt: Date.now(),
    source: 'blockvision',
    __seenAddress: address,
  })),
  // [v0.50] DeFi fan-out — default to no DeFi positions so existing
  // balance assertions stay stable. Individual tests can override.
  fetchAddressDefiPortfolio: vi.fn(async () => ({
    totalUsd: 0,
    perProtocol: {},
    pricedAt: Date.now(),
    source: 'blockvision' as const,
  })),
}));

const baseMcp = {
  listTools: vi.fn(),
  callTool: vi.fn(),
  isConnected: vi.fn(() => true),
};

const positionFetcher = vi.fn(async (_address: string): Promise<ServerPositionData> => ({
  savings: 1000,
  borrows: 0,
  pendingRewards: 0,
  healthFactor: null,
  maxBorrow: 0,
  supplies: [],
  borrows_detail: [],
  savingsRate: 0.045,
}));

function ctx(opts: { wallet?: string; positionFetcher?: typeof positionFetcher } = {}) {
  return {
    walletAddress: opts.wallet === undefined ? USER_ADDR : opts.wallet,
    mcpManager: baseMcp as unknown,
    positionFetcher: opts.positionFetcher ?? positionFetcher,
    blockvisionApiKey: 'test',
  } as Parameters<typeof balanceCheckTool.call>[1];
}

interface BalanceResult {
  data: {
    address: string;
    isSelfQuery: boolean;
    total: number;
    available: number;
    savings: number;
    defi?: number;
    defiByProtocol?: Record<string, number>;
    defiSource?: string;
  };
  displayText: string;
}

describe('[v0.49] balance_check address scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to context.walletAddress when input.address is omitted', async () => {
    const res = (await balanceCheckTool.call({}, ctx())) as BalanceResult;
    expect(res.data.address).toBe(USER_ADDR);
    expect(res.data.isSelfQuery).toBe(true);
  });

  it('honors explicit input.address (the fix)', async () => {
    const res = (await balanceCheckTool.call(
      { address: FUNKII_ADDR },
      ctx(),
    )) as BalanceResult;
    expect(res.data.address).toBe(FUNKII_ADDR);
    expect(res.data.isSelfQuery).toBe(false);
  });

  it('passes the target address to positionFetcher (not context.walletAddress)', async () => {
    await balanceCheckTool.call({ address: FUNKII_ADDR }, ctx());
    expect(positionFetcher).toHaveBeenCalledWith(FUNKII_ADDR);
    expect(positionFetcher).not.toHaveBeenCalledWith(USER_ADDR);
  });

  it('passes the target address to fetchAddressPortfolio', async () => {
    const { fetchAddressPortfolio } = await import('../blockvision-prices.js');
    await balanceCheckTool.call({ address: FUNKII_ADDR }, ctx());
    expect(fetchAddressPortfolio).toHaveBeenCalledWith(FUNKII_ADDR, 'test', undefined);
  });

  it('case-insensitive equality decides isSelfQuery', async () => {
    const res = (await balanceCheckTool.call(
      { address: USER_ADDR.toUpperCase() },
      ctx(),
    )) as BalanceResult;
    expect(res.data.isSelfQuery).toBe(true);
  });

  it('prefixes the displayText with a truncated-address subject for non-self queries', async () => {
    const res = (await balanceCheckTool.call(
      { address: FUNKII_ADDR },
      ctx(),
    )) as BalanceResult;
    expect(res.displayText).toContain(FUNKII_ADDR.slice(0, 6));
    expect(res.displayText).toContain(FUNKII_ADDR.slice(-4));
  });

  it('omits the address subject from displayText for self queries', async () => {
    const res = (await balanceCheckTool.call({}, ctx())) as BalanceResult;
    expect(res.displayText.startsWith('Balance:')).toBe(true);
    expect(res.displayText).not.toContain(USER_ADDR.slice(0, 6));
  });

  /**
   * [v1.2 SuiNS] balance_check now accepts a *.sui name. Pre-fix the
   * Zod schema rejected anything that wasn't a 0x address, so "what's
   * obehi.sui's balance" was untooled — the LLM either fell back to
   * web_search (no SuiNS index) or local-contact lookup (wrong wallet).
   * Now: the engine resolves the name via Sui RPC, queries the resolved
   * 0x address, and stamps `suinsName` on the result so cards can title
   * themselves "Balance · obehi.sui".
   */
  it('resolves a SuiNS name and queries the resolved 0x address', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      if (body?.method === 'suix_resolveNameServiceAddress') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: FUNKII_ADDR }),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url} ${init?.body}`);
    }) as unknown as typeof fetch;

    try {
      const res = (await balanceCheckTool.call(
        { address: 'obehi.sui' },
        ctx(),
      )) as BalanceResult & { data: { suinsName?: string | null } };
      expect(res.data.address).toBe(FUNKII_ADDR);
      expect(res.data.suinsName).toBe('obehi.sui');
      expect(res.data.isSelfQuery).toBe(false);
      expect(positionFetcher).toHaveBeenCalledWith(FUNKII_ADDR);
      expect(res.displayText).toContain('obehi.sui');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  /**
   * SDK fallback (no MCP, no positionFetcher) cannot honor a non-self
   * address because the agent is bound to its own wallet. Refuse rather
   * than silently returning the agent's balance under a wrong heading.
   */
  it('rejects a non-self address when only the SDK agent is available', async () => {
    const sdkOnlyCtx = {
      walletAddress: USER_ADDR,
      agent: {
        balance: async () => ({
          available: 0,
          savings: 0,
          debt: 0,
          pendingRewards: 0,
          gasReserve: 0,
          total: 0,
          stables: 0,
        }),
      },
    } as Parameters<typeof balanceCheckTool.call>[1];
    await expect(
      balanceCheckTool.call({ address: FUNKII_ADDR }, sdkOnlyCtx),
    ).rejects.toThrow(/cannot inspect/i);
  });
});

/**
 * [v0.50] balance_check rolls DeFi positions (Cetus/Suilend/Scallop/etc.)
 * into `total` so the LLM and UI see the actual net worth, not just
 * wallet + savings. NAVI is intentionally excluded from the DeFi figure
 * (savings already cover it).
 */
describe('[v0.50] balance_check DeFi rollup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds defi.totalUsd to bal.total and exposes defiByProtocol/defiSource', async () => {
    const { fetchAddressDefiPortfolio } = await import('../blockvision-prices.js');
    (fetchAddressDefiPortfolio as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      totalUsd: 8559.5,
      perProtocol: { cetus: 5000, suilend: 3000, scallop: 559.5 },
      pricedAt: Date.now(),
      source: 'blockvision',
    });

    const res = (await balanceCheckTool.call({}, ctx())) as BalanceResult;
    // Wallet portfolio (12.345678 USDC) + savings (1000) + defi (8559.5) = 9571.84...
    expect(res.data.defi).toBeCloseTo(8559.5, 2);
    expect(res.data.defiByProtocol).toEqual({ cetus: 5000, suilend: 3000, scallop: 559.5 });
    expect(res.data.defiSource).toBe('blockvision');
    expect(res.data.total).toBeCloseTo(12.345678 + 1000 + 8559.5, 2);
  });

  it('keeps total = wallet+savings when DeFi reports zero', async () => {
    const res = (await balanceCheckTool.call({}, ctx())) as BalanceResult;
    expect(res.data.defi).toBe(0);
    expect(res.data.total).toBeCloseTo(12.345678 + 1000, 2);
  });

  it('passes the target address (not user address) to the DeFi fetcher', async () => {
    const { fetchAddressDefiPortfolio } = await import('../blockvision-prices.js');
    await balanceCheckTool.call({ address: FUNKII_ADDR }, ctx());
    expect(fetchAddressDefiPortfolio).toHaveBeenCalledWith(FUNKII_ADDR, 'test');
    expect(fetchAddressDefiPortfolio).not.toHaveBeenCalledWith(USER_ADDR, 'test');
  });

  it('mentions DeFi in displayText when totalUsd > 0', async () => {
    const { fetchAddressDefiPortfolio } = await import('../blockvision-prices.js');
    (fetchAddressDefiPortfolio as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      totalUsd: 250,
      perProtocol: { suilend: 250 },
      pricedAt: Date.now(),
      source: 'blockvision',
    });
    const res = (await balanceCheckTool.call({}, ctx())) as BalanceResult;
    expect(res.displayText).toMatch(/DeFi positions/);
    expect(res.displayText).toContain('suilend');
    expect(res.displayText).toContain('250.00');
  });
});
