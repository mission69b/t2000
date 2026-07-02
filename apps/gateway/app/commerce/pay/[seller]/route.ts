import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { USDC } from '@suimpp/mpp/server';
import {
  createX402Requirements,
  parseX402Header,
  X402_PAYMENT_HEADER,
  X402_VERSION,
} from '@suimpp/mpp/x402';
import { recordCommerceReceipt, splitAmount, uptoSettlement } from '@/lib/commerce';
import { getDeployedService, isSafeUpstreamUrl } from '@/lib/deploy';
import { DELIVERY_AUTH_HEADER, signDelivery } from '@/lib/sellers';
import { TREASURY_ADDRESS } from '@/lib/constants';
import { refundUsdc, treasurySendUsdc } from '@/lib/refund';
import {
  getChainInfo,
  hasX402Payment,
  settleX402Request,
  withX402Receipt,
} from '@/lib/x402-dialect';
import { env } from '@/lib/env';

// POST /commerce/pay/{seller} — gateway-mediated agent→agent buy (Agent
// Commerce C.2/C.3). No payment → x402 402 (payTo = treasury). X-PAYMENT →
// collect to treasury, then:
//   • DELIVERY MODE (seller has an mcpEndpoint): collect → proxy the call to the
//     seller → on 2xx forward the net (release) + receipt + relay the response;
//     on failure refund the buyer the GROSS (the treasury-custody window is the
//     escrow — the seller is paid only after delivery succeeds).
//   • PAYMENT-ONLY (no endpoint): collect → forward net → receipt.
// Price is the seller's declared `priceUsdc` (directory); `?amount` overrides.

export const dynamic = 'force-dynamic';

const NETWORK =
  (env.NEXT_PUBLIC_SUI_NETWORK as 'mainnet' | 'testnet') ?? 'mainnet';
const DIRECTORY_BASE = 'https://api.t2000.ai/v1';
const DELIVERY_TIMEOUT_MS = 15_000;
// Cap relayed seller responses — a malicious/buggy seller must not be able to
// stream an unbounded body through the gateway (memory/DoS).
const MAX_RESPONSE_BYTES = 512 * 1024;

// Challenge HMAC-binding (B): bind the issued challengeId to (seller, gross) so
// a payment can only settle against the exact terms we quoted, and a challengeId
// can't be self-minted. Reuses the gateway's challenge secret; if unset, binding
// is disabled (degrades to the prior random-id behaviour, never blocks).
const CHALLENGE_SECRET = env.MPP_CHALLENGE_SECRET;

// Bind the challenge to the SELLER only (stable). The AMOUNT is NOT bound here —
// `settleX402Request` already enforces the signed tx pays the resolved price to
// the treasury, so binding the amount was redundant AND fragile: a price edit
// (or the 30s price cache) between probe and settle would break a valid payment.
function challengeSig(nonce: string, seller: string): string {
  return createHmac('sha256', CHALLENGE_SECRET ?? '')
    .update(`${nonce}:${seller}`)
    .digest('base64url')
    .slice(0, 22);
}

function issueChallengeId(seller: string): string {
  const nonce = randomBytes(12).toString('base64url');
  if (!CHALLENGE_SECRET) {
    return nonce;
  }
  return `${nonce}.${challengeSig(nonce, seller)}`;
}

