import { SuilendClient, LENDING_MARKET_ID, LENDING_MARKET_TYPE, parseReserve } from '@suilend/sdk';
import type { SuiClient, CoinMetadata } from '@mysten/sui/client';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SUPPORTED_ASSETS, USDC_DECIMALS } from '../constants.js';
import { T2000Error } from '../errors.js';
import { usdcToRaw } from '../utils/format.js';
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
const MIN_HEALTH_FACTOR = 1.5;

interface SuilendContext {
  suilendClient: SuilendClient;
  client: SuiClient;
  keypair: Ed25519Keypair;
  address: string;
}

let _suilendClient: SuilendClient | null = null;

async function getSuilendClient(client: SuiClient): Promise<SuilendClient> {
  if (!_suilendClient) {
    _suilendClient = await SuilendClient.initialize(
      LENDING_MARKET_ID,
      LENDING_MARKET_TYPE,
      client,
    );
  }
  return _suilendClient;
}

function coinTypeToSymbol(coinType: unknown): string {
  let typeStr: string;
  if (typeof coinType === 'string') {
    typeStr = coinType;
  } else if (coinType && typeof coinType === 'object' && 'name' in coinType) {
    const name = (coinType as { name: unknown }).name;
    if (typeof name === 'string') {
      typeStr = name;
    } else if (name && typeof name === 'object' && 'bytes' in (name as object)) {
      typeStr = Buffer.from((name as { bytes: number[] }).bytes).toString('utf-8');
    } else {
      typeStr = String(name);
    }
  } else {
    typeStr = String(coinType);
  }
  if (typeStr.includes('usdc') || typeStr.includes('USDC')) return 'USDC';
  if (typeStr.includes('sui') || typeStr.includes('SUI')) return 'SUI';
  return typeStr;
}

async function getObligationInfo(
  ctx: SuilendContext,
): Promise<{ obligationId: string; ownerCapId: string } | null> {
  const caps = await SuilendClient.getObligationOwnerCaps(
    ctx.address,
    [LENDING_MARKET_TYPE],
    ctx.client,
  );

  if (caps.length === 0) return null;

  const cap = caps[0];
  return {
    obligationId: cap.obligationId,
    ownerCapId: cap.id,
  };
}

async function ensureObligation(
  ctx: SuilendContext,
): Promise<{ obligationId: string; ownerCapId: string }> {
  const existing = await getObligationInfo(ctx);
  if (existing) return existing;

  const tx = new Transaction();
  const ownerCap = ctx.suilendClient.createObligation(tx);
  tx.transferObjects([ownerCap], ctx.address);

  const result = await ctx.client.signAndExecuteTransaction({
    signer: ctx.keypair,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  await ctx.client.waitForTransaction({ digest: result.digest });

  const newInfo = await getObligationInfo(ctx);
  if (!newInfo) throw new T2000Error('TRANSACTION_FAILED', 'Failed to create Suilend obligation');
  return newInfo;
}

function extractGasCost(effects: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } } | undefined | null): number {
  if (!effects?.gasUsed) return 0;
  return (
    (Number(effects.gasUsed.computationCost) +
      Number(effects.gasUsed.storageCost) -
      Number(effects.gasUsed.storageRebate)) /
    1e9
  );
}

export async function save(
  client: SuiClient,
  keypair: Ed25519Keypair,
  amount: number,
): Promise<SaveResult> {
  const address = keypair.getPublicKey().toSuiAddress();
  const suilendClient = await getSuilendClient(client);
  const ctx: SuilendContext = { suilendClient, client, keypair, address };

  const { ownerCapId } = await ensureObligation(ctx);

  const rawAmount = usdcToRaw(amount).toString();

  const tx = new Transaction();
  await suilendClient.depositIntoObligation(address, USDC_TYPE, rawAmount, tx, ownerCapId);

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
  };
}

