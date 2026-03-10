import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { SuiPythClient, SuiPriceServiceConnection } from '@pythnetwork/pyth-sui-js';
import { SUPPORTED_ASSETS, STABLE_ASSETS } from '../constants.js';
import type { StableAsset } from '../constants.js';
import { T2000Error } from '../errors.js';
import { stableToRaw, usdcToRaw } from '../utils/format.js';
import { addCollectFeeToTx } from './protocolFee.js';
import type {
  SaveResult,
  WithdrawResult,
  BorrowResult,
  RepayResult,
  GasMethod,
  RatesResult,
  PositionsResult,
  PositionEntry,
  HealthFactorResult,
  MaxWithdrawResult,
  MaxBorrowResult,
} from '../types.js';

const USDC_TYPE = SUPPORTED_ASSETS.USDC.type;
const RATE_DECIMALS = 27;
const LTV_DECIMALS = 27;
const MIN_HEALTH_FACTOR = 1.5;
const WITHDRAW_DUST_BUFFER = 0.001;
const CLOCK = '0x06';
const SUI_SYSTEM_STATE = '0x05';
const NAVI_BALANCE_DECIMALS = 9;
const CONFIG_API = 'https://open-api.naviprotocol.io/api/navi/config?env=prod';
const POOLS_API = 'https://open-api.naviprotocol.io/api/navi/pools?env=prod';

const PACKAGE_API = 'https://open-api.naviprotocol.io/api/package';
const PYTH_HERMES_URL = 'https://hermes.pyth.network/';
let packageCache: { id: string; ts: number } | null = null;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OracleFeed {
  oracleId: number;
  assetId: number;
  feedId: string;
  pythPriceFeedId: string;
  pythPriceInfoObject: string;
}

interface NaviConfig {
  package: string;
  storage: string;
  incentiveV2: string;
  incentiveV3: string;
  uiGetter: string;
  oracle: {
    packageId: string;
    priceOracle: string;
    oracleConfig: string;
    supraOracleHolder: string;
    switchboardAggregator: string;
    pythStateId: string;
    wormholeStateId: string;
    feeds: OracleFeed[];
  };
}

// Oracle package ID comes from config.oracle.packageId (not hardcoded)

interface NaviPool {
  id: number;
  coinType: string;
  suiCoinType: string;
  currentSupplyRate: string;
  currentBorrowRate: string;
  currentSupplyIndex: string;
  currentBorrowIndex: string;
  ltv: string;
  liquidationFactor: { bonus: string; ratio: string; threshold: string };
  contract: { reserveId: string; pool: string };
  token: { symbol: string; decimals: number; price: number };
}

interface UserState {
  assetId: number;
  supplyBalance: bigint;
  borrowBalance: bigint;
}

function toBigInt(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  return BigInt(String(v));
}

// ---------------------------------------------------------------------------
// BCS
// ---------------------------------------------------------------------------

const UserStateInfo = bcs.struct('UserStateInfo', {
  asset_id: bcs.u8(),
  borrow_balance: bcs.u256(),
  supply_balance: bcs.u256(),
});

function decodeDevInspect<T>(
  result: { results?: Array<{ returnValues?: Array<[number[], string]> }> | null; error?: string | null },
  schema: { parse: (data: Uint8Array) => T },
): T | undefined {
  const rv = result.results?.[0]?.returnValues?.[0];
  if (result.error || !rv) return undefined;
  const bytes = Uint8Array.from(rv[0]);
  return schema.parse(bytes);
}

// ---------------------------------------------------------------------------
// Config + Pool cache
// ---------------------------------------------------------------------------

