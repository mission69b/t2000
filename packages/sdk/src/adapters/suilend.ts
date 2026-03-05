import type { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeStructTag } from '@mysten/sui/utils';
import type {
  LendingAdapter,
  LendingRates,
  AdapterPositions,
  HealthInfo,
  AdapterTxResult,
  AdapterCapability,
} from './types.js';
import { SUPPORTED_ASSETS } from '../constants.js';
import { usdcToRaw } from '../utils/format.js';
import { T2000Error } from '../errors.js';
import { addCollectFeeToTx } from '../protocols/protocolFee.js';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';

const USDC_TYPE = SUPPORTED_ASSETS.USDC.type;
const USDC_DECIMALS = SUPPORTED_ASSETS.USDC.decimals;
const WAD = 1e18;
const MIN_HEALTH_FACTOR = 1.5;

interface SuilendSdk {
  SuilendClient: {
    initialize(id: string, type: string, client: SuiClient): Promise<SuilendClientInstance>;
    getObligationOwnerCaps(
      ownerId: string,
      typeArgs: string[],
      client: SuiClient,
    ): Promise<ObligationOwnerCap[]>;
  };
  LENDING_MARKET_ID: string;
  LENDING_MARKET_TYPE: string;
}

interface SuilendClientInstance {
  lendingMarket: {
    id: string;
    $typeArgs: string[];
    reserves: SuilendReserve[];
  };
  createObligation(tx: Transaction): [TransactionObjectArgument];
  deposit(
    coin: TransactionObjectArgument,
    coinType: string,
    obligationOwnerCap: TransactionObjectArgument | string,
    tx: Transaction,
  ): void;
  withdrawAndSendToUser(
    ownerId: string,
    obligationOwnerCap: string,
    obligationId: string,
    coinType: string,
    value: string,
    tx: Transaction,
  ): Promise<void>;
  getObligation(obligationId: string): Promise<SuilendObligation>;
  findReserveArrayIndex(coinType: string): bigint;
}

interface SuilendReserve {
  coinType: { name: string };
  mintDecimals: number;
  availableAmount: bigint;
  borrowedAmount: { value: bigint };
  ctokenSupply: bigint;
  unclaimedSpreadFees: { value: bigint };
  cumulativeBorrowRate: { value: bigint };
  price: { value: bigint };
  config: {
    element: {
      openLtvPct: number;
      closeLtvPct: number;
      spreadFeeBps: bigint | number;
      interestRateUtils: (bigint | number)[];
      interestRateAprs: (bigint | number)[];
    } | null;
  };
}

interface ObligationOwnerCap {
  id: string;
  obligationId: string;
}

interface SuilendObligation {
  id: string;
  deposits: Array<{
    coinType: { name: string };
    depositedCtokenAmount: bigint;
    reserveArrayIndex: bigint;
  }>;
  borrows: Array<{
    coinType: { name: string };
    borrowedAmount: { value: bigint };
    cumulativeBorrowRate: { value: bigint };
    reserveArrayIndex: bigint;
  }>;
}

function interpolateRate(
  utilBreakpoints: number[],
  aprBreakpoints: number[],
  utilizationPct: number,
): number {
  if (utilBreakpoints.length === 0) return 0;
  if (utilizationPct <= utilBreakpoints[0]) return aprBreakpoints[0];
  if (utilizationPct >= utilBreakpoints[utilBreakpoints.length - 1]) {
    return aprBreakpoints[aprBreakpoints.length - 1];
  }

  for (let i = 1; i < utilBreakpoints.length; i++) {
    if (utilizationPct <= utilBreakpoints[i]) {
      const t =
        (utilizationPct - utilBreakpoints[i - 1]) /
        (utilBreakpoints[i] - utilBreakpoints[i - 1]);
      return aprBreakpoints[i - 1] + t * (aprBreakpoints[i] - aprBreakpoints[i - 1]);
    }
  }
  return aprBreakpoints[aprBreakpoints.length - 1];
}

