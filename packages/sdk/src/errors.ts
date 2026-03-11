export type T2000ErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'INSUFFICIENT_GAS'
  | 'INVALID_ADDRESS'
  | 'INVALID_AMOUNT'
  | 'WALLET_NOT_FOUND'
  | 'WALLET_LOCKED'
  | 'WALLET_EXISTS'
  | 'SPONSOR_FAILED'
  | 'SPONSOR_RATE_LIMITED'
  | 'GAS_STATION_UNAVAILABLE'
  | 'GAS_FEE_EXCEEDED'
  | 'SIMULATION_FAILED'
  | 'TRANSACTION_FAILED'
  | 'ASSET_NOT_SUPPORTED'
  | 'SWAP_FAILED'
  | 'SLIPPAGE_EXCEEDED'
  | 'HEALTH_FACTOR_TOO_LOW'
  | 'WITHDRAW_WOULD_LIQUIDATE'
  | 'NO_COLLATERAL'
  | 'PROTOCOL_PAUSED'
  | 'PROTOCOL_UNAVAILABLE'
  | 'RPC_ERROR'
  | 'RPC_UNREACHABLE'
  | 'SPONSOR_UNAVAILABLE'
  | 'AUTO_TOPUP_FAILED'
  | 'PRICE_EXCEEDS_LIMIT'
  | 'UNSUPPORTED_NETWORK'
  | 'PAYMENT_EXPIRED'
  | 'DUPLICATE_PAYMENT'
  | 'FACILITATOR_REJECTION'
  | 'CONTACT_NOT_FOUND'
  | 'INVALID_CONTACT_NAME'
  | 'FACILITATOR_TIMEOUT'
  | 'SENTINEL_API_ERROR'
  | 'SENTINEL_NOT_FOUND'
  | 'SENTINEL_TX_FAILED'
  | 'SENTINEL_TEE_ERROR'
  | 'SAFEGUARD_BLOCKED'
  | 'UNKNOWN';

export interface T2000ErrorData {
  reason?: string;
  [key: string]: unknown;
}

export class T2000Error extends Error {
  readonly code: T2000ErrorCode;
  readonly data?: T2000ErrorData;
  readonly retryable: boolean;

  constructor(code: T2000ErrorCode, message: string, data?: T2000ErrorData, retryable = false) {
    super(message);
    this.name = 'T2000Error';
    this.code = code;
    this.data = data;
    this.retryable = retryable;
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      ...(this.data && { data: this.data }),
      retryable: this.retryable,
    };
  }
}

export function mapWalletError(error: unknown): T2000Error {
  const msg = error instanceof Error ? error.message : String(error);

  if (msg.includes('rejected') || msg.includes('cancelled')) {
    return new T2000Error('TRANSACTION_FAILED', 'Transaction cancelled');
  }
  if (msg.includes('Insufficient') || msg.includes('insufficient')) {
    return new T2000Error('INSUFFICIENT_BALANCE', 'Insufficient balance');
  }

  return new T2000Error('UNKNOWN', msg, undefined, true);
}

export function mapMoveAbortCode(code: number): string {
  const abortMessages: Record<number, string> = {
    1: 'Protocol is temporarily paused',
    2: 'Amount must be greater than zero',
    3: 'Invalid operation type',
    4: 'Fee rate exceeds maximum',
    5: 'Insufficient treasury balance',
    6: 'Not authorized',
    7: 'Package version mismatch — upgrade required',
    8: 'Timelock is active — wait for expiry',
    9: 'No pending change to execute',
    10: 'Already at current version',
    // NAVI Protocol abort codes
    1502: 'Oracle price is stale — try again in a moment',
    1503: 'Withdrawal amount is invalid (zero or dust) — try a specific amount instead of "all"',
    1600: 'Health factor too low — withdrawal would risk liquidation',
    1605: 'Asset borrowing is disabled or at capacity on this protocol',
    // Cetus DEX abort codes
    46001: 'Swap failed — the DEX pool rejected the trade (liquidity or routing issue). Try again.',
  };
  return abortMessages[code] ?? `Move abort code: ${code}`;
}

/**
 * Check if an error message contains a MoveAbort — these are on-chain
 * failures that will fail regardless of gas method, so retrying is pointless.
 */
export function isMoveAbort(msg: string): boolean {
  return msg.includes('MoveAbort') || msg.includes('MovePrimitiveRuntimeError');
}

export function parseMoveAbortMessage(msg: string): string {
  const abortMatch = msg.match(/abort code:\s*(\d+)/i) ?? msg.match(/MoveAbort[^,]*,\s*(\d+)/);
  if (abortMatch) {
    const code = parseInt(abortMatch[1], 10);
    const mapped = mapMoveAbortCode(code);
    if (mapped.startsWith('Move abort code:')) {
      const moduleMatch = msg.match(/in '([^']+)'/);
      if (moduleMatch) return `${mapped} (in ${moduleMatch[1]})`;
    }
    return mapped;
  }
  return msg;
}