export async function withdraw(
  client: SuiClient,
  keypair: Ed25519Keypair,
  amount: number,
): Promise<WithdrawResult> {
  const address = keypair.getPublicKey().toSuiAddress();
  const suilendClient = await getSuilendClient(client);

  const info = await getObligationInfo({ suilendClient, client, keypair, address });
  if (!info) throw new T2000Error('NO_COLLATERAL', 'No savings position found');

  const obligation = await suilendClient.getObligation(info.obligationId);

  let deposited = 0;
  for (const deposit of obligation.deposits) {
    const symbol = coinTypeToSymbol(deposit.coinType);
    if (symbol === 'USDC') {
      deposited += await getDepositedUnderlying(client, deposit, USDC_DECIMALS);
    }
  }

  // Cap at available — leave 0.001 USDC buffer for rounding
  const effectiveAmount = Math.min(amount, Math.max(0, deposited - 0.001));
  if (effectiveAmount <= 0) throw new T2000Error('NO_COLLATERAL', 'Nothing to withdraw');
  const rawAmount = usdcToRaw(effectiveAmount).toString();

  const tx = new Transaction();
  await suilendClient.refreshAll(tx, obligation);
  await suilendClient.withdrawAndSendToUser(
    address,
    info.ownerCapId,
    info.obligationId,
    USDC_TYPE,
    rawAmount,
    tx,
  );

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

export async function borrow(
  client: SuiClient,
  keypair: Ed25519Keypair,
  amount: number,
): Promise<BorrowResult> {
  const address = keypair.getPublicKey().toSuiAddress();
  const suilendClient = await getSuilendClient(client);

  const info = await getObligationInfo({ suilendClient, client, keypair, address });
  if (!info) throw new T2000Error('NO_COLLATERAL', 'No savings position found — deposit collateral first');

  const rawAmount = usdcToRaw(amount).toString();

  const obligation = await suilendClient.getObligation(info.obligationId);

  const tx = new Transaction();
  await suilendClient.refreshAll(tx, obligation);
  await suilendClient.borrowAndSendToUser(
    address,
    info.ownerCapId,
    info.obligationId,
    USDC_TYPE,
    rawAmount,
    tx,
  );

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });

  const hf = await getHealthFactor(client, keypair);

  return {
    success: true,
    tx: result.digest,
    amount,
    fee: 0,
    healthFactor: hf.healthFactor,
    gasCost: extractGasCost(result.effects),
    gasMethod: 'self-funded' as GasMethod,
  };
}

export async function repay(
  client: SuiClient,
  keypair: Ed25519Keypair,
  amount: number,
): Promise<RepayResult> {
  const address = keypair.getPublicKey().toSuiAddress();
  const suilendClient = await getSuilendClient(client);

  const info = await getObligationInfo({ suilendClient, client, keypair, address });
  if (!info) throw new T2000Error('NO_COLLATERAL', 'No borrow position found');

  const rawAmount = usdcToRaw(amount).toString();

  const tx = new Transaction();
  await suilendClient.repayIntoObligation(address, info.obligationId, USDC_TYPE, rawAmount, tx);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });

  return {
    success: true,
    tx: result.digest,
    amount,
    remainingDebt: 0,
    gasCost: extractGasCost(result.effects),
    gasMethod: 'self-funded' as GasMethod,
  };
}

