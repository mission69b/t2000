import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import {
  getLendingPositions,
  getPools as naviGetPools,
  getHealthFactor as naviGetHealthFactor,
  depositCoinPTB,
  withdrawCoinPTB,
  borrowCoinPTB,
  repayCoinPTB,
  getUserAvailableLendingRewards,
  claimLendingRewardsPTB,
  summaryLendingRewards,
  updateOraclePriceBeforeUserOperationPTB,
  type Pool,
} from '@naviprotocol/lending';
import { SUPPORTED_ASSETS, STABLE_ASSETS } from '../constants.js';
import type { SupportedAsset } from '../constants.js';
import { T2000Error } from '../errors.js';
import { stableToRaw } from '../utils/format.js';
import { addCollectFeeToTx } from './protocolFee.js';
import type { PendingReward } from '../adapters/types.js';
import type {
  RatesResult,
  PositionsResult,
  PositionEntry,
  HealthFactorResult,
  MaxWithdrawResult,
  MaxBorrowResult,
} from '../types.js';

const MIN_HEALTH_FACTOR = 1.5;
const NAVI_SUPPORTED_ASSETS = [...STABLE_ASSETS, 'SUI', 'ETH', 'GOLD'] as const;

// NAVI SDK expects SuiClient (v1 name), our code uses SuiJsonRpcClient (v2 name).
// They're the same runtime class, so the cast is safe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sdkOptions(client: SuiJsonRpcClient): { env: 'prod'; client: any; cacheTime: number; disableCache: boolean } {
  // Fully disable NAVI SDK's built-in caching. cacheTime: 0 bypasses the
  // top-level withCache check, but internal SDK calls override it via
  // spread order ({ ...opts, cacheTime: w }). disableCache: true is the
  // only flag the SDK never overrides — it short-circuits the cache check.
  return { env: 'prod', client, cacheTime: 0, disableCache: true };
}

/**
 * Refresh Pyth oracle prices in the PTB before price-dependent NAVI operations.
 * NAVI's on-chain contract requires fresh oracle prices (within 15s) for
 * withdraw, borrow, and repay. Unlike Suilend (which auto-refreshes), NAVI's
 * PTB builders don't update prices — the caller must do it via this SDK helper.
 */
async function refreshOracle(
  tx: Transaction,
  client: SuiJsonRpcClient,
  address: string,
  options?: { skipPythUpdate?: boolean; skipOracle?: boolean },
): Promise<void> {
  if (options?.skipOracle) return;
  const origInfo = console.info;
  const origWarn = console.warn;
  console.info = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('stale price feed')) return;
    origInfo.apply(console, args);
  };
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('price feed')) return;
    origWarn.apply(console, args);
  };
  try {
    const pools = await naviGetPools(sdkOptions(client));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oracleOpts: any = {
      ...sdkOptions(client),
      throws: false,
      // Pyth update uses tx.splitCoins(tx.gas, ...) which is incompatible
      // with sponsored transactions where tx.gas belongs to the sponsor.
      updatePythPriceFeeds: !options?.skipPythUpdate,
    };
    await updateOraclePriceBeforeUserOperationPTB(tx, address, pools, oracleOpts);
  } catch {
    // Best-effort: if oracle refresh fails (network issue), the operation
    // may still succeed if on-chain prices are fresh enough.
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
  }
}

const NAVI_SYMBOL_MAP: Record<string, string> = {
  nUSDC: 'USDC',
  suiUSDT: 'USDT',
  suiUSDe: 'USDe',
  XAUM: 'GOLD',
  WBTC: 'BTC',
  suiETH: 'ETH',
  WETH: 'ETH',
  SUI: 'SUI',
  USDC: 'USDC',
  USDT: 'USDT',
  USDe: 'USDe',
  USDsui: 'USDsui',
};

function resolveNaviSymbol(sdkSymbol: string, coinType: string): string {
  for (const [key, info] of Object.entries(SUPPORTED_ASSETS)) {
    const poolSuffix = coinType.split('::').slice(1).join('::').toLowerCase();
    const targetSuffix = info.type.split('::').slice(1).join('::').toLowerCase();
    if (poolSuffix === targetSuffix) return key;
  }
  return NAVI_SYMBOL_MAP[sdkSymbol] ?? sdkSymbol;
}

