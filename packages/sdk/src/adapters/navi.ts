import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
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
import { STABLE_ASSETS } from '../constants.js';
import { T2000Error } from '../errors.js';
import { normalizeAsset } from '../utils/format.js';
import * as naviProtocol from '../protocols/navi.js';

export const descriptor: ProtocolDescriptor = {
  id: 'navi',
  name: 'NAVI Protocol',
  packages: [],
  dynamicPackageId: true,
  actionMap: {
    'incentive_v3::entry_deposit': 'save',
    'incentive_v3::deposit': 'save',
    'incentive_v3::withdraw_v2': 'withdraw',
    'incentive_v3::entry_withdraw': 'withdraw',
    'incentive_v3::borrow_v2': 'borrow',
    'incentive_v3::entry_borrow': 'borrow',
    'incentive_v3::entry_repay': 'repay',
    'incentive_v3::repay': 'repay',
  },
};

export class NaviAdapter implements LendingAdapter {
  readonly id = 'navi';
  readonly name = 'NAVI Protocol';
  readonly version = '1.0.0';
  readonly capabilities: readonly AdapterCapability[] = ['save', 'withdraw', 'borrow', 'repay'];
  readonly supportedAssets: readonly string[] = [...STABLE_ASSETS, 'SUI', 'ETH', 'GOLD'];
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
    options?: { collectFee?: boolean; sponsored?: boolean },
  ): Promise<AdapterTxResult> {
    const normalized = normalizeAsset(asset);
    const tx = await naviProtocol.buildSaveTx(this.client, address, amount, { ...options, asset: normalized });
    return { tx };
  }

  async buildWithdrawTx(
    address: string,
    amount: number,
    asset: string,
    options?: { sponsored?: boolean },
  ): Promise<AdapterTxResult & { effectiveAmount: number }> {
    const normalized = normalizeAsset(asset);
    const result = await naviProtocol.buildWithdrawTx(this.client, address, amount, { asset: normalized, sponsored: options?.sponsored });
    return { tx: result.tx, effectiveAmount: result.effectiveAmount };
  }

  async buildBorrowTx(
    address: string,
    amount: number,
    asset: string,
    options?: { collectFee?: boolean; sponsored?: boolean },
  ): Promise<AdapterTxResult> {
    const normalized = normalizeAsset(asset);
    const tx = await naviProtocol.buildBorrowTx(this.client, address, amount, { ...options, asset: normalized });
    return { tx };
  }

  async buildRepayTx(
    address: string,
    amount: number,
    asset: string,
    options?: { sponsored?: boolean },
  ): Promise<AdapterTxResult> {
    const normalized = normalizeAsset(asset);
    const tx = await naviProtocol.buildRepayTx(this.client, address, amount, { asset: normalized, sponsored: options?.sponsored });
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
  ): Promise<{ coin: TransactionObjectArgument; effectiveAmount: number }> {
    const normalized = normalizeAsset(asset);
    return naviProtocol.addWithdrawToTx(tx, this.client, address, amount, { asset: normalized });
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
  ): Promise<void> {
    const normalized = normalizeAsset(asset);
    return naviProtocol.addRepayToTx(tx, this.client, address, coin, { asset: normalized });
  }

  async getPendingRewards(address: string): Promise<PendingReward[]> {
    return naviProtocol.getPendingRewards(this.client, address);
  }

  async addClaimRewardsToTx(tx: Transaction, address: string): Promise<PendingReward[]> {
    return naviProtocol.addClaimRewardsToTx(tx, this.client, address);
  }
}
