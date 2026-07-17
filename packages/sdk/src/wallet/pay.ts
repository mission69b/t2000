import type { SuiGrpcClient } from '@mysten/sui/grpc';
import { fromBase64 } from '@mysten/sui/utils';
import type { X402Requirements } from '@suimpp/mpp/x402';
import type { TransactionSigner } from '../signer.js';
import type { PayOptions, PayResult } from '../types.js';
import { T2000Error } from '../errors.js';
import { parseChallengeAmount } from '../mpp-cost.js';
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
 * 402 handshake + balance migration stay in `payWithMpp` (network).
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
// payWithMpp — the SDK's single source of truth for the pay loop. Browser-safe
// (no fs / keyManager / SafeguardEnforcer), so the Audric client can run it
// in-browser on the zkLogin session key. `T2000.pay()` delegates here.
//
// TWO dialects, ONE preference order (both ride the SAME gasless
// `send_funds<USDC>` rail; the only difference is who submits):
//
// 1. x402 `sui-exact` (preferred — SPEC_AGENT_PAYMENTS_X402 1.2; scheme =
//    SUIMPP_X402_SCHEME.md v0.3): the 402 body carries `accepts[]`; the
//    client signs an authorization, the SERVER settles (settle-then-serve,
//    so a failed upstream is never charged). The withdrawal form draws from
//    the SIP-58 address balance, so coin-object funds are migrated in first
//    when needed (S.414 finding).
//
// 2. MPP header dialect (fallback — suimpp.dev/spec): the 402 carries only a
//    `WWW-Authenticate: Payment … method="sui"` challenge, no x402 body. The
//    CLIENT broadcasts the gasless USDC transfer and retries with the digest
//    credential. S.452 retired this path assuming all sellers were our
//    gateway (which dual-serves); the first EXTERNAL seller (JMPR, S.453)
//    shipped header-only — the client must speak everything the gateway and
//    suimpp spec serve, so the fallback is back. Trade-off vs x402: the
//    client pays BEFORE the server proves it can deliver, so a broken seller
//    can charge without serving — x402 stays preferred whenever offered.
// ---------------------------------------------------------------------------

export async function payWithMpp(args: {
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

  const reqInit: RequestInit = {
    method,
    headers: options.headers,
    body: canHaveBody ? options.body : undefined,
  };

  // Probe (no payment). A paid endpoint answers 402; a free/cached one serves.
  const probe = await fetch(options.url, reqInit);
  if (probe.status !== 402) {
    return finalize(probe, { paid: false });
  }

  const requirements = await pickSuiExactRequirements(probe, client.network);
  if (requirements) {
    // Job-class (escrow-intent) 402 — SPEC_A2A_ESCROW slice 2. The entry
    // advertises escrow TERMS, not an instant settlement challenge: paying
    // it with a signed transfer would move money with no delivery contract.
    // Fail closed and route the caller to the escrow flow.
    const { isX402EscrowRequirements } = await import('@suimpp/mpp/x402');
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
    const result = await payViaX402({ signer, client, options, reqInit, requirements });
    await reportDirectPayment(result, options.url);
    return result;
  }

  // No x402 envelope — fall back to the MPP header dialect when the 402
  // advertises a `sui` method challenge.
  const headerChallenge = await parseMppSuiChallenge(probe);
  if (headerChallenge) {
    // Fail CLOSED before any money moves: the header dialect pays first and
    // proves identity with a personal-message signature the SELLER verifies.
    // zkLogin signatures are ZK constructs external sellers can't check —
    // the payment settles on-chain, then the retry 402s and the buyer ate
    // the charge (live: JMPR × Audric Passport, 2026-07-17). x402 is immune
    // (the tx itself carries the zkLogin sig; the CHAIN verifies it), so
    // zkLogin payers require sellers that offer x402.
    if (signer.kind === 'zklogin') {
      throw new T2000Error(
        'DIALECT_UNSUPPORTED',
        'This seller only offers the MPP header dialect, which zkLogin (Passport) wallets ' +
          'cannot safely pay: the seller cannot verify zkLogin signatures, so the payment ' +
          'would settle on-chain without the service delivering. No payment was made. ' +
          'Use an x402-capable service, or pay from a keypair wallet (t2 CLI / MCP).',
        { dialect: 'mpp-header', signerKind: 'zklogin' },
      );
    }
    const result = await payViaMppHeader({ signer, client, options });
    await reportDirectPayment(result, options.url);
    return result;
  }

  throw new T2000Error(
    'FACILITATOR_REJECTION',
    `Endpoint returned 402 without an x402 'exact' / sui:${client.network} requirement in the body ` +
      `or an MPP 'sui' challenge in WWW-Authenticate. Nothing this SDK can pay.`,
  );
}

// ---------------------------------------------------------------------------
// Direct-seller activity reporting (S.743). Gateway-proxied payments are
// logged server-side by the gateway itself; DIRECT payments (catalog
// federation — seller's own origin) never touch it, leaving the activity
// feed blind. After a paid call to a non-gateway origin, tell the gateway
// "look at this digest for this url" — it verifies on-chain (USDC inflow to
// the cataloged seller's pinned payTo) before recording, so the report
// carries no trusted data. Best-effort by construction: timeout-capped and
// error-swallowed, a lost report never fails or delays the payment. Awaited
// (not fire-and-forget) so short-lived CLI processes don't drop it on exit.
// ---------------------------------------------------------------------------

const MPP_REPORT_URL = 'https://mpp.t2000.ai/api/mpp/report';
const REPORT_TIMEOUT_MS = 2_000;

async function reportDirectPayment(result: PayResult, url: string): Promise<void> {
  if (!result.paid || !result.receipt?.reference) return;
  try {
    if (new URL(url).origin === new URL(MPP_REPORT_URL).origin) return;
    await fetch(MPP_REPORT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ digest: result.receipt.reference, url }),
      signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
    });
  } catch {
    // Best-effort: the payment already succeeded; the feed row is analytics.
  }
}

