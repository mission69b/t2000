import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { SUPPORTED_ASSETS } from '../constants.js';
import { T2000Error } from '../errors.js';
import { usdcToRaw } from '../utils/format.js';
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NaviConfig {
  package: string;
  storage: string;
  incentiveV2: string;
  incentiveV3: string;
  uiGetter: string;
  oracle: { packageId: string; priceOracle: string };
}

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

async function getConfig(fresh = false): Promise<NaviConfig> {
  if (configCache && !fresh && Date.now() - configCache.ts < CACHE_TTL) return configCache.data;
  const data = await fetchJson<NaviConfig>(CONFIG_API);
  configCache = { data, ts: Date.now() };
  return data;
}

async function getPools(fresh = false): Promise<NaviPool[]> {
  if (poolsCache && !fresh && Date.now() - poolsCache.ts < CACHE_TTL) return poolsCache.data;
  const data = await fetchJson<NaviPool[]>(POOLS_API);
  poolsCache = { data, ts: Date.now() };
  return data;
}

async function getUsdcPool(): Promise<NaviPool> {
  const pools = await getPools();
  const usdc = pools.find(
    (p) => p.token?.symbol === 'USDC' || p.coinType?.toLowerCase().includes('usdc'),
  );
  if (!usdc) throw new T2000Error('PROTOCOL_UNAVAILABLE', 'USDC pool not found on NAVI');
  return usdc;
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
  const result = (rawBalance * scale + half) / BigInt(currentIndex);
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

  return (decoded as Array<{ asset_id: number; supply_balance: unknown; borrow_balance: unknown }>)
    .map((s) => ({
      assetId: s.asset_id,
      supplyBalance: toBigInt(s.supply_balance),
      borrowBalance: toBigInt(s.borrow_balance),
    }))
    .filter((s) => s.supplyBalance !== 0n || s.borrowBalance !== 0n);
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

function mergeCoinsPtb(
  tx: Transaction,
  coins: Array<{ coinObjectId: string; balance: string }>,
  amount: number,
): TransactionObjectArgument {
  if (coins.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', 'No coins to merge');

  const primary = tx.object(coins[0].coinObjectId);
  if (coins.length > 1) {
    tx.mergeCoins(primary, coins.slice(1).map((c) => tx.object(c.coinObjectId)));
  }

  const [split] = tx.splitCoins(primary, [amount]);
  return split;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function buildSaveTx(
  client: SuiJsonRpcClient,
  address: string,
  amount: number,
  options: { collectFee?: boolean } = {},
): Promise<Transaction> {
  const rawAmount = Number(usdcToRaw(amount));
  const [config, pool] = await Promise.all([getConfig(), getUsdcPool()]);

  const coins = await fetchCoins(client, address, USDC_TYPE);
  if (coins.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', 'No USDC coins found');

  const tx = new Transaction();
  tx.setSender(address);

  const coinObj = mergeCoinsPtb(tx, coins, rawAmount);

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
): Promise<{ tx: Transaction; effectiveAmount: number }> {
  const [config, pool, pools, states] = await Promise.all([
    getConfig(),
    getUsdcPool(),
    getPools(),
    getUserState(client, address),
  ]);

  const usdcState = states.find((s) => s.assetId === pool.id);
  const deposited = usdcState ? compoundBalance(usdcState.supplyBalance, pool.currentSupplyIndex) : 0;

  const effectiveAmount = Math.min(amount, Math.max(0, deposited - WITHDRAW_DUST_BUFFER));
  if (effectiveAmount <= 0) throw new T2000Error('NO_COLLATERAL', 'Nothing to withdraw');

  const rawAmount = Number(usdcToRaw(effectiveAmount));
  const tx = new Transaction();
  tx.setSender(address);

  tx.moveCall({
    target: `${config.package}::incentive_v3::entry_withdraw_v2`,
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
  });

  return { tx, effectiveAmount };
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
  options: { collectFee?: boolean } = {},
): Promise<Transaction> {
  const rawAmount = Number(usdcToRaw(amount));
  const [config, pool] = await Promise.all([getConfig(), getUsdcPool()]);

  const tx = new Transaction();
  tx.setSender(address);

  tx.moveCall({
    target: `${config.package}::incentive_v3::entry_borrow_v2`,
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
  });

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
): Promise<Transaction> {
  const rawAmount = Number(usdcToRaw(amount));
  const [config, pool] = await Promise.all([getConfig(), getUsdcPool()]);

  const coins = await fetchCoins(client, address, USDC_TYPE);
  if (coins.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', 'No USDC coins to repay with');

  const tx = new Transaction();
  tx.setSender(address);

  const coinObj = mergeCoinsPtb(tx, coins, rawAmount);

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
  const pool = await getUsdcPool();
  const usdcState = states.find((s) => s.assetId === pool.id);
  const remainingDebt = usdcState ? compoundBalance(usdcState.borrowBalance, pool.currentBorrowIndex) : 0;

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

  const [config, pool, states] = await Promise.all([
    getConfig(),
    getUsdcPool(),
    getUserState(client, address),
  ]);

  const usdcState = states.find((s) => s.assetId === pool.id);
  const supplied = usdcState ? compoundBalance(usdcState.supplyBalance, pool.currentSupplyIndex) : 0;
  const borrowed = usdcState ? compoundBalance(usdcState.borrowBalance, pool.currentBorrowIndex) : 0;

  const ltv = parseLtv(pool.ltv);
  const liqThreshold = parseLiqThreshold(pool.liquidationFactor.threshold);
  const maxBorrowVal = Math.max(0, supplied * ltv - borrowed);

  let healthFactor: number;
  if (borrowed <= 0) {
    healthFactor = Infinity;
  } else {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${config.uiGetter}::calculator_unchecked::dynamic_health_factor`,
        arguments: [
          tx.object(CLOCK),
          tx.object(config.storage),
          tx.object(config.oracle.priceOracle),
          tx.pure.u8(pool.id),
          tx.pure.address(address),
          tx.pure.u8(pool.id),
          tx.pure.u64(0),
          tx.pure.u64(0),
          tx.pure.bool(false),
        ],
        typeArguments: [pool.suiCoinType],
      });

      const result = await client.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: address,
      });

      const decoded = decodeDevInspect(result, bcs.u256());
      if (decoded !== undefined) {
        healthFactor = normalizeHealthFactor(Number(decoded));
      } else {
        healthFactor = borrowed > 0 ? (supplied * liqThreshold) / borrowed : Infinity;
      }
    } catch {
      healthFactor = borrowed > 0 ? (supplied * liqThreshold) / borrowed : Infinity;
    }
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
    const pool = await getUsdcPool();

    let saveApy = rateToApy(pool.currentSupplyRate);
    let borrowApy = rateToApy(pool.currentBorrowRate);

    if (saveApy <= 0 || saveApy > 100) saveApy = 4.0;
    if (borrowApy <= 0 || borrowApy > 100) borrowApy = 6.0;

    return { USDC: { saveApy, borrowApy } };
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

    const symbol = pool.token?.symbol ?? 'UNKNOWN';
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
