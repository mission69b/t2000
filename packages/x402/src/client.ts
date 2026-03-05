import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { T2000Error } from '@t2000/sdk';
import type {
  PaymentRequired,
  PaymentPayload,
  X402FetchOptions,
  PaymentDetails,
} from './types.js';
import {
  X402_HEADERS,
  DEFAULT_MAX_PRICE,
  DEFAULT_TIMEOUT,
} from './types.js';
import { buildPaymentTransaction } from './payment-kit.js';

/**
 * Parses the PAYMENT-REQUIRED header from a 402 response.
 * Validates network, asset, expiry, and price constraints.
 */
export function parsePaymentRequired(
  headerValue: string | null,
  maxPrice: number = DEFAULT_MAX_PRICE,
): PaymentRequired {
  if (!headerValue) {
    throw new T2000Error(
      'TRANSACTION_FAILED',
      '402 response missing PAYMENT-REQUIRED header',
    );
  }

  let parsed: PaymentRequired;
  try {
    parsed = JSON.parse(headerValue);
  } catch {
    throw new T2000Error(
      'TRANSACTION_FAILED',
      'Malformed PAYMENT-REQUIRED header: invalid JSON',
      { raw: headerValue },
    );
  }

  if (!parsed.network || !parsed.amount || !parsed.payTo || !parsed.nonce || parsed.expiresAt == null) {
    throw new T2000Error(
      'TRANSACTION_FAILED',
      'PAYMENT-REQUIRED header missing required fields',
      { parsed },
    );
  }

  if (parsed.network !== 'sui') {
    throw new T2000Error(
      'UNSUPPORTED_NETWORK',
      `x402 requires network "${parsed.network}" but only Sui is supported`,
      { network: parsed.network },
    );
  }

  if (parsed.asset && parsed.asset !== 'USDC') {
    throw new T2000Error(
      'TRANSACTION_FAILED',
      `x402 requires asset "${parsed.asset}" but only USDC is supported`,
      { asset: parsed.asset },
    );
  }

  if (parsed.expiresAt < Date.now() / 1000) {
    throw new T2000Error(
      'PAYMENT_EXPIRED',
      'x402 payment challenge has expired',
      { expiresAt: parsed.expiresAt },
    );
  }

  const price = Number(parsed.amount);
  if (price > maxPrice) {
    throw new T2000Error(
      'PRICE_EXCEEDS_LIMIT',
      `Requested price $${parsed.amount} exceeds max price $${maxPrice}`,
      { requested: parsed.amount, limit: maxPrice },
    );
  }

  return parsed;
}

export interface X402Wallet {
  client: SuiJsonRpcClient;
  keypair: Ed25519Keypair;
  address(): string;
  signAndExecute(tx: unknown): Promise<{ digest: string }>;
}

/**
 * x402 client for Sui. Handles the full 402 payment flow:
 * 1. Sends initial request
 * 2. Detects 402 Payment Required
 * 3. Parses payment terms
 * 4. Builds and executes Payment Kit PTB
 * 5. Retries with X-PAYMENT proof header
 */
export class x402Client {
  private wallet: X402Wallet;

  constructor(wallet: X402Wallet) {
    this.wallet = wallet;
  }

  /**
   * Makes an HTTP request, handling x402 payment if required.
   * Non-402 responses pass through unmodified.
   */
  async fetch(url: string, options: X402FetchOptions = {}): Promise<Response> {
    const {
      maxPrice = DEFAULT_MAX_PRICE,
      method = 'GET',
      headers = {},
      body,
      timeout = DEFAULT_TIMEOUT,
      dryRun = false,
      onPayment,
    } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const initial = await globalThis.fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      if (initial.status !== 402) {
        return initial;
      }

      const paymentRequired = parsePaymentRequired(
        initial.headers.get(X402_HEADERS.PAYMENT_REQUIRED),
        maxPrice,
      );

      if (dryRun) {
        return new Response(
          JSON.stringify({
            dryRun: true,
            amount: paymentRequired.amount,
            asset: paymentRequired.asset,
            payTo: paymentRequired.payTo,
            network: paymentRequired.network,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      const tx = await buildPaymentTransaction(
        this.wallet.client,
        this.wallet.address(),
        {
          nonce: paymentRequired.nonce,
          amount: paymentRequired.amount,
          payTo: paymentRequired.payTo,
        },
      );

      let result: { digest: string };
      try {
        result = await this.wallet.signAndExecute(tx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('EDuplicatePayment') || msg.includes('duplicate')) {
          throw new T2000Error(
            'DUPLICATE_PAYMENT',
            'Payment nonce already used on-chain',
            { nonce: paymentRequired.nonce },
          );
        }
        if (msg.includes('InsufficientCoinBalance') || msg.includes('Insufficient')) {
          throw new T2000Error(
            'INSUFFICIENT_BALANCE',
            'Not enough USDC to complete payment',
            { required: paymentRequired.amount },
          );
        }
        throw new T2000Error(
          'TRANSACTION_FAILED',
          `Payment transaction failed: ${msg}`,
          { nonce: paymentRequired.nonce },
        );
      }

      const paymentDetails: PaymentDetails = {
        amount: paymentRequired.amount,
        asset: paymentRequired.asset || 'USDC',
        payTo: paymentRequired.payTo,
        nonce: paymentRequired.nonce,
        txHash: result.digest,
      };

      onPayment?.(paymentDetails);

      const paymentPayload: PaymentPayload = {
        txHash: result.digest,
        network: 'sui',
        amount: paymentRequired.amount,
        nonce: paymentRequired.nonce,
      };

      const retry = await globalThis.fetch(url, {
        method,
        headers: {
          ...headers,
          [X402_HEADERS.X_PAYMENT]: JSON.stringify(paymentPayload),
        },
        body,
        signal: controller.signal,
      });

      return retry;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
