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
  updateOraclePriceBeforeUserOperationPTB,
  type Pool,
} from '@naviprotocol/lending';
import { SUPPORTED_ASSETS, ALL_NAVI_ASSETS } from '../constants.js';
import type { SupportedAsset } from '../constants.js';
import { T2000Error } from '../errors.js';
import { stableToRaw } from '../utils/format.js';
import { getCoinMeta } from '../token-registry.js';
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
  WAL: 'WAL',
  NAVX: 'NAVX',
  ETH: 'ETH',
  GOLD: 'GOLD',
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

      const apy = (isBorrow
        ? parseFloat(pool.borrowIncentiveApyInfo?.apy ?? '0')
        : parseFloat(pool.supplyIncentiveApyInfo?.apy ?? '0')) / 100;

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

    for (const asset of ALL_NAVI_ASSETS) {
      const targetType = SUPPORTED_ASSETS[asset as keyof typeof SUPPORTED_ASSETS].type;
      const pool = pools.find((p: Pool) => {
        const poolSuffix = (p.suiCoinType || p.coinType || '').split('::').slice(1).join('::').toLowerCase();
        const targetSuffix = targetType.split('::').slice(1).join('::').toLowerCase();
        return poolSuffix === targetSuffix;
      });
      if (!pool) continue;

      const saveApy = parseFloat(pool.supplyIncentiveApyInfo?.apy ?? '0') / 100;
      const borrowApy = parseFloat(pool.borrowIncentiveApyInfo?.apy ?? '0') / 100;

      if (saveApy >= 0 && saveApy < 2.0) {
        result[asset] = { saveApy, borrowApy: borrowApy >= 0 && borrowApy < 2.0 ? borrowApy : 0 };
      }
    }

    if (!result.USDC) result.USDC = { saveApy: 0.04, borrowApy: 0.06 };
    return result;
  } catch {
    return { USDC: { saveApy: 0.04, borrowApy: 0.06 } };
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
  options: { asset?: string } = {},
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

  // [B5 v2 / 2026-04-30] No fee collection here. SDK + CLI are fee-free by design.
  // Consumer apps (Audric) collect fees by calling `addFeeTransfer(tx, coinObj, ...)`
  // BEFORE invoking this builder. See packages/sdk/src/protocols/protocolFee.ts.

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
  // skipPythUpdate=true is required for sponsored builds (Enoki):
  // Pyth's SuiPythClient.updatePriceFeeds uses tx.splitCoins(tx.gas, ...)
  // for the oracle fee. Sponsored txes can't reference tx.gas as an
  // argument — Sui rejects with "Cannot use GasCoin as a transaction
  // argument". Skipping the client-side Pyth update still adds NAVI's
  // on-chain `update_single_price_v2` moveCalls, which read Pyth's
  // on-chain state (kept fresh by Pyth keepers ~every 5s for major
  // assets). Self-funded callers (CLI) leave it false to also pay the
  // Pyth fee from tx.gas, maximizing freshness.
  options: { asset?: string; skipPythUpdate?: boolean } = {},
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

  await refreshOracle(tx, client, address, { skipPythUpdate: options.skipPythUpdate });

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
  // See note on buildWithdrawTx for skipPythUpdate semantics.
  options: { asset?: string; skipPythUpdate?: boolean } = {},
): Promise<{ coin: TransactionObjectArgument; effectiveAmount: number }> {
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
    const [coin] = tx.moveCall({
      target: '0x2::coin::zero',
      typeArguments: [assetInfo.type],
    });
    return { coin, effectiveAmount: 0 };
  }

  await refreshOracle(tx, client, address, { skipPythUpdate: options.skipPythUpdate });

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
  options: { asset?: string } = {},
): Promise<void> {
  const asset = options.asset ?? 'USDC';
  const assetInfo = resolveAssetInfo(asset);

  // [B5 v2 / 2026-04-30] No fee collection — see comment in `buildSaveTx`.

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
  // skipOracle bypasses oracle entirely (safe for repay — no HF risk; debt
  // reduction never triggers liquidation). skipPythUpdate is the narrower
  // flag — preserves on-chain `update_single_price_v2` calls but skips the
  // tx.gas-using Pyth fee payment. Sponsored callers (Enoki) typically pass
  // skipOracle=true; self-funded callers can leave both undefined.
  // See note on buildWithdrawTx for sponsored-build details.
  options: { asset?: string; skipPythUpdate?: boolean; skipOracle?: boolean } = {},
): Promise<void> {
  const asset = options.asset ?? 'USDC';
  const assetInfo = resolveAssetInfo(asset);

  await refreshOracle(tx, client, address, {
    skipPythUpdate: options.skipPythUpdate,
    skipOracle: options.skipOracle,
  });

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
  // See note on buildWithdrawTx for skipPythUpdate semantics.
  options: { asset?: string; skipPythUpdate?: boolean } = {},
): Promise<Transaction> {
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    throw new T2000Error('INVALID_AMOUNT', 'Borrow amount must be a positive number');
  }
  const asset = options.asset ?? 'USDC';
  const assetInfo = resolveAssetInfo(asset);
  const rawAmount = Number(stableToRaw(amount, assetInfo.decimals));

  const tx = new Transaction();
  tx.setSender(address);

  await refreshOracle(tx, client, address, { skipPythUpdate: options.skipPythUpdate });

  try {
    const borrowedCoin = await borrowCoinPTB(tx, assetInfo.type, rawAmount, sdkOptions(client));

    // [B5 v2 / 2026-04-30] No fee collection — consumer apps that want to
    // charge a fee should use `addBorrowToTx` directly, split the fee from
    // the returned coin via `addFeeTransfer`, then transfer the remainder.
    // See packages/sdk/src/protocols/protocolFee.ts.

    tx.transferObjects([borrowedCoin as TransactionObjectArgument], address);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new T2000Error('PROTOCOL_UNAVAILABLE', `NAVI borrow failed: ${msg}`);
  }

  return tx;
}

