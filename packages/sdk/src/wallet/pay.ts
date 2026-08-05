import type { SuiGrpcClient } from '@mysten/sui/grpc';
import { fromBase64, normalizeSuiAddress } from '@mysten/sui/utils';
import type { X402Requirements } from '@t2000/sui-x402';
import type { TransactionSigner } from '../signer.js';
import type { PayOptions, PayResult } from '../types.js';
import { T2000Error } from '../errors.js';
import { reportX402Activity } from './activity-report.js';
import { executeTx } from './executeTx.js';
import {
  type PreflightResult,
  PREFLIGHT_OK,
  preflightFail,
  checkPositiveAmount,
} from '../preflight.js';

/**
 * Synchronous, network-free preflight for `pay` (x402 Service call). Validates
 * the target URL shape and the `maxPrice` ceiling when present — the cheap
 * checks the v3 host runs before dispatching the paid tool / showing the
 * tap-to-confirm card. Returns a `PreflightResult`; never throws. The probe +
 * 402 handshake + balance migration stay in `payWithX402` (network).
 */
export function preflightPay(input: { url: string; maxPrice?: number }): PreflightResult {
  if (typeof input.url !== 'string' || input.url.trim() === '') {
    return preflightFail('FACILITATOR_REJECTION', 'A target URL is required to pay');
  }
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return preflightFail('FACILITATOR_REJECTION', `Invalid URL: ${input.url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return preflightFail(
      'FACILITATOR_REJECTION',
      `URL must be http(s): got ${parsed.protocol}//`,
    );
  }
  // `maxPrice` is optional (no ceiling = pay whatever the 402 asks). Validate
  // only when the caller set one — a malformed ceiling is a fat-finger.
  if (input.maxPrice !== undefined) {
    const priceCheck = checkPositiveAmount(input.maxPrice, 'maxPrice');
    if (!priceCheck.valid) return priceCheck;
  }
  return PREFLIGHT_OK;
}

// ---------------------------------------------------------------------------
// payWithX402 — the SDK's single source of truth for the pay loop. Browser-safe
// (no fs / keyManager / SafeguardEnforcer), so the Audric client can run it
// in-browser on the zkLogin session key. `T2000.pay()` delegates here.
//
// ONE dialect: x402 `sui-exact` (SPEC_AGENT_PAYMENTS_X402 1.2; scheme =
// SUIMPP_X402_SCHEME.md v0.3, dialect SSOT = @t2000/sui-x402). The 402 body
// carries `accepts[]`; the client signs an authorization, the SERVER settles
// (settle-then-serve, so a failed upstream is never charged). The withdrawal
// form draws from the SIP-58 address balance, so coin-object funds are
// migrated in first when needed (S.414 finding).
//
// The MPP header dialect (WWW-Authenticate: Payment, client-broadcasts-then-
// retries with the digest) was REMOVED 2026-08-03 (S.880): it paid before
// the server proved it could deliver (a broken seller charges without
// serving — the JMPR class), zkLogin payers could never use it safely, and
// it was the SDK's last runtime tie to the retired suimpp header stack. A
// header-only 402 now fails closed with a typed error before any money
// moves. The `extra.suimpp` FIELD NAME on the wire is protocol SSOT and is
// unrelated to any package dependency.
// ---------------------------------------------------------------------------

/**
 * What a paid call WOULD cost, without paying (S.919). Every branch mirrors
 * a `payWithX402` outcome so the probe can never promise something the pay
 * path then refuses — one dialect story, not two.
 */
export type X402Probe =
  | { kind: 'free'; status: number; note: string }
  | {
      kind: 'payable';
      priceUsdc: number;
      asset: string;
      payTo: string;
      network: string;
    }
  | { kind: 'escrow'; priceUsdc: number; payTo: string; note: string }
  | { kind: 'unsupported'; reason: string; note: string }
  | { kind: 'incomplete'; reason: string; note: string }
  | { kind: 'not-x402'; status: number; note: string };

