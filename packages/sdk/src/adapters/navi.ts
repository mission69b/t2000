import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type {
  LendingAdapter,
  LendingRates,
  AdapterPositions,
  HealthInfo,
  AdapterTxResult,
  AdapterCapability,
  PendingReward,
} from './types.js';
import { ALL_NAVI_ASSETS } from '../constants.js';
import { T2000Error } from '../errors.js';
import { normalizeAsset } from '../utils/format.js';
import * as naviProtocol from '../protocols/navi.js';

export { naviDescriptor as descriptor } from './descriptors.js';

export class NaviAdapter implements LendingAdapter {
  readonly id = 'navi';
  readonly name = 'NAVI Protocol';
  readonly version = '1.0.0';
  readonly capabilities: readonly AdapterCapability[] = ['save', 'withdraw', 'borrow', 'repay'];
  readonly supportedAssets: readonly string[] = [...ALL_NAVI_ASSETS];
  readonly supportsSameAssetBorrow = true;

  private client!: SuiJsonRpcClient;

  async init(client: SuiJsonRpcClient): Promise<void> {
    this.client = client;
  }

  initSync(client: SuiJsonRpcClient): void {
    this.client = client;
  }

  async getRates(asset: string): Promise<LendingRates> {
    const rates = await naviProtocol.getRates(this.client);
    const normalized = normalizeAsset(asset);
    const r = rates[normalized as keyof typeof rates];
    if (!r) throw new T2000Error('ASSET_NOT_SUPPORTED', `NAVI does not support ${asset}`);
    return { asset: normalized, saveApy: r.saveApy, borrowApy: r.borrowApy };
  }

  async getPositions(address: string): Promise<AdapterPositions> {
    const result = await naviProtocol.getPositions(this.client, address);
    return {
      supplies: result.positions
        .filter(p => p.type === 'save')
        .map(p => ({ asset: p.asset, amount: p.amount, amountUsd: p.amountUsd, apy: p.apy })),
      borrows: result.positions
        .filter(p => p.type === 'borrow')
        .map(p => ({ asset: p.asset, amount: p.amount, amountUsd: p.amountUsd, apy: p.apy })),
    };
  }

  async getHealth(address: string): Promise<HealthInfo> {
    return naviProtocol.getHealthFactor(this.client, address);
  }

  async buildSaveTx(
    address: string,
    amount: number,
    asset: string,
    options?: { collectFee?: boolean },
  ): Promise<AdapterTxResult> {
    const normalized = normalizeAsset(asset);
    const tx = await naviProtocol.buildSaveTx(this.client, address, amount, { ...options, asset: normalized });
    return { tx };
  }

  async buildWithdrawTx(
    address: string,
    amount: number,
    asset: string,
    options?: { skipPythUpdate?: boolean },
  ): Promise<AdapterTxResult & { effectiveAmount: number }> {
    const normalized = normalizeAsset(asset);
    const result = await naviProtocol.buildWithdrawTx(this.client, address, amount, {
      asset: normalized,
      skipPythUpdate: options?.skipPythUpdate,
    });
    return { tx: result.tx, effectiveAmount: result.effectiveAmount };
  }

  async buildBorrowTx(
    address: string,
    amount: number,
    asset: string,
    options?: { collectFee?: boolean; skipPythUpdate?: boolean },
  ): Promise<AdapterTxResult> {
    const normalized = normalizeAsset(asset);
    const tx = await naviProtocol.buildBorrowTx(this.client, address, amount, { ...options, asset: normalized });
    return { tx };
  }

  async buildRepayTx(
    address: string,
    amount: number,
    asset: string,
    options?: { skipOracle?: boolean; skipPythUpdate?: boolean },
  ): Promise<AdapterTxResult> {
    const normalized = normalizeAsset(asset);
    const tx = await naviProtocol.buildRepayTx(this.client, address, amount, {
      asset: normalized,
      skipOracle: options?.skipOracle,
      skipPythUpdate: options?.skipPythUpdate,
    });
    return { tx };
  }

  async maxWithdraw(address: string, _asset: string) {
    return naviProtocol.maxWithdrawAmount(this.client, address);
  }

  async maxBorrow(address: string, _asset: string) {
    return naviProtocol.maxBorrowAmount(this.client, address);
  }

  async addWithdrawToTx(
    tx: Transaction,
    address: string,
    amount: number,
    asset: string,
    options?: { skipPythUpdate?: boolean },
  ): Promise<{ coin: TransactionObjectArgument; effectiveAmount: number }> {
    const normalized = normalizeAsset(asset);
    return naviProtocol.addWithdrawToTx(tx, this.client, address, amount, {
      asset: normalized,
      skipPythUpdate: options?.skipPythUpdate,
    });
  }

  async addSaveToTx(
    tx: Transaction,
    address: string,
    coin: TransactionObjectArgument,
    asset: string,
    options?: { collectFee?: boolean },
  ): Promise<void> {
    const normalized = normalizeAsset(asset);
    return naviProtocol.addSaveToTx(tx, this.client, address, coin, { ...options, asset: normalized });
  }

  async addRepayToTx(
    tx: Transaction,
    address: string,
    coin: TransactionObjectArgument,
    asset: string,
    options?: { skipPythUpdate?: boolean },
  ): Promise<void> {
    const normalized = normalizeAsset(asset);
    return naviProtocol.addRepayToTx(tx, this.client, address, coin, {
      asset: normalized,
      skipPythUpdate: options?.skipPythUpdate,
    });
  }

  async getPendingRewards(address: string): Promise<PendingReward[]> {
    return naviProtocol.getPendingRewards(this.client, address);
  }

  async addClaimRewardsToTx(tx: Transaction, address: string): Promise<PendingReward[]> {
    return naviProtocol.addClaimRewardsToTx(tx, this.client, address);
  }
}
