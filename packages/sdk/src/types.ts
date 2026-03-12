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
  investment: number;
  investmentPnL: number;
  gasReserve: GasReserve;
  total: number;
  assets: Record<string, number>;
  stables: Record<string, number>;
}

export type GasMethod = 'self-funded' | 'sponsored' | 'auto-topup';

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

export interface SwapResult {
  success: boolean;
  tx: string;
  fromAmount: number;
  fromAsset: string;
  toAmount: number;
  toAsset: string;
  priceImpact: number;
  fee: number;
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

export interface RebalanceStep {
  action: 'withdraw' | 'swap' | 'deposit';
  protocol?: string;
  fromAsset?: string;
  toAsset?: string;
  amount: number;
  estimatedOutput?: number;
}

export interface RebalanceResult {
  executed: boolean;
  steps: RebalanceStep[];
  fromProtocol: string;
  fromAsset: string;
  toProtocol: string;
  toAsset: string;
  amount: number;
  currentApy: number;
  newApy: number;
  annualGain: number;
  estimatedSwapCost: number;
  breakEvenDays: number;
  txDigests: string[];
  totalGasCost: number;
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
  timestamp: number;
  gasMethod?: GasMethod;
}

export interface SentinelAgent {
  id: string;
  objectId: string;
  name: string;
  model: string;
  systemPrompt: string;
  attackFee: bigint;
  prizePool: bigint;
  totalAttacks: number;
  successfulBreaches: number;
  state: string;
}

export interface SentinelVerdict {
  success: boolean;
  score: number;
  agentResponse: string;
  juryResponse: string;
  funResponse: string;
  signature: string;
  timestampMs: number;
}

export interface SentinelAttackResult {
  attackObjectId: string;
  sentinelId: string;
  prompt: string;
  verdict: SentinelVerdict;
  requestTx: string;
  settleTx: string;
  won: boolean;
  feePaid: number;
}

// --- Investment types ---

export interface InvestmentTrade {
  id: string;
  type: 'buy' | 'sell';
  asset: string;
  amount: number;
  price: number;
  usdValue: number;
  fee: number;
  tx: string;
  timestamp: string;
}

export interface InvestmentPosition {
  asset: string;
  totalAmount: number;
  costBasis: number;
  avgPrice: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  trades: InvestmentTrade[];
}

export interface PortfolioResult {
  positions: InvestmentPosition[];
  totalInvested: number;
  totalValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  realizedPnL: number;
}

export interface InvestResult {
  success: boolean;
  tx: string;
  type: 'buy' | 'sell';
  asset: string;
  amount: number;
  price: number;
  usdValue: number;
  fee: number;
  gasCost: number;
  gasMethod: GasMethod;
  realizedPnL?: number;
  position: InvestmentPosition;
}

// --- Margin trading types ---

export type PositionSide = 'long' | 'short';

export interface PerpsPosition {
  market: string;
  side: PositionSide;
  margin: number;
  leverage: number;
  size: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
}

export interface TradeResult {
  success: boolean;
  action: 'open' | 'close';
  market: string;
  side: PositionSide;
  margin: number;
  leverage: number;
  size: number;
  entryPrice: number;
  liquidationPrice?: number;
  realizedPnL?: number;
  tx?: string;
}

export interface TradePositionsResult {
  positions: PerpsPosition[];
  totalMargin: number;
  totalUnrealizedPnL: number;
}
