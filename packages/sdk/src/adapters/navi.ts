import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type {
  LendingAdapter,
  LendingRates,
  AdapterPositions,
  HealthInfo,
  AdapterTxResult,
  AdapterCapability,
} from './types.js';
import { T2000Error } from '../errors.js';
import * as naviProtocol from '../protocols/navi.js';

export class NaviAdapter implements LendingAdapter {
  readonly id = 'navi';
  readonly name = 'NAVI Protocol';
  readonly version = '1.0.0';
  readonly capabilities: readonly AdapterCapability[] = ['save', 'withdraw', 'borrow', 'repay'];
  readonly supportedAssets: readonly string[] = ['USDC'];
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
    const key = asset.toUpperCase() as keyof typeof rates;
    const r = rates[key];
    if (!r) throw new T2000Error('ASSET_NOT_SUPPORTED', `NAVI does not support ${asset}`);
    return { asset, saveApy: r.saveApy, borrowApy: r.borrowApy };
  }

  async getPositions(address: string): Promise<AdapterPositions> {
    const result = await naviProtocol.getPositions(this.client, address);
    return {
      supplies: result.positions
        .filter(p => p.type === 'save')
        .map(p => ({ asset: p.asset, amount: p.amount, apy: p.apy })),
      borrows: result.positions
        .filter(p => p.type === 'borrow')
        .map(p => ({ asset: p.asset, amount: p.amount, apy: p.apy })),
    };
  }

  async getHealth(address: string): Promise<HealthInfo> {
    return naviProtocol.getHealthFactor(this.client, address);
  }

  async buildSaveTx(
    address: string,
    amount: number,
    _asset: string,
    options?: { collectFee?: boolean },
  ): Promise<AdapterTxResult> {
    const tx = await naviProtocol.buildSaveTx(this.client, address, amount, options);
    return { tx };
  }

  async buildWithdrawTx(
    address: string,
    amount: number,
    _asset: string,
  ): Promise<AdapterTxResult & { effectiveAmount: number }> {
    const result = await naviProtocol.buildWithdrawTx(this.client, address, amount);
    return { tx: result.tx, effectiveAmount: result.effectiveAmount };
  }

  async buildBorrowTx(
    address: string,
    amount: number,
    _asset: string,
    options?: { collectFee?: boolean },
  ): Promise<AdapterTxResult> {
    const tx = await naviProtocol.buildBorrowTx(this.client, address, amount, options);
    return { tx };
  }

  async buildRepayTx(
    address: string,
    amount: number,
    _asset: string,
  ): Promise<AdapterTxResult> {
    const tx = await naviProtocol.buildRepayTx(this.client, address, amount);
    return { tx };
  }

  async maxWithdraw(address: string, _asset: string) {
    return naviProtocol.maxWithdrawAmount(this.client, address);
  }

  async maxBorrow(address: string, _asset: string) {
    return naviProtocol.maxBorrowAmount(this.client, address);
  }
}
