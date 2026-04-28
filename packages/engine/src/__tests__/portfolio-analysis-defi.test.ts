// ---------------------------------------------------------------------------
// Regression suite for the [Bug — 2026-04-28] portfolio_analysis fix.
//
// Pre-fix manifestation: a wallet with $228 in coin holdings + $1,569 in
// Cetus LPs reported `totalValue: 228` from this tool — wallet only,
// dropping 87% of the user's actual net worth. The LLM then narrated
// the wallet as "concentrated in FAITH" when actually the bulk was in
// liquidity pools, contradicting balance_check's correct $1,797 read on
// the same wallet in the same chat session.
//
// Root cause: portfolio_analysis was written before DeFi support was
// added to balance_check (v0.50). The engine never updated it, so it
// stayed in a pre-DeFi world even after the rest of the harness
// learned about Cetus/Bluefin/Suilend.
//
// Fix: fan-out a fetchAddressDefiPortfolio call alongside the existing
// portfolio + positions fetches, surface the value as `defiValue` +
// `defiSource` on the result, and add it to `totalValue`. Per-protocol
// values appear as synthetic allocations so the breakdown bar is
// accurate. Same SSOT principle that drives balance_check's DeFi line.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';

const TEST_ADDR = `0x${'1bf820'.padEnd(64, '0')}`;

vi.mock('../blockvision-prices.js', () => ({
  fetchAddressPortfolio: vi.fn(async () => ({
    coins: [
      { coinType: '0xa::faith::FAITH', symbol: 'FAITH', balance: '34895618500000000', decimals: 9, usdValue: 220.60 },
      { coinType: '0xb::usdc::USDC', symbol: 'USDC', balance: '5124900', decimals: 6, usdValue: 5.13 },
      { coinType: '0x2::sui::SUI', symbol: 'SUI', balance: '1268700000', decimals: 9, usdValue: 1.18 },
    ],
    totalUsd: 226.91,
    pricedAt: Date.now(),
    source: 'blockvision' as const,
  })),
  fetchAddressDefiPortfolio: vi.fn(async () => ({
    totalUsd: 1569.46,
    perProtocol: { cetus: 1569.46 },
    pricedAt: Date.now(),
    source: 'blockvision' as const,
  })),
}));

vi.mock('../audric-api.js', () => ({
  // Force the standalone-engine code path so portfolio-analysis hits
  // fetchAddressDefiPortfolio directly. The audric-snapshot path is
  // exercised in a separate test below by overriding this mock.
  fetchAudricPortfolio: vi.fn(async () => null),
}));

import { portfolioAnalysisTool } from '../tools/portfolio-analysis.js';

interface PortfolioResultData {
  totalValue: number;
  walletValue: number;
  savingsValue: number;
  defiValue: number;
  defiSource: string;
  debtValue: number;
  allocations: Array<{ symbol: string; usdValue: number; percentage: number }>;
  insights: Array<{ type: string; message: string }>;
}

const ctx = () => ({
  walletAddress: TEST_ADDR,
  blockvisionApiKey: 'test',
  suiRpcUrl: 'https://fullnode.mainnet.sui.io',
  positionFetcher: vi.fn(async () => ({
    savings: 0,
    borrows: 0,
    savingsRate: 0,
    healthFactor: null,
    maxBorrow: 0,
    pendingRewards: 0,
    supplies: [],
    borrows_detail: [],
  })),
});