function computeRatesFromReserve(reserve: SuilendReserve): {
  borrowAprPct: number;
  depositAprPct: number;
  utilizationPct: number;
} {
  const decimals = reserve.mintDecimals;
  const available = Number(reserve.availableAmount) / 10 ** decimals;
  const borrowed =
    Number(reserve.borrowedAmount.value) / WAD / 10 ** decimals;
  const totalDeposited = available + borrowed;
  const utilizationPct =
    totalDeposited > 0 ? (borrowed / totalDeposited) * 100 : 0;

  const config = reserve.config.element;
  if (!config) return { borrowAprPct: 0, depositAprPct: 0, utilizationPct: 0 };

  const utils = config.interestRateUtils.map(Number);
  const aprs = config.interestRateAprs.map((a) => Number(a) / 100);

  const borrowAprPct = interpolateRate(utils, aprs, utilizationPct);
  const spreadFeeBps = Number(config.spreadFeeBps);
  const depositAprPct =
    (utilizationPct / 100) *
    (borrowAprPct / 100) *
    (1 - spreadFeeBps / 10000) *
    100;

  return { borrowAprPct, depositAprPct, utilizationPct };
}

function cTokenRatio(reserve: SuilendReserve): number {
  if (reserve.ctokenSupply === 0n) return 1;

  const available = Number(reserve.availableAmount);
  const borrowed = Number(reserve.borrowedAmount.value) / WAD;
  const spreadFees = Number(reserve.unclaimedSpreadFees.value) / WAD;
  const totalSupply = available + borrowed - spreadFees;

  return totalSupply / Number(reserve.ctokenSupply);
}

/**
 * Suilend adapter — save + withdraw for USDC.
 * Borrow/repay deferred to Phase 10 (requires multi-stable support).
 *
 * Uses the @suilend/sdk package (optional peer dependency). Users must
 * install it separately: `npm install @suilend/sdk@^1`
 *
 * @see https://docs.suilend.fi/ecosystem/suilend-sdk-guide
 */
export class SuilendAdapter implements LendingAdapter {
  readonly id = 'suilend';
  readonly name = 'Suilend';
  readonly version = '1.0.0';
  readonly capabilities: readonly AdapterCapability[] = ['save', 'withdraw'];
  readonly supportedAssets: readonly string[] = ['USDC'];
  readonly supportsSameAssetBorrow = false;

  private client!: SuiClient;
  private suilend!: SuilendClientInstance;
  private lendingMarketType!: string;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(client: SuiClient): Promise<void> {
    this.client = client;
    await this.lazyInit();
  }

  initSync(client: SuiClient): void {
    this.client = client;
  }

