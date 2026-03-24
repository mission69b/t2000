'use client';

import { useQuery } from '@tanstack/react-query';
import { useSuiClient } from '@mysten/dapp-kit';

const MIST_PER_SUI = 1_000_000_000;
const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const USDC_DECIMALS = 6;
const CETUS_USDC_SUI_POOL = '0xb8d7d9e66a60c239e7a60110efcf8571655daa67b55b7534e1bc855fcff644d9';

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

      const [suiBal, usdcBal, suiPrice, posData, ratesData] = await Promise.all([
        client.getBalance({ owner: address, coinType: '0x2::sui::SUI' }),
        client.getBalance({ owner: address, coinType: USDC_TYPE }).catch(() => ({ totalBalance: '0' })),
        fetchSuiPrice(client),
        fetch(`/api/positions?address=${address}`)
          .then(r => r.json())
          .catch(() => ({ savings: 0, borrows: 0 })),
        fetch('/api/rates')
          .then(r => r.json())
          .catch(() => ({ rates: [], bestSaveRate: null })),
      ]);

      const r2 = (n: number) => Math.round(n * 100) / 100;

      const sui = r2(Number(suiBal.totalBalance) / MIST_PER_SUI);
      const usdc = r2(Number(usdcBal.totalBalance) / (10 ** USDC_DECIMALS));
      const suiUsd = r2(sui * suiPrice);

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
        loading: false,
      };
    },
  });
}
