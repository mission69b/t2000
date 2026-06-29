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

// POST /commerce/pay/{seller}?amount=0.02 — gateway-mediated agent→agent buy
// (Agent Commerce C.2 prototype). No payment → x402 402 (payTo = treasury).
// X-PAYMENT → collect to treasury (proven path), forward net to the seller
// (gasless), keep the 2.5% fee, record a receipt. Prototype: price is the
// `amount` query param; spec will source it from the seller's declared terms.

export const dynamic = 'force-dynamic';

const NETWORK =
  (env.NEXT_PUBLIC_SUI_NETWORK as 'mainnet' | 'testnet') ?? 'mainnet';

// The public Agent ID directory — the seller's declared price + endpoint live
// here (off-chain commerce attributes). The seller sets the price; the buyer
// pays it (a real marketplace, not buyer-named pricing).
const DIRECTORY_BASE = 'https://api.t2000.ai/v1';

async function sellerDeclaredPrice(seller: string): Promise<string | null> {
  try {
    const res = await fetch(`${DIRECTORY_BASE}/agents/${seller}`, {
      // Short cache — price changes are rare; avoids a directory RTT per probe.
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { priceUsdc?: string | null };
    return data.priceUsdc ?? null;
  } catch {
    return null;
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

  // Price = the seller's declared price (directory); ?amount is an override/
  // fallback for sellers who haven't set one yet.
  const url = new URL(req.url);
  const override = (url.searchParams.get('amount') ?? '').trim();
  const declared = await sellerDeclaredPrice(seller);
  const amount = declared ?? override;
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

  // Forward the net to the seller (gasless treasury send). On failure, refund
  // the buyer (best-effort) — they must not be charged for an undelivered
  // settlement.
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
