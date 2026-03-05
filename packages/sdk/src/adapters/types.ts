import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

export type AdapterCapability = 'save' | 'withdraw' | 'borrow' | 'repay' | 'swap';

export interface AdapterTxResult {
  tx: Transaction;
  feeCoin?: TransactionObjectArgument;
  meta?: Record<string, unknown>;
}

export interface LendingRates {
  asset: string;
  saveApy: number;
  borrowApy: number;
}

export interface AdapterPositions {
  supplies: Array<{ asset: string; amount: number; apy: number }>;
  borrows: Array<{ asset: string; amount: number; apy: number }>;
}

export interface HealthInfo {
  healthFactor: number;
  supplied: number;
  borrowed: number;
  maxBorrow: number;
  liquidationThreshold: number;
}

export interface SwapQuote {
  expectedOutput: number;
  priceImpact: number;
  poolPrice: number;
}

export interface LendingAdapter {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: readonly AdapterCapability[];
  readonly supportedAssets: readonly string[];
  readonly supportsSameAssetBorrow: boolean;

  init(client: SuiJsonRpcClient): Promise<void>;

  getRates(asset: string): Promise<LendingRates>;
  getPositions(address: string): Promise<AdapterPositions>;
  getHealth(address: string): Promise<HealthInfo>;

  buildSaveTx(address: string, amount: number, asset: string, options?: { collectFee?: boolean }): Promise<AdapterTxResult>;
  buildWithdrawTx(address: string, amount: number, asset: string): Promise<AdapterTxResult & { effectiveAmount: number }>;
  buildBorrowTx(address: string, amount: number, asset: string, options?: { collectFee?: boolean }): Promise<AdapterTxResult>;
  buildRepayTx(address: string, amount: number, asset: string): Promise<AdapterTxResult>;

  maxWithdraw(address: string, asset: string): Promise<{ maxAmount: number; healthFactorAfter: number; currentHF: number }>;
  maxBorrow(address: string, asset: string): Promise<{ maxAmount: number; healthFactorAfter: number; currentHF: number }>;
}

export interface SwapAdapter {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: readonly AdapterCapability[];

  init(client: SuiJsonRpcClient): Promise<void>;

  getQuote(from: string, to: string, amount: number): Promise<SwapQuote>;
  buildSwapTx(
    address: string,
    from: string,
    to: string,
    amount: number,
    maxSlippageBps?: number,
  ): Promise<AdapterTxResult & { estimatedOut: number; toDecimals: number }>;
  getSupportedPairs(): Array<{ from: string; to: string }>;
  getPoolPrice(): Promise<number>;
}
