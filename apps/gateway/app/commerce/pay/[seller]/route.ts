import { randomBytes } from 'node:crypto';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { USDC } from '@suimpp/mpp/server';
import {
  createX402Requirements,
  X402_VERSION,
} from '@suimpp/mpp/x402';
import { recordCommerceReceipt, splitAmount } from '@/lib/commerce';
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

// SSRF guard: only deliver to public https hosts (the seller's mcpEndpoint is
// arbitrary on-chain data — never let it point the gateway at an internal host).
function isSafeDeliveryUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') {
    return false;
  }
  const host = u.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return false;
  }
  return true;
}

interface DeliveryResult {
  ok: boolean;
  status: number;
  data: unknown;
}

async function deliverToSeller(
  endpoint: string,
  body: string,
  buyer: string,
): Promise<DeliveryResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-buyer': buyer },
      body: body || undefined,
      signal: controller.signal,
    });
    const ct = res.headers.get('content-type') ?? '';
    const data = ct.includes('application/json')
      ? await res.json().catch(() => null)
      : await res.text().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: err instanceof Error ? err.message : 'delivery failed',
    };
  } finally {
    clearTimeout(timer);
  }
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
      challengeId: randomBytes(16).toString('hex'),
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
  const deliveryMode =
    Boolean(profile.mcpEndpoint) && isSafeDeliveryUrl(profile.mcpEndpoint as string);

  // DELIVERY MODE — the treasury holds the gross while we attempt delivery
  // (the escrow window). The seller is released only on a 2xx.
  if (deliveryMode) {
    const delivered = await deliverToSeller(
      profile.mcpEndpoint as string,
      buyerBody,
      buyer,
    );
    if (!delivered.ok) {
      let refunded: string | null = null;
      try {
        refunded = await refundUsdc({ payer: buyer, amount, network: NETWORK });
      } catch {
        refunded = null;
      }
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

    // Delivered → release the net to the seller. If the forward itself fails
    // (rare — treasury key/floor), the buyer keeps the delivered response; we
    // log settlement_due for a manual payout rather than clawing back service.
    let forwardDigest: string | null = null;
    try {
      forwardDigest = await treasurySendUsdc({
        to: seller,
        amount: split.netDecimal,
        network: NETWORK,
      });
    } catch (err) {
      console.error(
        `[commerce] settlement_due seller=${seller} net=${split.netDecimal} buyer=${buyer} collect=${settle.transaction} reason=${err instanceof Error ? err.message : String(err)}`,
      );
    }
    await recordCommerceReceipt({
      buyer,
      seller,
      grossDecimal: amount,
      forwardDigest: forwardDigest ?? settle.transaction,
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

  await recordCommerceReceipt({ buyer, seller, grossDecimal: amount, forwardDigest });
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
