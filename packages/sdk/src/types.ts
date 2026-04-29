export interface T2000Options {
  keyPath?: string;
  /** PIN to decrypt the key file. Accepts any string (4+ chars). */
  pin?: string;
  /** @deprecated Use `pin` instead. */
  passphrase?: string;
  network?: 'mainnet' | 'testnet';
  rpcUrl?: string;
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

export interface SendResult {
  success: boolean;
  tx: string;
  amount: number;
  to: string;
  contactName?: string;
  gasCost: number;
  gasCostUnit: string;
  balance: BalanceResponse;
}

export interface SaveResult {
  success: boolean;
  tx: string;
  amount: number;
  apy: number;
  fee: number;
  gasCost: number;
  savingsBalance: number;
}

export interface WithdrawResult {
  success: boolean;
  tx: string;
  amount: number;
  asset?: string;
  gasCost: number;
}

export interface BorrowResult {
  success: boolean;
  tx: string;
  amount: number;
  /** [v0.51.0] Asset borrowed — 'USDC' or 'USDsui'. Optional for backward compat. */
  asset?: string;
  fee: number;
  healthFactor: number;
  gasCost: number;
}

export interface RepayResult {
  success: boolean;
  tx: string;
  amount: number;
  /** [v0.51.1] Asset repaid — 'USDC' or 'USDsui'. Optional for backward compat. */
  asset?: string;
  remainingDebt: number;
  gasCost: number;
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

export interface PaymentRequest {
  address: string;
  network: string;
  amount: number | null;
  currency: string;
  memo: string | null;
  label: string | null;
  /** Unique payment identifier (UUID) for Payment Kit registry */
  nonce: string;
  /** Payment Kit URI (sui:pay?...) for QR codes and wallet deep links */
  qrUri: string;
  /** Human-readable summary */
  displayText: string;
}

export interface TransactionRecord {
  digest: string;
  /** Coarse bucket — `'send' | 'lending' | 'swap' | 'transaction'`. STABLE. */
  action: string;
  /**
   * Finer-grained display label derived from the Move-call function
   * name (e.g. `'deposit'`, `'withdraw'`, `'payment_link'`,
   * `'on-chain'`). Optional — frontends should fall back to `action`
   * when missing. Never used by ACI filters.
   */
  label?: string;
  amount?: number;
  asset?: string;
  recipient?: string;
  /**
   * Direction of the user's principal (non-gas) balance movement on
   * this tx — `'out'` if they spent, `'in'` if they received.
   * Computed from on-chain balance changes (NOT from `label`), so the
   * card can render the correct sign even for opaque actions like
   * `swap`/`router`. Undefined when no user balance change is
   * detectable (e.g. pure read-only or admin txs).
   */
  direction?: 'in' | 'out';
  timestamp: number;
  gasCost?: number;
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
}

export interface CompoundRewardsResult {
  success: boolean;
  claimTx: string;
  swapTxs: string[];
  depositTx: string;
  rewards: PendingReward[];
  totalCompoundedUsdc: number;
  totalGasCost: number;
}

export interface StakeVSuiResult {
  success: boolean;
  tx: string;
  amountSui: number;
  vSuiReceived: number;
  apy: number;
  gasCost: number;
}

export interface UnstakeVSuiResult {
  success: boolean;
  tx: string;
  vSuiAmount: number;
  suiReceived: number;
  gasCost: number;
}

export interface SwapResult {
  success: boolean;
  tx: string;
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  priceImpact: number;
  route: string;
  gasCost: number;
}

export interface SwapQuoteResult {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  priceImpact: number;
  route: string;
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

// --- Financial summary (for notifications / cron) ---

export type HFAlertLevel = 'none' | 'warn' | 'critical';

export interface FinancialSummary {
  walletAddress: string;
  usdcAvailable: number;
  savingsBalance: number;
  debtBalance: number;
  idleUsdc: number;
  healthFactor: number;
  hfAlertLevel: HFAlertLevel;
  saveApy: number;
  borrowApy: number;
  dailyYield: number;
  gasReserveSui: number;
  gasReserveUsd: number;
  fetchedAt: number;
}