function verifyChallengeId(challengeId: string, seller: string): boolean {
  if (!CHALLENGE_SECRET) {
    return true; // binding disabled — don't block
  }
  const [nonce, sig] = challengeId.split('.');
  if (!(nonce && sig)) {
    return false;
  }
  const expected = challengeSig(nonce, seller);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface SellerProfile {
  priceUsdc: string | null;
  mcpEndpoint: string | null;
}

async function fetchSellerProfile(seller: string): Promise<SellerProfile> {
  try {
    const res = await fetch(`${DIRECTORY_BASE}/agents/${seller}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return { priceUsdc: null, mcpEndpoint: null };
    }
    const data = (await res.json()) as {
      priceUsdc?: string | null;
      mcpEndpoint?: string | null;
    };
    return {
      priceUsdc: data.priceUsdc ?? null,
      mcpEndpoint: data.mcpEndpoint ?? null,
    };
  } catch {
    return { priceUsdc: null, mcpEndpoint: null };
  }
}

interface DeliveryResult {
  ok: boolean;
  status: number;
  data: unknown;
  /** Seller-reported actual cost (atomic USDC) via X-402-Settle-Amount, for
   *  usage-based (`sui-upto`) settlement. null = charge the full authorized max. */
  settleAmount: number | null;
}

async function deliverToSeller(
  endpoint: string,
  body: string,
  buyer: string,
  opts?: { method?: 'GET' | 'POST'; extraHeaders?: Record<string, string> },
): Promise<DeliveryResult> {
  const method = opts?.method ?? 'POST';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method,
      headers: {
        'content-type': 'application/json',
        // Seller-configured auth (Agent Deploy) — injected server-side, never
        // exposed to the buyer. Buyer identity comes last (can't be overridden).
        ...(opts?.extraHeaders ?? {}),
        'x-agent-buyer': buyer,
        // Signed proof this call came through the paid delivery leg — the
        // gateway-hosted seller routes (app/sellers/*) refuse without it.
        [DELIVERY_AUTH_HEADER]: signDelivery(endpoint),
      },
      body: method === 'POST' ? body || undefined : undefined,
      // Block SSRF-via-redirect (a public URL 30x-ing to an internal host).
      redirect: 'error',
      signal: controller.signal,
    });

    // Read the body with a hard byte cap so a seller can't stream an unbounded
    // response through us. Over the cap → treat as a failed delivery (refund).
    const capped = await readCapped(res.body);
    if (capped === null) {
      return {
        ok: false,
        status: res.status,
        data: 'response too large',
        settleAmount: null,
      };
    }
    const ct = res.headers.get('content-type') ?? '';
    let data: unknown = capped;
    if (ct.includes('application/json')) {
      try {
        data = capped ? JSON.parse(capped) : null;
      } catch {
        data = capped;
      }
    }
    const reported = res.headers.get('x-402-settle-amount');
    const settleAmount =
      reported != null && Number.isFinite(Number.parseInt(reported, 10))
        ? Number.parseInt(reported, 10)
        : null;
    return { ok: res.ok, status: res.status, data, settleAmount };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: err instanceof Error ? err.message : 'delivery failed',
      settleAmount: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Read a response body as text, capped at MAX_RESPONSE_BYTES. Returns null if
 *  the body exceeds the cap (caller treats as a failed delivery). */
async function readCapped(
  body: ReadableStream<Uint8Array> | null,
): Promise<string | null> {
  if (!body) {
    return '';
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        received += value.length;
        if (received > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    }
  } catch {
    return null;
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

async function handle(
  req: Request,
  ctx: { params: Promise<{ seller: string }> },
): Promise<Response> {
  const { seller: sellerRaw } = await ctx.params;
  let seller: string;
  try {
    seller = normalizeSuiAddress(sellerRaw.trim());
  } catch {
    seller = '';
  }
  if (!isValidSuiAddress(seller)) {
    return Response.json({ error: 'Invalid seller address' }, { status: 400 });
  }

  const url = new URL(req.url);
  const override = (url.searchParams.get('amount') ?? '').trim();
  const profile = await fetchSellerProfile(seller);
  const amount = profile.priceUsdc ?? override;
  if (!amount) {
    return Response.json(
      { error: 'Seller has not declared a price (and no amount override given). Set one with `t2 agent service --price`.' },
      { status: 400 },
    );
  }
  const split = splitAmount(amount);
  if (!split) {
    return Response.json(
      { error: 'price must be a USDC value whose net (after 2.5% fee) is ≥ $0.01' },
      { status: 400 },
    );
  }

  // No payment yet → issue the x402 challenge (collect to the treasury).
  if (!hasX402Payment(req)) {
    const { chain, epoch } = await getChainInfo(NETWORK);
    const requirements = createX402Requirements({
      challengeId: issueChallengeId(seller),
      amount,
      currency: USDC,
      recipient: TREASURY_ADDRESS,
      resource: req.url,
      network: NETWORK,
      chain,
      currentEpoch: epoch,
    });
    return Response.json(
      { x402Version: X402_VERSION, error: 'Payment required', accepts: [requirements] },
      { status: 402 },
    );
  }

  // Verify the payment's challengeId is one WE issued for these exact terms
  // (HMAC-bound to seller + gross) — defense-in-depth before settling.
  try {
    const parsed = parseX402Header(req.headers.get(X402_PAYMENT_HEADER) ?? '');
    if (!verifyChallengeId(parsed.payload.challengeId, seller)) {
      return Response.json(
        { error: 'Payment challenge invalid or mismatched.' },
        { status: 402 },
      );
    }
  } catch {
    return Response.json(
      { error: 'Malformed X-PAYMENT header.' },
      { status: 400 },
    );
  }

  // Capture the buyer's service input (forwarded to the seller on delivery).
  // settle reads only the X-PAYMENT header, so reading the body here is safe.
  const buyerBody = await req.text().catch(() => '');

  // Collect to the treasury (proven settle-then-serve path; terms server-set).
  let settled: Awaited<ReturnType<typeof settleX402Request>>;
  try {
    settled = await settleX402Request(req, {
      amount,
      currency: USDC,
      recipient: TREASURY_ADDRESS,
      network: NETWORK,
    });
  } catch (err) {
    return Response.json(
      { error: `Payment settlement rejected: ${err instanceof Error ? err.message : String(err)}` },
      { status: 402 },
    );
  }

  const { settle, report } = settled;
  const buyer = report.sender ?? settle.payer;

  // Agent Deploy (Option A): a gateway-hosted config-proxy takes precedence
  // over a self-hosted mcpEndpoint. Deliver to the seller's configured upstream
  // (injecting their encrypted headers); the upstream/key never touch the
  // directory or any response.
  const deployed = await getDeployedService(seller);
  const deliveryTarget = deployed?.upstreamUrl ?? profile.mcpEndpoint ?? null;
  const deliveryMode = Boolean(deliveryTarget) && isSafeUpstreamUrl(deliveryTarget as string);

  // DELIVERY MODE — the treasury holds the gross while we attempt delivery
  // (the escrow window). The seller is released only on a 2xx.
  if (deliveryMode) {
    const delivered = await deliverToSeller(
      deliveryTarget as string,
      buyerBody,
      buyer,
      deployed
        ? { method: deployed.method, extraHeaders: deployed.headers }
        : undefined,
    );
    if (!delivered.ok) {
      let refunded: string | null = null;
      try {
        refunded = await refundUsdc({ payer: buyer, amount, network: NETWORK });
      } catch {
        refunded = null;
      }
      await recordCommerceReceipt({
        buyer,
        seller,
        resource: profile.mcpEndpoint ?? undefined,
        grossMicros: split.grossMicros,
        feeMicros: 0,
        netMicros: 0,
        status: 'refunded',
        collectDigest: settle.transaction,
        forwardDigest: refunded,
      });
      return withX402Receipt(
        Response.json(
          {
            ok: false,
            error: 'Seller delivery failed — payment refunded.',
            sellerStatus: delivered.status,
            refunded: Boolean(refunded),
            ...(refunded ? { refundTx: refunded } : {}),
          },
          { status: 502 },
        ),
        settle,
      );
    }

    // Usage-based (`sui-upto`): the buyer authorized `split.grossMicros` (the
    // max, already collected); charge the seller-reported actual (≤ max),
    // refund the excess, settle the fee/net on the actual.
    const upto = uptoSettlement(split.grossMicros, delivered.settleAmount);

    // Refund the buyer the unused authorization (only when above the dust floor).
    let refundDigest: string | null = null;
    if (upto.refundMicros > 0) {
      try {
        refundDigest = await treasurySendUsdc({
          to: buyer,
          amount: upto.refundDecimal,
          network: NETWORK,
        });
      } catch (err) {
        console.error(
          `[commerce] upto_refund_due buyer=${buyer} refund=${upto.refundDecimal} collect=${settle.transaction} reason=${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Release the net (of the actual) to the seller. If the forward itself
    // fails (rare), the buyer keeps the delivered response; we log
    // settlement_due for a manual payout rather than clawing back service.
    let forwardDigest: string | null = null;
    try {
      forwardDigest = await treasurySendUsdc({
        to: seller,
        amount: upto.netDecimal,
        network: NETWORK,
      });
    } catch (err) {
      console.error(
        `[commerce] settlement_due seller=${seller} net=${upto.netDecimal} buyer=${buyer} collect=${settle.transaction} reason=${err instanceof Error ? err.message : String(err)}`,
      );
    }
    await recordCommerceReceipt({
      buyer,
      seller,
      resource: profile.mcpEndpoint ?? undefined,
      // The effective sale = the actual charged (gross of fee).
      grossMicros: upto.actualMicros,
      feeMicros: upto.feeMicros,
      netMicros: upto.netMicros,
      status: forwardDigest ? 'settled' : 'settlement_due',
      collectDigest: settle.transaction,
      forwardDigest,
    });
    return withX402Receipt(
      Response.json({
        ok: true,
        receipt: {
          buyer,
          seller,
          authorizedMicros: split.grossMicros,
          chargedMicros: upto.actualMicros,
          refundMicros: upto.refundMicros,
          feeMicros: upto.feeMicros,
          netMicros: upto.netMicros,
          feeBps: 250,
          collectDigest: settle.transaction,
          forwardDigest,
          ...(refundDigest ? { refundDigest } : {}),
          delivered: true,
        },
        response: delivered.data,
      }),
      settle,
    );
  }

  // PAYMENT-ONLY — no seller endpoint to deliver to: collect → forward → receipt.
  let forwardDigest: string;
  try {
    forwardDigest = await treasurySendUsdc({
      to: seller,
      amount: split.netDecimal,
      network: NETWORK,
    });
  } catch (err) {
    let refunded: string | null = null;
    try {
      refunded = await refundUsdc({ payer: buyer, amount, network: NETWORK });
    } catch {
      refunded = null;
    }
    await recordCommerceReceipt({
      buyer,
      seller,
      grossMicros: split.grossMicros,
      feeMicros: 0,
      netMicros: 0,
      status: 'refunded',
      collectDigest: settle.transaction,
      forwardDigest: refunded,
    });
    return withX402Receipt(
      Response.json(
        {
          ok: false,
          error: `Settlement to seller failed: ${err instanceof Error ? err.message : String(err)}`,
          refunded: Boolean(refunded),
          ...(refunded ? { refundTx: refunded } : {}),
        },
        { status: 502 },
      ),
      settle,
    );
  }

  await recordCommerceReceipt({
    buyer,
    seller,
    grossMicros: split.grossMicros,
    feeMicros: split.feeMicros,
    netMicros: split.netMicros,
    status: 'settled',
    collectDigest: settle.transaction,
    forwardDigest,
  });
  return withX402Receipt(
    Response.json({
      ok: true,
      receipt: {
        buyer,
        seller,
        grossMicros: split.grossMicros,
        feeMicros: split.feeMicros,
        netMicros: split.netMicros,
        feeBps: 250,
        collectDigest: settle.transaction,
        forwardDigest,
        delivered: false,
      },
    }),
    settle,
  );
}

export function GET(req: Request, ctx: { params: Promise<{ seller: string }> }) {
  return handle(req, ctx);
}
export function POST(req: Request, ctx: { params: Promise<{ seller: string }> }) {
  return handle(req, ctx);
}
