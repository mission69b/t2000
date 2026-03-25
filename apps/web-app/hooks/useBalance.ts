'use client';

import { useQuery } from '@tanstack/react-query';
import { useSuiClient } from '@mysten/dapp-kit';

const MIST_PER_SUI = 1_000_000_000;
const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const USDC_DECIMALS = 6;
const CETUS_USDC_SUI_POOL = '0xb8d7d9e66a60c239e7a60110efcf8571655daa67b55b7534e1bc855fcff644d9';

const TRADEABLE_COINS: Record<string, { type: string; decimals: number }> = {
  USDT: { type: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT', decimals: 6 },
  BTC: { type: '0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC', decimals: 8 },
  ETH: { type: '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH', decimals: 8 },
  GOLD: { type: '0x9d297676e7a4b771ab023291377b2adfaa4938fb9080b8d12430e4b108b836a9::xaum::XAUM', decimals: 9 },
};

export interface BalanceData {
  total: number;
  checking: number;
  savings: number;
  borrows: number;
  sui: number;
  suiUsd: number;
  usdc: number;
  suiPrice: number;
  savingsRate: number;
  healthFactor: number | null;
  maxBorrow: number;
  pendingRewards: number;
  bestSaveRate: { protocol: string; rate: number } | null;
  /** Raw token balances for tradeable assets (BTC, ETH, GOLD, USDT) */
  assetBalances: Record<string, number>;
  loading: boolean;
}

async function fetchSuiPrice(client: ReturnType<typeof useSuiClient>): Promise<number> {
  try {
    const pool = await client.getObject({
      id: CETUS_USDC_SUI_POOL,
      options: { showContent: true },
    });

    if (pool.data?.content?.dataType === 'moveObject') {
      const fields = pool.data.content.fields as Record<string, unknown>;
      const currentSqrtPrice = BigInt(String(fields.current_sqrt_price ?? '0'));

      if (currentSqrtPrice > BigInt(0)) {
        const Q64 = BigInt(2) ** BigInt(64);
        const sqrtPriceFloat = Number(currentSqrtPrice) / Number(Q64);
        const rawPrice = sqrtPriceFloat * sqrtPriceFloat;
        const price = 1000 / rawPrice;
        if (price > 0.01 && price < 1000) return price;
      }
    }
  } catch {
    // fallback
  }
  return 1.0;
}

export function useBalance(address: string | null) {
  const client = useSuiClient();

  return useQuery<BalanceData>({
    queryKey: ['balance', address],
    enabled: !!address,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    queryFn: async (): Promise<BalanceData> => {
      if (!address) throw new Error('No address');

      const tradeableEntries = Object.entries(TRADEABLE_COINS);
      const [suiBal, usdcBal, suiPrice, posData, ratesData, ...tradeableBals] = await Promise.all([
        client.getBalance({ owner: address, coinType: '0x2::sui::SUI' }),
        client.getBalance({ owner: address, coinType: USDC_TYPE }).catch(() => ({ totalBalance: '0' })),
        fetchSuiPrice(client),
        fetch(`/api/positions?address=${address}`)
          .then(r => r.json())
          .catch(() => ({ savings: 0, borrows: 0 })),
        fetch('/api/rates')
          .then(r => r.json())
          .catch(() => ({ rates: [], bestSaveRate: null })),
        ...tradeableEntries.map(([, info]) =>
          client.getBalance({ owner: address, coinType: info.type })
            .catch(() => ({ totalBalance: '0' })),
        ),
      ]);

      const r2 = (n: number) => Math.round(n * 100) / 100;

      const sui = r2(Number(suiBal.totalBalance) / MIST_PER_SUI);
      const usdc = r2(Number(usdcBal.totalBalance) / (10 ** USDC_DECIMALS));
      const suiUsd = r2(sui * suiPrice);

      const assetBalances: Record<string, number> = {};
      tradeableEntries.forEach(([symbol, info], idx) => {
        const raw = Number(tradeableBals[idx].totalBalance);
        assetBalances[symbol] = raw / 10 ** info.decimals;
      });

      const checking = r2(usdc + suiUsd);
      const savings = r2(posData.savings ?? 0);
      const borrows = r2(posData.borrows ?? 0);
      const savingsRate = r2(posData.savingsRate ?? 0);
      const healthFactor = posData.healthFactor ?? null;
      const maxBorrow = r2(posData.maxBorrow ?? 0);
      const pendingRewards = r2(posData.pendingRewards ?? 0);
      const bestSaveRate = ratesData.bestSaveRate ?? null;

      return {
        total: r2(checking + savings - borrows),
        checking,
        savings,
        borrows,
        sui,
        suiUsd,
        usdc,
        suiPrice: r2(suiPrice),
        savingsRate,
        healthFactor,
        maxBorrow,
        pendingRewards,
        bestSaveRate,
        assetBalances,
        loading: false,
      };
    },
  });
}