/**
 * READ-ONLY x402 probe: issue the same request `pay()` would, read the 402,
 * and report the terms. Never signs, never spends, never throws on a
 * non-payable answer — an unpayable endpoint is information, not a failure.
 * (Invalid input still throws, exactly as `pay()` would, so a caller can't
 * probe a URL that could never be paid.)
 */
export async function probeX402(args: {
  network: string;
  options: PayOptions;
}): Promise<X402Probe> {
  const { network } = args;
  const pf = preflightPay({ url: args.options.url, maxPrice: args.options.maxPrice });
  if (!pf.valid) throw new T2000Error(pf.code, pf.error);

  const { reqInit } = normalizePayRequest(args.options);
  const probe = await fetch(args.options.url, reqInit);
  if (probe.status !== 402) {
    return {
      kind: 'free',
      status: probe.status,
      note: 'No payment required — this endpoint served without a 402.',
    };
  }

  const pick = await pickSuiExactRequirements(probe, network);
  if (pick.kind === 'payable') {
    const requirements = pick.requirements;
    const priceUsdc = atomicToHuman(
      BigInt(requirements.maxAmountRequired),
      await assetDecimals(requirements.asset),
    );
    const { isX402EscrowRequirements } = await import('@t2000/sui-x402');
    if (isX402EscrowRequirements(requirements)) {
      return {
        kind: 'escrow',
        priceUsdc,
        payTo: requirements.payTo,
        note:
          'This endpoint sells deliverable work through on-chain escrow, not an instant call. ' +
          'Hire it as a job instead — funds lock in a Job object and release on delivery.',
      };
    }
    return {
      kind: 'payable',
      priceUsdc,
      asset: requirements.asset,
      payTo: requirements.payTo,
      network,
    };
  }

  if (hasPaymentAuthenticateHeader(probe)) {
    return {
      kind: 'unsupported',
      reason: 'header-only-402-unsupported',
      note:
        'This seller answered a header-only 402 (WWW-Authenticate: Payment) with no payable ' +
        'x402 accepts[] envelope. That dialect is no longer supported — the seller must offer ' +
        'x402 (e.g. @t2000/serve emits it).',
    };
  }
  if (pick.kind === 'incomplete') {
    return {
      kind: 'incomplete',
      reason: 'incomplete-x402-accepts',
      note:
        "Seller's x402 challenge is incomplete (missing extra.suimpp) — the 402 advertises an " +
        'exact/sui entry but carries no settlement challenge to bind a payment to.',
    };
  }
  return {
    kind: 'not-x402',
    status: probe.status,
    note:
      `Endpoint returned 402 without an x402 'exact' / sui:${network} requirement in the body. ` +
      'Nothing this SDK can pay.',
  };
}

/**
 * Shared request shaping for probe + pay so both legs send the SAME bytes —
 * a probe that differed from the paid retry would report the wrong price.
 */
function normalizePayRequest(input: PayOptions): {
  options: PayOptions;
  reqInit: RequestInit;
} {
  let options = input;
  const method = (options.method ?? 'GET').toUpperCase();
  const canHaveBody = method !== 'GET' && method !== 'HEAD';

  // Default `content-type: application/json` when the body IS JSON and the
  // caller didn't say otherwise. Without it, fetch stamps `text/plain` and
  // strict servers (FastAPI et al.) receive the body as a string — a 422
  // before the 402 ever fires (live finding vs JMPR, the first external
  // seller). Every retry below reads from the normalized `options`.
  if (
    canHaveBody &&
    typeof options.body === 'string' &&
    isJsonText(options.body) &&
    !hasContentType(options.headers)
  ) {
    options = {
      ...options,
      headers: { ...(options.headers ?? {}), 'content-type': 'application/json' },
    };
  }

  return {
    options,
    reqInit: {
      method,
      headers: options.headers,
      body: canHaveBody ? options.body : undefined,
    },
  };
}