describe('portfolio_analysis — DeFi inclusion (Bug 2026-04-28)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('totalValue includes DeFi: $228 wallet + $1,569 Cetus = $1,797 (the bug-report wallet)', async () => {
    const result = await portfolioAnalysisTool.call({}, ctx());
    const data = result.data as PortfolioResultData;
    expect(data.walletValue).toBeCloseTo(226.91, 1);
    expect(data.defiValue).toBeCloseTo(1569.46, 1);
    expect(data.defiSource).toBe('blockvision');
    expect(data.totalValue).toBeCloseTo(226.91 + 1569.46, 1);
    expect(data.totalValue).toBeGreaterThan(1700);
    // Pre-fix this was 226.91 — the bug.
    expect(data.totalValue).not.toBeLessThan(1700);
  });

  it('exposes per-protocol DeFi as synthetic allocations so the pie reflects reality', async () => {
    const result = await portfolioAnalysisTool.call({}, ctx());
    const data = result.data as PortfolioResultData;
    const cetusEntry = data.allocations.find((a) => a.symbol === 'Cetus DeFi');
    expect(cetusEntry).toBeDefined();
    expect(cetusEntry!.usdValue).toBeCloseTo(1569.46, 1);
    // Cetus is the largest position — should be sorted to the top.
    expect(data.allocations[0].symbol).toBe('Cetus DeFi');
    // Allocations should sum (approximately) to total — within 5% rounding.
    const allocSum = data.allocations.reduce((s, a) => s + a.usdValue, 0);
    expect(allocSum / data.totalValue).toBeGreaterThan(0.95);
  });

  it('does NOT misclassify the wallet as FAITH-concentrated when DeFi is the bulk', async () => {
    const result = await portfolioAnalysisTool.call({}, ctx());
    const data = result.data as PortfolioResultData;
    const faithEntry = data.allocations.find((a) => a.symbol === 'FAITH');
    expect(faithEntry).toBeDefined();
    // FAITH is ~12% of the corrected total ($220 / $1,797), NOT 97%.
    expect(faithEntry!.percentage).toBeLessThan(20);
    // Pre-fix this was 97% and triggered a "single-asset concentration"
    // insight that scared the user about a FAITH depeg risk that
    // wasn't actually the dominant exposure.
  });

  it('displayText surfaces DeFi to the LLM so it can narrate accurately', async () => {
    const result = await portfolioAnalysisTool.call({}, ctx());
    expect(result.displayText).toContain('DeFi:');
    expect(result.displayText).toContain('1569.46');
  });

  it("emits a 'partial' caveat insight when defiSource is partial", async () => {
    const { fetchAddressDefiPortfolio } = await import('../blockvision-prices.js');
    (fetchAddressDefiPortfolio as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      totalUsd: 800,
      perProtocol: { cetus: 800 },
      pricedAt: Date.now(),
      source: 'partial' as const,
    });
    const result = await portfolioAnalysisTool.call({}, ctx());
    const data = result.data as PortfolioResultData;
    expect(data.defiSource).toBe('partial');
    const partialInsight = data.insights.find((i) => i.message.toLowerCase().includes('partial'));
    expect(partialInsight).toBeDefined();
    expect(partialInsight!.type).toBe('warning');
    // Value still flows into totalValue even when partial.
    expect(data.totalValue).toBeGreaterThan(1000);
  });

  it("emits an 'unreachable' caveat when defiSource is degraded", async () => {
    const { fetchAddressDefiPortfolio } = await import('../blockvision-prices.js');
    (fetchAddressDefiPortfolio as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      totalUsd: 0,
      perProtocol: {},
      pricedAt: Date.now(),
      source: 'degraded' as const,
    });
    const result = await portfolioAnalysisTool.call({}, ctx());
    const data = result.data as PortfolioResultData;
    expect(data.defiSource).toBe('degraded');
    const degradedInsight = data.insights.find((i) => i.message.toLowerCase().includes('could not be loaded'));
    expect(degradedInsight).toBeDefined();
    expect(degradedInsight!.type).toBe('warning');
  });

  it('falls back gracefully when fetchAddressDefiPortfolio throws', async () => {
    const { fetchAddressDefiPortfolio } = await import('../blockvision-prices.js');
    (fetchAddressDefiPortfolio as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('blockvision 429'));
    const result = await portfolioAnalysisTool.call({}, ctx());
    const data = result.data as PortfolioResultData;
    // Wallet value still surfaces; defi defaults to 0 + 'degraded'.
    expect(data.walletValue).toBeGreaterThan(0);
    expect(data.defiValue).toBe(0);
    expect(data.defiSource).toBe('degraded');
  });

  it('uses audric snapshot DeFi value when available (SSOT, no double fetch)', async () => {
    const { fetchAudricPortfolio } = await import('../audric-api.js');
    const { fetchAddressDefiPortfolio } = await import('../blockvision-prices.js');
    (fetchAudricPortfolio as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      portfolio: {
        coins: [],
        totalUsd: 100,
        pricedAt: Date.now(),
        source: 'blockvision' as const,
      },
      positions: {
        savings: 0, borrows: 0, savingsRate: 0, healthFactor: null,
        maxBorrow: 0, pendingRewards: 0, supplies: [], borrows_detail: [],
      },
      netWorthUsd: 1700,
      estimatedDailyYield: 0,
      walletAllocations: {},
      defiValueUsd: 1600,
      defiSource: 'blockvision' as const,
    });
    const result = await portfolioAnalysisTool.call({}, ctx());
    const data = result.data as PortfolioResultData;
    expect(data.defiValue).toBe(1600);
    // The direct DeFi fetcher must NOT be called when the audric
    // snapshot already has a non-degraded value.
    expect(fetchAddressDefiPortfolio).not.toHaveBeenCalled();
  });
});
