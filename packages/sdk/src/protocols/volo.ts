/**
 * VOLO vSUI liquid staking — thin transaction builders.
 * No SDK dependency. Two Move calls, immutable contract addresses.
 */
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';

export const VOLO_PKG = '0x68d22cf8bdbcd11ecba1e094922873e4080d4d11133e2443fddda0bfd11dae20';
export const VOLO_POOL = '0x2d914e23d82fedef1b5f56a32d5c64bdcc3087ccfea2b4d6ea51a71f587840e5';
export const VOLO_METADATA = '0x680cd26af32b2bde8d3361e804c53ec1d1cfe24c7f039eb7f549e8dfde389a60';
export const VSUI_TYPE = '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT';
export const SUI_SYSTEM_STATE = '0x05';
export const MIN_STAKE_MIST = 1_000_000_000n; // 1 SUI

const VOLO_STATS_URL = 'https://open-api.naviprotocol.io/api/volo/stats';

export interface VoloStats {
  apy: number;
  exchangeRate: number;
  tvl: number;
}

/**
 * Fetch VOLO vSUI staking stats (APY, exchange rate, TVL).
 */
export async function getVoloStats(): Promise<VoloStats> {
  const res = await fetch(VOLO_STATS_URL, {
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`VOLO stats API error: HTTP ${res.status}`);
  }

  const data = await res.json() as {
    apy?: number;
    exchange_rate?: number;
    exchangeRate?: number;
    tvl?: number;
    data?: { apy?: number; exchange_rate?: number; exchangeRate?: number; tvl?: number };
  };

  const d = data.data ?? data;

  return {
    apy: d.apy ?? 0,
    exchangeRate: d.exchange_rate ?? d.exchangeRate ?? 1,
    tvl: d.tvl ?? 0,
  };
}

/**
 * Build a PTB to stake SUI for vSUI.
 */
export async function buildStakeVSuiTx(
  _client: SuiJsonRpcClient,
  address: string,
  amountMist: bigint,
): Promise<Transaction> {
  if (amountMist < MIN_STAKE_MIST) {
    throw new Error(`Minimum stake is 1 SUI (${MIN_STAKE_MIST} MIST). Got: ${amountMist}`);
  }

  const tx = new Transaction();
  tx.setSender(address);

  const [suiCoin] = tx.splitCoins(tx.gas, [amountMist]);

  const [vSuiCoin] = tx.moveCall({
    target: `${VOLO_PKG}::stake_pool::stake`,
    arguments: [
      tx.object(VOLO_POOL),
      tx.object(VOLO_METADATA),
      tx.object(SUI_SYSTEM_STATE),
      suiCoin,
    ],
  });

  tx.transferObjects([vSuiCoin], address);
  return tx;
}

/**
 * Build a PTB to unstake vSUI back to SUI.
 */
export async function buildUnstakeVSuiTx(
  client: SuiJsonRpcClient,
  address: string,
  amountMist: bigint | 'all',
): Promise<Transaction> {
  const coins = await fetchVSuiCoins(client, address);
  if (coins.length === 0) {
    throw new Error('No vSUI found in wallet.');
  }

  const tx = new Transaction();
  tx.setSender(address);

  const primary = tx.object(coins[0].coinObjectId);
  if (coins.length > 1) {
    tx.mergeCoins(primary, coins.slice(1).map((c) => tx.object(c.coinObjectId)));
  }

  let vSuiCoin: TransactionObjectArgument;
  if (amountMist === 'all') {
    vSuiCoin = primary;
  } else {
    [vSuiCoin] = tx.splitCoins(primary, [amountMist]);
  }

  const [suiCoin] = tx.moveCall({
    target: `${VOLO_PKG}::stake_pool::unstake`,
    arguments: [
      tx.object(VOLO_POOL),
      tx.object(VOLO_METADATA),
      tx.object(SUI_SYSTEM_STATE),
      vSuiCoin,
    ],
  });

  tx.transferObjects([suiCoin], address);
  return tx;
}

async function fetchVSuiCoins(
  client: SuiJsonRpcClient,
  address: string,
): Promise<Array<{ coinObjectId: string; balance: string }>> {
  const all: Array<{ coinObjectId: string; balance: string }> = [];
  let cursor: string | null | undefined;
  let hasNext = true;
  while (hasNext) {
    const page = await client.getCoins({
      owner: address,
      coinType: VSUI_TYPE,
      cursor: cursor ?? undefined,
    });
    all.push(...page.data.map((c) => ({ coinObjectId: c.coinObjectId, balance: c.balance })));
    cursor = page.nextCursor;
    hasNext = page.hasNextPage;
  }
  return all;
}