export async function payWithX402(args: {
  signer: TransactionSigner;
  client: SuiGrpcClient;
  options: PayOptions;
}): Promise<PayResult> {
  const { signer, client } = args;
  let options = args.options;

  // Layer 2 — cheap synchronous preflight (URL shape + maxPrice sanity) before
  // any network round-trip. Rethrow the precise code+message verbatim.
  const pf = preflightPay({ url: options.url, maxPrice: options.maxPrice });
  if (!pf.valid) throw new T2000Error(pf.code, pf.error);

  // Shared with `probeX402` (S.919) so both legs send identical bytes.
  const normalized = normalizePayRequest(options);
  options = normalized.options;
  const reqInit = normalized.reqInit;

  // Probe (no payment). A paid endpoint answers 402; a free/cached one serves.
  const probe = await fetch(options.url, reqInit);
  if (probe.status !== 402) {
    return finalize(probe, { paid: false });
  }

  const pick = await pickSuiExactRequirements(probe, client.network);
  if (pick.kind === 'payable') {
    const requirements = pick.requirements;
    // Job-class (escrow-intent) 402 — SPEC_A2A_ESCROW slice 2. The entry
    // advertises escrow TERMS, not an instant settlement challenge: paying
    // it with a signed transfer would move money with no delivery contract.
    // Fail closed and route the caller to the escrow flow.
    const { isX402EscrowRequirements } = await import('@t2000/sui-x402');
    if (isX402EscrowRequirements(requirements)) {
      const escrow = requirements.extra.escrow;
      const price = atomicToHuman(
        BigInt(requirements.maxAmountRequired),
        await assetDecimals(requirements.asset),
      );
      throw new T2000Error(
        'ESCROW_REQUIRED',
        'This endpoint sells deliverable work through on-chain escrow, not an instant call. ' +
          `Create a job instead: t2 job create ${price} ${requirements.payTo} --spec <your-brief> ` +
          '— funds lock in a Job object and release on delivery. No payment was made.',
        { payTo: requirements.payTo, priceUsdc: price, escrow },
      );
    }
    // Self-payment guard: a transfer to yourself executes but nets a ZERO
    // balance change, so the seller's settle check refuses to serve AFTER
    // the on-chain leg ran (founder buying from his own seller wallet,
    // 2026-07-20). Fail closed before anything is signed.
    assertNotSelfPayment(signer.getAddress(), requirements.payTo);
    const result = await payViaX402({ signer, client, options, reqInit, requirements });
    return result;
  }

  // No PAYABLE x402 envelope — fail CLOSED, always, before any money moves.
  // A header-only 402 (`WWW-Authenticate: Payment …`, no x402 accepts[]) is
  // deliberately unsupported: that dialect paid client-side BEFORE the
  // server proved it could deliver. Name it precisely so sellers know the
  // fix is emitting the x402 envelope (e.g. via @t2000/serve).
  if (hasPaymentAuthenticateHeader(probe)) {
    throw new T2000Error(
      'DIALECT_UNSUPPORTED',
      'This seller answered a header-only 402 (WWW-Authenticate: Payment) with no payable ' +
        'x402 accepts[] envelope. The MPP header dialect is no longer supported — it charged ' +
        'before the seller proved it could deliver. No payment was made. The seller must ' +
        'offer x402 (e.g. @t2000/serve emits it).',
      { dialect: 'mpp-header', reason: 'header-only-402-unsupported' },
    );
  }

  if (pick.kind === 'incomplete') {
    throw new T2000Error(
      'FACILITATOR_REJECTION',
      "Seller's x402 challenge is incomplete (missing extra.suimpp) — nothing was paid. " +
        'The 402 advertises an exact/sui entry but carries no settlement challenge to bind ' +
        'a payment to; the seller must emit the createX402Requirements shape to be x402-payable.',
      { reason: 'incomplete-x402-accepts' },
    );
  }
  throw new T2000Error(
    'FACILITATOR_REJECTION',
    `Endpoint returned 402 without an x402 'exact' / sui:${client.network} requirement in the body ` +
      `or an MPP 'sui' challenge in WWW-Authenticate. Nothing this SDK can pay.`,
  );
}

