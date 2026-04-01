export interface T2000Options {
  keyPath?: string;
  /** PIN to decrypt the key file. Accepts any string (4+ chars). */
  pin?: string;
  /** @deprecated Use `pin` instead. */
  passphrase?: string;
  network?: 'mainnet' | 'testnet';
  rpcUrl?: string;
  sponsored?: boolean;
  name?: string;
}

export interface GasReserve {
  sui: number;
  usdEquiv: number;
}

export interface BalanceResponse {
  available: number;
  savings: number;
  debt: number;
  pendingRewards: number;
  gasReserve: GasReserve;
  total: number;
  stables: Record<string, number>;
}

export type GasMethod = 'self-funded' | 'sponsored' | 'auto-topup' | 'none';

export interface SendResult {
  success: boolean;
  tx: string;
  amount: number;
  to: string;
  contactName?: string;
  gasCost: number;
  gasCostUnit: string;
  gasMethod: GasMethod;
  balance: BalanceResponse;
}

export interface SaveResult {
  success: boolean;
  tx: string;
  amount: number;
  apy: number;
  fee: number;
  gasCost: number;
  gasMethod: GasMethod;
  savingsBalance: number;
}

export interface WithdrawResult {
  success: boolean;
  tx: string;
  amount: number;
  gasCost: number;
  gasMethod: GasMethod;
}

export interface BorrowResult {
  success: boolean;
  tx: string;
  amount: number;
  fee: number;
  healthFactor: number;
  gasCost: number;
  gasMethod: GasMethod;
}

export interface RepayResult {
  success: boolean;
  tx: string;
  amount: number;
  remainingDebt: number;
  gasCost: number;
  gasMethod: GasMethod;
}

export interface HealthFactorResult {
  healthFactor: number;
  supplied: number;
  borrowed: number;
  maxBorrow: number;
  liquidationThreshold: number;
}

export interface MaxWithdrawResult {
  maxAmount: number;
  healthFactorAfter: number;
  currentHF: number;
}

export interface MaxBorrowResult {
  maxAmount: number;
  healthFactorAfter: number;
  currentHF: number;
}

export interface AssetRates {
  saveApy: number;
  borrowApy: number;
}

export interface RatesResult {
  [asset: string]: AssetRates;
}

export interface PositionEntry {
  protocol: string;
  asset: string;
  type: 'save' | 'borrow';
  amount: number;
  amountUsd?: number;
  apy: number;
}

export interface PositionsResult {
  positions: PositionEntry[];
}

export interface EarningsResult {
  totalYieldEarned: number;
  currentApy: number;
  dailyEarning: number;
  supplied: number;
}

export interface FundStatusResult {
  supplied: number;
  apy: number;
  earnedToday: number;
  earnedAllTime: number;
  projectedMonthly: number;
}

export interface DepositInfo {
  address: string;
  network: string;
  supportedAssets: string[];
  instructions: string;
}

export interface TransactionRecord {
  digest: string;
  action: string;
  amount?: number;
  asset?: string;
  recipient?: string;
  timestamp: number;
  gasCost?: number;
  gasMethod?: GasMethod;
}

// --- Claim rewards types ---

export interface PendingReward {
  protocol: string;
  asset: string;
  coinType: string;
  symbol: string;
  amount: number;
  estimatedValueUsd: number;
}

export interface ClaimRewardsResult {
  success: boolean;
  tx: string;
  rewards: PendingReward[];
  totalValueUsd: number;
  gasCost: number;
  gasMethod: GasMethod;
}

export interface PayOptions {
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  maxPrice?: number;
}

export interface PayResult {
  status: number;
  body: unknown;
  paid: boolean;
  cost?: number;
  receipt?: {
    reference: string;
    timestamp: string;
  };
}