let configCache: { data: NaviConfig; ts: number } | null = null;
let poolsCache: { data: NaviPool[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60_000;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new T2000Error('PROTOCOL_UNAVAILABLE', `NAVI API error: ${res.status}`);
  const json = (await res.json()) as { data?: T; code?: number };
  return (json.data ?? json) as T;
}

async function getLatestPackageId(): Promise<string> {
  if (packageCache && Date.now() - packageCache.ts < CACHE_TTL) return packageCache.id;
  const res = await fetch(PACKAGE_API);
  if (!res.ok) throw new T2000Error('PROTOCOL_UNAVAILABLE', `NAVI package API error: ${res.status}`);
  const json = (await res.json()) as { packageId?: string };
  if (!json.packageId) throw new T2000Error('PROTOCOL_UNAVAILABLE', 'NAVI package API returned no packageId');
  packageCache = { id: json.packageId, ts: Date.now() };
  return json.packageId;
}

async function getConfig(fresh = false): Promise<NaviConfig> {
  if (configCache && !fresh && Date.now() - configCache.ts < CACHE_TTL) return configCache.data;
  const [data, latestPkg] = await Promise.all([
    fetchJson<NaviConfig>(CONFIG_API),
    getLatestPackageId(),
  ]);
  data.package = latestPkg;
  configCache = { data, ts: Date.now() };
  return data;
}

async function getPools(fresh = false): Promise<NaviPool[]> {
  if (poolsCache && !fresh && Date.now() - poolsCache.ts < CACHE_TTL) return poolsCache.data;
  const data = await fetchJson<NaviPool[]>(POOLS_API);
  poolsCache = { data, ts: Date.now() };
  return data;
}

function matchesCoinType(poolType: string, targetType: string): boolean {
  const poolSuffix = poolType.split('::').slice(1).join('::').toLowerCase();
  const targetSuffix = targetType.split('::').slice(1).join('::').toLowerCase();
  return poolSuffix === targetSuffix;
}

function resolvePoolSymbol(pool: NaviPool): string {
  const coinType = pool.suiCoinType || pool.coinType || '';
  for (const [key, info] of Object.entries(SUPPORTED_ASSETS)) {
    if (matchesCoinType(coinType, info.type)) return key;
  }
  return pool.token?.symbol ?? 'UNKNOWN';
}

async function getPool(asset: StableAsset = 'USDC'): Promise<NaviPool> {
  const pools = await getPools();
  const targetType = SUPPORTED_ASSETS[asset].type;

  const pool = pools.find(
    (p) => matchesCoinType(p.suiCoinType || p.coinType || '', targetType),
  );
  if (!pool) {
    throw new T2000Error(
      'ASSET_NOT_SUPPORTED',
      `${SUPPORTED_ASSETS[asset].displayName} pool not found on NAVI. Try: ${STABLE_ASSETS.filter(a => a !== asset).join(', ')}`,
    );
  }
  return pool;
}

async function getUsdcPool(): Promise<NaviPool> {
  return getPool('USDC');
}

// ---------------------------------------------------------------------------
// Oracle price update (required before withdraw/borrow)
// ---------------------------------------------------------------------------

function addOracleUpdate(tx: Transaction, config: NaviConfig, pool: NaviPool): void {
  const feed = config.oracle.feeds?.find((f) => f.assetId === pool.id);
  if (!feed) {
    throw new T2000Error('PROTOCOL_UNAVAILABLE', `Oracle feed not found for asset ${pool.token?.symbol ?? pool.id}`);
  }

  tx.moveCall({
    target: `${config.oracle.packageId}::oracle_pro::update_single_price_v2`,
    arguments: [
      tx.object(CLOCK),
      tx.object(config.oracle.oracleConfig),
      tx.object(config.oracle.priceOracle),
      tx.object(config.oracle.supraOracleHolder),
      tx.object(feed.pythPriceInfoObject),
      tx.object(config.oracle.switchboardAggregator),
      tx.pure.address(feed.feedId),
    ],
  });
}

/**
 * Pushes fresh Pyth prices and then updates NAVI oracles for our
 * supported stablecoins only (USDC, USDT, USDe, USDsui).
 *
 * NAVI's validate_withdraw/validate_borrow requires oracle prices
 * fresher than 15 seconds. Keeper bots usually keep them fresh, but
 * when they don't, the operation fails with abort code 1503. By
 * pushing Pyth VAAs ourselves in the same PTB, we guarantee freshness.
 */
async function refreshStableOracles(
  tx: Transaction,
  client: SuiJsonRpcClient,
  config: NaviConfig,
  pools: NaviPool[],
): Promise<void> {
  const stableTypes = STABLE_ASSETS.map((a) => SUPPORTED_ASSETS[a].type);

  const stablePools = pools.filter((p) => {
    const ct = p.suiCoinType || p.coinType || '';
    return stableTypes.some((t) => matchesCoinType(ct, t));
  });

  const feeds = (config.oracle.feeds ?? []).filter(
    (f) => stablePools.some((p) => p.id === f.assetId),
  );

  if (feeds.length === 0) return;

  const pythFeedIds = feeds.map((f) => f.pythPriceFeedId).filter(Boolean);

  if (pythFeedIds.length > 0 && config.oracle.pythStateId && config.oracle.wormholeStateId) {
    try {
      const connection = new SuiPriceServiceConnection(PYTH_HERMES_URL);
      const priceUpdateData = await connection.getPriceFeedsUpdateData(pythFeedIds);
      // Pyth SDK bundles @mysten/sui v1 — runtime API identical to v2.
      const pythClient = new SuiPythClient(
        client as never,
        config.oracle.pythStateId,
        config.oracle.wormholeStateId,
      );
      await pythClient.updatePriceFeeds(tx as never, priceUpdateData, pythFeedIds);
    } catch (err) {
      console.error('[t2000] Pyth oracle push failed, falling back to cached prices:', (err as Error).message ?? err);
    }
  }

  for (const pool of stablePools) {
    addOracleUpdate(tx, config, pool);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractGasCost(effects: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } } | undefined | null): number {
  if (!effects?.gasUsed) return 0;
  return Math.abs(
    (Number(effects.gasUsed.computationCost) +
      Number(effects.gasUsed.storageCost) -
      Number(effects.gasUsed.storageRebate)) / 1e9,
  );
}

function rateToApy(rawRate: string): number {
  if (!rawRate || rawRate === '0') return 0;
  return Number(BigInt(rawRate)) / 10 ** RATE_DECIMALS * 100;
}

function parseLtv(rawLtv: string): number {
  if (!rawLtv || rawLtv === '0') return 0.75;
  return Number(BigInt(rawLtv)) / 10 ** LTV_DECIMALS;
}

function parseLiqThreshold(val: string | number): number {
  if (typeof val === 'number') return val;
  const n = Number(val);
  if (n > 1) return Number(BigInt(val)) / 10 ** LTV_DECIMALS;
  return n;
}

function normalizeHealthFactor(raw: number): number {
  const v = raw / 10 ** RATE_DECIMALS;
  return v > 1e5 ? Infinity : v;
}

function compoundBalance(rawBalance: bigint, currentIndex: string): number {
  if (!rawBalance || !currentIndex || currentIndex === '0') return 0;
  const scale = BigInt('1' + '0'.repeat(RATE_DECIMALS));
  const half = scale / 2n;
  const result = (rawBalance * BigInt(currentIndex) + half) / scale;
  return Number(result) / 10 ** NAVI_BALANCE_DECIMALS;
}

// ---------------------------------------------------------------------------
// On-chain reads
// ---------------------------------------------------------------------------

async function getUserState(client: SuiJsonRpcClient, address: string): Promise<UserState[]> {
  const config = await getConfig();
  const tx = new Transaction();
  tx.moveCall({
    target: `${config.uiGetter}::getter_unchecked::get_user_state`,
    arguments: [tx.object(config.storage), tx.pure.address(address)],
  });

  const result = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: address,
  });

  const decoded = decodeDevInspect(result, bcs.vector(UserStateInfo));
  if (!decoded) return [];

  const mapped = (decoded as Array<{ asset_id: number; supply_balance: unknown; borrow_balance: unknown }>)
    .map((s) => ({
      assetId: s.asset_id,
      supplyBalance: toBigInt(s.supply_balance),
      borrowBalance: toBigInt(s.borrow_balance),
    }));

  return mapped.filter((s) => s.supplyBalance !== 0n || s.borrowBalance !== 0n);
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

