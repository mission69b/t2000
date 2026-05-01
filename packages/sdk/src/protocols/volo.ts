/**
 * VOLO vSUI liquid staking — thin transaction builders.
 * No SDK dependency. Two Move calls, immutable contract addresses.
 */
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { SUI_TYPE } from '../token-registry.js';

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
  const coins = await fetchCoinsByType(client, address, VSUI_TYPE);
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

/**
 * SPEC 7 § "Layer 1" Volo stake appender. Two modes.
 *
 * Wallet mode (`inputCoin` omitted): fetches SUI coins from the
 * sender's wallet (paginated), merges/splits to `amountMist`. Mirrors
 * the audric host's `transactions/prepare/route.ts:524-545` volo-stake
 * branch — sponsored-flow safe (does NOT consume `tx.gas`, which
 * belongs to the Enoki sponsor in sponsored flows).
 *
 * For non-sponsored flows where the caller owns `tx.gas`, prefer
 * `buildStakeVSuiTx` directly (it splits from gas, which is more
 * efficient by avoiding the extra getCoins RTT).
 *
 * Chain mode (`inputCoin` provided): consumes the passed-in SUI coin
 * ref entirely. Used for chained flows like "swap USDC → SUI → stake".
 * The caller is responsible for splitting upstream if they only want
 * part of the input coin staked.
 *
 * @returns
 *   - `coin`: vSUI output coin ref, ready for downstream consumption or
 *     wallet transfer (`tx.transferObjects`).
 *   - `effectiveAmountMist`: SUI mist consumed (echoes `input.amountMist`
 *     in both modes; chain-mode trusts the caller-supplied value since
 *     the actual coin balance is opaque).
 */
export async function addStakeVSuiToTx(
  tx: Transaction,
  client: SuiJsonRpcClient,
  address: string,
  input: {
    amountMist: bigint;
    inputCoin?: TransactionObjectArgument;
  },
): Promise<{ coin: TransactionObjectArgument; effectiveAmountMist: bigint }> {
  if (input.amountMist < MIN_STAKE_MIST) {
    throw new Error(`Minimum stake is 1 SUI (${MIN_STAKE_MIST} MIST). Got: ${input.amountMist}`);
  }

  let suiCoin: TransactionObjectArgument;

  if (input.inputCoin) {
    suiCoin = input.inputCoin;
  } else {
    const coins = await fetchCoinsByType(client, address, SUI_TYPE);
    if (coins.length === 0) {
      throw new Error('No SUI coins found in wallet');
    }

    const totalBalance = coins.reduce((sum, c) => sum + BigInt(c.balance), 0n);
    if (totalBalance < input.amountMist) {
      throw new Error(`Insufficient SUI: need ${input.amountMist} MIST, have ${totalBalance}`);
    }

    const primary = tx.object(coins[0].coinObjectId);
    if (coins.length > 1) {
      tx.mergeCoins(primary, coins.slice(1).map((c) => tx.object(c.coinObjectId)));
    }
    [suiCoin] = tx.splitCoins(primary, [input.amountMist]);
  }

  const [vSuiCoin] = tx.moveCall({
    target: `${VOLO_PKG}::stake_pool::stake`,
    arguments: [
      tx.object(VOLO_POOL),
      tx.object(VOLO_METADATA),
      tx.object(SUI_SYSTEM_STATE),
      suiCoin,
    ],
  });

  return { coin: vSuiCoin, effectiveAmountMist: input.amountMist };
}

/**
 * SPEC 7 § "Layer 1" Volo unstake appender. Two modes.
 *
 * Wallet mode (`inputCoin` omitted): fetches vSUI coins from the
 * sender's wallet (paginated), merges to a primary coin, splits to
 * `amountMist` (or consumes the entire merged primary if `'all'`).
 *
 * Chain mode (`inputCoin` provided): consumes the passed-in vSUI coin
 * ref. With `amountMist = 'all'`, the entire input coin is unstaked.
 * With a bigint `amountMist`, the input coin is split internally and
 * only that portion unstaked (the leftover stays accessible via the
 * original ref). Used for chained flows where vSUI was just produced
 * by a prior step.
 *
 * @returns
 *   - `coin`: SUI output coin ref, ready for downstream consumption
 *     (e.g. `addSendToTx`, `addStakeVSuiToTx` re-stake) or wallet
 *     transfer (`tx.transferObjects`).
 *   - `effectiveAmountMist`: input vSUI mist consumed; echoes
 *     `input.amountMist` (`'all'` is preserved as-is — the actual SUI
 *     received differs from input vSUI by the pool exchange rate, so
 *     callers needing the SUI amount must query `getVoloStats` or
 *     parse balance changes from the executed tx).
 */
export async function addUnstakeVSuiToTx(
  tx: Transaction,
  client: SuiJsonRpcClient,
  address: string,
  input: {
    amountMist: bigint | 'all';
    inputCoin?: TransactionObjectArgument;
  },
): Promise<{ coin: TransactionObjectArgument; effectiveAmountMist: bigint | 'all' }> {
  let vSuiCoin: TransactionObjectArgument;

  if (input.inputCoin) {
    if (input.amountMist === 'all') {
      vSuiCoin = input.inputCoin;
    } else {
      [vSuiCoin] = tx.splitCoins(input.inputCoin, [input.amountMist]);
    }
  } else {
    const coins = await fetchCoinsByType(client, address, VSUI_TYPE);
    if (coins.length === 0) {
      throw new Error('No vSUI found in wallet.');
    }

    const primary = tx.object(coins[0].coinObjectId);
    if (coins.length > 1) {
      tx.mergeCoins(primary, coins.slice(1).map((c) => tx.object(c.coinObjectId)));
    }

    if (input.amountMist === 'all') {
      vSuiCoin = primary;
    } else {
      [vSuiCoin] = tx.splitCoins(primary, [input.amountMist]);
    }
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

  return { coin: suiCoin, effectiveAmountMist: input.amountMist };
}

/**
 * Paginated coin lookup by coin type. Local helper shared between
 * `buildUnstakeVSuiTx` (fetches vSUI), `addStakeVSuiToTx` (fetches
 * SUI), and `addUnstakeVSuiToTx` (fetches vSUI). P2.2c may extract
 * a shared `wallet/coinSelection.ts` once `addSendFromWalletToTx` and
 * the registry adapter need the same prelude.
 */
async function fetchCoinsByType(
  client: SuiJsonRpcClient,
  owner: string,
  coinType: string,
): Promise<Array<{ coinObjectId: string; balance: string }>> {
  const all: Array<{ coinObjectId: string; balance: string }> = [];
  let cursor: string | null | undefined;
  let hasNext = true;
  while (hasNext) {
    const page = await client.getCoins({
      owner,
      coinType,
      cursor: cursor ?? undefined,
    });
    all.push(...page.data.map((c) => ({ coinObjectId: c.coinObjectId, balance: c.balance })));
    cursor = page.nextCursor;
    hasNext = page.hasNextPage;
  }
  return all;
}