function resolveAssetInfo(asset: string): { type: string; decimals: number; displayName: string } {
  if (asset in SUPPORTED_ASSETS) {
    const info = SUPPORTED_ASSETS[asset as SupportedAsset];
    return { type: info.type, decimals: info.decimals, displayName: info.displayName };
  }
  throw new T2000Error('ASSET_NOT_SUPPORTED', `Unknown asset: ${asset}`);
}


async function fetchCoins(
  client: SuiJsonRpcClient,
  owner: string,
  coinType: string,
): Promise<Array<{ coinObjectId: string; balance: string }>> {
  const all: Array<{ coinObjectId: string; balance: string }> = [];
  let cursor: string | null | undefined;
  let hasNext = true;
  while (hasNext) {
    const page = await client.getCoins({ owner, coinType, cursor: cursor ?? undefined });
    all.push(...page.data.map((c) => ({ coinObjectId: c.coinObjectId, balance: c.balance })));
    cursor = page.nextCursor;
    hasNext = page.hasNextPage;
  }
  return all;
}

function mergeCoins(
  tx: Transaction,
  coins: Array<{ coinObjectId: string; balance: string }>,
): TransactionObjectArgument {
  if (coins.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', 'No coins to merge');
  const primary = tx.object(coins[0].coinObjectId);
  if (coins.length > 1) {
    tx.mergeCoins(primary, coins.slice(1).map((c) => tx.object(c.coinObjectId)));
  }
  return primary;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getPositions(
  client: SuiJsonRpcClient,
  address: string,
): Promise<PositionsResult> {

  try {
    const naviPositions = await getLendingPositions(address, {
      ...sdkOptions(client),
      markets: ['main'],
    });

    const positions: PositionEntry[] = [];

    for (const pos of naviPositions) {
      const data = pos['navi-lending-supply']
        ?? pos['navi-lending-emode-supply']
        ?? pos['navi-lending-borrow']
        ?? pos['navi-lending-emode-borrow'];
      if (!data) continue;

      const isBorrow = pos.type.includes('borrow');
      const symbol = resolveNaviSymbol(data.token.symbol, data.token.coinType);
      const amount = parseFloat(data.amount);
      const amountUsd = parseFloat(data.valueUSD);
      const pool = data.pool;

      const apy = isBorrow
        ? parseFloat(pool.borrowIncentiveApyInfo?.apy ?? '0')
        : parseFloat(pool.supplyIncentiveApyInfo?.apy ?? '0');

      if (amountUsd > 0.01 || amount > 1e-10) {
        positions.push({
          protocol: 'navi',
          asset: symbol,
          type: isBorrow ? 'borrow' : 'save',
          amount,
          amountUsd,
          apy,
        });
      }
    }

    return { positions };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not found') || msg.includes('404')) return { positions: [] };
    throw new T2000Error('PROTOCOL_UNAVAILABLE', `NAVI getPositions failed: ${msg}`);
  }
}

export async function getRates(client: SuiJsonRpcClient): Promise<RatesResult> {
  try {
    const pools = await naviGetPools(sdkOptions(client));
    const result: RatesResult = {};

    for (const asset of NAVI_SUPPORTED_ASSETS) {
      const targetType = SUPPORTED_ASSETS[asset as keyof typeof SUPPORTED_ASSETS].type;
      const pool = pools.find((p: Pool) => {
        const poolSuffix = (p.suiCoinType || p.coinType || '').split('::').slice(1).join('::').toLowerCase();
        const targetSuffix = targetType.split('::').slice(1).join('::').toLowerCase();
        return poolSuffix === targetSuffix;
      });
      if (!pool) continue;

      const saveApy = parseFloat(pool.supplyIncentiveApyInfo?.apy ?? '0');
      const borrowApy = parseFloat(pool.borrowIncentiveApyInfo?.apy ?? '0');

      if (saveApy >= 0 && saveApy < 200) {
        result[asset] = { saveApy, borrowApy: borrowApy >= 0 && borrowApy < 200 ? borrowApy : 0 };
      }
    }

    if (!result.USDC) result.USDC = { saveApy: 4.0, borrowApy: 6.0 };
    return result;
  } catch {
    return { USDC: { saveApy: 4.0, borrowApy: 6.0 } };
  }
}

export async function getHealthFactor(
  client: SuiJsonRpcClient,
  address: string,
): Promise<HealthFactorResult> {

  const posResult = await getPositions(client, address);
  let supplied = 0;
  let borrowed = 0;

  for (const pos of posResult.positions) {
    const usd = pos.amountUsd ?? pos.amount;
    if (pos.type === 'save') supplied += usd;
    else if (pos.type === 'borrow') borrowed += usd;
  }

  let healthFactor: number;
  try {
    const hf = await naviGetHealthFactor(address, sdkOptions(client));
    healthFactor = hf > 1e5 ? Infinity : hf;
  } catch {
    healthFactor = borrowed > 0 ? (supplied * 0.75) / borrowed : Infinity;
  }

  const ltv = 0.75;
  const maxBorrow = Math.max(0, supplied * ltv - borrowed);

  return {
    healthFactor,
    supplied,
    borrowed,
    maxBorrow,
    liquidationThreshold: ltv,
  };
}

export async function buildSaveTx(
  client: SuiJsonRpcClient,
  address: string,
  amount: number,
  options: { collectFee?: boolean; asset?: string } = {},
): Promise<Transaction> {
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    throw new T2000Error('INVALID_AMOUNT', 'Save amount must be a positive number');
  }
  const asset = options.asset ?? 'USDC';
  const assetInfo = resolveAssetInfo(asset);

  const coins = await fetchCoins(client, address, assetInfo.type);
  if (coins.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', `No ${assetInfo.displayName} coins found`);

  const totalBalance = coins.reduce((sum, c) => sum + BigInt(c.balance), 0n);

  const tx = new Transaction();
  tx.setSender(address);

  const coinObj = mergeCoins(tx, coins);

  if (options.collectFee) {
    addCollectFeeToTx(tx, coinObj, 'save');
  }

  const rawAmount = Math.min(Number(stableToRaw(amount, assetInfo.decimals)), Number(totalBalance));

  try {
    await depositCoinPTB(tx, assetInfo.type, coinObj as never, {
      ...sdkOptions(client),
      amount: rawAmount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new T2000Error('PROTOCOL_UNAVAILABLE', `NAVI deposit failed: ${msg}`);
  }

  return tx;
}

export async function buildWithdrawTx(
  client: SuiJsonRpcClient,
  address: string,
  amount: number,
  options: { asset?: string; sponsored?: boolean } = {},
): Promise<{ tx: Transaction; effectiveAmount: number }> {
  const asset = options.asset ?? 'USDC';
  const assetInfo = resolveAssetInfo(asset);

  const posResult = await getPositions(client, address);
  const supply = posResult.positions.find(
    (p) => p.type === 'save' && p.asset === asset,
  );
  const deposited = supply?.amount ?? 0;

  const dustBuffer = 1000 / 10 ** assetInfo.decimals;
  const effectiveAmount = Math.min(amount, Math.max(0, deposited - dustBuffer));
  if (effectiveAmount <= 0) throw new T2000Error('NO_COLLATERAL', `Nothing to withdraw for ${assetInfo.displayName} on NAVI`);

  const rawAmount = Number(stableToRaw(effectiveAmount, assetInfo.decimals));
  if (rawAmount <= 0) {
    throw new T2000Error('INVALID_AMOUNT', 'Withdrawal amount rounds to zero — balance is dust');
  }

  const tx = new Transaction();
  tx.setSender(address);

  await refreshOracle(tx, client, address, { skipPythUpdate: options.sponsored });

  try {
    const coin = await withdrawCoinPTB(tx, assetInfo.type, rawAmount, sdkOptions(client));
    tx.transferObjects([coin as TransactionObjectArgument], address);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new T2000Error('PROTOCOL_UNAVAILABLE', `NAVI withdraw failed: ${msg}`);
  }

  return { tx, effectiveAmount };
}

export async function addWithdrawToTx(
  tx: Transaction,
  client: SuiJsonRpcClient,
  address: string,
  amount: number,
  options: { asset?: string; sponsored?: boolean } = {},
): Promise<{ coin: TransactionObjectArgument; effectiveAmount: number }> {
  const asset = options.asset ?? 'USDC';
  const sponsored = options.sponsored ?? true;
  const assetInfo = resolveAssetInfo(asset);

  const posResult = await getPositions(client, address);
  const supply = posResult.positions.find(
    (p) => p.type === 'save' && p.asset === asset,
  );
  const deposited = supply?.amount ?? 0;

  const dustBuffer = 1000 / 10 ** assetInfo.decimals;
  const effectiveAmount = Math.min(amount, Math.max(0, deposited - dustBuffer));
  if (effectiveAmount <= 0) throw new T2000Error('NO_COLLATERAL', `Nothing to withdraw for ${assetInfo.displayName} on NAVI`);

  const rawAmount = Number(stableToRaw(effectiveAmount, assetInfo.decimals));
  if (rawAmount <= 0) {
    const [coin] = tx.moveCall({
      target: '0x2::coin::zero',
      typeArguments: [assetInfo.type],
    });
    return { coin, effectiveAmount: 0 };
  }

  await refreshOracle(tx, client, address, { skipPythUpdate: sponsored });

  try {
    const coin = await withdrawCoinPTB(tx, assetInfo.type, rawAmount, sdkOptions(client));
    return { coin: coin as TransactionObjectArgument, effectiveAmount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new T2000Error('PROTOCOL_UNAVAILABLE', `NAVI withdraw failed: ${msg}`);
  }
}

export async function addSaveToTx(
  tx: Transaction,
  _client: SuiJsonRpcClient,
  _address: string,
  coin: TransactionObjectArgument,
  options: { asset?: string; collectFee?: boolean } = {},
): Promise<void> {
  const asset = options.asset ?? 'USDC';
  const assetInfo = resolveAssetInfo(asset);

  if (options.collectFee) {
    addCollectFeeToTx(tx, coin, 'save');
  }

  try {
    await depositCoinPTB(tx, assetInfo.type, coin as never, { env: 'prod' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new T2000Error('PROTOCOL_UNAVAILABLE', `NAVI deposit failed: ${msg}`);
  }
}

export async function addRepayToTx(
  tx: Transaction,
  client: SuiJsonRpcClient,
  address: string,
  coin: TransactionObjectArgument,
  options: { asset?: string; sponsored?: boolean } = {},
): Promise<void> {
  const asset = options.asset ?? 'USDC';
  const sponsored = options.sponsored ?? true;
  const assetInfo = resolveAssetInfo(asset);

  await refreshOracle(tx, client, address, { skipPythUpdate: sponsored });

  try {
    await repayCoinPTB(tx, assetInfo.type, coin as never, { env: 'prod' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new T2000Error('PROTOCOL_UNAVAILABLE', `NAVI repay failed: ${msg}`);
  }
}

export async function buildBorrowTx(
  client: SuiJsonRpcClient,
  address: string,
  amount: number,
  options: { collectFee?: boolean; asset?: string; sponsored?: boolean } = {},
): Promise<Transaction> {
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    throw new T2000Error('INVALID_AMOUNT', 'Borrow amount must be a positive number');
  }
  const asset = options.asset ?? 'USDC';
  const assetInfo = resolveAssetInfo(asset);
  const rawAmount = Number(stableToRaw(amount, assetInfo.decimals));

  const tx = new Transaction();
  tx.setSender(address);

  await refreshOracle(tx, client, address, { skipPythUpdate: options.sponsored });

  try {
    const borrowedCoin = await borrowCoinPTB(tx, assetInfo.type, rawAmount, sdkOptions(client));

    if (options.collectFee) {
      addCollectFeeToTx(tx, borrowedCoin as TransactionObjectArgument, 'borrow');
    }

    tx.transferObjects([borrowedCoin as TransactionObjectArgument], address);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new T2000Error('PROTOCOL_UNAVAILABLE', `NAVI borrow failed: ${msg}`);
  }

  return tx;
}

export async function buildRepayTx(
  client: SuiJsonRpcClient,
  address: string,
  amount: number,
  options: { asset?: string; sponsored?: boolean; skipOracle?: boolean } = {},
): Promise<Transaction> {
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    throw new T2000Error('INVALID_AMOUNT', 'Repay amount must be a positive number');
  }
  const asset = options.asset ?? 'USDC';
  const assetInfo = resolveAssetInfo(asset);

  const coins = await fetchCoins(client, address, assetInfo.type);
  if (coins.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', `No ${assetInfo.displayName} coins to repay with`);

  const totalBalance = coins.reduce((sum, c) => sum + BigInt(c.balance), 0n);

  const tx = new Transaction();
  tx.setSender(address);

  const coinObj = mergeCoins(tx, coins);

  const rawAmount = Math.min(Number(stableToRaw(amount, assetInfo.decimals)), Number(totalBalance));
  const [repayCoin] = tx.splitCoins(coinObj, [rawAmount]);

  await refreshOracle(tx, client, address, {
    skipPythUpdate: options.sponsored,
    skipOracle: options.skipOracle,
  });

  try {
    await repayCoinPTB(tx, assetInfo.type, repayCoin as never, {
      ...sdkOptions(client),
      amount: rawAmount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new T2000Error('PROTOCOL_UNAVAILABLE', `NAVI repay failed: ${msg}`);
  }

  return tx;
}

export async function maxWithdrawAmount(
  client: SuiJsonRpcClient,
  address: string,
): Promise<MaxWithdrawResult> {
  const hf = await getHealthFactor(client, address);
  const ltv = hf.liquidationThreshold > 0 ? hf.liquidationThreshold : 0.75;

  let maxAmount: number;
  if (hf.borrowed === 0) {
    maxAmount = hf.supplied;
  } else {
    maxAmount = Math.max(0, hf.supplied - (hf.borrowed * MIN_HEALTH_FACTOR / ltv));
  }

  const remainingSupply = hf.supplied - maxAmount;
  const hfAfter = hf.borrowed > 0 ? (remainingSupply * ltv) / hf.borrowed : Infinity;

  return { maxAmount, healthFactorAfter: hfAfter, currentHF: hf.healthFactor };
}

export async function maxBorrowAmount(
  client: SuiJsonRpcClient,
  address: string,
): Promise<MaxBorrowResult> {
  const hf = await getHealthFactor(client, address);
  const ltv = hf.liquidationThreshold > 0 ? hf.liquidationThreshold : 0.75;

  const maxAmount = Math.max(0, hf.supplied * ltv / MIN_HEALTH_FACTOR - hf.borrowed);

  return { maxAmount, healthFactorAfter: MIN_HEALTH_FACTOR, currentHF: hf.healthFactor };
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export async function getPendingRewards(
  client: SuiJsonRpcClient,
  address: string,
): Promise<PendingReward[]> {
  try {
    const rewards = await getUserAvailableLendingRewards(address, {
      ...sdkOptions(client),
      markets: ['main'],
    });

    if (!rewards || rewards.length === 0) return [];

    const summary = summaryLendingRewards(rewards);
    const result: PendingReward[] = [];

    for (const s of summary) {
      for (const rw of s.rewards) {
        const available = Number(rw.available);
        if (available <= 0) continue;
        const symbol = rw.coinType.split('::').pop() ?? 'UNKNOWN';
        result.push({
          protocol: 'navi',
          asset: String(s.assetId),
          coinType: rw.coinType,
          symbol,
          amount: available,
          estimatedValueUsd: 0,
        });
      }
    }

    return result;
  } catch {
    return [];
  }
}

export async function addClaimRewardsToTx(
  tx: Transaction,
  client: SuiJsonRpcClient,
  address: string,
): Promise<PendingReward[]> {
  try {
    const rewards = await getUserAvailableLendingRewards(address, {
      ...sdkOptions(client),
      markets: ['main'],
    });

    if (!rewards || rewards.length === 0) return [];

    const claimable = rewards.filter(
      (r) => Number(r.userClaimableReward) > 0,
    );
    if (claimable.length === 0) return [];

    const claimed = await claimLendingRewardsPTB(tx, claimable, {
      env: 'prod',
      customCoinReceive: { type: 'transfer', transfer: address },
    });

    return claimed.map((c) => ({
      protocol: 'navi',
      asset: '',
      coinType: '',
      symbol: 'REWARD',
      amount: 0,
      estimatedValueUsd: 0,
    }));
  } catch {
    return [];
  }
}