/**
 * [B5 v2] Add a NAVI borrow to an existing PTB and return the borrowed coin
 * WITHOUT transferring it to the user. Lets consumer apps interpose a fee
 * transfer (split → transfer to treasury) before the final transfer to user.
 *
 * This is the lower-level companion to `buildBorrowTx`. CLI / direct SDK
 * callers should keep using `buildBorrowTx` (it transfers to user automatically
 * and is fee-free); Audric uses this to wedge `addFeeTransfer` between the
 * borrow and the user transfer.
 */
export async function addBorrowToTx(
  tx: Transaction,
  client: SuiJsonRpcClient,
  address: string,
  amount: number,
  options: { asset?: string; skipPythUpdate?: boolean } = {},
): Promise<TransactionObjectArgument> {
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    throw new T2000Error('INVALID_AMOUNT', 'Borrow amount must be a positive number');
  }
  const asset = options.asset ?? 'USDC';
  const assetInfo = resolveAssetInfo(asset);
  const rawAmount = Number(stableToRaw(amount, assetInfo.decimals));

  await refreshOracle(tx, client, address, { skipPythUpdate: options.skipPythUpdate });

  try {
    const borrowedCoin = await borrowCoinPTB(tx, assetInfo.type, rawAmount, sdkOptions(client));
    return borrowedCoin as TransactionObjectArgument;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new T2000Error('PROTOCOL_UNAVAILABLE', `NAVI borrow failed: ${msg}`);
  }
}

