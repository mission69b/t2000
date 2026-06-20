import type { SuiGrpcClient } from '@mysten/sui/grpc';
import { fromBase64 } from '@mysten/sui/utils';
import type { X402Requirements } from '@suimpp/mpp/x402';
import type { TransactionSigner } from '../signer.js';
import type { PayOptions, PayResult } from '../types.js';
import { T2000Error } from '../errors.js';
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
// x402 `sui-exact`, ONE path (SPEC_AGENT_PAYMENTS_X402 1.2; scheme =
// SUIMPP_X402_SCHEME.md v0.3). The flow: sign an authorization, the gateway
// settles. The legacy MPP "digest dialect" (client broadcasts, retries with
// the tx digest) was retired from the SDK — the gateway dual-serves both for
// installed pre-x402 CLIs, so the SDK client doesn't need a fallback. Both
// dialects always rode the SAME gasless `send_funds<USDC>` rail; the only
// difference was who submits, and x402 is now the only one we speak.
//
// Settlement: the withdrawal form draws from the SIP-58 address balance (the
// canonical stateless, offline-signable shape), so coin-object funds are
// migrated in first when needed (S.414 finding). The client only SIGNS — the
// gateway submits (settle-then-serve), so a failed upstream is never charged.
// ---------------------------------------------------------------------------

export async function payWithMpp(args: {
  signer: TransactionSigner;
  client: SuiGrpcClient;
  options: PayOptions;
}): Promise<PayResult> {
  const { signer, client, options } = args;

  // Layer 2 — cheap synchronous preflight (URL shape + maxPrice sanity) before
  // any network round-trip. Rethrow the precise code+message verbatim.
  const pf = preflightPay({ url: options.url, maxPrice: options.maxPrice });
  if (!pf.valid) throw new T2000Error(pf.code, pf.error);

  const method = (options.method ?? 'GET').toUpperCase();
  const canHaveBody = method !== 'GET' && method !== 'HEAD';
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
  if (!requirements) {
    throw new T2000Error(
      'FACILITATOR_REJECTION',
      `Endpoint returned 402 without an x402 'exact' / sui:${client.network} payment requirement. ` +
        `This SDK only speaks the x402 dialect.`,
    );
  }

  return payViaX402({ signer, client, options, reqInit, requirements });
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
