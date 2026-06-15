export interface T2000Options {
  keyPath?: string;
  /** PIN to decrypt the key file. Accepts any string (4+ chars). */
  pin?: string;
  /** @deprecated Use `pin` instead. */
  passphrase?: string;
  network?: 'mainnet' | 'testnet';
  rpcUrl?: string;
}

export interface SuiHolding {
  /** SUI balance in whole SUI (not MIST). */
  amount: number;
  /** USD value of the SUI holding. */
  usdValue: number;
}

export interface BalanceResponse {
  /** Spendable stablecoins keyed by symbol (USDC, USDsui) — gasless to send/pay. */
  stables: Record<string, number>;
  /** Sum of spendable stables in USD. Used for send/pay pre-checks. */
  available: number;
  /** SUI holding — used for swaps (and any non-gasless gas). Not a "reserve". */
  sui: SuiHolding;
  /** Total wallet value in USD (available + sui.usdValue). */
  totalUsd: number;
}

export interface SendResult {
  success: boolean;
  tx: string;
  amount: number;
  to: string;
  /**
   * [S.279] Set when the recipient was resolved via SuiNS (e.g. `alex.sui`).
   * CLI receipts render "Sent to alex.sui (0xabc...)" when present.
   */
  suinsName?: string;
  gasCost: number;
  gasCostUnit: string;
  balance: BalanceResponse;
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
  /**
   * Which payment dialect settled the call. `'x402'` = the sign-then-settle
   * x402 `sui-exact` scheme (client signs, gateway settles); `'legacy'` = the
   * pre-x402 MPP digest dialect (client broadcasts, retries with the digest).
   * Undefined when nothing was paid (free/cached endpoint). See
   * SUIMPP_X402_SCHEME.md.
   */
  dialect?: 'x402' | 'legacy';
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

