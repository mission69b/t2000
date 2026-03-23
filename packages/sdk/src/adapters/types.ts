import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

export type AdapterCapability = 'save' | 'withdraw' | 'borrow' | 'repay' | 'swap' | 'perps';

/**
 * Describes a protocol for indexer event classification.
 * Each adapter exports one of these so the server can auto-build
 * detection rules without manual sync.
 *
 * To add a new protocol: export a `descriptor` from your adapter file.
 */
export interface ProtocolDescriptor {
  /** Unique protocol ID — must match the adapter's `id` field */
  id: string;
  /** Human-readable name */
  name: string;
  /**
   * On-chain package IDs that identify this protocol's transactions.
   * For protocols with upgradeable packages, list the original/base package.
   */
  packages: string[];
  /**
   * Maps `module::function` patterns to action types.
   * The indexer matches Move call targets against these patterns.
   * For dynamic package IDs (e.g. NAVI), matching is done on module::function only.
   */
  actionMap: Record<string, string>;
  /**
   * If true, the indexer matches by module::function suffix only,
   * ignoring the package ID prefix. Use for protocols with frequently
   * upgraded (dynamic) package IDs.
   */
  dynamicPackageId?: boolean;
}

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
  supplies: Array<{ asset: string; amount: number; amountUsd?: number; apy: number }>;
  borrows: Array<{ asset: string; amount: number; amountUsd?: number; apy: number }>;
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

  buildSaveTx(address: string, amount: number, asset: string, options?: { collectFee?: boolean; sponsored?: boolean }): Promise<AdapterTxResult>;
  buildWithdrawTx(address: string, amount: number, asset: string, options?: { sponsored?: boolean }): Promise<AdapterTxResult & { effectiveAmount: number }>;
  buildBorrowTx(address: string, amount: number, asset: string, options?: { collectFee?: boolean; sponsored?: boolean }): Promise<AdapterTxResult>;
  buildRepayTx(address: string, amount: number, asset: string, options?: { sponsored?: boolean }): Promise<AdapterTxResult>;

  maxWithdraw(address: string, asset: string): Promise<{ maxAmount: number; healthFactorAfter: number; currentHF: number }>;
  maxBorrow(address: string, asset: string): Promise<{ maxAmount: number; healthFactorAfter: number; currentHF: number }>;

  addWithdrawToTx?(tx: Transaction, address: string, amount: number, asset: string): Promise<{ coin: TransactionObjectArgument; effectiveAmount: number }>;
  addSaveToTx?(tx: Transaction, address: string, coin: TransactionObjectArgument, asset: string, options?: { collectFee?: boolean }): Promise<void>;
  addRepayToTx?(tx: Transaction, address: string, coin: TransactionObjectArgument, asset: string): Promise<void>;

  getPendingRewards?(address: string): Promise<PendingReward[]>;
  addClaimRewardsToTx?(tx: Transaction, address: string): Promise<PendingReward[]>;
}

export interface PendingReward {
  protocol: string;
  asset: string;
  coinType: string;
  symbol: string;
  amount: number;
  estimatedValueUsd: number;
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

  addSwapToTx?(
    tx: Transaction,
    address: string,
    inputCoin: TransactionObjectArgument,
    from: string,
    to: string,
    amount: number,
    maxSlippageBps?: number,
  ): Promise<{ outputCoin: TransactionObjectArgument; estimatedOut: number; toDecimals: number }>;
}

export interface PerpsAdapter {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: readonly AdapterCapability[];
  readonly supportedMarkets: readonly string[];

  init(keypair: unknown, network: 'mainnet' | 'testnet'): Promise<void>;

  getAccountBalance(address: string): Promise<number>;
  getPositions(address: string): Promise<import('../types.js').PerpsPosition[]>;
  getMarketPrice(market: string): Promise<number>;

  deposit(amount: number): Promise<string>;
  withdraw(amount: number): Promise<string>;

  openPosition(params: {
    market: string;
    side: import('../types.js').PositionSide;
    margin: number;
    leverage: number;
  }): Promise<import('../types.js').TradeResult>;

  closePosition(market: string): Promise<import('../types.js').TradeResult>;
}