export async function buildSaveTx(
  client: SuiJsonRpcClient,
  address: string,
  amount: number,
  options: { collectFee?: boolean; asset?: StableAsset } = {},
): Promise<Transaction> {
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    throw new T2000Error('INVALID_AMOUNT', 'Save amount must be a positive number');
  }
  const asset = options.asset ?? 'USDC';
  const assetInfo = SUPPORTED_ASSETS[asset];
  const rawAmount = Number(stableToRaw(amount, assetInfo.decimals));
  const [config, pool] = await Promise.all([getConfig(), getPool(asset)]);

  const coins = await fetchCoins(client, address, assetInfo.type);
  if (coins.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', `No ${assetInfo.displayName} coins found`);

  const tx = new Transaction();
  tx.setSender(address);

  const coinObj = mergeCoins(tx, coins);

  if (options.collectFee) {
    addCollectFeeToTx(tx, coinObj, 'save');
  }

  tx.moveCall({
    target: `${config.package}::incentive_v3::entry_deposit`,
    arguments: [
      tx.object(CLOCK),
      tx.object(config.storage),
      tx.object(pool.contract.pool),
      tx.pure.u8(pool.id),
      coinObj,
      tx.pure.u64(rawAmount),
      tx.object(config.incentiveV2),
      tx.object(config.incentiveV3),
    ],
    typeArguments: [pool.suiCoinType],
  });

  return tx;
}

