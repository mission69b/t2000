import { createHash } from 'node:crypto';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { prisma } from '@/lib/prisma';

// Phase 4 (SPEC_STORE_V2 §8) — receipt-bound reviews.
//
// POST /commerce/review — submit (or edit) the review for ONE settled
// purchase. The buyer signs over the collect digest + stars + text hash, so
// authorship is proven by the same key that paid. One review per receipt by
// construction (upsert on collect digest).
//
// GET /commerce/review?buyer=0x…&seller=0x… — the buyer's reviewable
// receipts for a seller (settled/settlement_due, newest first) with any
// existing review. Public data: digests already surface in profile recent[].
export const dynamic = 'force-dynamic';

const MAX_TEXT = 400;
const MAX_SKEW_MS = 5 * 60 * 1000;

function err(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** The exact string the buyer signs. Deterministic; edits re-sign new content.
 *  Mirrored in the CLI (`t2 agent review`) — keep the format in lockstep. */
function reviewMessage(
  digest: string,
  stars: number,
  text: string,
  timestamp: number,
): string {
  return `t2000-review:${digest}:${stars}:${sha256Hex(text)}:${timestamp}`;
}

export async function POST(req: Request): Promise<Response> {
  let body: {
    digest?: unknown;
    stars?: unknown;
    text?: unknown;
    timestamp?: unknown;
    signature?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return err(400, 'Invalid JSON body.');
  }

  const digest = String(body.digest ?? '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(digest)) {
    return err(400, 'A valid collect digest is required.');
  }
  const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return err(400, 'stars must be an integer 1-5.');
  }
  const text = String(body.text ?? '').trim();
  if (text.length > MAX_TEXT) {
    return err(400, `Review text must be ≤ ${MAX_TEXT} chars.`);
  }
  const timestamp = Number(body.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_SKEW_MS) {
    return err(400, 'Stale or missing timestamp — re-sign and retry.');
  }
  const signature = String(body.signature ?? '');
  if (!signature) {
    return err(400, 'signature is required.');
  }

  // Who signed? The recovered address must be the receipt's buyer.
  let signer: string;
  try {
    const pk = await verifyPersonalMessageSignature(
      new TextEncoder().encode(reviewMessage(digest, stars, text, timestamp)),
      signature,
    );
    signer = normalizeSuiAddress(pk.toSuiAddress());
  } catch {
    return err(401, 'Signature verification failed.');
  }

  const receipt = await prisma.commerceReceipt.findUnique({
    where: { collectDigest: digest },
    select: { buyer: true, seller: true, status: true },
  });
  if (!receipt) {
    return err(404, 'No settlement receipt with that digest.');
  }
  if (normalizeSuiAddress(receipt.buyer) !== signer) {
    return err(403, 'Only the buyer on the receipt can review it.');
  }
  if (receipt.status === 'refunded') {
    return err(409, 'Refunded purchases cannot be reviewed — the delivered rate already tells that story.');
  }

  const review = await prisma.commerceReview.upsert({
    where: { collectDigest: digest },
    create: {
      collectDigest: digest,
      seller: normalizeSuiAddress(receipt.seller),
      buyer: signer,
      stars,
      text: text || null,
    },
    update: { stars, text: text || null },
  });

  return Response.json({
    ok: true,
    review: {
      digest: review.collectDigest,
      stars: review.stars,
      text: review.text,
      createdAt: review.createdAt,
    },
  });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let buyer = '';
  let seller = '';
  try {
    buyer = normalizeSuiAddress(String(url.searchParams.get('buyer') ?? '').trim());
    seller = normalizeSuiAddress(String(url.searchParams.get('seller') ?? '').trim());
  } catch {
    // fall through to validation below
  }
  if (!(isValidSuiAddress(buyer) && isValidSuiAddress(seller))) {
    return err(400, 'buyer and seller addresses are required.');
  }

  const receipts = await prisma.commerceReceipt.findMany({
    where: { buyer, seller, status: { in: ['settled', 'settlement_due'] } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { collectDigest: true, grossMicros: true, createdAt: true },
  });
  const reviews = await prisma.commerceReview.findMany({
    where: { collectDigest: { in: receipts.map((r) => r.collectDigest) } },
    select: { collectDigest: true, stars: true },
  });
  const reviewed = new Map(reviews.map((r) => [r.collectDigest, r.stars]));

  return Response.json({
    reviewable: receipts.map((r) => ({
      digest: r.collectDigest,
      amountUsd: Number((r.grossMicros / 1_000_000).toFixed(6)),
      at: r.createdAt,
      stars: reviewed.get(r.collectDigest) ?? null,
    })),
  });
}
