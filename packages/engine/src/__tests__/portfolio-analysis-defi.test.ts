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

  // -------------------------------------------------------------------
  // [Bug — 2026-04-28 round 2] audric snapshot trust gate
  //
  // Pre-fix the gate was `defiSource !== 'degraded'`, which let
  // `partial + 0` from the audric host through as authoritative. During
  // a BlockVision 429 burst the audric host's `/api/portfolio` returns
  // `partial + 0` (some protocols failed, the rest reported $0, no
  // sticky-positive in *its* process) — but the engine's direct fetcher
  // in the chat route may have a sticky-positive in *this* Vercel
  // instance's cache. Trusting audric's $0 silently dropped the DeFi
  // line that `balance_check` (always direct) showed correctly on the
  // same turn.
  //
  // New gate: trust audric only when source === 'blockvision' OR the
  // value is > 0. Otherwise fall through to the engine's direct fetcher
  // and pick up the sticky cache (or surface honest degradation).
  // -------------------------------------------------------------------

  it('falls through to direct fetcher when audric returns partial + 0 (sticky cache wins)', async () => {
    const { fetchAudricPortfolio } = await import('../audric-api.js');
    const { fetchAddressDefiPortfolio } = await import('../blockvision-prices.js');
    // Wallet shape mirrors the production bug-report wallet — long-tail
    // FAITH dominating, small USDC + SUI dust. When audric returns
    // partial+0 on DeFi the engine must still surface the wallet sum
    // ($229.92) plus the sticky-cached DeFi value ($620.87).
    (fetchAudricPortfolio as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      portfolio: {
        coins: [
          { coinType: '0xa::faith::FAITH', symbol: 'FAITH', balance: '34895618500000000', decimals: 9, usdValue: 222.62 },
          { coinType: '0xb::usdc::USDC', symbol: 'USDC', balance: '5124900', decimals: 6, usdValue: 5.13 },
          { coinType: '0x2::sui::SUI', symbol: 'SUI', balance: '1268700000', decimals: 9, usdValue: 2.17 },
        ],
        totalUsd: 229.92,
        pricedAt: Date.now(),
        source: 'blockvision' as const,
      },
      positions: {
        savings: 0, borrows: 0, savingsRate: 0, healthFactor: null,
        maxBorrow: 0, pendingRewards: 0, supplies: [], borrows_detail: [],
      },
      netWorthUsd: 229.92,
      estimatedDailyYield: 0,
      walletAllocations: {},
      defiValueUsd: 0,
      defiSource: 'partial' as const,
    });
    // Engine's direct fetcher has the sticky-cached positive value
    // (this is what happened in production: balance_check called the
    // direct fetcher on the same turn and got $620.87 partial-stale,
    // while portfolio_analysis trusted audric's $0).
    (fetchAddressDefiPortfolio as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      totalUsd: 620.87,
      perProtocol: { cetus: 620.87 },
      pricedAt: Date.now() - 60_000,
      source: 'partial-stale' as const,
    });

    const result = await portfolioAnalysisTool.call({}, ctx());
    const data = result.data as PortfolioResultData;

    expect(fetchAddressDefiPortfolio).toHaveBeenCalledTimes(1);
    expect(data.defiValue).toBeCloseTo(620.87, 2);
    expect(data.defiSource).toBe('partial-stale');
    // Total now matches what balance_check + Full Portfolio Overview
    // reported on the same wallet on the same turn — SSOT restored.
    expect(data.totalValue).toBeCloseTo(229.92 + 620.87, 1);
  });

  it('still trusts audric when source is partial but value > 0 (no double fetch)', async () => {
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
      netWorthUsd: 850,
      estimatedDailyYield: 0,
      walletAllocations: {},
      defiValueUsd: 750,
      defiSource: 'partial' as const,
    });

    const result = await portfolioAnalysisTool.call({}, ctx());
    const data = result.data as PortfolioResultData;

    expect(fetchAddressDefiPortfolio).not.toHaveBeenCalled();
    expect(data.defiValue).toBe(750);
    expect(data.defiSource).toBe('partial');
  });

  it('still trusts audric when source is partial-stale but value > 0 (no double fetch)', async () => {
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
      netWorthUsd: 720,
      estimatedDailyYield: 0,
      walletAllocations: {},
      defiValueUsd: 620,
      defiSource: 'partial-stale' as const,
    });

    const result = await portfolioAnalysisTool.call({}, ctx());
    const data = result.data as PortfolioResultData;

    expect(fetchAddressDefiPortfolio).not.toHaveBeenCalled();
    expect(data.defiValue).toBe(620);
    expect(data.defiSource).toBe('partial-stale');
  });

  it('falls through to direct fetcher when audric returns degraded + 0', async () => {
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
      netWorthUsd: 100,
      estimatedDailyYield: 0,
      walletAllocations: {},
      defiValueUsd: 0,
      defiSource: 'degraded' as const,
    });
    (fetchAddressDefiPortfolio as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      totalUsd: 1234,
      perProtocol: { cetus: 1234 },
      pricedAt: Date.now(),
      source: 'blockvision' as const,
    });

    const result = await portfolioAnalysisTool.call({}, ctx());
    const data = result.data as PortfolioResultData;

    expect(fetchAddressDefiPortfolio).toHaveBeenCalledTimes(1);
    expect(data.defiValue).toBe(1234);
    expect(data.defiSource).toBe('blockvision');
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
