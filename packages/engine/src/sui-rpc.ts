// ---------------------------------------------------------------------------
// Direct Sui JSON-RPC coin fetcher — no SDK dependency required.
// Uses suix_getAllBalances to get wallet coin balances.
// ---------------------------------------------------------------------------

const SUI_MAINNET_URL = 'https://fullnode.mainnet.sui.io:443';

export interface SuiCoinBalance {
  coinType: string;
  totalBalance: string;
  coinObjectCount: number;
}

const KNOWN_COINS: Record<string, { symbol: string; decimals: number }> = {
  '0x2::sui::SUI': { symbol: 'SUI', decimals: 9 },
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC': { symbol: 'USDC', decimals: 6 },
  '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN': { symbol: 'USDT', decimals: 6 },
  '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT': { symbol: 'USDT', decimals: 6 },
  '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH': { symbol: 'ETH', decimals: 8 },
  '0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC': { symbol: 'BTC', decimals: 8 },
  '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL': { symbol: 'WAL', decimals: 9 },
  '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX': { symbol: 'NAVX', decimals: 9 },
  '0x9d297676e7a4b771ab023291377b2adfaa4938fb9080b8d12430e4b108b836a9::xaum::XAUM': { symbol: 'GOLD', decimals: 6 },
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
    const known = KNOWN_COINS[b.coinType];
    const symbol = known?.symbol ?? extractSymbol(b.coinType);
    const decimals = known?.decimals ?? 9;
    return {
      coinType: b.coinType,
      symbol,
      decimals,
      totalBalance: b.totalBalance,
      coinObjectCount: b.coinObjectCount,
    };
  });
}

function extractSymbol(coinType: string): string {
  const parts = coinType.split('::');
  return parts[parts.length - 1] ?? 'UNKNOWN';
}
