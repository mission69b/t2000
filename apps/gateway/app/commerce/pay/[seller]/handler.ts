import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { after } from 'next/server';
import { USDC } from '@suimpp/mpp/server';
import {
  createX402Requirements,
  parseX402Header,
  X402_PAYMENT_HEADER,
  X402_VERSION,
} from '@suimpp/mpp/x402';
import { recordCommerceReceipt, splitAmount, uptoSettlement } from '@/lib/commerce';
import { getDeployedService, isSafeUpstreamUrl } from '@/lib/deploy';
import { logPayment } from '@/lib/log-payment';
import { runTaskChecksForWallets, runnerAddress } from '@/lib/tasks';
import { appendBuyerParams, DELIVERY_AUTH_HEADER, signDelivery } from '@/lib/sellers';
import { COLLECT_ADDRESS } from '@/lib/constants';
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

interface AgentServiceDoc {
  slug: string;
  priceUsdc?: string | null;
  endpoint?: string | null;
  method?: 'GET' | 'POST';
  active?: boolean;
}

interface SellerProfile {
  priceUsdc: string | null;
  mcpEndpoint: string | null;
  services: AgentServiceDoc[];
}

async function fetchSellerProfile(seller: string): Promise<SellerProfile> {
  try {
    const res = await fetch(`${DIRECTORY_BASE}/agents/${seller}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return { priceUsdc: null, mcpEndpoint: null, services: [] };
    }
    const data = (await res.json()) as {
      priceUsdc?: string | null;
      mcpEndpoint?: string | null;
      services?: AgentServiceDoc[] | null;
    };
    return {
      priceUsdc: data.priceUsdc ?? null,
      mcpEndpoint: data.mcpEndpoint ?? null,
      services: Array.isArray(data.services) ? data.services : [],
    };
  } catch {
    return { priceUsdc: null, mcpEndpoint: null, services: [] };
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
  // [S.638] GET upstreams receive buyer input as query params (bounded,
  // seller-saved params always win); POST upstreams get it as the body.
  const target = method === 'GET' ? appendBuyerParams(endpoint, body) : endpoint;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      method,
      headers: {
        'content-type': 'application/json',
        // Seller-configured auth (Agent Deploy) — injected server-side, never
        // exposed to the buyer. Buyer identity comes last (can't be overridden).
        ...(opts?.extraHeaders ?? {}),
        'x-agent-buyer': buyer,
        // Signed proof this call came through the paid delivery leg — the
        // gateway-hosted seller routes (app/sellers/*) refuse without it.
        // Signed over origin+path only — buyer query params don't break it.
        [DELIVERY_AUTH_HEADER]: signDelivery(target),
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

export async function handle(
  req: Request,
  seller0: string,
  slug?: string,
): Promise<Response> {
  let seller: string;
  try {
    seller = normalizeSuiAddress(seller0.trim());
  } catch {
    seller = '';
  }
  if (!isValidSuiAddress(seller)) {
    return Response.json({ error: 'Invalid seller address' }, { status: 400 });
  }

  const url = new URL(req.url);
  const override = (url.searchParams.get('amount') ?? '').trim();
  const profile = await fetchSellerProfile(seller);

  // Store v2 Phase 1: slug-addressed service resolution. The slug names one
  // SKU of the seller's catalog; the bare URL keeps serving the legacy
  // default (profile.mcpEndpoint + priceUsdc) unchanged.
  const service = slug
    ? (profile.services.find((s) => s.slug === slug && s.active !== false) ??
      null)
    : null;
  if (slug && !service) {
    return Response.json(
      { error: `Unknown service "${slug}" for this seller.` },
      { status: 404 },
    );
  }

  // `?amount` OVERRIDES the declared price (the doc'd contract, line 34) —
  // it's how task-reward buys pay more than a listing's price. S.639 fix:
  // this was `priceUsdc ?? override`, so a priced listing silently beat the
  // override and the first-sale reward underpaid a listed seller.
  const amount = override || (service ? service.priceUsdc : profile.priceUsdc);
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
      recipient: COLLECT_ADDRESS,
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
      recipient: COLLECT_ADDRESS,
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

  // Agent Deploy (Option A): the wrap config applies ONLY while the listing
  // actually points at the rail buy URL — the on-chain record decides which
  // mode is active (S.639 fix: a stale wrap must never shadow a self-hosted
  // endpoint the seller declared later). The upstream/key never touch the
  // directory or any response.
  // Slug services (Phase 1): same rule per SKU — a service with its own
  // https endpoint self-hosts; otherwise its per-slug wrap config delivers.
  const buyUrlMarker = slug
    ? `/commerce/pay/${seller.toLowerCase()}/${slug}`
    : `/commerce/pay/${seller.toLowerCase()}`;
  const declaredEndpoint = service
    ? (service.endpoint ?? null)
    : (profile.mcpEndpoint ?? null);
  const listingIsWrap =
    !declaredEndpoint || declaredEndpoint.toLowerCase().endsWith(buyUrlMarker);
  const deployed = listingIsWrap ? await getDeployedService(seller, slug) : null;
  const deliveryTarget = deployed?.upstreamUrl ?? declaredEndpoint ?? null;
  const deliveryMode = Boolean(deliveryTarget) && isSafeUpstreamUrl(deliveryTarget as string);
  // Receipts record WHICH SKU sold (per-service sold counts derive later).
  const receiptResource = slug
    ? `/commerce/pay/${seller}/${slug}`
    : (profile.mcpEndpoint ?? undefined);
  // Delivery method: per-service declared method wins in BOTH modes (S.670
  // fix — self-hosted catalog endpoints used to be POSTed unconditionally,
  // so a GET-only upstream refunded every sale). The deploy config's stored
  // method remains the default-service fallback.
  if (deployed && service?.method) {
    deployed.method = service.method;
  }

  // DELIVERY MODE — the treasury holds the gross while we attempt delivery
  // (the escrow window). The seller is released only on a 2xx.
  if (deliveryMode) {
    const delivered = await deliverToSeller(
      deliveryTarget as string,
      buyerBody,
      buyer,
      deployed
        ? { method: deployed.method, extraHeaders: deployed.headers }
        : service?.method
          ? { method: service.method }
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
        resource: receiptResource,
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
    // [S.627] Fee → REVENUE at settle (escrow holds customer funds only).
    // Inert until REVENUE_ADDRESS is set; fees < $0.01 can't go gasless —
    // they accrue in escrow and are swept manually. Post-response, best-effort
    // (a missed sweep reconciles from the receipt ledger).
    if (env.REVENUE_ADDRESS && upto.feeMicros >= 10_000) {
      const feeDecimal = (upto.feeMicros / 1e6).toFixed(6);
      after(() =>
        treasurySendUsdc({
          to: env.REVENUE_ADDRESS as string,
          amount: feeDecimal,
          network: NETWORK,
        }).catch((err) =>
          console.error(
            `[commerce] fee_sweep_due fee=${feeDecimal} collect=${settle.transaction} reason=${err instanceof Error ? err.message : String(err)}`,
          ),
        ),
      );
    }
    await recordCommerceReceipt({
      buyer,
      seller,
      resource: receiptResource,
      // The effective sale = the actual charged (gross of fee).
      grossMicros: upto.actualMicros,
      feeMicros: upto.feeMicros,
      netMicros: upto.netMicros,
      status: forwardDigest ? 'settled' : 'settlement_due',
      collectDigest: settle.transaction,
      forwardDigest,
    });
    // Activity feed (S.623): agent-commerce settlements ride the same
    // MppPayment stream as gateway service calls (mpp.t2000.ai/activity).
    after(() =>
      logPayment({
        service: 'commerce',
        endpoint: seller,
        amount: String(upto.actualMicros / 1e6),
        digest: settle.transaction,
        sender: buyer,
      }),
    );
    // Tasks hook (§II.16 v2): this settlement may be the qualifying event for
    // a task (first sale / agent hire / agent card) — check buyer + seller
    // AFTER the response streams (zero added latency). The runner's own
    // reward buys are excluded inside; skipping here too avoids self-checks.
    if (buyer.toLowerCase() !== runnerAddress()?.toLowerCase()) {
      after(() => runTaskChecksForWallets([buyer, seller]));
    }
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
  // [S.627] Fee → REVENUE at settle (payment-only leg) — same rules as the
  // delivery leg: inert until REVENUE_ADDRESS set, $0.01 gasless floor.
  if (env.REVENUE_ADDRESS && split.feeMicros >= 10_000) {
    const feeDecimal = (split.feeMicros / 1e6).toFixed(6);
    after(() =>
      treasurySendUsdc({
        to: env.REVENUE_ADDRESS as string,
        amount: feeDecimal,
        network: NETWORK,
      }).catch((err) =>
        console.error(
          `[commerce] fee_sweep_due fee=${feeDecimal} collect=${settle.transaction} reason=${err instanceof Error ? err.message : String(err)}`,
        ),
      ),
    );
  }
  // Activity feed (S.623) — payment-only settlements are activity too.
  after(() =>
    logPayment({
      service: 'commerce',
      endpoint: seller,
      amount: String(split.grossMicros / 1e6),
      digest: settle.transaction,
      sender: buyer,
    }),
  );
  // Tasks hook — payment-only settlements can complete a buyer-side task too
  // (the runner's own reward buys are excluded inside).
  if (buyer.toLowerCase() !== runnerAddress()?.toLowerCase()) {
    after(() => runTaskChecksForWallets([buyer, seller]));
  }
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
