import type { ClientWithCoreApi } from '@mysten/sui/client';
import type { Signer } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import {
  fromBase64,
  normalizeSuiAddress,
  toBase64,
  toHex,
} from '@mysten/sui/utils';
import type { Currency } from './constants.js';
import type { DigestStore, PaymentReport } from './store.js';
import { parseAmountToRaw, withRetry } from './utils.js';

// ---------------------------------------------------------------------------
// x402 dialect for the suimpp rail — scheme `exact` on network `sui:*`.
//
// Canonical design doc: t2000-internal `spec/active/SUIMPP_X402_SCHEME.md`
// (v0.3, APPROVED). The settlement rail is identical to the legacy digest
// dialect — a gasless stablecoin transfer (`0x2::balance::send_funds`,
// gasPrice = 0, no gas payment, protocol-level gasless). The ONLY change is
// choreography: the client SIGNS but does not submit; the server (gateway /
// facilitator) submits at serve time. This makes no-charge-on-failure
// structural and clients sign-only.
//
// Replay binding (on-chain): the stateless address-balance form requires
// `ValidDuring { minEpoch, maxEpoch, chain, nonce }` expiration — we derive
// the nonce from the challenge id, which cryptographically binds the signed
// payment to the specific 402 challenge and guarantees two same-amount
// payments in the same epoch produce distinct digests. The nonce carries
// UNIQUENESS, not secrecy (challenge ids are already unguessable HMAC
// outputs); replay safety = challenge-once + digest-once + the 1-epoch
// window, enforced server-side.
// ---------------------------------------------------------------------------

export const X402_SCHEME = 'exact' as const;
export const X402_VERSION = 1 as const;
/** Request header carrying the signed payment (x402 standard). */
export const X402_PAYMENT_HEADER = 'X-PAYMENT';
/** Response header carrying the settlement result (x402 standard). */
export const X402_PAYMENT_RESPONSE_HEADER = 'X-PAYMENT-RESPONSE';

/** The Sui framework package — the ONLY package a payment PTB may call. */
const FRAMEWORK_PACKAGE = normalizeSuiAddress('0x2');
/** `module::function` pairs that move funds to the recipient. */
const SEND_FUNDS_FNS = new Set(['balance::send_funds', 'coin::send_funds']);
/** Every `module::function` permitted in a payment PTB (the gasless trio). */
const ALLOWED_FNS = new Set([
  ...SEND_FUNDS_FNS,
  'balance::redeem_funds',
  'coin::redeem_funds',
  'balance::withdrawal_split',
  'coin::into_balance',
]);

export type X402Network =
  `sui:${'mainnet' | 'testnet' | 'devnet' | 'localnet'}`;

export interface X402Requirements {
  scheme: typeof X402_SCHEME;
  network: X402Network;
  /** Full Sui coin type of the payment asset. */
  asset: string;
  /** Atomic units (e.g. USDC 6dp) as a decimal string. */
  maxAmountRequired: string;
  payTo: string;
  resource: string;
  maxTimeoutSeconds: number;
  extra: {
    suimpp: {
      /** The mppx challenge id this payment must bind to (single-use). */
      challengeId: string;
      /** u32 derived from challengeId — goes into ValidDuring.nonce. */
      nonce: number;
      /** Chain identifier string for ValidDuring (genesis digest). */
      chain: string;
      minEpoch: string;
      maxEpoch: string;
    };
  };
}