// ---------------------------------------------------------------------------
// x402 `sui-exact` — sign-then-settle
// ---------------------------------------------------------------------------

/** True when an `accepts[]` entry carries the COMPLETE instant-settlement
 *  challenge — `extra.suimpp` exactly as `createX402Requirements` emits it.
 *  A bare `exact`/`sui:mainnet` entry WITHOUT it is decorative: there is no
 *  challenge to bind a payment to, and `buildX402SignedPayment` would crash
 *  destructuring `extra.suimpp` (live: JMPR × Audric, 2026-07-27). */
function hasCompleteSuimppChallenge(entry: X402Requirements): boolean {
  const s = (entry as { extra?: { suimpp?: Record<string, unknown> } }).extra?.suimpp;
  return (
    !!s &&
    typeof s.challengeId === 'string' &&
    s.challengeId.length > 0 &&
    typeof s.nonce === 'number' &&
    typeof s.chain === 'string' &&
    s.chain.length > 0 &&
    typeof s.minEpoch === 'string' &&
    typeof s.maxEpoch === 'string'
  );
}

type SuiExactPick =
  /** Complete instant challenge OR job-class escrow entry — safe to act on. */
  | { kind: 'payable'; requirements: X402Requirements }
  /** An `exact`/`sui:<network>` entry exists but is INCOMPLETE (no usable
   *  `extra.suimpp`, no escrow terms) — never x402-payable; the caller
   *  fails closed with a typed error. */
  | { kind: 'incomplete' }
  | { kind: 'none' };

async function pickSuiExactRequirements(response: Response, network: string): Promise<SuiExactPick> {
  try {
    const body = (await response.clone().json()) as { accepts?: X402Requirements[] };
    const want = `sui:${network === 'testnet' ? 'testnet' : 'mainnet'}`;
    const entry = body.accepts?.find((a) => a.scheme === 'exact' && a.network === want);
    if (!entry) return { kind: 'none' };
    const { isX402EscrowRequirements } = await import('@t2000/sui-x402');
    if (hasCompleteSuimppChallenge(entry) || isX402EscrowRequirements(entry)) {
      return { kind: 'payable', requirements: entry };
    }
    return { kind: 'incomplete' };
  } catch {
    return { kind: 'none' };
  }
}

