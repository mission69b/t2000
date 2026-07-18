/**
 * Browser-safe entry point for @t2000/sdk.
 *
 * Exports everything the web app needs WITHOUT Node-only modules
 * (e.g. the fs-based keyManager is excluded).
 */

// Signer abstraction
export type { TransactionSigner } from './signer.js';
export { KeypairSigner } from './wallet/keypairSigner.js';
export { ZkLoginSigner, type ZkLoginProof } from './wallet/zkLoginSigner.js';

// Gasless MPP pay — browser-safe; the Audric client runs this in-browser on
// the zkLogin session key (unified gasless write path). Same canonical loop
// `T2000.pay()` delegates to. Pair with `executeTx` for advanced callers.
// (`PayOptions` / `PayResult` are exported from the types block below.)
export { payWithMpp, preflightPay, parseMppSuiChallenge } from './wallet/pay.js';
export { executeTx } from './wallet/executeTx.js';

// Error handling
export { T2000Error, mapWalletError, mapMoveAbortCode } from './errors.js';
export type { T2000ErrorCode, T2000ErrorData } from './errors.js';

// Constants
export {
  MIST_PER_SUI,
  SUI_DECIMALS,
  USDC_DECIMALS,
  T2000_OVERLAY_FEE_WALLET,
  SUPPORTED_ASSETS,
  CLOCK_ID,
  DEFAULT_NETWORK,
} from './constants.js';
export type { SupportedAsset, StableAsset } from './constants.js';
export {
  STABLE_ASSETS,
  GAS_RESERVE_MIN,
} from './constants.js';

// Utilities
export { validateAddress, truncateAddress } from './utils/sui.js';
export {
  KNOWN_TARGETS,
  LABEL_PATTERNS,
  classifyAction,
  classifyLabel,
  fallbackLabel,
  refineLendingLabel,
  classifyTransaction,
  extractTransferDetails,
  extractAllUserLegs,
} from './wallet/classify.js';
export type {
  ClassifyBalanceChange,
  ClassifyResult,
  ExtractedTransfer,
  TxDirection,
} from './wallet/classify.js';
/**
 * Tx parsing helpers. Safe in the browser — they only do shape
 * inspection / classification and do not import any Node-only modules.
 * `queryHistory` and `queryTransaction` are not re-exported here
 * because they reach the network (GraphQL) directly; browser consumers
 * can build the same flow with `parseSuiRpcTx` + their own fetch.
 */
export {
  parseSuiRpcTx,
  extractTxSender,
  extractTxCommands,
} from './wallet/history.js';
export type { SuiRpcTxBlock } from './wallet/history.js';
export {
  mistToSui,
  suiToMist,
  usdcToRaw,
  rawToUsdc,
  stableToRaw,
  rawToStable,
  getDecimals,
  formatUsd,
  formatSui,
  formatAssetAmount,
} from './utils/format.js';
export { toBase64, fromBase64 } from './utils/base64.js';

// Simulation — use dynamic import() to avoid Buffer dependency in browser bundles
// import { simulateTransaction } from '@t2000/sdk' (main entry) for Node usage
export type { SimulationResult } from './utils/simulate.js';

// Protocol fee
// Cetus aggregator helpers — Audric prepare/route.ts uses these directly to
// build swap PTBs with overlay fees (per-call, not module-global).
export { findSwapRoute, buildSwapTx, OVERLAY_FEE_RATE, preflightSwap } from './protocols/cetus-swap.js';
export type { SwapRouteResult, OverlayFeeConfig } from './protocols/cetus-swap.js';

// Synchronous, network-free preflight (layer 2) — pure, browser-safe. The v3
// host runs these in the agent loop before the tap-to-confirm card.
// buildSendTx is browser-safe (builds a gasless PTB; the client is injected) —
// the Audric client signs it in-browser with the zkLogin session (send_transfer).
export { buildSendTx, preflightSend } from './wallet/send.js';

// A2A escrow job builders + readers — browser-safe (client injected, no fs).
// Store surfaces build the buyer-side legs on a zkLogin session key.
export {
  A2A_ESCROW_PACKAGE_ID,
  A2A_ESCROW_FEE_CONFIG_ID,
  MAX_JOB_USDC,
  MAX_REVIEW_WINDOW_MS,
  MAX_DELIVER_HORIZON_MS,
  JOB_STATES,
  preflightCreateJob,
  buildCreateJobTx,
  buildDeliverJobTx,
  buildReleaseJobTx,
  buildRejectJobTx,
  buildRefundJobTx,
  getJob,
  jobActionsFor,
  verifyJobForSeller,
} from './wallet/job.js';
export type { Job, JobState, JobTerms, JobVerification } from './wallet/job.js';
export {
  type PreflightResult,
  PREFLIGHT_MAX_AMOUNT,
  PREFLIGHT_OK,
  preflightFail,
  checkPositiveAmount,
  checkSuiAddress,
} from './preflight.js';

// Spending limits are Node-only (`@t2000/sdk/limits` uses node:fs) — NOT
// exported here. The browser (Audric) write path skips client-side limits;
// the server budget ledger is the cap there.

// Types
export type {
  BalanceResponse,
  SuiHolding,
  SendResult,
  DepositInfo,
  TransactionRecord,
  TransactionLeg,
  PayOptions,
  PayResult,
} from './types.js';

// Token registry — zero Node.js deps, safe for client-side use
export {
  COIN_REGISTRY,
  TOKEN_MAP,
  resolveTokenType,
  resolveSymbol,
  getDecimalsForCoinType,
  SUI_TYPE,
  USDC_TYPE,
  USDT_TYPE,
  USDSUI_TYPE,
  USDE_TYPE,
  ETH_TYPE,
  WBTC_TYPE,
  WAL_TYPE,
  NAVX_TYPE,
  IKA_TYPE,
  LOFI_TYPE,
  MANIFEST_TYPE,
} from './token-registry.js';
export type { CoinMeta } from './token-registry.js';
