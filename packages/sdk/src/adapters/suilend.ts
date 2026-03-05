import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
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
const WAD = 1e18;
const MIN_HEALTH_FACTOR = 1.5;
const CLOCK = '0x6';

const LENDING_MARKET_ID = '0x84030d26d85eaa7035084a057f2f11f701b7e2e4eda87551becbc7c97505ece1';
const LENDING_MARKET_TYPE = '0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf::suilend::MAIN_POOL';
const SUILEND_PACKAGE = '0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf';
const UPGRADE_CAP_ID = '0x3d4ef1859c3ee9fc72858f588b56a09da5466e64f8cc4e90a7b3b909fba8a7ae';
const FALLBACK_PUBLISHED_AT = '0xd2a67633ccb8de063163e25bcfca242929caf5cf1a26c2929dab519ee0b8f331';

interface Reserve {
  coinType: string;
  mintDecimals: number;
  availableAmount: number;
  borrowedAmountWad: number;
  ctokenSupply: number;
  unclaimedSpreadFeesWad: number;
  cumulativeBorrowRateWad: number;
  openLtvPct: number;
  closeLtvPct: number;
  spreadFeeBps: number;
  interestRateUtils: number[];
  interestRateAprs: number[];
  arrayIndex: number;
}

interface ObligationCap {
  id: string;
  obligationId: string;
}

interface Obligation {
  deposits: Array<{ coinType: string; ctokenAmount: number; reserveIdx: number }>;
  borrows: Array<{ coinType: string; borrowedWad: number; cumBorrowRateWad: number; reserveIdx: number }>;
}

// ---------------------------------------------------------------------------
// Rate math (unchanged from SDK-based version)
// ---------------------------------------------------------------------------

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

function computeRates(reserve: Reserve): { borrowAprPct: number; depositAprPct: number } {
  const available = reserve.availableAmount / 10 ** reserve.mintDecimals;
  const borrowed = reserve.borrowedAmountWad / WAD / 10 ** reserve.mintDecimals;
  const totalDeposited = available + borrowed;
  const utilizationPct = totalDeposited > 0 ? (borrowed / totalDeposited) * 100 : 0;

  if (reserve.interestRateUtils.length === 0) return { borrowAprPct: 0, depositAprPct: 0 };

  const aprs = reserve.interestRateAprs.map((a) => a / 100);
  const borrowAprPct = interpolateRate(reserve.interestRateUtils, aprs, utilizationPct);
  const depositAprPct =
    (utilizationPct / 100) *
    (borrowAprPct / 100) *
    (1 - reserve.spreadFeeBps / 10000) *
    100;

  return { borrowAprPct, depositAprPct };
}

function cTokenRatio(reserve: Reserve): number {
  if (reserve.ctokenSupply === 0) return 1;
  const totalSupply =
    reserve.availableAmount +
    reserve.borrowedAmountWad / WAD -
    reserve.unclaimedSpreadFeesWad / WAD;
  return totalSupply / reserve.ctokenSupply;
}

// ---------------------------------------------------------------------------
// JSON-RPC response helpers
// ---------------------------------------------------------------------------

type Fields = Record<string, unknown>;

function f(obj: unknown): Fields {
  if (obj && typeof obj === 'object' && 'fields' in obj) return (obj as { fields: Fields }).fields;
  return obj as Fields;
}

function str(v: unknown): string { return String(v ?? '0'); }
function num(v: unknown): number { return Number(str(v)); }