async function payViaX402(args: {
  signer: TransactionSigner;
  client: SuiGrpcClient;
  options: PayOptions;
  reqInit: RequestInit;
  requirements: X402Requirements;
}): Promise<PayResult> {
  const { signer, client, options, reqInit, requirements } = args;
  // Belt to pickSuiExactRequirements' suspenders: buildX402SignedPayment
  // destructures `requirements.extra.suimpp` — an incomplete entry reaching
  // this far must fail as a typed error, never a raw TypeError in chat.
  if (!hasCompleteSuimppChallenge(requirements)) {
    throw new T2000Error(
      'FACILITATOR_REJECTION',
      "Seller's x402 challenge is incomplete (missing extra.suimpp) — nothing was paid.",
      { reason: 'incomplete-x402-accepts' },
    );
  }
  const { buildX402SignedPayment, X402_PAYMENT_HEADER, X402_PAYMENT_RESPONSE_HEADER } = await import(
    '@t2000/sui-x402'
  );

  const amountRaw = BigInt(requirements.maxAmountRequired);
  assertWithinMaxPrice(atomicToHuman(amountRaw, await assetDecimals(requirements.asset)), options.maxPrice);

  // The x402 withdrawal form spends ONLY the SIP-58 address balance. A wallet
  // funded by ordinary coin transfers (or swap output) holds Coin<USDC>
  // objects → migrate enough in first (S.414 finding; SUIMPP_X402_SCHEME §4).
  const migrationGasSui = await ensureAddressBalanceCovers({
    signer,
    client,
    asset: requirements.asset,
    amountRaw,
  });

  // Build + sign — NEVER submitted client-side; the gateway settles. The
  // builder only reads toSuiAddress() + signTransaction(), both of which every
  // TransactionSigner (keypair AND zkLogin) provides.
  const signerAdapter = {
    toSuiAddress: () => signer.getAddress(),
    signTransaction: (bytes: Uint8Array) => signer.signTransaction(bytes),
  } as unknown as Parameters<typeof buildX402SignedPayment>[0]['signer'];

  const { header } = await buildX402SignedPayment({ requirements, signer: signerAdapter });

  const res = await fetch(options.url, {
    ...reqInit,
    headers: { ...(options.headers ?? {}), [X402_PAYMENT_HEADER]: header },
  });

  // Settled iff the gateway returned the x402 receipt header.
  const settleHeader = res.headers.get(X402_PAYMENT_RESPONSE_HEADER);
  const paid = !!settleHeader;
  let digest: string | undefined;
  if (settleHeader) {
    try {
      digest = (JSON.parse(new TextDecoder().decode(fromBase64(settleHeader))) as { transaction?: string })
        .transaction;
    } catch {
      digest = undefined;
    }
  }

  const result = await finalize(res, { paid });
  if (!paid) return { ...result, dialect: 'x402' };

  // B2: attributed activity report — settled payments only, fire-and-forget
  // (the endpoint chain-verifies the digest; a dead report changes nothing).
  if (digest && options.activityReport !== false) {
    const report = options.activityReport || {};
    reportX402Activity(
      {
        digest,
        payTo: requirements.payTo,
        payer: signer.getAddress(),
        amountMicroUsdc: Number(amountRaw),
        network: requirements.network,
        route: options.url,
        source: report.source ?? 'pay',
      },
      report.url,
    );
  }

  return {
    ...result,
    dialect: 'x402',
    cost: atomicToHuman(amountRaw, await assetDecimals(requirements.asset)),
    gasCostSui: migrationGasSui,
    receipt: digest
      ? { reference: digest, timestamp: new Date().toISOString() }
      : result.receipt,
  };
}

/** Throw when the 402's payTo IS the payer — a self-transfer executes but
 * nets a zero balance change, so an x402 seller's settle check refuses to
 * serve after the on-chain leg already ran (and a header-dialect seller
 * charges without serving). Sellers testing their own endpoint must use a
 * different wallet. */
function assertNotSelfPayment(payer: string, payTo: string): void {
  if (normalizeSuiAddress(payer) === normalizeSuiAddress(payTo)) {
    throw new T2000Error(
      'FACILITATOR_REJECTION',
      'This endpoint pays YOUR OWN wallet — a self-payment nets a zero balance change, ' +
        'so the seller will not serve it. Nothing was paid. Test your endpoint from a ' +
        'different wallet (e.g. the t2 CLI wallet).',
      { payer, payTo },
    );
  }
}

/** Throw `PRICE_EXCEEDS_LIMIT` when the challenge price exceeds the caller's
 * `maxPrice` ceiling (no ceiling = pay whatever the 402 asks). */
function assertWithinMaxPrice(price: number, maxPrice: number | undefined): void {
  if (maxPrice !== undefined && price > maxPrice) {
    throw new T2000Error(
      'PRICE_EXCEEDS_LIMIT',
      `Service price $${price} exceeds maxPrice ceiling $${maxPrice}`,
      { price, maxPrice },
    );
  }
}

/**
 * Ensure the sender's SIP-58 address balance covers `amountRaw` of `asset`.
 * Returns the SUI gas spent migrating (0 when no migration was needed or the
 * migration was gasless). Throws `INSUFFICIENT_BALANCE` when the wallet
 * doesn't hold enough of the asset at all (coins + address balance combined).
 */