// ---------------------------------------------------------------------------
// Escrow intent — the job-class extension (SPEC_A2A_ESCROW slice 2).
//
// Instant calls are settle-then-serve and need no escrow. Async deliverable
// work (reports, builds, SLA jobs) commits funds BEFORE delivery starts, so
// a job-class endpoint's 402 advertises escrow TERMS instead of a payment
// challenge: the buyer creates+funds a shared `a2a_escrow::escrow::Job`
// object on Sui (funds live in the object — no facilitator custody), then
// presents the Job object id as the X-PAYMENT credential. The seller
// verifies the object ON-CHAIN (funded, pays me, covers the price) before
// starting work — chain-verified, so it works for every signer including
// zkLogin. Settlement (deliver/release/reject/refund) happens on the object,
// not through this rail.
//
// Semantics: an accepts[] entry carrying `extra.escrow` is JOB-CLASS — the
// seller MUST refuse an instant signed-transfer X-PAYMENT against it, and
// clients MUST NOT pay it instantly (route through the escrow flow, e.g.
// `t2 job create`).
//
// This package carries only the surface t2000 consumes: the terms types +
// the two discriminators (isX402EscrowRequirements for client routing,
// isX402EscrowHeader for the seller-side refusal). The escrow-credential
// BUILDER helpers (createX402EscrowRequirements, encode/parse of the
// Job-object X-PAYMENT payload) had zero consumers here and stay published
// in @suimpp/mpp.
// ---------------------------------------------------------------------------

export interface X402EscrowTerms {
  /** Time the seller commits to deliver within, in ms from job creation. */
  deliverWithinMs: number;
  /** Buyer's accept/reject window after delivery, in ms. Lapse = release. */
  reviewWindowMs: number;
  /** Buyer's share in basis points if they reject (0–10000). Fixed at job
   *  creation — neither side can move the goalposts later. */
  rejectSplitBps: number;
  /** The escrow Move package the seller verifies jobs against
   *  (`a2a_escrow::escrow` on the advertised network). */
  packageId?: string;
  /** Optional pointer (URL or short note) describing the expected job-spec
   *  format the buyer should hash into the job's `spec_hash`. */
  specSchema?: string;
}

/** A job-class `accepts[]` entry. Same base fields as the instant entry
 *  (`maxAmountRequired` = the job price) but NO settlement challenge —
 *  `extra.escrow` replaces `extra.suimpp`. */
export interface X402EscrowRequirements {
  scheme: typeof X402_SCHEME;
  network: X402Network;
  asset: string;
  /** The job price in atomic units (decimal string). */
  maxAmountRequired: string;
  /** The seller wallet the Job must pay (and the claimed Agent ID wallet). */
  payTo: string;
  resource: string;
  maxTimeoutSeconds: number;
  extra: { escrow: X402EscrowTerms };
}

/** Discriminate a job-class entry inside a mixed accepts[] array. */
export function isX402EscrowRequirements(
  entry: unknown,
): entry is X402EscrowRequirements {
  return Boolean(
    entry &&
      typeof entry === 'object' &&
      typeof (entry as X402EscrowRequirements).extra?.escrow
        ?.deliverWithinMs === 'number',
  );
}

/** Discriminate escrow vs instant X-PAYMENT credentials without throwing —
 *  sellers serving both classes route on this before parsing. */
export function isX402EscrowHeader(headerValue: string): boolean {
  try {
    const parsed = JSON.parse(
      new TextDecoder().decode(fromBase64(headerValue)),
    );
    return typeof parsed?.payload?.jobId === 'string';
  } catch {
    return false;
  }
}

export interface X402PaymentPayload {
  x402Version: typeof X402_VERSION;
  scheme: typeof X402_SCHEME;
  network: X402Network;
  payload: {
    senderAddress: string;
    /** base64 BCS TransactionData — fully signed-ready bytes. */
    txBytes: string;
    /** Sender signature over txBytes (Ed25519 / secp / zkLogin). */
    senderSignature: string;
    challengeId: string;
  };
}

export interface X402SettleResponse {
  success: boolean;
  network: X402Network;
  /** Settled transaction digest. */
  transaction: string;
  payer: string;
}

/**
 * Derive the ValidDuring nonce (u32) from a challenge id. FNV-1a 32-bit —
 * dependency-free and browser-safe. The nonce provides per-challenge
 * UNIQUENESS (distinct digests for otherwise-identical payments); it is not
 * a secret and carries no security on its own.
 */