function parseReserve(raw: unknown, index: number): Reserve {
  const r = f(raw);
  const coinTypeField = f(r.coin_type);
  const config = f(f(r.config)?.element);

  return {
    coinType: str(coinTypeField?.name),
    mintDecimals: num(r.mint_decimals),
    availableAmount: num(r.available_amount),
    borrowedAmountWad: num(f(r.borrowed_amount)?.value),
    ctokenSupply: num(r.ctoken_supply),
    unclaimedSpreadFeesWad: num(f(r.unclaimed_spread_fees)?.value),
    cumulativeBorrowRateWad: num(f(r.cumulative_borrow_rate)?.value),
    openLtvPct: num(config?.open_ltv_pct),
    closeLtvPct: num(config?.close_ltv_pct),
    spreadFeeBps: num(config?.spread_fee_bps),
    interestRateUtils: Array.isArray(config?.interest_rate_utils) ? (config.interest_rate_utils as unknown[]).map(num) : [],
    interestRateAprs: Array.isArray(config?.interest_rate_aprs) ? (config.interest_rate_aprs as unknown[]).map(num) : [],
    arrayIndex: index,
  };
}

function parseObligation(raw: Fields): Obligation {
  const deposits = Array.isArray(raw.deposits)
    ? (raw.deposits as unknown[]).map((d) => {
        const df = f(d);
        return {
          coinType: str(f(df.coin_type)?.name),
          ctokenAmount: num(df.deposited_ctoken_amount),
          reserveIdx: num(df.reserve_array_index),
        };
      })
    : [];

  const borrows = Array.isArray(raw.borrows)
    ? (raw.borrows as unknown[]).map((b) => {
        const bf = f(b);
        return {
          coinType: str(f(bf.coin_type)?.name),
          borrowedWad: num(f(bf.borrowed_amount)?.value),
          cumBorrowRateWad: num(f(bf.cumulative_borrow_rate)?.value),
          reserveIdx: num(bf.reserve_array_index),
        };
      })
    : [];

  return { deposits, borrows };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Suilend adapter — contract-first, no SDK dependency.
 * Interacts directly with Suilend Move contracts via RPC + PTB moveCall.
 */
export class SuilendAdapter implements LendingAdapter {
  readonly id = 'suilend';
  readonly name = 'Suilend';
  readonly version = '2.0.0';
  readonly capabilities: readonly AdapterCapability[] = ['save', 'withdraw'];
  readonly supportedAssets: readonly string[] = ['USDC'];
  readonly supportsSameAssetBorrow = false;

  private client!: SuiJsonRpcClient;
  private publishedAt: string | null = null;
  private reserveCache: Reserve[] | null = null;

  async init(client: SuiJsonRpcClient): Promise<void> {
    this.client = client;
  }

  initSync(client: SuiJsonRpcClient): void {
    this.client = client;
  }

  // -- On-chain reads -------------------------------------------------------

  private async resolvePackage(): Promise<string> {
    if (this.publishedAt) return this.publishedAt;
    try {
      const cap = await this.client.getObject({ id: UPGRADE_CAP_ID, options: { showContent: true } });
      if (cap.data?.content?.dataType === 'moveObject') {
        const fields = cap.data.content.fields as Fields;
        this.publishedAt = str(fields.package);
        return this.publishedAt;
      }
    } catch { /* use fallback */ }
    this.publishedAt = FALLBACK_PUBLISHED_AT;
    return this.publishedAt;
  }

  private async loadReserves(fresh = false): Promise<Reserve[]> {
    if (this.reserveCache && !fresh) return this.reserveCache;

    const market = await this.client.getObject({
      id: LENDING_MARKET_ID,
      options: { showContent: true },
    });

    if (market.data?.content?.dataType !== 'moveObject') {
      throw new T2000Error('PROTOCOL_UNAVAILABLE', 'Failed to read Suilend lending market');
    }

    const fields = market.data.content.fields as Fields;
    const reservesRaw = fields.reserves as unknown[];

    if (!Array.isArray(reservesRaw)) {
      throw new T2000Error('PROTOCOL_UNAVAILABLE', 'Failed to parse Suilend reserves');
    }

    this.reserveCache = reservesRaw.map((r, i) => parseReserve(r, i));
    return this.reserveCache;
  }

  private findReserve(reserves: Reserve[], asset: string): Reserve | undefined {
    const upper = asset.toUpperCase();
    let coinType: string;
    if (upper === 'USDC') coinType = USDC_TYPE;
    else if (upper === 'SUI') coinType = '0x2::sui::SUI';
    else if (asset.includes('::')) coinType = asset;
    else return undefined;

    try {
      const normalized = normalizeStructTag(coinType);
      return reserves.find((r) => {
        try { return normalizeStructTag(r.coinType) === normalized; } catch { return false; }
      });
    } catch { return undefined; }
  }

  private async fetchObligationCaps(address: string): Promise<ObligationCap[]> {
    const capType = `${SUILEND_PACKAGE}::lending_market::ObligationOwnerCap<${LENDING_MARKET_TYPE}>`;
    const caps: ObligationCap[] = [];
    let cursor: string | null | undefined;
    let hasNext = true;

    while (hasNext) {
      const page = await this.client.getOwnedObjects({
        owner: address,
        filter: { StructType: capType },
        options: { showContent: true },
        cursor: cursor ?? undefined,
      });

      for (const item of page.data) {
        if (item.data?.content?.dataType !== 'moveObject') continue;
        const fields = item.data.content.fields as Fields;
        caps.push({
          id: item.data.objectId,
          obligationId: str(fields.obligation_id),
        });
      }

      cursor = page.nextCursor;
      hasNext = page.hasNextPage;
    }

    return caps;
  }

  private async fetchObligation(obligationId: string): Promise<Obligation> {
    const obj = await this.client.getObject({ id: obligationId, options: { showContent: true } });
    if (obj.data?.content?.dataType !== 'moveObject') {
      throw new T2000Error('PROTOCOL_UNAVAILABLE', 'Failed to read Suilend obligation');
    }
    return parseObligation(obj.data.content.fields as Fields);
  }

  private resolveSymbol(coinType: string): string {
    try {
      const normalized = normalizeStructTag(coinType);
      if (normalized === normalizeStructTag(USDC_TYPE)) return 'USDC';
      if (normalized === normalizeStructTag('0x2::sui::SUI')) return 'SUI';
    } catch { /* fall through */ }
    const parts = coinType.split('::');
    return parts[parts.length - 1] || 'UNKNOWN';
  }

  // -- Adapter interface ----------------------------------------------------

  async getRates(asset: string): Promise<LendingRates> {
    const reserves = await this.loadReserves();
    const reserve = this.findReserve(reserves, asset);
    if (!reserve) throw new T2000Error('ASSET_NOT_SUPPORTED', `Suilend does not support ${asset}`);

    const { borrowAprPct, depositAprPct } = computeRates(reserve);
    return { asset, saveApy: depositAprPct, borrowApy: borrowAprPct };
  }

  async getPositions(address: string): Promise<AdapterPositions> {
    const supplies: Array<{ asset: string; amount: number; apy: number }> = [];
    const borrows: Array<{ asset: string; amount: number; apy: number }> = [];

    const caps = await this.fetchObligationCaps(address);
    if (caps.length === 0) return { supplies, borrows };

    const [reserves, obligation] = await Promise.all([
      this.loadReserves(),
      this.fetchObligation(caps[0].obligationId),
    ]);

    for (const dep of obligation.deposits) {
      const reserve = reserves[dep.reserveIdx];
      if (!reserve) continue;
      const ratio = cTokenRatio(reserve);
      const amount = (dep.ctokenAmount * ratio) / 10 ** reserve.mintDecimals;
      const { depositAprPct } = computeRates(reserve);
      supplies.push({ asset: this.resolveSymbol(dep.coinType), amount, apy: depositAprPct });
    }

    for (const bor of obligation.borrows) {
      const reserve = reserves[bor.reserveIdx];
      if (!reserve) continue;
      const rawAmount = bor.borrowedWad / WAD / 10 ** reserve.mintDecimals;
      const reserveRate = reserve.cumulativeBorrowRateWad / WAD;
      const posRate = bor.cumBorrowRateWad / WAD;
      const compounded = posRate > 0 ? rawAmount * (reserveRate / posRate) : rawAmount;
      const { borrowAprPct } = computeRates(reserve);
      borrows.push({ asset: this.resolveSymbol(bor.coinType), amount: compounded, apy: borrowAprPct });
    }

    return { supplies, borrows };
  }

  async getHealth(address: string): Promise<HealthInfo> {
    const caps = await this.fetchObligationCaps(address);
    if (caps.length === 0) {
      return { healthFactor: Infinity, supplied: 0, borrowed: 0, maxBorrow: 0, liquidationThreshold: 0 };
    }

    const positions = await this.getPositions(address);
    const supplied = positions.supplies.reduce((s, p) => s + p.amount, 0);
    const borrowed = positions.borrows.reduce((s, p) => s + p.amount, 0);

    const reserves = await this.loadReserves();
    const reserve = this.findReserve(reserves, 'USDC');
    const closeLtv = reserve?.closeLtvPct ?? 75;
    const openLtv = reserve?.openLtvPct ?? 70;
    const liqThreshold = closeLtv / 100;

    const healthFactor = borrowed > 0 ? (supplied * liqThreshold) / borrowed : Infinity;
    const maxBorrow = Math.max(0, supplied * (openLtv / 100) - borrowed);

    return { healthFactor, supplied, borrowed, maxBorrow, liquidationThreshold: liqThreshold };
  }

  async buildSaveTx(
    address: string,
    amount: number,
    _asset: string,
    options?: { collectFee?: boolean },
  ): Promise<AdapterTxResult> {
    const [pkg, reserves] = await Promise.all([this.resolvePackage(), this.loadReserves()]);
    const usdcReserve = this.findReserve(reserves, 'USDC');
    if (!usdcReserve) throw new T2000Error('ASSET_NOT_SUPPORTED', 'USDC reserve not found on Suilend');

    const caps = await this.fetchObligationCaps(address);
    const tx = new Transaction();
    tx.setSender(address);

    let capRef: TransactionObjectArgument | string;
    if (caps.length === 0) {
      const [newCap] = tx.moveCall({
        target: `${pkg}::lending_market::create_obligation`,
        typeArguments: [LENDING_MARKET_TYPE],
        arguments: [tx.object(LENDING_MARKET_ID)],
      });
      capRef = newCap;
    } else {
      capRef = caps[0].id;
    }

    const allCoins = await this.fetchAllCoins(address, USDC_TYPE);
    if (allCoins.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', 'No USDC coins found');

    const primaryCoinId = allCoins[0].coinObjectId;
    if (allCoins.length > 1) {
      tx.mergeCoins(tx.object(primaryCoinId), allCoins.slice(1).map((c) => tx.object(c.coinObjectId)));
    }

    const rawAmount = usdcToRaw(amount).toString();
    const [depositCoin] = tx.splitCoins(tx.object(primaryCoinId), [rawAmount]);

    if (options?.collectFee) {
      addCollectFeeToTx(tx, depositCoin as TransactionObjectArgument, 'save');
    }

    const [ctokens] = tx.moveCall({
      target: `${pkg}::lending_market::deposit_liquidity_and_mint_ctokens`,
      typeArguments: [LENDING_MARKET_TYPE, USDC_TYPE],
      arguments: [
        tx.object(LENDING_MARKET_ID),
        tx.pure.u64(usdcReserve.arrayIndex),
        tx.object(CLOCK),
        depositCoin,
      ],
    });

    tx.moveCall({
      target: `${pkg}::lending_market::deposit_ctokens_into_obligation`,
      typeArguments: [LENDING_MARKET_TYPE, USDC_TYPE],
      arguments: [
        tx.object(LENDING_MARKET_ID),
        tx.pure.u64(usdcReserve.arrayIndex),
        typeof capRef === 'string' ? tx.object(capRef) : capRef,
        tx.object(CLOCK),
        ctokens,
      ],
    });

    if (typeof capRef !== 'string') {
      tx.transferObjects([capRef], address);
    }

    return { tx };
  }

  async buildWithdrawTx(
    address: string,
    amount: number,
    _asset: string,
  ): Promise<AdapterTxResult & { effectiveAmount: number }> {
    const [pkg, reserves] = await Promise.all([this.resolvePackage(), this.loadReserves(true)]);
    const usdcReserve = this.findReserve(reserves, 'USDC');
    if (!usdcReserve) throw new T2000Error('ASSET_NOT_SUPPORTED', 'USDC reserve not found on Suilend');

    const caps = await this.fetchObligationCaps(address);
    if (caps.length === 0) throw new T2000Error('NO_COLLATERAL', 'No Suilend position found');

    const positions = await this.getPositions(address);
    const deposited = positions.supplies.find((s) => s.asset === 'USDC')?.amount ?? 0;
    const effectiveAmount = Math.min(amount, deposited);
    if (effectiveAmount <= 0) throw new T2000Error('NO_COLLATERAL', 'Nothing to withdraw from Suilend');

    const ratio = cTokenRatio(usdcReserve);
    const ctokenAmount = Math.ceil(effectiveAmount * 10 ** usdcReserve.mintDecimals / ratio);

    const tx = new Transaction();
    tx.setSender(address);

    const [ctokens] = tx.moveCall({
      target: `${pkg}::lending_market::withdraw_ctokens`,
      typeArguments: [LENDING_MARKET_TYPE, USDC_TYPE],
      arguments: [
        tx.object(LENDING_MARKET_ID),
        tx.pure.u64(usdcReserve.arrayIndex),
        tx.object(caps[0].id),
        tx.object(CLOCK),
        tx.pure.u64(ctokenAmount),
      ],
    });

    const exemptionType = `${SUILEND_PACKAGE}::lending_market::RateLimiterExemption<${LENDING_MARKET_TYPE}, ${USDC_TYPE}>`;
    const [none] = tx.moveCall({
      target: '0x1::option::none',
      typeArguments: [exemptionType],
    });

    const [coin] = tx.moveCall({
      target: `${pkg}::lending_market::redeem_ctokens_and_withdraw_liquidity`,
      typeArguments: [LENDING_MARKET_TYPE, USDC_TYPE],
      arguments: [
        tx.object(LENDING_MARKET_ID),
        tx.pure.u64(usdcReserve.arrayIndex),
        tx.object(CLOCK),
        ctokens,
        none,
      ],
    });

    tx.transferObjects([coin], address);

    return { tx, effectiveAmount };
  }

  async buildBorrowTx(
    _address: string,
    _amount: number,
    _asset: string,
    _options?: { collectFee?: boolean },
  ): Promise<AdapterTxResult> {
    throw new T2000Error('ASSET_NOT_SUPPORTED', 'Suilend borrow requires different collateral/borrow assets. Deferred to Phase 10.');
  }

  async buildRepayTx(
    _address: string,
    _amount: number,
    _asset: string,
  ): Promise<AdapterTxResult> {
    throw new T2000Error('ASSET_NOT_SUPPORTED', 'Suilend repay deferred to Phase 10.');
  }

  async maxWithdraw(
    address: string,
    _asset: string,
  ): Promise<{ maxAmount: number; healthFactorAfter: number; currentHF: number }> {
    const health = await this.getHealth(address);

    let maxAmount: number;
    if (health.borrowed === 0) {
      maxAmount = health.supplied;
    } else {
      maxAmount = Math.max(0, health.supplied - (health.borrowed * MIN_HEALTH_FACTOR) / health.liquidationThreshold);
    }

    const remainingSupply = health.supplied - maxAmount;
    const hfAfter = health.borrowed > 0
      ? (remainingSupply * health.liquidationThreshold) / health.borrowed
      : Infinity;

    return { maxAmount, healthFactorAfter: hfAfter, currentHF: health.healthFactor };
  }

  async maxBorrow(
    _address: string,
    _asset: string,
  ): Promise<{ maxAmount: number; healthFactorAfter: number; currentHF: number }> {
    throw new T2000Error('ASSET_NOT_SUPPORTED', 'Suilend maxBorrow deferred to Phase 10.');
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
