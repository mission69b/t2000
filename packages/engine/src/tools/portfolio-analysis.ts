import { z } from 'zod';
import { buildTool } from '../tool.js';
import {
  fetchAddressPortfolio,
  fetchAddressDefiPortfolio,
  type AddressPortfolio,
  type DefiSummary,
} from '../blockvision-prices.js';
import { fetchAudricPortfolio } from '../audric-api.js';
import type { ServerPositionData } from '../types.js';

const inputSchema = z.object({
  address: z.string().optional().describe('Sui address to analyze (defaults to connected wallet)'),
});

interface AssetAllocation {
  symbol: string;
  amount: number;
  usdValue: number;
  percentage: number;
}

interface PortfolioInsight {
  type: 'info' | 'warning' | 'suggestion';
  message: string;
}

interface WeekChange {
  absoluteUsd: number;
  percentChange: number;
}

interface PortfolioResult {
  totalValue: number;
  walletValue: number;
  savingsValue: number;
  /**
   * [Bug — 2026-04-28] Aggregated DeFi value across non-NAVI protocols
   * (Cetus LPs, Bluefin, Suilend, etc.) — same field that's been on
   * `balance_check` since v0.50. Pre-fix this tool ignored DeFi entirely:
   * a wallet with $1,569 in Cetus LPs reported a $228 totalValue
   * (wallet only), under-counting net worth by 87% and prompting the LLM
   * to misclassify the wallet as "concentrated in FAITH" when actually
   * the bulk was in liquidity pools. Same SSOT-divergence class the v0.54
   * cache work fixed for FullPortfolioCanvas, manifesting in a different
   * tool that was written before DeFi support was bolted on.
   */
  defiValue: number;
  /** Provenance of the DeFi read — used by the UI card to caveat partial/degraded. */
  defiSource: DefiSummary['source'];
  debtValue: number;
  healthFactor: number | null;
  allocations: AssetAllocation[];
  stablePercentage: number;
  insights: PortfolioInsight[];
  savingsApy?: number;
  dailyEarning?: number;
  weekChange?: WeekChange;
  priceSource: AddressPortfolio['source'];
}

const STABLECOINS = new Set(['USDC', 'USDT', 'USDe', 'USDsui']);

