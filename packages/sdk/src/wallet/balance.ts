import type { SuiClient } from '@mysten/sui/client';
import { SUPPORTED_ASSETS, MIST_PER_SUI } from '../constants.js';
import type { BalanceResponse } from '../types.js';

export async function queryBalance(
  client: SuiClient,
  address: string,
): Promise<BalanceResponse> {
  const [usdcBalance, suiBalance] = await Promise.all([
    client.getBalance({ owner: address, coinType: SUPPORTED_ASSETS.USDC.type }),
    client.getBalance({ owner: address, coinType: SUPPORTED_ASSETS.SUI.type }),
  ]);

  const usdcAmount = Number(usdcBalance.totalBalance) / 10 ** SUPPORTED_ASSETS.USDC.decimals;
  const suiAmount = Number(suiBalance.totalBalance) / Number(MIST_PER_SUI);

  const savings = 0; // Merged from Suilend in T2000.balance()

  // TODO: fetch SUI price from Cetus in Week 3
  const suiPriceUsd = 3.50;
  const usdEquiv = suiAmount * suiPriceUsd;

  const total = usdcAmount + savings + usdEquiv;

  return {
    available: usdcAmount,
    savings,
    gasReserve: {
      sui: suiAmount,
      usdEquiv,
    },
    total,
    assets: {
      USDC: usdcAmount,
      SUI: suiAmount,
    },
  };
}