async function ensureAddressBalanceCovers(args: {
  signer: TransactionSigner;
  client: SuiGrpcClient;
  asset: string;
  amountRaw: bigint;
}): Promise<number> {
  const { signer, client, asset, amountRaw } = args;
  const owner = signer.getAddress();

  // total = coins + address balance (the canonical combined read)
  const balanceResp = await client.core.getBalance({ owner, coinType: asset });
  const total = BigInt(balanceResp.balance.balance);
  if (total < amountRaw) {
    throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient ${asset} to pay`, {
      available: total.toString(),
      required: amountRaw.toString(),
    });
  }

  // address balance = total − discrete coin-object sum (listCoins excludes AB).
  // Collect the coin objects too — we reuse them to build the migration.
  const coins: { objectId: string; balance: bigint }[] = [];
  let coinSum = 0n;
  let cursor: string | null | undefined;
  let hasNext = true;
  while (hasNext) {
    const page = await client.core.listCoins({ owner, coinType: asset, cursor: cursor ?? undefined });
    for (const c of page.objects) {
      coins.push({ objectId: c.objectId, balance: BigInt(c.balance) });
      coinSum += BigInt(c.balance);
    }
    cursor = page.cursor;
    hasNext = page.hasNextPage;
  }
  const addressBalance = total - coinSum;
  if (addressBalance >= amountRaw) return 0; // address balance already covers it

  // Move the shortfall from coin objects into the address balance by sending
  // WHOLE coin objects to self via `0x2::coin::send_funds` — one allowlisted
  // framework MoveCall per coin, NO native merge/split. Built on the gRPC
  // client so its resolver detects the all-allowlisted-MoveCall shape and zeros
  // gas: the migration itself is gasless (the same eligibility the x402
  // withdrawal + the gasless send rely on). The old merge+split+send shape had
  // native `SplitCoins`/`MergeCoins` commands → fell outside the allowlist →
  // forced SUI gas, breaking coin-object holders with 0 SUI.
  const shortfall = amountRaw - addressBalance;
  const { buildCoinToAddressBalanceMigration } = await import('./coinSelection.js');
  const grpcClient = await makeGrpcBuildClient(client);
  const { tx } = buildCoinToAddressBalanceMigration({ coins, coinType: asset, owner, minAmount: shortfall });
  const migration = await executeTx(client, signer, () => tx, { buildClient: grpcClient });
  return migration.gasCostSui;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** True when the 402 carries an MPP `WWW-Authenticate: Payment …` challenge
 *  — recognized ONLY to name the unsupported dialect in the error; never
 *  parsed, never paid. */
function hasPaymentAuthenticateHeader(response: Response): boolean {
  const header = response.headers.get('www-authenticate') ?? '';
  return /(^|,)\s*Payment[\s,]/i.test(`${header},`);
}

/** Cheap "is this JSON?" check — parse, don't guess from the first char. */
function isJsonText(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Case-insensitive content-type presence check on a plain header record. */
function hasContentType(headers: Record<string, string> | undefined): boolean {
  if (!headers) return false;
  return Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
}

/** Read the response body (json or text) and assemble the base PayResult. */
async function finalize(response: Response, opts: { paid: boolean }): Promise<PayResult> {
  const contentType = response.headers.get('content-type') ?? '';
  let body: unknown;
  try {
    body = contentType.includes('application/json') ? await response.json() : await response.text();
  } catch {
    body = null;
  }
  return { status: response.status, body, paid: opts.paid };
}

/** A gRPC client for tx BUILD — its resolver auto-detects the gasless
 * stablecoin shape (gasPrice/gasBudget/gasPayment zeroed). */
async function makeGrpcBuildClient(client: SuiGrpcClient): Promise<SuiGrpcClient> {
  const { SuiGrpcClient } = await import('@mysten/sui/grpc');
  const network: 'mainnet' | 'testnet' = client.network === 'testnet' ? 'testnet' : 'mainnet';
  const baseUrl =
    network === 'testnet' ? 'https://fullnode.testnet.sui.io' : 'https://fullnode.mainnet.sui.io';
  return new SuiGrpcClient({ baseUrl, network });
}

function atomicToHuman(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

async function assetDecimals(coinType: string): Promise<number> {
  try {
    const { getDecimalsForCoinType } = await import('../token-registry.js');
    const d = getDecimalsForCoinType(coinType);
    return typeof d === 'number' ? d : 6;
  } catch {
    return 6;
  }
}
