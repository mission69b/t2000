import {
  getPool,
  getLendingState,
  getHealthFactor as naviGetHealthFactor,
  getCoins,
  mergeCoinsPTB,
  depositCoinPTB,
  withdrawCoinPTB,
  borrowCoinPTB,
  repayCoinPTB,
  getPriceFeeds,
  filterPriceFeeds,
  updateOraclePricesPTB,
} from '@naviprotocol/lending';
import type { SuiClient } from '@mysten/sui/client';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
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

const ENV = { env: 'prod' as const };
const USDC_TYPE = SUPPORTED_ASSETS.USDC.type;
const RATE_DECIMALS = 27;
const LTV_DECIMALS = 27;
const MIN_HEALTH_FACTOR = 1.5;
const WITHDRAW_DUST_BUFFER = 0.001;

// NAVI normalizes all internal balances (supplyBalance, borrowBalance) to 9 decimal
// places regardless of the token's native decimals. USDC is 6 on-chain, but NAVI
// reports it with 3 extra decimals of precision. Verified empirically: depositing
// 2_000_000 raw USDC (6-dec = $2) results in supplyBalance ≈ 2_000_000_000 (9-dec).
// PTB functions (deposit/withdraw/borrow/repay) still use native 6-dec amounts.
const NAVI_BALANCE_DECIMALS = 9;

function clientOpt(client: SuiClient, fresh = false) {
  return { client, ...ENV, ...(fresh ? { disableCache: true } : {}) };
}

