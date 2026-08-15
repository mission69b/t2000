export { T2000 } from './t2000.js';
export type { TransactionSigner } from './signer.js';
export { KeypairSigner } from './wallet/keypairSigner.js';
export { ZkLoginSigner, type ZkLoginProof } from './wallet/zkLoginSigner.js';
export { payWithX402, preflightPay, probeX402 } from './wallet/pay.js';
export type { X402Probe } from './wallet/pay.js';
export {
  DEFAULT_ACTIVITY_REPORT_URL,
  reportX402Activity,
  type ActivityReportConfig,
  type X402ActivityPayload,
} from './wallet/activity-report.js';
export {
  chatCompletion,
  chatCompletionStream,
  listModels,
  DEFAULT_API_BASE,
} from './inference.js';
export type {
  ChatMessage,
  ChatParams,
  ChatResult,
  ChatUsage,
  ApiModel,
} from './inference.js';
export { verifyReceipt } from './verify.js';
export type {
  VerifyResult,
  VerifyCheck,
  VerifyAnchor,
  VerifyUpstream,
  UpstreamClaim,
  VerifyOptions,
  CheckStatus,
  TrustMode,
} from './verify.js';
export { executeTx } from './wallet/executeTx.js';
export { T2000Error, mapWalletError, mapMoveAbortCode } from './errors.js';
export type { T2000ErrorCode, T2000ErrorData } from './errors.js';
export type {
  T2000Options,
  BalanceResponse,
  SuiHolding,
  SendResult,
  DepositInfo,
  PaymentRequest,
  TransactionRecord,
  TransactionLeg,
  PayOptions,
  PayResult,
  SwapResult,
  SwapQuoteResult,
} from './types.js';
export {
  MIST_PER_SUI,
  SUI_DECIMALS,
  USDC_DECIMALS,
  T2000_OVERLAY_FEE_WALLET,
  SUPPORTED_ASSETS,
  CLOCK_ID,
  DEFAULT_NETWORK,
} from './constants.js';
export type { SupportedAsset, StableAsset, SendableAsset } from './constants.js';
export {
  STABLE_ASSETS,
  SENDABLE_ASSETS,
  GASLESS_MIN_STABLE_AMOUNT,
  GASLESS_STABLE_TYPES,
  DEFAULT_GRPC_URL,
  GAS_RESERVE_MIN,
  CETUS_USDC_SUI_POOL,
  OPERATION_ASSETS,
  isAllowedAsset,
  assertAllowedAsset,
} from './constants.js';
export type { Operation } from './constants.js';
export {
  validateAddress,
  truncateAddress,
  normalizeCoinType,
  getSuiClient,
  getSuiGrpcClient,
} from './utils/sui.js';
export {
  SUI_ADDRESS_REGEX,
  SUI_ADDRESS_STRICT_REGEX,
  SUINS_NAME_REGEX,
  InvalidAddressError,
  SuinsNotRegisteredError,
  SuinsRpcError,
  canonicalizeRecipientInput,
  looksLikeSuiNs,
  resolveSuinsViaRpc,
  resolveAddressToSuinsViaRpc,
  normalizeAddressInput,
} from './utils/suins.js';
export type { NormalizedAddress } from './utils/suins.js';
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
export {
  parseSuiRpcTx,
  extractTxSender,
  extractTxCommands,
  queryHistory,
  queryTransaction,
} from './wallet/history.js';
export type { SuiRpcTxBlock } from './wallet/history.js';
export { queryBalance } from './wallet/balance.js';
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
  normalizeAsset,
} from './utils/format.js';
export {
  generateKeypair,
  keypairFromPrivateKey,
  saveKey,
  saveBech32,
  loadKey,
  walletExists,
  exportPrivateKey,
  getAddress,
} from './wallet/keyManager.js';
export { buildSendTx, addSendToTx, preflightSend, classifySendAsset, invalidSendAssetMessage } from './wallet/send.js';
export type { SendAssetClass } from './wallet/send.js';
export {
  A2A_ESCROW_PACKAGE_ID,
  MAINNET_A2A_ESCROW_PACKAGE_ID,
  A2A_ESCROW_FEE_CONFIG_ID,
  MAX_JOB_USDC,
  MIN_JOB_USDC,
  MAX_REVIEW_WINDOW_MS,
  MAX_DELIVER_HORIZON_MS,
  JOB_STATES,
  preflightCreateJob,
  buildCreateJobTx,
  buildDeclineJobTx,
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
  A2A_ESCROW_OPENING_PACKAGE_ID,
  MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID,
  A2A_ESCROW_LATEST_PACKAGE_ID,
  MAINNET_A2A_ESCROW_LATEST_PACKAGE_ID,
  A2A_ESCROW_PACKAGE_V2_ID,
  A2A_ESCROW_PACKAGE_V3_ID,
  A2A_ESCROW_PACKAGE_V6_ID,
  A2A_ESCROW_PACKAGE_V7_ID,
  MAX_OPEN_WINDOW_MS,
  OPENING_CLAIM_POLICY_ANY_ACTIVE,
  OPENING_CLAIM_POLICY_PROVEN,
  OPENING_CLAIM_POLICY_PROVEN_4STAR,
  OPENING_CLAIM_POLICIES,
  buildCancelOpeningTx,
  buildClaimOpeningTx,
  buildCreateOpeningTx,
  buildRefundUnclaimedTx,
  getOpening,
  preflightCreateOpening,
} from './wallet/opening.js';
export type { Opening, OpeningTerms } from './wallet/opening.js';
export {
  A2A_SCORE_BOARD_ID,
  MAINNET_A2A_SCORE_BOARD_ID,
  PROVEN_MIN_REVIEWS,
  PROVEN_MIN_AVG_STARS_X10,
  REVIEW_MIN_STARS,
  REVIEW_MAX_STARS,
  buildSubmitFirstReviewTx,
  buildSubmitReviewTx,
  claimPolicyLabel,
  claimPolicyRequirement,
  deriveAgentScoreId,
  getAgentScore,
  meetsClaimPolicy,
} from './wallet/reputation.js';
export type { AgentScore } from './wallet/reputation.js';
export {
  assertBuyerRequirements,
  DEFAULT_COMMERCE_API_BASE,
  fetchService,
  getJobSpec,
  listServices,
  putJobSpec,
} from './commerce.js';
export type { ServiceListing } from './commerce.js';
export {
  customHireEnvelope,
  isCustomHireEnvelope,
} from './job-spec-envelope.js';
export {
  cancelOpenJob,
  claimOpenJob,
  getOpenJob,
  listOpenJobs,
  postOpenJob,
  setSponsoredTxGuard,
  type SponsoredTxGuard,
  refundOpenJob,
  submitJobReview,
} from './open-jobs.js';
export type { OpenJobFilter, OpenJobRow } from './open-jobs.js';
// Digest → created-object resolution (S.906 SSOT — CLI + console + Connect).
export {
  ESCROW_JOB_TYPE_MARKER,
  OPENING_TYPE_MARKER,
  resolveCreatedObjectId,
} from './utils/resolve-created.js';
export {
  fetchAllCoins,
  selectAndSplitCoin,
  selectSuiCoin,
} from './wallet/coinSelection.js';
export type { CoinPage, SelectAndSplitResult } from './wallet/coinSelection.js';
export {
  composeTx,
  deriveAllowedAddressesFromPtb,
  WRITE_APPENDER_REGISTRY,
  SPONSORED_PYTH_DEPENDENT_PROVIDERS,
  getSponsoredSwapProviders,
} from './composeTx.js';
export type {
  WriteToolName,
  WriteStep,
  ComposeTxOptions,
  ComposeTxResult,
  AppenderContext,
  StepPreview,
  SendTransferInput,
  SwapExecuteInput,
} from './composeTx.js';
export { simulateTransaction, throwIfSimulationFailed } from './utils/simulate.js';
export type { SimulationResult } from './utils/simulate.js';
export { getSwapQuote } from './swap-quote.js';
export {
  findSwapRoute,
  buildSwapTx,
  addSwapToTx,
  preflightSwap,
  OVERLAY_FEE_RATE,
  serializeCetusRoute,
  deserializeCetusRoute,
  verifyCetusRouteCoinMatch,
  isCetusRouteFresh,
} from './protocols/cetus-swap.js';
export type {
  SwapRouteResult,
  OverlayFeeConfig,
  SerializedCetusRoute,
  SerializedRouterDataV3,
  SerializedCetusRoutePath,
} from './protocols/cetus-swap.js';
export {
  COIN_REGISTRY,
  TOKEN_MAP,
  resolveTokenType,
  resolveSymbol,
  getDecimalsForCoinType,
  getCoinMeta,
  isInRegistry,
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
// [S.323 / 2026-05-25] VOLO vSUI staking re-exports removed (full cut).
// vSUI still exists in the codebase as a passive token (NAVI reward type
// + Cetus swap target), but t2000 no longer exposes mint/redeem surfaces.
export {
  AUDRIC_PARENT,
  AUDRIC_PARENT_NAME,
  AUDRIC_PARENT_NFT_ID,
  buildAddLeafTx,
  buildRevokeLeafTx,
  displayHandle,
  fullHandle,
  validateLabel,
} from './protocols/suins-leaf.js';
export type {
  BuildAddLeafParams,
  BuildRevokeLeafParams,
  LabelValidationResult,
  SuinsParent,
} from './protocols/suins-leaf.js';
// Unified spending limits (per-tx + cumulative daily, USD) — one gate for
// CLI + MCP + programmatic writes (R-0 Finding 1; closes H5). Node-only.
export {
  LimitEnforcer,
  LimitExceededError,
  approxUsdValue,
  assertLimitConfig,
  getLimits,
  hasLimits,
  setLimits,
  clearLimits,
  dailySpentToday,
  recordDailySpend,
  readLimitsFile,
  writeLimitsFile,
} from './limits/index.js';
export type { LimitsConfig, DailySpend, LimitsFile, LimitKind, LimitOperation, LimitAssertInput } from './limits/index.js';
// Synchronous, network-free preflight (layer 2) — pure input validation the
// v3 host runs before the LLM round-trip / tap-to-confirm. Per-builder
// validators (`preflightSend`/`preflightPay`/`preflightSwap`) are exported
// alongside their builders above; these are the shared primitives.
export {
  type PreflightResult,
  PREFLIGHT_MAX_AMOUNT,
  PREFLIGHT_OK,
  preflightFail,
  checkPositiveAmount,
  checkSuiAddress,
} from './preflight.js';
// Agent Capital — tokenize-your-agent launch orchestration (SPEC_ACP_SUI §6).
