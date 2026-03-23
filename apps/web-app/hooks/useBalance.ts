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
  sui: number;
  suiUsd: number;
  usdc: number;
  suiPrice: number;
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

      const [suiBal, usdcBal, suiPrice] = await Promise.all([
        client.getBalance({ owner: address, coinType: '0x2::sui::SUI' }),
        client.getBalance({ owner: address, coinType: USDC_TYPE }).catch(() => ({ totalBalance: '0' })),
        fetchSuiPrice(client),
      ]);

      const sui = Number(suiBal.totalBalance) / MIST_PER_SUI;
      const usdc = Number(usdcBal.totalBalance) / (10 ** USDC_DECIMALS);
      const suiUsd = sui * suiPrice;

      const checking = usdc + suiUsd;
      const savings = 0; // Will be populated when protocol positions are wired

      return {
        total: checking + savings,
        checking,
        savings,
        sui,
        suiUsd,
        usdc,
        suiPrice,
        loading: false,
      };
    },
  });
}