export async function save(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  amount: number,
): Promise<SaveResult> {
  const address = keypair.getPublicKey().toSuiAddress();
  const tx = await buildSaveTx(client, address, amount);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });

  const rates = await getRates(client);

  return {
    success: true,
    tx: result.digest,
    amount,
    apy: rates.USDC.saveApy,
    fee: 0,
    gasCost: extractGasCost(result.effects),
    gasMethod: 'self-funded' as GasMethod,
    savingsBalance: amount,
  };
}

export async function buildWithdrawTx(
  client: SuiJsonRpcClient,
  address: string,
  amount: number,
  options: { asset?: StableAsset } = {},
): Promise<{ tx: Transaction; effectiveAmount: number }> {
  const asset = options.asset ?? 'USDC';
  const assetInfo = SUPPORTED_ASSETS[asset];
  const [config, pool, pools, states] = await Promise.all([
    getConfig(),
    getPool(asset),
    getPools(),
    getUserState(client, address),
  ]);

  const assetState = states.find((s) => s.assetId === pool.id);
  const deposited = assetState ? compoundBalance(assetState.supplyBalance, pool.currentSupplyIndex) : 0;

  const effectiveAmount = Math.min(amount, Math.max(0, deposited - WITHDRAW_DUST_BUFFER));
  if (effectiveAmount <= 0) throw new T2000Error('NO_COLLATERAL', `Nothing to withdraw for ${assetInfo.displayName} on NAVI`);

  const rawAmount = Number(stableToRaw(effectiveAmount, assetInfo.decimals));
  if (rawAmount <= 0) {
    throw new T2000Error('INVALID_AMOUNT', `Withdrawal amount rounds to zero — balance is dust`);
  }

  const tx = new Transaction();
  tx.setSender(address);

  await refreshStableOracles(tx, client, config, pools);

  const [balance] = tx.moveCall({
    target: `${config.package}::incentive_v3::withdraw_v2`,
    arguments: [
      tx.object(CLOCK),
      tx.object(config.oracle.priceOracle),
      tx.object(config.storage),
      tx.object(pool.contract.pool),
      tx.pure.u8(pool.id),
      tx.pure.u64(rawAmount),
      tx.object(config.incentiveV2),
      tx.object(config.incentiveV3),
      tx.object(SUI_SYSTEM_STATE),
    ],
    typeArguments: [pool.suiCoinType],
  });

  const [coin] = tx.moveCall({
    target: '0x2::coin::from_balance',
    arguments: [balance],
    typeArguments: [pool.suiCoinType],
  });

  tx.transferObjects([coin], address);

  return { tx, effectiveAmount };
}

