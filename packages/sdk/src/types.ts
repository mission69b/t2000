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
  /** Set when the recipient was resolved via the legacy `contacts.json` alias. */
  contactName?: string;
  /**
   * [S.279] Set when the recipient was resolved via SuiNS (e.g. `alex.sui`).
   * CLI receipts render "Sent to alex.sui (0xabc...)" when present.
   */
  suinsName?: string;
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

/**
 * One non-zero user balance change for a transaction. Sui collapses
 * balance changes by coin type, so a 3-step bundle that touches USDC
 * three times surfaces as ONE leg of net USDC delta — not three.
 *
 * [Activity rebuild / 2026-05-10] Added so consumers can render swap
 * + bundle txs accurately instead of picking a single "primary leg"
 * (which made `Swapped 987.60 MANIFEST` look like +$987 of value when
 * the user actually paid 1 USDC for it).
 */
export interface TransactionLeg {
  /** Full Sui coin type string (e.g. `0x...usdc::USDC`). */
  coinType: string;
  /** Display symbol (USDC, SUI, GOLD, MANIFEST, …) from the token registry. */
  asset: string;
  /** On-chain decimals for this coin (used to format `amount`). */
  decimals: number;
  /** Token quantity as a positive number (e.g. 987.60). */
  amount: number;
  /** Signed raw bigint as a string (preserves sign + precision). */
  rawAmount: string;
  /** `'out'` if the user spent this coin, `'in'` if they received it. */
  direction: 'in' | 'out';
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
  /**
   * All non-zero user balance legs for this transaction. Single-write
   * txs have `legs.length === 1`; swaps have `2` (one `out`, one
   * `in`); bundles have `> 2`. Order is RPC order — not sorted by
   * size or USD value (audric's activity route prices + sorts).
   *
   * @since SDK v1.27.2 — was missing from earlier shapes; older
   * consumers can keep using `amount` / `asset` / `direction` (which
   * still resolve to the largest absolute leg).
   */
  legs: TransactionLeg[];
  /**
   * Largest-absolute-leg amount, kept for back-compat with consumers
   * that pre-date `legs[]`. New code should iterate `legs` instead.
   */
  amount?: number;
  /** @see {@link amount} — back-compat alias for `legs[primary].asset`. */
  asset?: string;
  recipient?: string;
  /**
   * Direction of the user's principal (non-gas) balance movement on
   * this tx — `'out'` if they spent, `'in'` if they received.
   * Computed from on-chain balance changes (NOT from `label`), so the
   * card can render the correct sign even for opaque actions like
   * `swap`/`router`. Undefined when no user balance change is
   * detectable (e.g. pure read-only or admin txs).
   *
   * @see {@link amount} — back-compat alias for `legs[primary].direction`.
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

// [S.323 / 2026-05-25] StakeVSuiResult + UnstakeVSuiResult removed —
// see `t2000.ts` for the cut rationale. vSUI remains as a passive token
// (NAVI reward, Cetus swap target) but the mint/redeem surfaces are gone.

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
  /**
   * [SPEC 20.2 / D-1 (a)] Structured Cetus route captured at quote time.
   * Threaded through `pending_action.cetusRoute` so the prepare-route can
   * skip the ~400-500ms `findSwapRoute()` re-discovery, and so the
   * post-write resume system prompt can ground LLM narration against the
   * canonical route (closing S19-F2). Optional for backward compat with
   * pre-SPEC-20.2 callers (CLI, server-only direct calls).
   */
  serializedRoute?: import('./protocols/cetus-swap.js').SerializedCetusRoute;
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
  /**
   * SUI gas cost actually paid on chain. Zero for gasless payments —
   * which means an MPP payment hit the protocol's gasless allowlist
   * (USDC / USDsui / USDY / FdUSD / AUSD / BUCK / USDB / SUI_USDE) and
   * was accepted with `gasPrice=0, gasBudget=0, gasPayment=[]`. See
   * https://docs.sui.io/develop/transaction-payment/gasless-stablecoin-transfers
   */
  gasCostSui?: number;
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