export function challengeNonce(challengeId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < challengeId.length; i++) {
    hash ^= challengeId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function x402Network(
  network: 'mainnet' | 'testnet' | 'devnet' | 'localnet',
): X402Network {
  return `sui:${network}`;
}

// ---------------------------------------------------------------------------
// Server half — build the `accepts[]` entry for a 402 response
// ---------------------------------------------------------------------------

export interface CreateRequirementsOptions {
  challengeId: string;
  /** Human-units amount string from the challenge (e.g. "0.02"). */
  amount: string;
  currency: Currency;
  recipient: string;
  resource: string;
  network: 'mainnet' | 'testnet' | 'devnet' | 'localnet';
  /** Chain identifier string (genesis digest) for ValidDuring. */
  chain: string;
  /** Current epoch — requirements are valid for [epoch, epoch + 1]. */
  currentEpoch: bigint | number | string;
  maxTimeoutSeconds?: number;
}

export function createX402Requirements(
  options: CreateRequirementsOptions,
): X402Requirements {
  const amountRaw = parseAmountToRaw(options.amount, options.currency.decimals);
  const minEpoch = BigInt(options.currentEpoch);
  return {
    scheme: X402_SCHEME,
    network: x402Network(options.network),
    asset: options.currency.type,
    maxAmountRequired: amountRaw.toString(),
    payTo: options.recipient,
    resource: options.resource,
    maxTimeoutSeconds: options.maxTimeoutSeconds ?? 60,
    extra: {
      suimpp: {
        challengeId: options.challengeId,
        nonce: challengeNonce(options.challengeId),
        chain: options.chain,
        minEpoch: minEpoch.toString(),
        maxEpoch: (minEpoch + 1n).toString(),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Client half — build + sign the payment WITHOUT submitting
// ---------------------------------------------------------------------------

export interface BuildSignedPaymentOptions {
  requirements: X402Requirements;
  signer: Signer;
  /**
   * Optional client for build-time resolution. The canonical stateless
   * shape (address-balance withdrawal → redeem_funds → send_funds) has no
   * object inputs, so the build is offline when omitted.
   */
  client?: ClientWithCoreApi;
}

/**
 * Build the canonical stateless payment transaction, sign it, and return the
 * `X-PAYMENT` header value + parsed payload. Never submits — settlement is
 * the server's job (`settleX402Payment`).
 */
export async function buildX402SignedPayment(
  options: BuildSignedPaymentOptions,
): Promise<{ header: string; payment: X402PaymentPayload }> {
  const { requirements, signer } = options;
  const { suimpp } = requirements.extra;
  const sender = signer.toSuiAddress();
  const amountRaw = BigInt(requirements.maxAmountRequired);

  const tx = new Transaction();
  tx.setSender(sender);

  const [balance] = tx.moveCall({
    target: '0x2::balance::redeem_funds',
    typeArguments: [requirements.asset],
    arguments: [tx.withdrawal({ amount: amountRaw, type: requirements.asset })],
  });
  tx.moveCall({
    target: '0x2::balance::send_funds',
    typeArguments: [requirements.asset],
    arguments: [balance, tx.pure.address(requirements.payTo)],
  });

  // Gasless stablecoin transfer: empty gas payment + zero price/budget.
  tx.setGasPrice(0);
  tx.setGasBudget(0);
  tx.setGasPayment([]);
  tx.setExpiration({
    ValidDuring: {
      minEpoch: suimpp.minEpoch,
      maxEpoch: suimpp.maxEpoch,
      minTimestamp: null,
      maxTimestamp: null,
      chain: suimpp.chain,
      nonce: suimpp.nonce,
    },
  });

  const bytes = options.client
    ? await tx.build({ client: options.client })
    : await tx.build();
  const { signature } = await signer.signTransaction(bytes);

  const payment: X402PaymentPayload = {
    x402Version: X402_VERSION,
    scheme: X402_SCHEME,
    network: requirements.network,
    payload: {
      senderAddress: sender,
      txBytes: toBase64(bytes),
      senderSignature: signature,
      challengeId: suimpp.challengeId,
    },
  };
  return { header: encodeX402Header(payment), payment };
}

export function encodeX402Header(payment: X402PaymentPayload): string {
  return toBase64(new TextEncoder().encode(JSON.stringify(payment)));
}

export function parseX402Header(headerValue: string): X402PaymentPayload {
  let parsed: X402PaymentPayload;
  try {
    parsed = JSON.parse(new TextDecoder().decode(fromBase64(headerValue)));
  } catch {
    throw new Error('[suimpp/x402] X-PAYMENT header is not base64 JSON');
  }
  if (parsed.scheme !== X402_SCHEME) {
    throw new Error(`[suimpp/x402] Unsupported scheme: ${parsed.scheme}`);
  }
  const p = parsed.payload;
  if (
    !p?.txBytes ||
    !p?.senderSignature ||
    !p?.challengeId ||
    !p?.senderAddress
  ) {
    throw new Error('[suimpp/x402] X-PAYMENT payload missing required fields');
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Server half — verify (pre-settle, structural) + settle (submit + confirm)
// ---------------------------------------------------------------------------

export interface VerifyX402Options {
  payment: X402PaymentPayload;
  /** The terms this payment must match (from the original challenge). */
  expected: {
    challengeId: string;
    amount: string;
    currency: Currency;
    recipient: string;
    network: 'mainnet' | 'testnet' | 'devnet' | 'localnet';
  };
}

/**
 * Structural pre-settle verification: the signed bytes must be the canonical
 * gasless payment for OUR terms before we relay them. Catches wrong-terms /
 * relay-abuse payloads without an RPC call.
 *
 * SCOPE (Phase 1): this is a STRUCTURAL check — it does NOT verify
 * `senderSignature`. Signature authority is the chain at `settleX402Payment`
 * (a bad signature fails `executeTransaction`, and under settle-then-serve
 * the upstream is never called), plus the post-settle balance-change check.
 * A standalone Phase-3 public `/verify` endpoint adds an explicit async
 * signature check (needs a client for zkLogin) on top of this.
 */
export function verifyX402Payment(options: VerifyX402Options): {
  txBytes: Uint8Array;
  nonce: number;
} {
  const { payment, expected } = options;

  if (payment.network !== x402Network(expected.network)) {
    throw new Error(`[suimpp/x402] Network mismatch: ${payment.network}`);
  }
  if (payment.payload.challengeId !== expected.challengeId) {
    throw new Error('[suimpp/x402] Payment is bound to a different challenge');
  }

  const txBytes = fromBase64(payment.payload.txBytes);
  const tx = Transaction.from(txBytes);
  const data = tx.getData();

  if (
    !data.sender ||
    normalizeSuiAddress(data.sender) !==
      normalizeSuiAddress(payment.payload.senderAddress)
  ) {
    throw new Error('[suimpp/x402] Transaction sender mismatch');
  }

  // Gasless shape: zero price, no gas payment objects.
  const gas = data.gasData;
  if (BigInt(gas.price ?? 1) !== 0n || (gas.payment?.length ?? 0) > 0) {
    throw new Error('[suimpp/x402] Transaction is not a gasless transfer');
  }

  // ValidDuring nonce = the on-chain challenge binding.
  const expiration = data.expiration;
  const validDuring =
    expiration && 'ValidDuring' in expiration ? expiration.ValidDuring : null;
  if (!validDuring) {
    throw new Error(
      '[suimpp/x402] Transaction must use ValidDuring expiration',
    );
  }
  const expectedNonce = challengeNonce(expected.challengeId);
  if (Number(validDuring.nonce) !== expectedNonce) {
    throw new Error(
      '[suimpp/x402] ValidDuring nonce does not bind to the challenge',
    );
  }

  // Command allowlist: only the gasless transfer trio on the FRAMEWORK
  // package (0x2) may appear, and at least one send_funds must pay the
  // expected recipient. The package check is load-bearing — a malicious
  // `0xEVIL::balance::send_funds` must NOT pass as `0x2::balance::send_funds`.
  const normalizedRecipient = normalizeSuiAddress(expected.recipient);
  let paysRecipient = false;
  for (const command of data.commands) {
    if (!('MoveCall' in command) || !command.MoveCall) {
      throw new Error('[suimpp/x402] Only MoveCall commands are permitted');
    }
    const call = command.MoveCall;
    const fn = `${call.module}::${call.function}`;
    if (normalizeSuiAddress(call.package) !== FRAMEWORK_PACKAGE) {
      throw new Error(
        `[suimpp/x402] Non-framework package call: ${call.package}::${fn}`,
      );
    }
    if (!ALLOWED_FNS.has(fn)) {
      throw new Error(`[suimpp/x402] Disallowed Move call: 0x2::${fn}`);
    }
    if (SEND_FUNDS_FNS.has(fn)) {
      const recipientArg = call.arguments[call.arguments.length - 1];
      if (
        recipientArg &&
        typeof recipientArg === 'object' &&
        'Input' in recipientArg
      ) {
        const input = data.inputs[recipientArg.Input as number];
        if (input && 'Pure' in input && input.Pure?.bytes) {
          const addr = `0x${toHex(fromBase64(input.Pure.bytes))}`;
          if (normalizeSuiAddress(addr) === normalizedRecipient) {
            paysRecipient = true;
          }
        }
      }
    }
  }
  if (!paysRecipient) {
    throw new Error(
      '[suimpp/x402] Transaction does not pay the expected recipient',
    );
  }

  return { txBytes, nonce: expectedNonce };
}

export interface SettleX402Options {
  payment: X402PaymentPayload;
  client: ClientWithCoreApi;
  /** Digest replay store — shared with the legacy dialect. */
  store: DigestStore;
  expected: VerifyX402Options['expected'];
  onPayment?: (report: PaymentReport) => void;
}

/**
 * Settle-then-serve: verify structurally, submit the client-signed bytes,
 * confirm the on-chain balance change, record the digest. Throws (and the
 * host returns 402) without serving if anything fails — and because the
 * host only calls the upstream AFTER this resolves, a failed upstream can
 * void/refund before any service value is lost.
 */
export async function settleX402Payment(
  options: SettleX402Options,
): Promise<X402SettleResponse> {
  const { payment, client, store, expected } = options;
  const { txBytes } = verifyX402Payment({ payment, expected });

  const result = await withRetry(
    () =>
      client.core.executeTransaction({
        transaction: txBytes,
        signatures: [payment.payload.senderSignature],
        include: { balanceChanges: true, transaction: true },
      }),
    { attempts: 3, baseDelayMs: 500 },
  );

  const resolved = result.Transaction ?? result.FailedTransaction;
  if (!resolved?.status.success) {
    throw new Error(
      `[suimpp/x402] Settlement failed on-chain: ${
        resolved?.status.error?.message ?? 'unknown'
      }`,
    );
  }

  const digest = resolved.digest;
  if (await store.has(digest)) {
    throw new Error(`[suimpp/x402] Digest already used: ${digest}`);
  }

  // Post-settle enforcement (same checks as the legacy dialect).
  const normalizedRecipient = normalizeSuiAddress(expected.recipient);
  const paid = resolved.balanceChanges.find(
    (bc) =>
      bc.coinType === expected.currency.type &&
      normalizeSuiAddress(bc.address) === normalizedRecipient &&
      BigInt(bc.amount) > 0n,
  );
  const requestedRaw = parseAmountToRaw(
    expected.amount,
    expected.currency.decimals,
  );
  if (!paid || BigInt(paid.amount) < requestedRaw) {
    throw new Error('[suimpp/x402] Settled amount does not satisfy the terms');
  }

  await store.set(digest);

  const report: PaymentReport = {
    digest,
    sender: payment.payload.senderAddress,
    recipient: expected.recipient,
    amount: expected.amount,
    currency: expected.currency.type,
    network: expected.network,
  };
  if (options.onPayment) {
    try {
      options.onPayment(report);
    } catch {}
  }

  return {
    success: true,
    network: payment.network,
    transaction: digest,
    payer: payment.payload.senderAddress,
  };
}

export function encodeX402Response(response: X402SettleResponse): string {
  return toBase64(new TextEncoder().encode(JSON.stringify(response)));
}