/**
 * Composable variant: adds withdraw commands to an existing PTB and
 * returns the coin object for chaining (no transferObjects).
 */
export async function addWithdrawToTx(
  tx: Transaction,
  client: SuiJsonRpcClient,
  address: string,
  amount: number,
  options: { asset?: StableAsset } = {},
): Promise<{ coin: TransactionObjectArgument; effectiveAmount: number }> {
  const asset = options.asset ?? 'USDC';
  const assetInfo = SUPPORTED_ASSETS[asset];
  const [config, pool, pools, states] = await Promise.all([
    getConfig(),
    getPool(asset),
    getPools(),
    getUserState(client, address),
  ]);

  const assetState = states.find((s) => s.assetId === pool.id);
  const deposited = assetState ? compoundBalance(assetState.supplyBalance, pool.currentSupplyIndex) : 0;

  const effectiveAmount = Math.min(amount, Math.max(0, deposited - WITHDRAW_DUST_BUFFER));
  if (effectiveAmount <= 0) throw new T2000Error('NO_COLLATERAL', `Nothing to withdraw for ${assetInfo.displayName} on NAVI`);

  const rawAmount = Number(stableToRaw(effectiveAmount, assetInfo.decimals));
  if (rawAmount <= 0) {
    // Dust position — create a zero-value coin instead of calling on-chain withdraw
    const [coin] = tx.moveCall({
      target: '0x2::coin::zero',
      typeArguments: [pool.suiCoinType],
    });
    return { coin, effectiveAmount: 0 };
  }

  await refreshStableOracles(tx, client, config, pools);

  const [balance] = tx.moveCall({
    target: `${config.package}::incentive_v3::withdraw_v2`,
    arguments: [
      tx.object(CLOCK),
      tx.object(config.oracle.priceOracle),
      tx.object(config.storage),
      tx.object(pool.contract.pool),
      tx.pure.u8(pool.id),
      tx.pure.u64(rawAmount),
      tx.object(config.incentiveV2),
      tx.object(config.incentiveV3),
      tx.object(SUI_SYSTEM_STATE),
    ],
    typeArguments: [pool.suiCoinType],
  });

  const [coin] = tx.moveCall({
    target: '0x2::coin::from_balance',
    arguments: [balance],
    typeArguments: [pool.suiCoinType],
  });

  return { coin, effectiveAmount };
}

/**
 * Composable variant: adds deposit commands to an existing PTB
 * using a coin object from a prior step (withdraw/swap).
 */
export async function addSaveToTx(
  tx: Transaction,
  _client: SuiJsonRpcClient,
  _address: string,
  coin: TransactionObjectArgument,
  options: { asset?: StableAsset; collectFee?: boolean } = {},
): Promise<void> {
  const asset = options.asset ?? 'USDC';
  const [config, pool] = await Promise.all([getConfig(), getPool(asset)]);

  if (options.collectFee) {
    addCollectFeeToTx(tx, coin, 'save');
  }

  const [coinValue] = tx.moveCall({
    target: '0x2::coin::value',
    typeArguments: [pool.suiCoinType],
    arguments: [coin],
  });

  tx.moveCall({
    target: `${config.package}::incentive_v3::entry_deposit`,
    arguments: [
      tx.object(CLOCK),
      tx.object(config.storage),
      tx.object(pool.contract.pool),
      tx.pure.u8(pool.id),
      coin,
      coinValue,
      tx.object(config.incentiveV2),
      tx.object(config.incentiveV3),
    ],
    typeArguments: [pool.suiCoinType],
  });
}

/**
 * Composable variant: adds repay commands to an existing PTB
 * using a coin object from a prior step (swap).
 */
