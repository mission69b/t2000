import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeStructTag } from '@mysten/sui/utils';
import {
  SuilendClient,
  LENDING_MARKET_ID,
  LENDING_MARKET_TYPE,
} from '@suilend/sdk/client';
import { initializeSuilend, initializeObligations } from '@suilend/sdk/lib/initialize';
import { Side } from '@suilend/sdk/lib/types';
import type {
  LendingAdapter,
  LendingRates,
  AdapterPositions,
  HealthInfo,
  AdapterTxResult,
  AdapterCapability,
  ProtocolDescriptor,
  PendingReward,
} from './types.js';
import { SUPPORTED_ASSETS, STABLE_ASSETS } from '../constants.js';
import { stableToRaw } from '../utils/format.js';
import { T2000Error } from '../errors.js';
import { addCollectFeeToTx } from '../protocols/protocolFee.js';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';

const SUILEND_PACKAGE = '0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf';
const MIN_HEALTH_FACTOR = 1.5;

async function quietSuilend<T>(fn: () => Promise<T>): Promise<T> {
  const origLog = console.log;
  const origWarn = console.warn;
  const filter = (...args: unknown[]) =>
    typeof args[0] === 'string' && (args[0].includes('PythEndpoint') || args[0].includes('PythConnection'));
  console.log = (...args: unknown[]) => { if (!filter(...args)) origLog.apply(console, args); };
  console.warn = (...args: unknown[]) => { if (!filter(...args)) origWarn.apply(console, args); };
  return fn().finally(() => { console.log = origLog; console.warn = origWarn; });
}

export const descriptor: ProtocolDescriptor = {
  id: 'suilend',
  name: 'Suilend',
  packages: [SUILEND_PACKAGE],
  actionMap: {
    'lending_market::deposit_liquidity_and_mint_ctokens': 'save',
    'lending_market::deposit_ctokens_into_obligation': 'save',
    'lending_market::create_obligation': 'save',
    'lending_market::withdraw_ctokens': 'withdraw',
    'lending_market::redeem_ctokens_and_withdraw_liquidity': 'withdraw',
    'lending_market::redeem_ctokens_and_withdraw_liquidity_request': 'withdraw',
    'lending_market::fulfill_liquidity_request': 'withdraw',
    'lending_market::unstake_sui_from_staker': 'withdraw',
    'lending_market::borrow': 'borrow',
    'lending_market::repay': 'repay',
  },
};

export class SuilendAdapter implements LendingAdapter {
  readonly id = 'suilend';
  readonly name = 'Suilend';
  readonly version = '3.0.0';
  readonly capabilities: readonly AdapterCapability[] = ['save', 'withdraw', 'borrow', 'repay'];
  readonly supportedAssets: readonly string[] = [...STABLE_ASSETS, 'SUI', 'ETH', 'BTC', 'GOLD'];
  readonly supportsSameAssetBorrow = false;

  private client!: SuiJsonRpcClient;
  private sdkClient: SuilendClient | null = null;

  async init(client: SuiJsonRpcClient): Promise<void> {
    this.client = client;
  }

  initSync(client: SuiJsonRpcClient): void {
    this.client = client;
  }

  private async getSdkClient(): Promise<SuilendClient> {
    if (!this.sdkClient) {
      this.sdkClient = await SuilendClient.initialize(
        LENDING_MARKET_ID,
        LENDING_MARKET_TYPE,
        this.client,
        false,
      );
    }
    return this.sdkClient;
  }

  private resolveSymbol(coinType: string): string {
    try {
      const normalized = normalizeStructTag(coinType);
      for (const [key, info] of Object.entries(SUPPORTED_ASSETS)) {
        try {
          if (normalizeStructTag(info.type) === normalized) return key;
        } catch { /* skip */ }
      }
    } catch { /* fall through */ }
    const parts = coinType.split('::');
    return parts[parts.length - 1] || 'UNKNOWN';
  }