function extractGasCost(effects: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } } | undefined | null): number {
  if (!effects?.gasUsed) return 0;
  return Math.abs(
    (Number(effects.gasUsed.computationCost) +
      Number(effects.gasUsed.storageCost) -
      Number(effects.gasUsed.storageRebate)) /
    1e9
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
  // NAVI returns thresholds as 27-decimal BigInt strings (e.g. "850000000000000000000000000"
  // for 0.85). If parseFloat yields > 1, it's a raw BigInt string needing conversion.
  const n = Number(val);
  if (n > 1) return Number(BigInt(val)) / 10 ** LTV_DECIMALS;
  return n;
}

function findUsdcPosition<T extends { pool: { token: { symbol: string }; coinType: string } }>(
  state: T[],
): T | undefined {
  return state.find(
    (p) => p.pool.token.symbol === 'USDC' || p.pool.coinType.toLowerCase().includes('usdc'),
  );
}

async function updateOracle(tx: Transaction, client: SuiClient, address: string): Promise<void> {
  try {
    const [feeds, state] = await Promise.all([
      getPriceFeeds(ENV),
      getLendingState(address, clientOpt(client)),
    ]);
    const relevant = filterPriceFeeds(feeds, { lendingState: state });
    if (relevant.length > 0) {
      await updateOraclePricesPTB(tx, relevant, { ...ENV, updatePythPriceFeeds: true });
    }
  } catch {
    // Oracle update failure is non-fatal — transaction may still succeed
  }
}

export async function buildSaveTx(
  client: SuiClient,
  address: string,
  amount: number,
  options: { collectFee?: boolean } = {},
): Promise<Transaction> {
  const rawAmount = Number(usdcToRaw(amount));

  const coins = await getCoins(address, { coinType: USDC_TYPE, client });
  if (!coins || coins.length === 0) {
    throw new T2000Error('INSUFFICIENT_BALANCE', 'No USDC coins found');
  }

  const tx = new Transaction();
  tx.setSender(address);

  const coinObj = mergeCoinsPTB(tx, coins, { balance: rawAmount });

  if (options.collectFee) {
    addCollectFeeToTx(tx, coinObj as TransactionObjectArgument, 'save');
  }

  await depositCoinPTB(tx, USDC_TYPE, coinObj, ENV);

  return tx;
}

export async function save(
  client: SuiClient,
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
  client: SuiClient,
  address: string,
  amount: number,
): Promise<{ tx: Transaction; effectiveAmount: number }> {
  const state = await getLendingState(address, clientOpt(client, true));
  const usdcPos = findUsdcPosition(state);
  const deposited = usdcPos ? Number(usdcPos.supplyBalance) / 10 ** NAVI_BALANCE_DECIMALS : 0;

  const effectiveAmount = Math.min(amount, Math.max(0, deposited - WITHDRAW_DUST_BUFFER));
  if (effectiveAmount <= 0) throw new T2000Error('NO_COLLATERAL', 'Nothing to withdraw');

  const rawAmount = Number(usdcToRaw(effectiveAmount));

  const tx = new Transaction();
  tx.setSender(address);

  await updateOracle(tx, client, address);

  const withdrawnCoin = await withdrawCoinPTB(tx, USDC_TYPE, rawAmount, ENV);
  tx.transferObjects([withdrawnCoin], address);

  return { tx, effectiveAmount };
}

export async function withdraw(
  client: SuiClient,
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
  client: SuiClient,
  address: string,
  amount: number,
  options: { collectFee?: boolean } = {},
): Promise<Transaction> {
  const rawAmount = Number(usdcToRaw(amount));

  const tx = new Transaction();
  tx.setSender(address);

  await updateOracle(tx, client, address);

  const borrowedCoin = await borrowCoinPTB(tx, USDC_TYPE, rawAmount, ENV);

  if (options.collectFee) {
    addCollectFeeToTx(tx, borrowedCoin, 'borrow');
  }

  tx.transferObjects([borrowedCoin], address);

  return tx;
}

export async function borrow(
  client: SuiClient,
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

  const hf = await naviGetHealthFactor(address, clientOpt(client, true));

  return {
    success: true,
    tx: result.digest,
    amount,
    fee: 0,
    healthFactor: hf,
    gasCost: extractGasCost(result.effects),
    gasMethod: 'self-funded' as GasMethod,
  };
}

export async function buildRepayTx(
  client: SuiClient,
  address: string,
  amount: number,
): Promise<Transaction> {
  const rawAmount = Number(usdcToRaw(amount));

  const coins = await getCoins(address, { coinType: USDC_TYPE, client });
  if (!coins || coins.length === 0) {
    throw new T2000Error('INSUFFICIENT_BALANCE', 'No USDC coins to repay with');
  }

  const tx = new Transaction();
  tx.setSender(address);

  const coinObj = mergeCoinsPTB(tx, coins, { balance: rawAmount });
  await repayCoinPTB(tx, USDC_TYPE, coinObj, { ...ENV, amount: rawAmount });

  return tx;
}

export async function repay(
  client: SuiClient,
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

  const state = await getLendingState(address, clientOpt(client, true));
  const usdcPos = findUsdcPosition(state);
  const remainingDebt = usdcPos ? Number(usdcPos.borrowBalance) / 10 ** NAVI_BALANCE_DECIMALS : 0;

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
  client: SuiClient,
  addressOrKeypair: string | Ed25519Keypair,
): Promise<HealthFactorResult> {
  const address = typeof addressOrKeypair === 'string'
    ? addressOrKeypair
    : addressOrKeypair.getPublicKey().toSuiAddress();

  const [healthFactor, state, pool] = await Promise.all([
    naviGetHealthFactor(address, clientOpt(client, true)),
    getLendingState(address, clientOpt(client, true)),
    getPool(USDC_TYPE, ENV),
  ]);

  const usdcPos = findUsdcPosition(state);

  const supplied = usdcPos ? Number(usdcPos.supplyBalance) / 10 ** NAVI_BALANCE_DECIMALS : 0;
  const borrowed = usdcPos ? Number(usdcPos.borrowBalance) / 10 ** NAVI_BALANCE_DECIMALS : 0;

  const ltv = parseLtv(pool.ltv);
  const liqThreshold = parseLiqThreshold(pool.liquidationFactor.threshold);
  const maxBorrowVal = Math.max(0, supplied * ltv - borrowed);

  return {
    healthFactor: borrowed > 0 ? healthFactor : Infinity,
    supplied,
    borrowed,
    maxBorrow: maxBorrowVal,
    liquidationThreshold: liqThreshold,
  };
}

export async function getRates(client: SuiClient): Promise<RatesResult> {
  try {
    const pool = await getPool(USDC_TYPE, ENV);

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
  client: SuiClient,
  addressOrKeypair: string | Ed25519Keypair,
): Promise<PositionsResult> {
  const address = typeof addressOrKeypair === 'string'
    ? addressOrKeypair
    : addressOrKeypair.getPublicKey().toSuiAddress();

  const state = await getLendingState(address, clientOpt(client, true));
  const positions: PositionEntry[] = [];

  for (const pos of state) {
    const symbol = pos.pool.token?.symbol ?? 'UNKNOWN';
    const supplyBal = Number(pos.supplyBalance) / 10 ** NAVI_BALANCE_DECIMALS;
    const borrowBal = Number(pos.borrowBalance) / 10 ** NAVI_BALANCE_DECIMALS;

    if (supplyBal > 0.0001) {
      positions.push({
        protocol: 'navi',
        asset: symbol,
        type: 'save',
        amount: supplyBal,
        apy: rateToApy(pos.pool.currentSupplyRate),
      });
    }

    if (borrowBal > 0.0001) {
      positions.push({
        protocol: 'navi',
        asset: symbol,
        type: 'borrow',
        amount: borrowBal,
        apy: rateToApy(pos.pool.currentBorrowRate),
      });
    }
  }

  return { positions };
}

export async function maxWithdrawAmount(
  client: SuiClient,
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

  return {
    maxAmount,
    healthFactorAfter: hfAfter,
    currentHF: hf.healthFactor,
  };
}

export async function maxBorrowAmount(
  client: SuiClient,
  addressOrKeypair: string | Ed25519Keypair,
): Promise<MaxBorrowResult> {
  const hf = await getHealthFactor(client, addressOrKeypair);
  const ltv = hf.liquidationThreshold > 0 ? hf.liquidationThreshold : 0.75;

  const maxAmount = Math.max(0, hf.supplied * ltv / MIN_HEALTH_FACTOR - hf.borrowed);

  return {
    maxAmount,
    healthFactorAfter: MIN_HEALTH_FACTOR,
    currentHF: hf.healthFactor,
  };
}