export async function addRepayToTx(
  tx: Transaction,
  client: SuiJsonRpcClient,
  _address: string,
  coin: TransactionObjectArgument,
  options: { asset?: StableAsset } = {},
): Promise<void> {
  const asset = options.asset ?? 'USDC';
  const [config, pool] = await Promise.all([getConfig(), getPool(asset)]);

  addOracleUpdate(tx, config, pool);

  const [coinValue] = tx.moveCall({
    target: '0x2::coin::value',
    typeArguments: [pool.suiCoinType],
    arguments: [coin],
  });

  tx.moveCall({
    target: `${config.package}::incentive_v3::entry_repay`,
    arguments: [
      tx.object(CLOCK),
      tx.object(config.oracle.priceOracle),
      tx.object(config.storage),
      tx.object(pool.contract.pool),
      tx.pure.u8(pool.id),
      coin,
      coinValue,
      tx.object(config.incentiveV2),
      tx.object(config.incentiveV3),
    ],
    typeArguments: [pool.suiCoinType],
  });
}

export async function withdraw(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  amount: number,
): Promise<WithdrawResult> {
  const address = keypair.getPublicKey().toSuiAddress();
  const { tx, effectiveAmount } = await buildWithdrawTx(client, address, amount);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });

  return {
    success: true,
    tx: result.digest,
    amount: effectiveAmount,
    gasCost: extractGasCost(result.effects),
    gasMethod: 'self-funded' as GasMethod,
  };
}

export async function buildBorrowTx(
  client: SuiJsonRpcClient,
  address: string,
  amount: number,
  options: { collectFee?: boolean; asset?: StableAsset } = {},
): Promise<Transaction> {
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    throw new T2000Error('INVALID_AMOUNT', 'Borrow amount must be a positive number');
  }
  const asset = options.asset ?? 'USDC';
  const assetInfo = SUPPORTED_ASSETS[asset];
  const rawAmount = Number(stableToRaw(amount, assetInfo.decimals));
  const [config, pool, pools] = await Promise.all([
    getConfig(), getPool(asset), getPools(),
  ]);

  const tx = new Transaction();
  tx.setSender(address);

  await refreshStableOracles(tx, client, config, pools);

  const [balance] = tx.moveCall({
    target: `${config.package}::incentive_v3::borrow_v2`,
    arguments: [
      tx.object(CLOCK),
      tx.object(config.oracle.priceOracle),
      tx.object(config.storage),
      tx.object(pool.contract.pool),
      tx.pure.u8(pool.id),
      tx.pure.u64(rawAmount),
      tx.object(config.incentiveV2),
      tx.object(config.incentiveV3),
      tx.object(SUI_SYSTEM_STATE),
    ],
    typeArguments: [pool.suiCoinType],
  });

  const [borrowedCoin] = tx.moveCall({
    target: '0x2::coin::from_balance',
    arguments: [balance],
    typeArguments: [pool.suiCoinType],
  });

  if (options.collectFee) {
    addCollectFeeToTx(tx, borrowedCoin, 'borrow');
  }

  tx.transferObjects([borrowedCoin], address);

  return tx;
}

export async function borrow(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  amount: number,
): Promise<BorrowResult> {
  const address = keypair.getPublicKey().toSuiAddress();
  const tx = await buildBorrowTx(client, address, amount);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });

  const hfResult = await getHealthFactor(client, address);

  return {
    success: true,
    tx: result.digest,
    amount,
    fee: 0,
    healthFactor: hfResult.healthFactor,
    gasCost: extractGasCost(result.effects),
    gasMethod: 'self-funded' as GasMethod,
  };
}

