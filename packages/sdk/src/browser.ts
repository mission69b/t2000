/**
 * Browser-safe entry point for @t2000/sdk.
 *
 * Exports everything the web app needs WITHOUT Node-only modules:
 *   - keyManager (fs-based wallet encryption)
 *   - ContactManager (file-based contacts)
 *   - PortfolioManager (file-based portfolio)
 *   - StrategyManager / AutoInvestManager (file-based)
 *
 * Protocol adapters are NOT statically exported here — import them
 * via dynamic import() in the web app to keep the initial bundle small.
 */

// Signer abstraction
export type { TransactionSigner } from './signer.js';
export { KeypairSigner } from './wallet/keypairSigner.js';
export { ZkLoginSigner, type ZkLoginProof } from './wallet/zkLoginSigner.js';

// Error handling
export { T2000Error, mapWalletError, mapMoveAbortCode } from './errors.js';
export type { T2000ErrorCode, T2000ErrorData } from './errors.js';

// Gas
export {
  executeWithGas,
  shouldAutoTopUp,
  executeAutoTopUp,
  getGasStatus,
} from './gas/index.js';
export type {
  GasExecutionResult,
  AutoTopUpResult,
  GasSponsorResponse,
  GasStatusResponse,
  GasRequestType,
} from './gas/index.js';

// Constants
export {
  MIST_PER_SUI,
  SUI_DECIMALS,
  USDC_DECIMALS,
  BPS_DENOMINATOR,
  SUPPORTED_ASSETS,
  CLOCK_ID,
  DEFAULT_NETWORK,
  SENTINEL,
} from './constants.js';
export type { SupportedAsset, StableAsset, InvestmentAsset } from './constants.js';
export {
  STABLE_ASSETS,
  INVESTMENT_ASSETS,
  GAS_RESERVE_MIN,
} from './constants.js';

// Utilities
export { validateAddress, truncateAddress } from './utils/sui.js';
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
export { calculateFee, addCollectFeeToTx } from './protocols/protocolFee.js';
export type { ProtocolFeeInfo, FeeOperation } from './protocols/protocolFee.js';

// Safeguards — only browser-safe exports (SafeguardEnforcer uses node:fs)
export { SafeguardError } from './safeguards/errors.js';
export type { SafeguardRule, SafeguardErrorDetails } from './safeguards/errors.js';
export type { SafeguardConfig, TxMetadata } from './safeguards/types.js';
export { OUTBOUND_OPS, DEFAULT_SAFEGUARD_CONFIG } from './safeguards/types.js';

// Types
export type {
  BalanceResponse,
  GasReserve,
  GasMethod,
  SendResult,
  SaveResult,
  WithdrawResult,
  BorrowResult,
  RepayResult,
  SwapResult,
  HealthFactorResult,
  MaxWithdrawResult,
  MaxBorrowResult,
  AssetRates,
  RatesResult,
  PositionEntry,
  PositionsResult,
  EarningsResult,
  FundStatusResult,
  RebalanceStep,
  RebalanceResult,
  DepositInfo,
  TransactionRecord,
  InvestmentRecord,
  InvestmentPosition,
  PortfolioResult,
  InvestResult,
  InvestEarnResult,
  InvestRebalanceResult,
  InvestRebalanceMove,
  ClaimRewardsResult,
  PendingReward,
  PayOptions,
  PayResult,
} from './types.js';