  async getRates(asset: string): Promise<LendingRates> {
    try {
      const sdk = await this.getSdkClient();
      const { reserveMap } = await quietSuilend(() => initializeSuilend(this.client, sdk));

      const assetInfo = SUPPORTED_ASSETS[asset as keyof typeof SUPPORTED_ASSETS];
      if (!assetInfo) throw new T2000Error('ASSET_NOT_SUPPORTED', `Suilend does not support ${asset}`);

      const normalized = normalizeStructTag(assetInfo.type);
      const reserve = Object.values(reserveMap).find((r) => {
        try { return normalizeStructTag(r.coinType) === normalized; }
        catch { return false; }
      });

      if (!reserve) throw new T2000Error('ASSET_NOT_SUPPORTED', `Suilend does not support ${asset}`);

      return {
        asset,
        saveApy: reserve.depositAprPercent.toNumber(),
        borrowApy: reserve.borrowAprPercent.toNumber(),
      };
    } catch (err) {
      if (err instanceof T2000Error) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new T2000Error('PROTOCOL_UNAVAILABLE', `Suilend getRates failed: ${msg}`);
    }
  }

  async getPositions(address: string): Promise<AdapterPositions> {
    const supplies: AdapterPositions['supplies'] = [];
    const borrows: AdapterPositions['borrows'] = [];

    try {
      const sdk = await this.getSdkClient();
      const { reserveMap, refreshedRawReserves } = await quietSuilend(() => initializeSuilend(this.client, sdk));

      const { obligations, obligationOwnerCaps } = await initializeObligations(
        this.client, sdk, refreshedRawReserves, reserveMap, address,
      );

      if (obligationOwnerCaps.length === 0 || obligations.length === 0) {
        return { supplies, borrows };
      }

      const obligation = obligations[0];

      for (const dep of obligation.deposits) {
        const symbol = this.resolveSymbol(dep.coinType);
        const amount = dep.depositedAmount.toNumber();
        const amountUsd = dep.depositedAmountUsd.toNumber();
        const apy = dep.reserve.depositAprPercent.toNumber();
        if (amount > 0.0001) {
          supplies.push({ asset: symbol, amount, amountUsd, apy });
        }
      }

      for (const bor of obligation.borrows) {
        const symbol = this.resolveSymbol(bor.coinType);
        const amount = bor.borrowedAmount.toNumber();
        const amountUsd = bor.borrowedAmountUsd.toNumber();
        const apy = bor.reserve.borrowAprPercent.toNumber();
        if (amount > 0.0001) {
          borrows.push({ asset: symbol, amount, amountUsd, apy });
        }
      }
    } catch (err) {
      if (err instanceof T2000Error) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new T2000Error('PROTOCOL_UNAVAILABLE', `Suilend getPositions failed: ${msg}`);
    }

    return { supplies, borrows };
  }

  async getHealth(address: string): Promise<HealthInfo> {
    try {
      const sdk = await this.getSdkClient();
      const { reserveMap, refreshedRawReserves } = await quietSuilend(() => initializeSuilend(this.client, sdk));

      const { obligations, obligationOwnerCaps } = await initializeObligations(
        this.client, sdk, refreshedRawReserves, reserveMap, address,
      );

      if (obligationOwnerCaps.length === 0 || obligations.length === 0) {
        return { healthFactor: Infinity, supplied: 0, borrowed: 0, maxBorrow: 0, liquidationThreshold: 0 };
      }

      const ob = obligations[0];
      const supplied = ob.depositedAmountUsd.toNumber();
      const borrowed = ob.borrowedAmountUsd.toNumber();
      const borrowLimit = ob.borrowLimitUsd.toNumber();
      const unhealthy = ob.unhealthyBorrowValueUsd.toNumber();

      const liqThreshold = supplied > 0 ? unhealthy / supplied : 0.75;
      const healthFactor = borrowed > 0 ? unhealthy / borrowed : Infinity;
      const maxBorrow = Math.max(0, borrowLimit - borrowed);

      return { healthFactor, supplied, borrowed, maxBorrow, liquidationThreshold: liqThreshold };
    } catch {
      return { healthFactor: Infinity, supplied: 0, borrowed: 0, maxBorrow: 0, liquidationThreshold: 0 };
    }
  }