  private async lazyInit(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      let sdk: SuilendSdk;
      try {
        sdk = (await import('@suilend/sdk')) as unknown as SuilendSdk;
      } catch {
        throw new T2000Error(
          'PROTOCOL_UNAVAILABLE',
          'Suilend SDK not installed. Run: npm install @suilend/sdk@^1',
        );
      }

      this.lendingMarketType = sdk.LENDING_MARKET_TYPE;

      try {
        this.suilend = await sdk.SuilendClient.initialize(
          sdk.LENDING_MARKET_ID,
          sdk.LENDING_MARKET_TYPE,
          this.client,
        );
      } catch (err) {
        this.initPromise = null;
        throw new T2000Error(
          'PROTOCOL_UNAVAILABLE',
          `Failed to initialize Suilend: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      this.initialized = true;
    })();

    return this.initPromise;
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialized) {
      await this.lazyInit();
    }
  }

  private findReserve(asset: string): SuilendReserve | undefined {
    const upper = asset.toUpperCase();
    let coinType: string;
    if (upper === 'USDC') coinType = USDC_TYPE;
    else if (upper === 'SUI') coinType = '0x2::sui::SUI';
    else if (asset.includes('::')) coinType = asset;
    else return undefined;

    try {
      const normalized = normalizeStructTag(coinType);
      return this.suilend.lendingMarket.reserves.find(
        (r) => normalizeStructTag(r.coinType.name) === normalized,
      );
    } catch {
      return undefined;
    }
  }

  private async getObligationCaps(address: string): Promise<ObligationOwnerCap[]> {
    const SuilendClientStatic = ((await import('@suilend/sdk')) as unknown as SuilendSdk).SuilendClient;
    return SuilendClientStatic.getObligationOwnerCaps(
      address,
      [this.lendingMarketType],
      this.client,
    );
  }

  private resolveSymbol(coinType: string): string {
    const normalized = normalizeStructTag(coinType);
    if (normalized === normalizeStructTag(USDC_TYPE)) return 'USDC';
    if (normalized === normalizeStructTag('0x2::sui::SUI')) return 'SUI';
    const parts = coinType.split('::');
    return parts[parts.length - 1] || 'UNKNOWN';
  }

  async getRates(asset: string): Promise<LendingRates> {
    await this.ensureInit();

    const reserve = this.findReserve(asset);
    if (!reserve) {
      throw new T2000Error('ASSET_NOT_SUPPORTED', `Suilend does not support ${asset}`);
    }

    const { borrowAprPct, depositAprPct } = computeRatesFromReserve(reserve);

    return {
      asset,
      saveApy: depositAprPct,
      borrowApy: borrowAprPct,
    };
  }

  async getPositions(address: string): Promise<AdapterPositions> {
    await this.ensureInit();

    const supplies: Array<{ asset: string; amount: number; apy: number }> = [];
    const borrows: Array<{ asset: string; amount: number; apy: number }> = [];

    const caps = await this.getObligationCaps(address);
    if (caps.length === 0) return { supplies, borrows };

    const obligation = await this.suilend.getObligation(caps[0].obligationId);

    for (const deposit of obligation.deposits) {
      const coinType = normalizeStructTag(deposit.coinType.name);
      const reserve = this.suilend.lendingMarket.reserves.find(
        (r) => normalizeStructTag(r.coinType.name) === coinType,
      );
      if (!reserve) continue;

      const ctokenAmount = Number(deposit.depositedCtokenAmount.toString());
      const ratio = cTokenRatio(reserve);
      const amount = (ctokenAmount * ratio) / 10 ** reserve.mintDecimals;
      const { depositAprPct } = computeRatesFromReserve(reserve);

      supplies.push({ asset: this.resolveSymbol(coinType), amount, apy: depositAprPct });
    }

    for (const borrow of obligation.borrows) {
      const coinType = normalizeStructTag(borrow.coinType.name);
      const reserve = this.suilend.lendingMarket.reserves.find(
        (r) => normalizeStructTag(r.coinType.name) === coinType,
      );
      if (!reserve) continue;

      const rawBorrowed = Number(borrow.borrowedAmount.value.toString()) / WAD;
      const amount = rawBorrowed / 10 ** reserve.mintDecimals;

      const reserveRate = Number(reserve.cumulativeBorrowRate.value.toString()) / WAD;
      const posRate = Number(borrow.cumulativeBorrowRate.value.toString()) / WAD;
      const compounded = posRate > 0 ? amount * (reserveRate / posRate) : amount;

      const { borrowAprPct } = computeRatesFromReserve(reserve);
      borrows.push({ asset: this.resolveSymbol(coinType), amount: compounded, apy: borrowAprPct });
    }

    return { supplies, borrows };
  }

  async getHealth(address: string): Promise<HealthInfo> {
    await this.ensureInit();

    const caps = await this.getObligationCaps(address);
    if (caps.length === 0) {
      return { healthFactor: Infinity, supplied: 0, borrowed: 0, maxBorrow: 0, liquidationThreshold: 0 };
    }

    const positions = await this.getPositions(address);
    const supplied = positions.supplies.reduce((s, p) => s + p.amount, 0);
    const borrowed = positions.borrows.reduce((s, p) => s + p.amount, 0);

    const reserve = this.findReserve('USDC');
    const closeLtv = reserve?.config?.element?.closeLtvPct ?? 75;
    const openLtv = reserve?.config?.element?.openLtvPct ?? 70;
    const liqThreshold = closeLtv / 100;

    const healthFactor = borrowed > 0
      ? (supplied * liqThreshold) / borrowed
      : Infinity;

    const maxBorrow = Math.max(0, supplied * (openLtv / 100) - borrowed);

    return { healthFactor, supplied, borrowed, maxBorrow, liquidationThreshold: liqThreshold };
  }

  async buildSaveTx(
    address: string,
    amount: number,
    _asset: string,
    options?: { collectFee?: boolean },
  ): Promise<AdapterTxResult> {
    await this.ensureInit();

    const rawAmount = usdcToRaw(amount).toString();
    const tx = new Transaction();
    tx.setSender(address);

    const caps = await this.getObligationCaps(address);
    let capRef: TransactionObjectArgument | string;

    if (caps.length === 0) {
      const [newCap] = this.suilend.createObligation(tx);
      capRef = newCap;
    } else {
      capRef = caps[0].id;
    }

    const allCoins = await this.fetchAllCoins(address, USDC_TYPE);
    if (allCoins.length === 0) {
      throw new T2000Error('INSUFFICIENT_BALANCE', 'No USDC coins found');
    }

    const primaryCoinId = allCoins[0].coinObjectId;
    if (allCoins.length > 1) {
      tx.mergeCoins(
        tx.object(primaryCoinId),
        allCoins.slice(1).map((c) => tx.object(c.coinObjectId)),
      );
    }

    const [depositCoin] = tx.splitCoins(tx.object(primaryCoinId), [rawAmount]);

    if (options?.collectFee) {
      addCollectFeeToTx(tx, depositCoin as TransactionObjectArgument, 'save');
    }

    this.suilend.deposit(depositCoin as TransactionObjectArgument, USDC_TYPE, capRef, tx);

    return { tx };
  }

  async buildWithdrawTx(
    address: string,
    amount: number,
    _asset: string,
  ): Promise<AdapterTxResult & { effectiveAmount: number }> {
    await this.ensureInit();

    const caps = await this.getObligationCaps(address);
    if (caps.length === 0) {
      throw new T2000Error('NO_COLLATERAL', 'No Suilend position found');
    }

    const positions = await this.getPositions(address);
    const usdcSupply = positions.supplies.find((s) => s.asset === 'USDC');
    const deposited = usdcSupply?.amount ?? 0;

    const effectiveAmount = Math.min(amount, deposited);
    if (effectiveAmount <= 0) {
      throw new T2000Error('NO_COLLATERAL', 'Nothing to withdraw from Suilend');
    }

    const rawAmount = usdcToRaw(effectiveAmount).toString();
    const tx = new Transaction();
    tx.setSender(address);

    await this.suilend.withdrawAndSendToUser(
      address,
      caps[0].id,
      caps[0].obligationId,
      USDC_TYPE,
      rawAmount,
      tx,
    );

    return { tx, effectiveAmount };
  }

  async buildBorrowTx(
    _address: string,
    _amount: number,
    _asset: string,
    _options?: { collectFee?: boolean },
  ): Promise<AdapterTxResult> {
    throw new T2000Error(
      'ASSET_NOT_SUPPORTED',
      'SuilendAdapter.buildBorrowTx() not available — Suilend requires different collateral/borrow assets. Deferred to Phase 10.',
    );
  }

  async buildRepayTx(
    _address: string,
    _amount: number,
    _asset: string,
  ): Promise<AdapterTxResult> {
    throw new T2000Error(
      'ASSET_NOT_SUPPORTED',
      'SuilendAdapter.buildRepayTx() not available — deferred to Phase 10.',
    );
  }

  async maxWithdraw(
    address: string,
    _asset: string,
  ): Promise<{ maxAmount: number; healthFactorAfter: number; currentHF: number }> {
    await this.ensureInit();

    const health = await this.getHealth(address);

    let maxAmount: number;
    if (health.borrowed === 0) {
      maxAmount = health.supplied;
    } else {
      maxAmount = Math.max(
        0,
        health.supplied - (health.borrowed * MIN_HEALTH_FACTOR) / health.liquidationThreshold,
      );
    }

    const remainingSupply = health.supplied - maxAmount;
    const hfAfter = health.borrowed > 0
      ? (remainingSupply * health.liquidationThreshold) / health.borrowed
      : Infinity;

    return {
      maxAmount,
      healthFactorAfter: hfAfter,
      currentHF: health.healthFactor,
    };
  }

  async maxBorrow(
    _address: string,
    _asset: string,
  ): Promise<{ maxAmount: number; healthFactorAfter: number; currentHF: number }> {
    throw new T2000Error(
      'ASSET_NOT_SUPPORTED',
      'SuilendAdapter.maxBorrow() not available — deferred to Phase 10.',
    );
  }

  private async fetchAllCoins(
    owner: string,
    coinType: string,
  ): Promise<Array<{ coinObjectId: string; balance: string }>> {
    const all: Array<{ coinObjectId: string; balance: string }> = [];
    let cursor: string | null | undefined = null;
    let hasNext = true;

    while (hasNext) {
      const page = await this.client.getCoins({ owner, coinType, cursor: cursor ?? undefined });
      all.push(...page.data.map((c) => ({ coinObjectId: c.coinObjectId, balance: c.balance })));
      cursor = page.nextCursor;
      hasNext = page.hasNextPage;
    }

    return all;
  }
}