export const portfolioAnalysisTool = buildTool({
  name: 'portfolio_analysis',
  description:
    'Analyze portfolio allocation, risk exposure, and yield optimization. Shows asset breakdown, diversification score, health factor assessment, and actionable suggestions.',
  inputSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      address: { type: 'string', description: 'Sui address to analyze (defaults to connected wallet)' },
    },
    required: [],
  },
  isReadOnly: true,
  async call(input, context) {
    const address = input.address ?? context.walletAddress;
    if (!address) {
      throw new Error('No wallet address provided. Sign in first.');
    }

    const DUST_USD = 0.01;

    // [single-source-of-truth — Apr 2026] Try audric's canonical
    // `/api/portfolio` first. When it returns a snapshot we already have
    // wallet + positions in one call so we skip the parallel BV +
    // positionFetcher fan-out below.
    const audricSnapshot = await fetchAudricPortfolio(
      address,
      context.env,
      context.signal,
    );

    // [v1.4 BlockVision] Fan out parallel fetches: BlockVision portfolio
    // (coins + balances + USD prices in one shot), positions (host
    // fetcher), 7-day portfolio history, AND non-NAVI DeFi positions
    // (Cetus/Bluefin/Suilend/etc.). Total wall time is bound by the
    // slowest. Re-uses the per-request portfolio cache so a sibling
    // `balance_check` in the same turn shares the response.
    //
    // [Bug — 2026-04-28] DeFi is now a first-class fetch: the audric
    // snapshot path uses the value the audric host already computed
    // (single source of truth), the standalone path falls back to a
    // direct fetchAddressDefiPortfolio call. This closes the gap where
    // portfolio_analysis ignored the $1,569 in Cetus LPs that
    // balance_check reported correctly.
    const apiUrl = context.env?.AUDRIC_INTERNAL_API_URL;
    const [portfolio, positions, weekHistResult, defiSummary]: [
      AddressPortfolio,
      ServerPositionData | null,
      { change?: WeekChange } | null,
      DefiSummary,
    ] = await Promise.all([
      audricSnapshot
        ? Promise.resolve(audricSnapshot.portfolio)
        : (async () => {
            if (context.portfolioCache) {
              const hit = context.portfolioCache.get(address);
              if (hit) return hit;
            }
            const fresh = await fetchAddressPortfolio(
              address,
              context.blockvisionApiKey,
              context.suiRpcUrl,
            );
            context.portfolioCache?.set(address, fresh);
            return fresh;
          })().catch((err): AddressPortfolio => {
            console.warn('[portfolio_analysis] portfolio fetch failed:', err);
            return {
              coins: [],
              totalUsd: 0,
              pricedAt: Date.now(),
              source: 'sui-rpc-degraded',
            };
          }),
      audricSnapshot
        ? Promise.resolve(audricSnapshot.positions)
        : context.positionFetcher
          ? context.positionFetcher(address).catch((err) => {
              console.warn('[portfolio_analysis] positionFetcher failed:', err);
              return null;
            })
          : Promise.resolve(null),
      apiUrl
        ? fetch(
            `${apiUrl}/api/analytics/portfolio-history?days=7`,
            { headers: { 'x-sui-address': address }, signal: context.signal },
          )
            .then((res) => (res.ok ? res.json() as Promise<{ change?: WeekChange }> : null))
            .catch(() => null)
        : Promise.resolve(null),
      // DeFi fetch — prefer the audric snapshot's already-computed value
      // (when present and not 'degraded'), otherwise call the engine's
      // direct aggregator. The 'degraded' check prevents the audric
      // path from masking a useful direct read when the audric route's
      // own DeFi field came back empty.
      audricSnapshot && audricSnapshot.defiSource !== 'degraded'
        ? Promise.resolve<DefiSummary>({
            totalUsd: audricSnapshot.defiValueUsd,
            perProtocol: {},
            pricedAt: Date.now(),
            source: audricSnapshot.defiSource,
          })
        : fetchAddressDefiPortfolio(address, context.blockvisionApiKey).catch(
            (err): DefiSummary => {
              console.warn('[portfolio_analysis] defi fetch failed:', err);
              return { totalUsd: 0, perProtocol: {}, pricedAt: Date.now(), source: 'degraded' };
            },
          ),
    ]);

    let walletValue = 0;
    const allAllocations: AssetAllocation[] = [];

    for (const coin of portfolio.coins) {
      const amount = Number(coin.balance) / 10 ** coin.decimals;
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const usdValue = coin.usdValue ?? (coin.price != null ? amount * coin.price : 0);
      walletValue += usdValue;
      allAllocations.push({ symbol: coin.symbol, amount, usdValue, percentage: 0 });
    }

    const allocations = allAllocations.filter((a) => a.usdValue >= DUST_USD);

    let savingsValue = 0;
    let debtValue = 0;
    let healthFactor: number | null = null;
    let savingsApy: number | undefined;
    let dailyEarning: number | undefined;

    if (positions) {
      savingsValue = positions.savings ?? 0;
      debtValue = positions.borrows ?? 0;
      healthFactor = positions.healthFactor ?? null;
      if (typeof positions.savingsRate === 'number' && positions.savingsRate > 0) {
        savingsApy = positions.savingsRate;
        dailyEarning = savingsValue * savingsApy / 365;
      }
    }

    let weekChange: WeekChange | undefined;
    if (weekHistResult?.change && weekHistResult.change.absoluteUsd !== 0) {
      weekChange = weekHistResult.change;
    }

    // [Bug — 2026-04-28] DeFi must be in totalValue. Pre-fix:
    //   totalValue = walletValue + savingsValue
    // → a wallet with $228 wallet + $1,569 in Cetus LPs reported $228
    // total, dropping 87% of the user's actual net worth.
    const defiValue = defiSummary.totalUsd;

    // [Bug — 2026-04-28] Synthesize per-protocol DeFi entries as
    // allocations so the pie/MiniBar reflects the true breakdown. Each
    // protocol becomes one row labelled with a `<protocol> DeFi` symbol
    // (e.g. `Cetus DeFi`, `Bluefin DeFi`). `amount: 0` because there's
    // no single underlying token — these positions are LP-pair / staked
    // composites whose unit isn't meaningful at the analysis level.
    // Skipped when defiSource is 'degraded' (per-protocol map is empty).
    if (defiSummary.source !== 'degraded') {
      for (const [protocol, usdValue] of Object.entries(defiSummary.perProtocol)) {
        if (typeof usdValue === 'number' && usdValue >= DUST_USD) {
          // Title-case the protocol name for display: 'cetus' → 'Cetus DeFi'.
          const label = protocol.charAt(0).toUpperCase() + protocol.slice(1) + ' DeFi';
          allocations.push({ symbol: label, amount: 0, usdValue, percentage: 0 });
        }
      }
    } else if (defiValue > 0) {
      // Sticky-positive cache may give us a totalUsd without a protocol
      // breakdown — surface a single aggregate row so the pie still
      // includes DeFi mass even if we can't break it down.
      allocations.push({ symbol: 'DeFi (aggregate)', amount: 0, usdValue: defiValue, percentage: 0 });
    }

    const totalValue = walletValue + savingsValue + defiValue;

    for (const a of allocations) {
      a.percentage = totalValue > 0 ? (a.usdValue / totalValue) * 100 : 0;
    }
    allocations.sort((a, b) => b.usdValue - a.usdValue);

    const stableValue = allocations
      .filter((a) => STABLECOINS.has(a.symbol))
      .reduce((s, a) => s + a.usdValue, 0) + savingsValue;
    const stablePercentage = totalValue > 0 ? (stableValue / totalValue) * 100 : 0;

    const insights: PortfolioInsight[] = [];

    if (healthFactor !== null && healthFactor < 1.5) {
      insights.push({
        type: 'warning',
        message: `Health factor ${healthFactor.toFixed(2)} is dangerously low. Consider repaying debt or adding collateral.`,
      });
    } else if (healthFactor !== null && healthFactor < 2.5) {
      insights.push({
        type: 'warning',
        message: `Health factor ${healthFactor.toFixed(2)} is moderate. Monitor your positions.`,
      });
    }

    if (stablePercentage > 80) {
      insights.push({
        type: 'suggestion',
        message: `${stablePercentage.toFixed(0)}% stablecoins. Consider diversifying into yield-bearing positions.`,
      });
    }

    const idleCash = allocations.find((a) => a.symbol === 'USDC');
    if (idleCash && idleCash.usdValue > 10) {
      insights.push({
        type: 'suggestion',
        message: `$${idleCash.usdValue.toFixed(2)} USDC idle in wallet. Deposit into NAVI savings for ~4-5% APY.`,
      });
    }

    if (allocations.length === 1) {
      insights.push({
        type: 'info',
        message: 'Portfolio is concentrated in a single asset.',
      });
    }

    // [Bug — 2026-04-28] Caveat insight when DeFi was unreachable so the
    // LLM doesn't narrate the partial total as if it were complete.
    if (defiSummary.source === 'degraded') {
      insights.push({
        type: 'warning',
        message: 'DeFi positions could not be loaded — total may under-count any Cetus/Bluefin/Suilend value.',
      });
    } else if (defiSummary.source === 'partial') {
      insights.push({
        type: 'warning',
        message: 'DeFi data is partial — at least one protocol failed; total may under-count.',
      });
    }

    const result: PortfolioResult = {
      totalValue,
      walletValue,
      savingsValue,
      defiValue,
      defiSource: defiSummary.source,
      debtValue,
      healthFactor,
      allocations: allocations.slice(0, 10),
      stablePercentage,
      insights,
      savingsApy,
      dailyEarning,
      weekChange,
      priceSource: portfolio.source,
    };

    const defiSegment = defiValue > 0
      ? ` | DeFi: $${defiValue.toFixed(2)}${defiSummary.source === 'partial' ? ' (partial)' : ''}`
      : '';
    const topLine = `Total: $${totalValue.toFixed(2)} | Wallet: $${walletValue.toFixed(2)} | Savings: $${savingsValue.toFixed(2)}${defiSegment}`;
    const insightLines = insights.map((i) => `${i.type === 'warning' ? '⚠' : '→'} ${i.message}`).join('\n');

    return {
      data: result,
      displayText: `${topLine}\n${insightLines}`,
    };
  },
});
