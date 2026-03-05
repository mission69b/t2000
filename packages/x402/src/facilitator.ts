import type { SuiJsonRpcClient, SuiEvent } from '@mysten/sui/jsonRpc';
import { usdcToRaw } from '@t2000/sdk';
import type {
  VerifyRequest,
  VerifyResponse,
  VerifyFailureReason,
} from './types.js';
import { PAYMENT_RECEIPT_EVENT_TYPE } from './constants.js';

interface PaymentReceiptFields {
  payment_amount: string;
  receiver: string;
  nonce: string;
  coin_type?: string;
  timestamp_ms?: string;
}

function isPaymentReceipt(event: SuiEvent): boolean {
  return event.type === PAYMENT_RECEIPT_EVENT_TYPE;
}

function parsePaymentReceiptFields(event: SuiEvent): PaymentReceiptFields | null {
  const json = event.parsedJson as Record<string, unknown> | undefined;
  if (!json) return null;

  return {
    payment_amount: String(json.payment_amount ?? ''),
    receiver: String(json.receiver ?? ''),
    nonce: String(json.nonce ?? ''),
    coin_type: json.coin_type ? String(json.coin_type) : undefined,
    timestamp_ms: json.timestamp_ms ? String(json.timestamp_ms) : undefined,
  };
}

/**
 * Verifies an x402 payment by checking the Sui transaction on-chain.
 *
 * Verification steps:
 * 1. Check if the challenge has expired
 * 2. Fetch the transaction from Sui RPC
 * 3. Find the PaymentReceipt event emitted by Payment Kit
 * 4. Validate amount, recipient, and nonce match the request
 *
 * Duplicate nonces are already prevented by Move's EDuplicatePayment.
 * This function only verifies payments that successfully landed on-chain.
 */
export async function verifyPayment(
  client: SuiJsonRpcClient,
  req: VerifyRequest,
): Promise<VerifyResponse> {
  if (Date.now() / 1000 > req.expiresAt) {
    return { verified: false, reason: 'expired' };
  }

  let tx;
  try {
    tx = await client.getTransactionBlock({
      digest: req.txHash,
      options: { showEffects: true, showEvents: true },
    });
  } catch {
    return { verified: false, reason: 'tx_not_found' };
  }

  if (!tx) {
    return { verified: false, reason: 'tx_not_found' };
  }

  const receiptEvent = tx.events?.find(isPaymentReceipt);
  if (!receiptEvent) {
    return { verified: false, reason: 'no_payment_event' };
  }

  const fields = parsePaymentReceiptFields(receiptEvent);
  if (!fields) {
    return { verified: false, reason: 'no_payment_event' };
  }

  const expectedAmount = usdcToRaw(Number(req.amount));
  if (BigInt(fields.payment_amount) !== expectedAmount) {
    return { verified: false, reason: 'amount_mismatch' };
  }

  if (fields.receiver !== req.payTo) {
    return { verified: false, reason: 'wrong_recipient' };
  }

  if (fields.nonce !== req.nonce) {
    return { verified: false, reason: 'nonce_mismatch' as VerifyFailureReason };
  }

  return {
    verified: true,
    txHash: req.txHash,
    settledAmount: req.amount,
    settledAt: Math.floor(Date.now() / 1000),
  };
}
