export interface PaymentRequired {
  amount: string;
  asset: string;
  network: string;
  payTo: string;
  nonce: string;
  expiresAt: number;
  description?: string;
}

export interface PaymentPayload {
  txHash: string;
  network: string;
  amount: string;
  nonce: string;
}

export interface VerifyRequest {
  txHash: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  nonce: string;
  expiresAt: number;
}

export interface VerifyResponse {
  verified: boolean;
  txHash?: string;
  settledAmount?: string;
  settledAt?: number;
  receiptId?: string;
  reason?: VerifyFailureReason;
}

export type VerifyFailureReason =
  | 'expired'
  | 'tx_not_found'
  | 'no_payment_event'
  | 'amount_mismatch'
  | 'wrong_recipient'
  | 'nonce_mismatch';

export interface SettleRequest {
  txHash: string;
  nonce: string;
}

export interface SettleResponse {
  settled: boolean;
}

export interface X402ClientOptions {
  maxPrice?: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  dryRun?: boolean;
  onPayment?: (details: PaymentDetails) => void;
}

export interface PaymentDetails {
  amount: string;
  asset: string;
  payTo: string;
  nonce: string;
  txHash: string;
}

export type X402FetchOptions = X402ClientOptions;

export const X402_HEADERS = {
  PAYMENT_REQUIRED: 'payment-required',
  X_PAYMENT: 'x-payment',
} as const;

export const DEFAULT_MAX_PRICE = 1.0;
export const DEFAULT_TIMEOUT = 30_000;