export async function buildRepayTx(
  client: SuiJsonRpcClient,
  address: string,
  amount: number,
  options: { asset?: StableAsset } = {},
): Promise<Transaction> {
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    throw new T2000Error('INVALID_AMOUNT', 'Repay amount must be a positive number');
  }
  const asset = options.asset ?? 'USDC';
  const assetInfo = SUPPORTED_ASSETS[asset];
  const rawAmount = Number(stableToRaw(amount, assetInfo.decimals));
  const [config, pool] = await Promise.all([getConfig(), getPool(asset)]);

  const coins = await fetchCoins(client, address, assetInfo.type);
  if (coins.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', `No ${assetInfo.displayName} coins to repay with`);

  const tx = new Transaction();
  tx.setSender(address);

  addOracleUpdate(tx, config, pool);

  const coinObj = mergeCoins(tx, coins);

  tx.moveCall({
    target: `${config.package}::incentive_v3::entry_repay`,
    arguments: [
      tx.object(CLOCK),
      tx.object(config.oracle.priceOracle),
      tx.object(config.storage),
      tx.object(pool.contract.pool),
      tx.pure.u8(pool.id),
      coinObj,
      tx.pure.u64(rawAmount),
      tx.object(config.incentiveV2),
      tx.object(config.incentiveV3),
    ],
    typeArguments: [pool.suiCoinType],
  });

  return tx;
}

export async function repay(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  amount: number,
): Promise<RepayResult> {
  const address = keypair.getPublicKey().toSuiAddress();
  const tx = await buildRepayTx(client, address, amount);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });

  const states = await getUserState(client, address);
  const pools = await getPools();
  let remainingDebt = 0;
  for (const state of states) {
    const pool = pools.find((p) => p.id === state.assetId);
    if (!pool) continue;
    remainingDebt += compoundBalance(state.borrowBalance, pool.currentBorrowIndex);
  }

  return {
    success: true,
    tx: result.digest,
    amount,
    remainingDebt,
    gasCost: extractGasCost(result.effects),
    gasMethod: 'self-funded' as GasMethod,
  };
}