/**
 * Parse the MPP header dialect from a 402 response: the
 * `WWW-Authenticate: Payment …` challenge(s), looking for `method="sui"`.
 * Returns the decoded `{ amount, currency, recipient }` request (amount is a
 * decimal string, e.g. "0.02") or `undefined` when the response carries no
 * sui challenge. Exported for the CLI's `t2 pay --estimate`.
 */
export async function parseMppSuiChallenge(
  response: Response,
): Promise<{ amount: string; currency: string; recipient: string; description?: string } | undefined> {
  try {
    const { Challenge } = await import('mppx');
    const challenges = Challenge.fromResponseList(response);
    const suiChallenge = challenges.find((c) => c.method === 'sui' && c.intent === 'charge');
    if (!suiChallenge) return undefined;
    const req = suiChallenge.request as Record<string, unknown>;
    if (typeof req?.amount !== 'string' || typeof req?.recipient !== 'string') return undefined;
    return {
      amount: req.amount,
      currency: typeof req.currency === 'string' ? req.currency : '',
      recipient: req.recipient,
      description: suiChallenge.description,
    };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// x402 `sui-exact` — sign-then-settle
// ---------------------------------------------------------------------------

async function pickSuiExactRequirements(
  response: Response,
  network: string,
): Promise<X402Requirements | undefined> {
  try {
    const body = (await response.clone().json()) as { accepts?: X402Requirements[] };
    const want = `sui:${network === 'testnet' ? 'testnet' : 'mainnet'}`;
    return body.accepts?.find((a) => a.scheme === 'exact' && a.network === want);
  } catch {
    return undefined;
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
  const { buildX402SignedPayment, X402_PAYMENT_HEADER, X402_PAYMENT_RESPONSE_HEADER } = await import(
    '@suimpp/mpp/x402'
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

// ---------------------------------------------------------------------------
// MPP header dialect — client broadcasts, retries with the digest credential.
// The pre-S.452 `payViaLegacy`, restored (S.453) for header-only external
// sellers. mppx's client handles the 402 → pay → retry loop; we plug in the
// Sui charge method with an `execute` override that routes the on-chain leg
// through `executeTx` (gRPC build → gasless resolver → the same
// `send_funds<USDC>` rail as x402).
// ---------------------------------------------------------------------------

async function payViaMppHeader(args: {
  signer: TransactionSigner;
  client: SuiGrpcClient;
  options: PayOptions;
}): Promise<PayResult> {
  const { signer, client, options } = args;

  const { Mppx } = await import('mppx/client');
  const { sui, USDC, USDC_TESTNET } = await import('@suimpp/mpp/client');

  const signerAddress = signer.getAddress();
  const network: 'mainnet' | 'testnet' = client.network === 'testnet' ? 'testnet' : 'mainnet';
  const grpcClient = await makeGrpcBuildClient(client);

  let paymentDigest: string | undefined;
  let gasCostSui = 0;
  // The real amount charged on-chain is the 402 challenge price (a decimal
  // USDC string like "0.01"), NOT the caller's `maxPrice` ceiling (Bug 1,
  // dogfood 2026-05-31). Capture it in `onChallenge` — and enforce the
  // ceiling THERE, before any credential is created: the header dialect pays
  // client-side, so this hook is the last stop before money moves.
  let chargedAmount: number | undefined;

  const mppx = Mppx.create({
    polyfill: false,
    onChallenge: async (challenge: { request?: { amount?: unknown } }) => {
      const parsed = parseChallengeAmount(challenge);
      if (parsed !== undefined) {
        chargedAmount = parsed;
        assertWithinMaxPrice(parsed, options.maxPrice);
      }
      return undefined;
    },
    methods: [
      sui({
        client,
        currency: network === 'testnet' ? USDC_TESTNET : USDC,
        signer: {
          toSuiAddress: () => signerAddress,
          signPersonalMessage: (bytes: Uint8Array) => signer.signPersonalMessage(bytes),
        } as unknown as Parameters<typeof sui>[0]['signer'],
        execute: async (tx) => {
          const result = await executeTx(client, signer, () => tx, { buildClient: grpcClient });
          paymentDigest = result.digest;
          gasCostSui = result.gasCostSui;
          return { digest: result.digest };
        },
      }),
    ],
  });

  const method = (options.method ?? 'GET').toUpperCase();
  const canHaveBody = method !== 'GET' && method !== 'HEAD';

  const response = await mppx.fetch(options.url, {
    method,
    headers: options.headers,
    body: canHaveBody ? options.body : undefined,
  });

  const paid = !!paymentDigest;
  const result = await finalize(response, { paid });
  if (!paid) return { ...result, dialect: 'legacy' };
  return {
    ...result,
    dialect: 'legacy',
    cost: chargedAmount ?? options.maxPrice ?? undefined,
    gasCostSui,
    receipt: paymentDigest
      ? { reference: paymentDigest, timestamp: new Date().toISOString() }
      : undefined,
  };
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