export async function buildRepayTx(
  client: SuiJsonRpcClient,
  address: string,
  amount: number,
  // skipOracle bypasses oracle entirely (safe for repay — no HF risk).
  // skipPythUpdate is the narrower flag — preserves on-chain
  // `update_single_price_v2` calls but skips the tx.gas-using Pyth fee
  // payment. See note on buildWithdrawTx for sponsored-build details.
  options: { asset?: string; skipOracle?: boolean; skipPythUpdate?: boolean } = {},
): Promise<Transaction> {
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    throw new T2000Error('INVALID_AMOUNT', 'Repay amount must be a positive number');
  }
  const asset = options.asset ?? 'USDC';
  const assetInfo = resolveAssetInfo(asset);

  const coins = await fetchCoins(client, address, assetInfo.type);
  if (coins.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', `No ${assetInfo.displayName} coins to repay with. Withdraw some savings first to get cash.`);

  const totalBalance = coins.reduce((sum, c) => sum + BigInt(c.balance), 0n);
  const rawRequested = Number(stableToRaw(amount, assetInfo.decimals));

  if (Number(totalBalance) < rawRequested && Number(totalBalance) < 1000) {
    throw new T2000Error('INSUFFICIENT_BALANCE', `Not enough ${assetInfo.displayName} to repay (need $${amount.toFixed(2)}, wallet has ~$${(Number(totalBalance) / 10 ** assetInfo.decimals).toFixed(4)}). Withdraw some savings first.`);
  }

  const tx = new Transaction();
  tx.setSender(address);

  const coinObj = mergeCoins(tx, coins);

  const rawAmount = Math.min(rawRequested, Number(totalBalance));
  const [repayCoin] = tx.splitCoins(coinObj, [rawAmount]);

  await refreshOracle(tx, client, address, {
    skipOracle: options.skipOracle,
    skipPythUpdate: options.skipPythUpdate,
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

/**
 * [Track B follow-up / 2026-05-08] Stateless wrapper around `getPendingRewards`
 * that creates its own `SuiJsonRpcClient`. Used by the engine's
 * `pending_rewards` tool — engine doesn't import `@mysten/sui` directly
 * (would expand its dep surface), so this helper accepts just `(address,
 * suiRpcUrl?)` and instantiates the client internally.
 *
 * **Why this exists.** Pre-fix the engine tool went through
 * `requireAgent(context).getPendingRewards()`, which threw
 * "Tool requires a T2000 agent instance — pass `agent` in EngineConfig"
 * in audric prod (audric uses sponsored-tx flow, never instantiates a
 * T2000 agent). Live mainnet smoke on funkii's wallet 2026-05-08 caught
 * this immediately when the LLM correctly called pending_rewards before
 * harvest_rewards. This helper makes the audric/CLI paths symmetric
 * (both work, neither requires an agent).
 *
 * Defaults `suiRpcUrl` to mainnet fullnode for CLI / standalone callers
 * that don't pass one. Errors propagate with the same `T2000Error`
 * shape as the underlying `getPendingRewards` (PROTOCOL_UNAVAILABLE on
 * NAVI degradation, etc.) so the engine tool's catch path is unchanged.
 */
export async function getPendingRewardsByAddress(
  address: string,
  suiRpcUrl?: string,
): Promise<PendingReward[]> {
  const { SuiJsonRpcClient, getJsonRpcFullnodeUrl } = await import('@mysten/sui/jsonRpc');
  const client = new SuiJsonRpcClient({
    url: suiRpcUrl ?? getJsonRpcFullnodeUrl('mainnet'),
    network: 'mainnet',
  });
  return getPendingRewards(client, address);
}

export async function getPendingRewards(
  client: SuiJsonRpcClient,
  address: string,
): Promise<PendingReward[]> {
  let rewards;
  try {
    rewards = await getUserAvailableLendingRewards(address, {
      ...sdkOptions(client),
      markets: ['main'],
    });
  } catch (err) {
    // [S18-F20] Pre-fix this swallowed every NAVI failure with `return []`,
    // making the engine's claim_rewards tool narrate "no pending rewards"
    // when NAVI was actually degraded. Now we throw a typed error so the
    // engine tool can surface "NAVI degraded — try again in a moment"
    // (truthful) instead of "no pending rewards" (false negative).
    // See `single-source-of-truth.mdc` rule on never silently downgrading
    // vendor degradation.
    const msg = err instanceof Error ? err.message : String(err);
    throw new T2000Error(
      'PROTOCOL_UNAVAILABLE',
      `NAVI rewards lookup failed: ${msg}`,
      { source: 'navi-rewards-read' },
      true,
    );
  }

  if (!rewards || rewards.length === 0) return [];

  // [S.118 follow-up — 2026-05-08]
  // Read from the same source as `addClaimRewardsToTx` (raw
  // `userClaimableReward`) and reuse the same aggregator
  // (`aggregateClaimableRewards`). Pre-fix this read iterated
  // `summaryLendingRewards(rewards).rewards.available` — a different NAVI
  // aggregation that produced row-structure AND per-coinType-total drift
  // vs the claim path (smoke on funkii's mainnet wallet showed 2 rows
  // here vs 1 row from `addClaimRewardsToTx`, with totals diverging by
  // ~1.36e-7 for the same vSUI cert across two NAVI pools). Routing both
  // through the same source + same aggregator removes the drift class
  // entirely and makes the contract test a true equality check (not
  // a tolerance-based one).
  const claimable = rewards.filter((r) => Number(r.userClaimableReward) > 0);
  return aggregateClaimableRewards(claimable);
}

export async function addClaimRewardsToTx(
  tx: Transaction,
  client: SuiJsonRpcClient,
  address: string,
): Promise<PendingReward[]> {
  let rewards;
  try {
    rewards = await getUserAvailableLendingRewards(address, {
      ...sdkOptions(client),
      markets: ['main'],
    });
  } catch (err) {
    // [S18-F20] See `getPendingRewards` for rationale — silent `return []`
    // here was a primary contributor to the engine's claim_rewards tool
    // narrating "no pending rewards" during NAVI degradation. Throw a
    // typed error; the engine tool catches and surfaces a truthful
    // "NAVI degraded" message instead.
    const msg = err instanceof Error ? err.message : String(err);
    throw new T2000Error(
      'PROTOCOL_UNAVAILABLE',
      `NAVI rewards lookup failed: ${msg}`,
      { source: 'navi-rewards-claim-prelude' },
      true,
    );
  }

  if (!rewards || rewards.length === 0) return [];

  const claimable = rewards.filter(
    (r) => Number(r.userClaimableReward) > 0,
  );
  if (claimable.length === 0) return [];

  // Capture per-reward metadata from the source `claimable` list before
  // it gets handed to the NAVI PTB builder. We previously stubbed every
  // returned reward as `{ symbol: 'REWARD', amount: 0 }`, which made
  // the engine narrate "no pending rewards" / "Claimed $0.00" even when
  // the on-chain tx successfully credited e.g. vSUI to the wallet. The
  // PTB builder's return value is just an internal opaque list of move
  // calls — the truth about which assets / amounts were claimed lives
  // in the `claimable` rows we filtered above.
  try {
    await claimLendingRewardsPTB(tx, claimable, {
      env: 'prod',
      customCoinReceive: { type: 'transfer', transfer: address },
    });
  } catch (err) {
    // [S18-F20] PTB-build failures are also worth surfacing rather than
    // silently returning empty — the lookup succeeded but the builder
    // (e.g. missing reward fund config) failed.
    const msg = err instanceof Error ? err.message : String(err);
    throw new T2000Error(
      'PROTOCOL_UNAVAILABLE',
      `NAVI claim PTB build failed: ${msg}`,
      { source: 'navi-rewards-claim-ptb' },
      true,
    );
  }

  return aggregateClaimableRewards(claimable);
}

/**
 * Standalone builder for the `claim_rewards` tool. Wraps the existing
 * `addClaimRewardsToTx` appender into a complete PTB so the SPEC 7
 * `composeTx` registry adapter has a single-step builder it can dispatch
 * to when `claim_rewards` is invoked alone (the chain-mode path uses
 * `addClaimRewardsToTx` directly inside a multi-step PTB).
 *
 * Multi-protocol claim flows (e.g. NAVI + Suilend in a future world)
 * still go through the `T2000` class's `claimRewards()` method, which
 * iterates every registered lending adapter via the adapter registry —
 * this standalone builder is intentionally NAVI-only to keep the shape
 * symmetric with the rest of SPEC 7's Layer 1 builders.
 *
 * Returns `{ tx, rewards }`:
 * - `tx` — built PTB with sender set; if no rewards are claimable, no
 *   move calls are appended (caller should skip executing).
 * - `rewards` — what WILL be claimed by `tx`. Empty array means nothing
 *   to claim.
 */
export async function buildClaimRewardsTx(
  client: SuiJsonRpcClient,
  address: string,
): Promise<{ tx: Transaction; rewards: PendingReward[] }> {
  const tx = new Transaction();
  tx.setSender(address);
  const rewards = await addClaimRewardsToTx(tx, client, address);
  return { tx, rewards };
}

/**
 * Minimal shape we read off the NAVI SDK's `LendingReward` rows. Kept
 * structural rather than imported so the tests don't have to reproduce
 * the full upstream type and the function works for any future caller
 * that has the same fields.
 */
export interface ClaimableRewardLike {
  userClaimableReward: number | string;
  rewardCoinType: string;
  assetId?: number | string;
}

/**
 * Aggregate raw NAVI `claimable` rows into the `PendingReward[]` shape
 * the engine surfaces to the LLM and the UI. Aggregates by reward coin
 * type so a user with rewards from multiple pools (e.g. USDC pool + SUI
 * pool both rewarding vSUI) sees a single "0.0165 vSUI" line rather
 * than three separate dust entries. Filters out non-finite / non-positive
 * amounts so dust noise can't sneak in as "$0.00 REWARD" rows.
 */
export function aggregateClaimableRewards(
  claimable: ClaimableRewardLike[],
): PendingReward[] {
  const aggregated = new Map<string, PendingReward>();
  for (const c of claimable) {
    const coinType = c.rewardCoinType;
    if (!coinType) continue;
    // [S18-F20 follow-up] Resolve symbol via canonical registry first; falls
    // back to raw struct name only for unregistered coins. Mirrors the same
    // resolution in `getPendingRewards` so both readers narrate vSUI rewards
    // as "vSUI" instead of the raw "CERT" struct name.
    const meta = getCoinMeta(coinType);
    const symbol = meta?.symbol ?? coinType.split('::').pop() ?? 'REWARD';
    const amount = Number(c.userClaimableReward);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const existing = aggregated.get(coinType);
    if (existing) {
      existing.amount += amount;
    } else {
      aggregated.set(coinType, {
        protocol: 'navi',
        asset: String(c.assetId ?? ''),
        coinType,
        symbol,
        amount,
        estimatedValueUsd: 0,
      });
    }
  }
  return Array.from(aggregated.values());
}
