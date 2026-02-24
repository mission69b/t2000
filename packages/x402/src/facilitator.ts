import type { SuiClient, SuiEvent } from '@mysten/sui/client';
import { usdcToRaw } from '@t2000/sdk';
import type {
  VerifyRequest,
  VerifyResponse,
  VerifyFailureReason,
} from './types.js';
import { PAYMENT_KIT_MODULE } from './constants.js';

interface PaymentEventFields {
  amount: string;
  receiver: string;
  nonce: string;
  coin_type?: string;
  receipt_id?: string;
}

function isPaymentEvent(event: SuiEvent): boolean {
  return event.type.includes(`${PAYMENT_KIT_MODULE}::PaymentEvent`);
}

function parsePaymentEventFields(event: SuiEvent): PaymentEventFields | null {
  const json = event.parsedJson as Record<string, unknown> | undefined;
  if (!json) return null;

  return {
    amount: String(json.amount ?? ''),
    receiver: String(json.receiver ?? ''),
    nonce: String(json.nonce ?? ''),
    coin_type: json.coin_type ? String(json.coin_type) : undefined,
    receipt_id: json.receipt_id ? String(json.receipt_id) : undefined,
  };
}

/**
 * Verifies an x402 payment by checking the Sui transaction on-chain.
 *
 * Verification steps:
 * 1. Check if the challenge has expired
 * 2. Fetch the transaction from Sui RPC
 * 3. Find the PaymentEvent emitted by Payment Kit
 * 4. Validate amount, recipient, and nonce match the request
 *
 * Duplicate nonces are already prevented by Move's EDuplicatePayment.
 * This function only verifies payments that successfully landed on-chain.
 */
export async function verifyPayment(
  client: SuiClient,
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

  const paymentEvent = tx.events?.find(isPaymentEvent);
  if (!paymentEvent) {
    return { verified: false, reason: 'no_payment_event' };
  }

  const fields = parsePaymentEventFields(paymentEvent);
  if (!fields) {
    return { verified: false, reason: 'no_payment_event' };
  }

  const expectedAmount = usdcToRaw(Number(req.amount));
  if (BigInt(fields.amount) !== expectedAmount) {
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
    receiptId: fields.receipt_id,
  };
}