  async buildSaveTx(
    address: string,
    amount: number,
    asset: string,
    options?: { collectFee?: boolean },
  ): Promise<AdapterTxResult> {
    const assetKey = (asset in SUPPORTED_ASSETS ? asset : 'USDC') as keyof typeof SUPPORTED_ASSETS;
    const assetInfo = SUPPORTED_ASSETS[assetKey];

    const sdk = await this.getSdkClient();
    const caps = await SuilendClient.getObligationOwnerCaps(address, [LENDING_MARKET_TYPE], this.client);
    const tx = new Transaction();
    tx.setSender(address);

    let capRef: string;
    if (caps.length === 0) {
      const newCap = sdk.createObligation(tx);
      tx.transferObjects([newCap], address);
      // Need to execute in two steps: create obligation, then deposit
      // For simplicity, create then deposit in same PTB using depositIntoObligation
    }

    const rawValue = stableToRaw(amount, assetInfo.decimals).toString();

    if (options?.collectFee) {
      const allCoins = await this.fetchAllCoins(address, assetInfo.type);
      if (allCoins.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', `No ${assetInfo.displayName} coins found`);
      const primaryCoinId = allCoins[0].coinObjectId;
      if (allCoins.length > 1) {
        tx.mergeCoins(tx.object(primaryCoinId), allCoins.slice(1).map((c) => tx.object(c.coinObjectId)));
      }
      const [depositCoin] = tx.splitCoins(tx.object(primaryCoinId), [rawValue]);
      addCollectFeeToTx(tx, depositCoin as TransactionObjectArgument, 'save');
    }

    if (caps.length > 0) {
      await sdk.depositIntoObligation(address, assetInfo.type, rawValue, tx, caps[0].id);
    } else {
      await sdk.depositIntoObligation(address, assetInfo.type, rawValue, tx, tx.object(caps[0]?.id ?? ''));
    }

    return { tx };
  }

  async buildWithdrawTx(
    address: string,
    amount: number,
    asset: string,
  ): Promise<AdapterTxResult & { effectiveAmount: number }> {
    const assetKey = (asset in SUPPORTED_ASSETS ? asset : 'USDC') as keyof typeof SUPPORTED_ASSETS;
    const assetInfo = SUPPORTED_ASSETS[assetKey];

    const sdk = await this.getSdkClient();
    const caps = await SuilendClient.getObligationOwnerCaps(address, [LENDING_MARKET_TYPE], this.client);
    if (caps.length === 0) throw new T2000Error('NO_COLLATERAL', 'No Suilend position found');

    const positions = await this.getPositions(address);
    const dep = positions.supplies.find(s => s.asset === assetKey);
    const deposited = dep?.amount ?? 0;
    const effectiveAmount = Math.min(amount, deposited);
    if (effectiveAmount <= 0) throw new T2000Error('NO_COLLATERAL', `Nothing to withdraw for ${assetInfo.displayName} on Suilend`);

    const rawValue = stableToRaw(effectiveAmount, assetInfo.decimals).toString();
    const tx = new Transaction();
    tx.setSender(address);

    await sdk.withdrawAndSendToUser(address, caps[0].id, caps[0].obligationId, assetInfo.type, rawValue, tx);

    return { tx, effectiveAmount };
  }

  async addWithdrawToTx(
    tx: Transaction,
    address: string,
    amount: number,
    asset: string,
  ): Promise<{ coin: TransactionObjectArgument; effectiveAmount: number }> {
    const assetKey = (asset in SUPPORTED_ASSETS ? asset : 'USDC') as keyof typeof SUPPORTED_ASSETS;
    const assetInfo = SUPPORTED_ASSETS[assetKey];

    const sdk = await this.getSdkClient();
    const caps = await SuilendClient.getObligationOwnerCaps(address, [LENDING_MARKET_TYPE], this.client);
    if (caps.length === 0) throw new T2000Error('NO_COLLATERAL', 'No Suilend position found');

    const positions = await this.getPositions(address);
    const dep = positions.supplies.find(s => s.asset === assetKey);
    const deposited = dep?.amount ?? 0;
    const effectiveAmount = Math.min(amount, deposited);
    if (effectiveAmount <= 0) throw new T2000Error('NO_COLLATERAL', `Nothing to withdraw for ${assetInfo.displayName} on Suilend`);

    const rawValue = stableToRaw(effectiveAmount, assetInfo.decimals).toString();
    const coin = await sdk.withdraw(caps[0].id, caps[0].obligationId, assetInfo.type, rawValue, tx);

    return { coin: coin as TransactionObjectArgument, effectiveAmount };
  }

  async addSaveToTx(
    tx: Transaction,
    address: string,
    coin: TransactionObjectArgument,
    asset: string,
    options?: { collectFee?: boolean },
  ): Promise<void> {
    const assetKey = (asset in SUPPORTED_ASSETS ? asset : 'USDC') as keyof typeof SUPPORTED_ASSETS;
    const assetInfo = SUPPORTED_ASSETS[assetKey];

    const sdk = await this.getSdkClient();
    const caps = await SuilendClient.getObligationOwnerCaps(address, [LENDING_MARKET_TYPE], this.client);

    let capRef: string | TransactionObjectArgument;
    if (caps.length === 0) {
      const newCap = sdk.createObligation(tx);
      capRef = newCap;
      tx.transferObjects([newCap], address);
    } else {
      capRef = caps[0].id;
    }

    if (options?.collectFee) {
      addCollectFeeToTx(tx, coin, 'save');
    }

    sdk.deposit(coin, assetInfo.type, capRef as string, tx);
  }

  async buildBorrowTx(
    address: string,
    amount: number,
    asset: string,
    options?: { collectFee?: boolean },
  ): Promise<AdapterTxResult> {
    const assetKey = (asset in SUPPORTED_ASSETS ? asset : 'USDC') as keyof typeof SUPPORTED_ASSETS;
    const assetInfo = SUPPORTED_ASSETS[assetKey];

    const sdk = await this.getSdkClient();
    const caps = await SuilendClient.getObligationOwnerCaps(address, [LENDING_MARKET_TYPE], this.client);
    if (caps.length === 0) throw new T2000Error('NO_COLLATERAL', 'No Suilend position found. Deposit collateral first with: t2000 save <amount>');

    const rawValue = stableToRaw(amount, assetInfo.decimals).toString();
    const tx = new Transaction();
    tx.setSender(address);

    if (options?.collectFee) {
      const coin = await sdk.borrow(caps[0].id, caps[0].obligationId, assetInfo.type, rawValue, tx);
      addCollectFeeToTx(tx, coin as TransactionObjectArgument, 'borrow');
      tx.transferObjects([coin], address);
    } else {
      await sdk.borrowAndSendToUser(address, caps[0].id, caps[0].obligationId, assetInfo.type, rawValue, tx);
    }

    return { tx };
  }

  async buildRepayTx(
    address: string,
    amount: number,
    asset: string,
  ): Promise<AdapterTxResult> {
    const assetKey = (asset in SUPPORTED_ASSETS ? asset : 'USDC') as keyof typeof SUPPORTED_ASSETS;
    const assetInfo = SUPPORTED_ASSETS[assetKey];

    const sdk = await this.getSdkClient();
    const caps = await SuilendClient.getObligationOwnerCaps(address, [LENDING_MARKET_TYPE], this.client);
    if (caps.length === 0) throw new T2000Error('NO_COLLATERAL', 'No Suilend obligation found');

    const rawValue = stableToRaw(amount, assetInfo.decimals).toString();
    const tx = new Transaction();
    tx.setSender(address);

    await sdk.repayIntoObligation(address, caps[0].obligationId, assetInfo.type, rawValue, tx);

    return { tx };
  }

  async addRepayToTx(
    tx: Transaction,
    address: string,
    coin: TransactionObjectArgument,
    asset: string,
  ): Promise<void> {
    const assetKey = (asset in SUPPORTED_ASSETS ? asset : 'USDC') as keyof typeof SUPPORTED_ASSETS;
    const assetInfo = SUPPORTED_ASSETS[assetKey];

    const sdk = await this.getSdkClient();
    const caps = await SuilendClient.getObligationOwnerCaps(address, [LENDING_MARKET_TYPE], this.client);
    if (caps.length === 0) throw new T2000Error('NO_COLLATERAL', 'No Suilend obligation found');

    sdk.repay(caps[0].obligationId, assetInfo.type, coin, tx);
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
    address: string,
    _asset: string,
  ): Promise<{ maxAmount: number; healthFactorAfter: number; currentHF: number }> {
    const health = await this.getHealth(address);
    return { maxAmount: health.maxBorrow, healthFactorAfter: MIN_HEALTH_FACTOR, currentHF: health.healthFactor };
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

  async getPendingRewards(address: string): Promise<PendingReward[]> {
    try {
      const sdk = await this.getSdkClient();
      const { reserveMap, refreshedRawReserves } = await quietSuilend(() => initializeSuilend(this.client, sdk));
      const { obligations, obligationOwnerCaps } = await initializeObligations(
        this.client, sdk, refreshedRawReserves, reserveMap, address,
      );

      if (obligationOwnerCaps.length === 0 || obligations.length === 0) return [];

      const ob = obligations[0];
      const rewards: PendingReward[] = [];

      for (const dep of ob.deposits) {
        for (const rw of dep.reserve.depositsPoolRewardManager.poolRewards) {
          if (rw.endTimeMs <= Date.now()) continue;
          const symbol = rw.symbol || rw.coinType.split('::').pop() || 'UNKNOWN';
          rewards.push({
            protocol: 'suilend',
            asset: this.resolveSymbol(dep.coinType),
            coinType: rw.coinType,
            symbol,
            amount: 0,
            estimatedValueUsd: 0,
          });
        }
      }

      return rewards;
    } catch {
      return [];
    }
  }

  async addClaimRewardsToTx(tx: Transaction, address: string): Promise<PendingReward[]> {
    try {
      const sdk = await this.getSdkClient();
      const caps = await SuilendClient.getObligationOwnerCaps(address, [LENDING_MARKET_TYPE], this.client);
      if (caps.length === 0) return [];

      const { reserveMap, refreshedRawReserves } = await quietSuilend(() => initializeSuilend(this.client, sdk));
      const { obligations } = await initializeObligations(
        this.client, sdk, refreshedRawReserves, reserveMap, address,
      );

      if (obligations.length === 0) return [];
      const ob = obligations[0];

      const claimRewards: Array<{
        reserveArrayIndex: bigint;
        rewardIndex: bigint;
        rewardCoinType: string;
        side: Side;
      }> = [];

      for (const dep of ob.deposits) {
        for (const rw of dep.reserve.depositsPoolRewardManager.poolRewards) {
          if (rw.endTimeMs <= Date.now()) continue;
          claimRewards.push({
            reserveArrayIndex: dep.reserveArrayIndex,
            rewardIndex: BigInt(rw.rewardIndex),
            rewardCoinType: rw.coinType,
            side: Side.DEPOSIT,
          });
        }
      }

      if (claimRewards.length === 0) return [];

      sdk.claimRewardsAndSendToUser(address, caps[0].id, claimRewards, tx);

      return claimRewards.map((r) => ({
        protocol: 'suilend',
        asset: '',
        coinType: r.rewardCoinType,
        symbol: r.rewardCoinType.split('::').pop() ?? 'UNKNOWN',
        amount: 0,
        estimatedValueUsd: 0,
      }));
    } catch {
      return [];
    }
  }
}