export async function getHealthFactor(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<HealthFactorResult> {
  const address = keypair.getPublicKey().toSuiAddress();
  const suilendClient = await getSuilendClient(client);

  const info = await getObligationInfo({ suilendClient, client, keypair, address });
  if (!info) {
    return { healthFactor: Infinity, supplied: 0, borrowed: 0, maxBorrow: 0, liquidationThreshold: 0 };
  }

  const obligation = await suilendClient.getObligation(info.obligationId);

  let supplied = 0;
  let borrowed = 0;

  for (const deposit of obligation.deposits) {
    const symbol = coinTypeToSymbol(deposit.coinType);
    if (symbol === 'USDC') {
      supplied += await getDepositedUnderlying(client, deposit, USDC_DECIMALS);
    }
  }

  for (const borrowPos of obligation.borrows) {
    const symbol = coinTypeToSymbol(borrowPos.coinType);
    if (symbol === 'USDC') {
      const rawValue = borrowPos.borrowedAmount.value?.toString?.() ?? '0';
      borrowed += Number(BigInt(rawValue)) / 10 ** (18 + USDC_DECIMALS);
    }
  }

  const healthFactor = borrowed > 0 ? supplied / borrowed : Infinity;

  return {
    healthFactor,
    supplied,
    borrowed,
    maxBorrow: supplied * 0.75 - borrowed,
    liquidationThreshold: 0.8,
  };
}

let _coinMetadataCache: Record<string, CoinMetadata> = {};

async function fetchCoinMetadata(client: SuiClient, coinType: string): Promise<CoinMetadata | null> {
  if (_coinMetadataCache[coinType]) return _coinMetadataCache[coinType];
  const meta = await client.getCoinMetadata({ coinType });
  if (meta) _coinMetadataCache[coinType] = meta;
  return meta;
}

async function getCTokenExchangeRate(client: SuiClient, coinType: string): Promise<number> {
  try {
    const suilendClient = await getSuilendClient(client);
    const reserveIndex = suilendClient.findReserveArrayIndex(coinType);
    const reserve = suilendClient.lendingMarket.reserves[Number(reserveIndex)];
    if (!reserve) return 1;

    const meta = await fetchCoinMetadata(client, coinType);
    if (!meta) return 1;

    const parsed = parseReserve(reserve, { [coinType]: meta });
    return parsed.cTokenExchangeRate.toNumber();
  } catch {
    return 1;
  }
}

async function getDepositedUnderlying(
  client: SuiClient,
  deposit: { coinType: unknown; depositedCtokenAmount: unknown },
  decimals: number,
): Promise<number> {
  const coinType = typeof deposit.coinType === 'string' ? deposit.coinType : USDC_TYPE;
  const ctokenRaw = Number(deposit.depositedCtokenAmount) / 10 ** decimals;
  const exchangeRate = await getCTokenExchangeRate(client, coinType);
  return ctokenRaw * exchangeRate;
}

export async function getRates(client: SuiClient): Promise<RatesResult> {
  const suilendClient = await getSuilendClient(client);
  const lm = suilendClient.lendingMarket;

  let saveApy = 0;
  let borrowApy = 0;

  const reserveIndex = suilendClient.findReserveArrayIndex(USDC_TYPE);
  const reserve = lm.reserves[Number(reserveIndex)];

  if (reserve) {
    try {
      const coinType = USDC_TYPE;
      const meta = await fetchCoinMetadata(client, coinType);
      if (meta) {
        const coinMetadataMap: Record<string, CoinMetadata> = { [coinType]: meta };
        const parsed = parseReserve(reserve, coinMetadataMap);
        saveApy = parsed.depositAprPercent.toNumber();
        borrowApy = parsed.borrowAprPercent.toNumber();
      }
    } catch {
      // Fall back to placeholder if parsing fails
      saveApy = 4.5;
      borrowApy = 6.0;
    }
  }

  return { USDC: { saveApy, borrowApy } };
}

export async function getPositions(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<PositionsResult> {
  const address = keypair.getPublicKey().toSuiAddress();
  const suilendClient = await getSuilendClient(client);

  const info = await getObligationInfo({ suilendClient, client, keypair, address });
  if (!info) return { positions: [] };

  const obligation = await suilendClient.getObligation(info.obligationId);
  const positions: PositionEntry[] = [];

  for (const deposit of obligation.deposits) {
    const symbol = coinTypeToSymbol(deposit.coinType);
    const decimals = symbol === 'USDC' ? USDC_DECIMALS : 9;
    const underlying = await getDepositedUnderlying(client, deposit, decimals);
    positions.push({
      protocol: 'suilend',
      asset: symbol,
      type: 'save',
      amount: underlying,
      apy: 0,
    });
  }

  for (const borrowPos of obligation.borrows) {
    const symbol = coinTypeToSymbol(borrowPos.coinType);
    const rawValue = borrowPos.borrowedAmount.value?.toString?.() ?? '0';
    positions.push({
      protocol: 'suilend',
      asset: symbol,
      type: 'borrow',
      amount: Number(BigInt(rawValue)) / 10 ** (18 + USDC_DECIMALS),
      apy: 0,
    });
  }

  return { positions };
}

export async function maxWithdrawAmount(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<MaxWithdrawResult> {
  const hf = await getHealthFactor(client, keypair);
  let maxAmount: number;
  if (hf.borrowed === 0) {
    maxAmount = hf.supplied;
  } else {
    maxAmount = Math.max(0, hf.supplied - (hf.borrowed * MIN_HEALTH_FACTOR / 0.75));
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
  keypair: Ed25519Keypair,
): Promise<MaxBorrowResult> {
  const hf = await getHealthFactor(client, keypair);
  const maxAmount = Math.max(0, hf.supplied * 0.75 / MIN_HEALTH_FACTOR - hf.borrowed);

  return {
    maxAmount,
    healthFactorAfter: MIN_HEALTH_FACTOR,
    currentHF: hf.healthFactor,
  };
}
