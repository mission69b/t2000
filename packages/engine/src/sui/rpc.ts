// ---------------------------------------------------------------------------
// Direct Sui JSON-RPC coin fetcher — no SDK dependency required.
// Uses suix_getAllBalances to get wallet coin balances.
// ---------------------------------------------------------------------------

import { getDecimalsForCoinType, resolveSymbol } from '@t2000/sdk';

const SUI_MAINNET_URL = 'https://fullnode.mainnet.sui.io:443';

export interface SuiCoinBalance {
  coinType: string;
  totalBalance: string;
  coinObjectCount: number;
}

/** Supplementary coins not in the SDK registry (legacy/wrapped variants). */
const EXTRA_COINS: Record<string, { symbol: string; decimals: number }> = {
  '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN': { symbol: 'USDT', decimals: 6 },
};

export interface WalletCoin {
  coinType: string;
  symbol: string;
  decimals: number;
  totalBalance: string;
  coinObjectCount: number;
}

/**
 * Fetch all coin balances for an address directly from the Sui JSON-RPC.
 * Returns enriched objects with known symbol/decimals where possible.
 */
export async function fetchWalletCoins(
  address: string,
  rpcUrl?: string,
): Promise<WalletCoin[]> {
  const url = rpcUrl || SUI_MAINNET_URL;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_getAllBalances',
      params: [address],
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`Sui RPC error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as {
    result?: SuiCoinBalance[];
    error?: { message: string };
  };

  if (json.error) {
    throw new Error(`Sui RPC error: ${json.error.message}`);
  }

  const balances = json.result ?? [];

  return balances.map((b) => {
    const extra = EXTRA_COINS[b.coinType];
    const symbol = extra?.symbol ?? resolveSymbol(b.coinType);
    const decimals = extra?.decimals ?? getDecimalsForCoinType(b.coinType);
    return {
      coinType: b.coinType,
      symbol,
      decimals,
      totalBalance: b.totalBalance,
      coinObjectCount: b.coinObjectCount,
    };
  });
}