export async function getHealthFactor(
  client: SuiJsonRpcClient,
  addressOrKeypair: string | Ed25519Keypair,
): Promise<HealthFactorResult> {
  const address = typeof addressOrKeypair === 'string'
    ? addressOrKeypair
    : addressOrKeypair.getPublicKey().toSuiAddress();

  const [config, pools, states] = await Promise.all([
    getConfig(),
    getPools(),
    getUserState(client, address),
  ]);

  let supplied = 0;
  let borrowed = 0;
  let weightedLtv = 0;
  let weightedLiqThreshold = 0;

  for (const state of states) {
    const pool = pools.find((p) => p.id === state.assetId);
    if (!pool) continue;

    const supplyBal = compoundBalance(state.supplyBalance, pool.currentSupplyIndex);
    const borrowBal = compoundBalance(state.borrowBalance, pool.currentBorrowIndex);
    const price = pool.token?.price ?? 1;

    supplied += supplyBal * price;
    borrowed += borrowBal * price;

    if (supplyBal > 0) {
      weightedLtv += supplyBal * price * parseLtv(pool.ltv);
      weightedLiqThreshold += supplyBal * price * parseLiqThreshold(pool.liquidationFactor.threshold);
    }
  }

  const ltv = supplied > 0 ? weightedLtv / supplied : 0.75;
  const liqThreshold = supplied > 0 ? weightedLiqThreshold / supplied : 0.75;
  const maxBorrowVal = Math.max(0, supplied * ltv - borrowed);

  const usdcPool = pools.find((p) => matchesCoinType(p.suiCoinType || p.coinType || '', SUPPORTED_ASSETS.USDC.type));

  let healthFactor: number;
  if (borrowed <= 0) {
    healthFactor = Infinity;
  } else if (usdcPool) {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${config.uiGetter}::calculator_unchecked::dynamic_health_factor`,
        arguments: [
          tx.object(CLOCK),
          tx.object(config.storage),
          tx.object(config.oracle.priceOracle),
          tx.pure.u8(usdcPool.id),
          tx.pure.address(address),
          tx.pure.u8(usdcPool.id),
          tx.pure.u64(0),
          tx.pure.u64(0),
          tx.pure.bool(false),
        ],
        typeArguments: [usdcPool.suiCoinType],
      });

      const result = await client.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: address,
      });

      const decoded = decodeDevInspect(result, bcs.u256());
      if (decoded !== undefined) {
        healthFactor = normalizeHealthFactor(Number(decoded));
      } else {
        healthFactor = (supplied * liqThreshold) / borrowed;
      }
    } catch {
      healthFactor = (supplied * liqThreshold) / borrowed;
    }
  } else {
    healthFactor = (supplied * liqThreshold) / borrowed;
  }

  return {
    healthFactor,
    supplied,
    borrowed,
    maxBorrow: maxBorrowVal,
    liquidationThreshold: liqThreshold,
  };
}

export async function getRates(client: SuiJsonRpcClient): Promise<RatesResult> {
  try {
    const pools = await getPools();
    const result: RatesResult = {};

    for (const asset of STABLE_ASSETS) {
      const targetType = SUPPORTED_ASSETS[asset].type;
      const pool = pools.find((p) => matchesCoinType(p.suiCoinType || p.coinType || '', targetType));
      if (!pool) continue;

      let saveApy = rateToApy(pool.currentSupplyRate);
      let borrowApy = rateToApy(pool.currentBorrowRate);

      if (saveApy <= 0 || saveApy > 100) saveApy = 0;
      if (borrowApy <= 0 || borrowApy > 100) borrowApy = 0;

      result[asset] = { saveApy, borrowApy };
    }

    if (!result.USDC) result.USDC = { saveApy: 4.0, borrowApy: 6.0 };
    return result;
  } catch {
    return { USDC: { saveApy: 4.0, borrowApy: 6.0 } };
  }
}

export async function getPositions(
  client: SuiJsonRpcClient,
  addressOrKeypair: string | Ed25519Keypair,
): Promise<PositionsResult> {
  const address = typeof addressOrKeypair === 'string'
    ? addressOrKeypair
    : addressOrKeypair.getPublicKey().toSuiAddress();

  const [states, pools] = await Promise.all([getUserState(client, address), getPools()]);
  const positions: PositionEntry[] = [];

  for (const state of states) {
    const pool = pools.find((p) => p.id === state.assetId);
    if (!pool) continue;

    const symbol = resolvePoolSymbol(pool);
    const supplyBal = compoundBalance(state.supplyBalance, pool.currentSupplyIndex);
    const borrowBal = compoundBalance(state.borrowBalance, pool.currentBorrowIndex);

    if (supplyBal > 0.0001) {
      positions.push({
        protocol: 'navi',
        asset: symbol,
        type: 'save',
        amount: supplyBal,
        apy: rateToApy(pool.currentSupplyRate),
      });
    }

    if (borrowBal > 0.0001) {
      positions.push({
        protocol: 'navi',
        asset: symbol,
        type: 'borrow',
        amount: borrowBal,
        apy: rateToApy(pool.currentBorrowRate),
      });
    }
  }

  return { positions };
}

export async function maxWithdrawAmount(
  client: SuiJsonRpcClient,
  addressOrKeypair: string | Ed25519Keypair,
): Promise<MaxWithdrawResult> {
  const hf = await getHealthFactor(client, addressOrKeypair);
  const ltv = hf.liquidationThreshold > 0 ? hf.liquidationThreshold : 0.75;

  let maxAmount: number;
  if (hf.borrowed === 0) {
    maxAmount = hf.supplied;
  } else {
    maxAmount = Math.max(0, hf.supplied - (hf.borrowed * MIN_HEALTH_FACTOR / ltv));
  }

  const remainingSupply = hf.supplied - maxAmount;
  const hfAfter = hf.borrowed > 0 ? remainingSupply / hf.borrowed : Infinity;

  return { maxAmount, healthFactorAfter: hfAfter, currentHF: hf.healthFactor };
}

export async function maxBorrowAmount(
  client: SuiJsonRpcClient,
  addressOrKeypair: string | Ed25519Keypair,
): Promise<MaxBorrowResult> {
  const hf = await getHealthFactor(client, addressOrKeypair);
  const ltv = hf.liquidationThreshold > 0 ? hf.liquidationThreshold : 0.75;

  const maxAmount = Math.max(0, hf.supplied * ltv / MIN_HEALTH_FACTOR - hf.borrowed);

  return { maxAmount, healthFactorAfter: MIN_HEALTH_FACTOR, currentHF: hf.healthFactor };
}
