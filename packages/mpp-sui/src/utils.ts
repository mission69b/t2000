import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

export const SUI_USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

/**
 * Fetch ALL coins of a given type, handling Sui pagination (max 50 per page).
 */
export interface CoinInfo {
  coinObjectId: string;
  balance: string;
}

export async function fetchCoins(
  client: SuiJsonRpcClient,
  owner: string,
  coinType: string,
): Promise<CoinInfo[]> {
  const coins: CoinInfo[] = [];
  let cursor: string | null | undefined;
  let hasNext = true;
  while (hasNext) {
    const page = await client.getCoins({ owner, coinType, cursor: cursor ?? undefined });
    coins.push(...page.data.map((c) => ({ coinObjectId: c.coinObjectId, balance: c.balance })));
    cursor = page.nextCursor;
    hasNext = page.hasNextPage;
  }
  return coins;
}

/**
 * Parse a string amount to raw bigint units without floating-point math.
 * "0.01" with 6 decimals → 10000n
 */
export function parseAmountToRaw(amount: string, decimals: number): bigint {
  const [whole = '0', frac = ''] = amount.split('.');
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFrac);
}
