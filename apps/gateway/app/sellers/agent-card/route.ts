import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: shareable agent-card generator (§II.13.B, the
// dealer.exe play). Sold by the "Card Forge" seed agent — reachable ONLY
// through the paid commerce delivery leg.
//
// Input (optional): { "address": "0x…" } — defaults to the BUYER's own agent
// (from the delivery leg's x-agent-buyer header). Output: the shareable PNG
// URL (public by design — sharing IS the point) + a ready-to-post caption +
// the receipt-backed stats it renders.
export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.t2000.ai/v1';
const CARD_BASE = 'https://mpp.t2000.ai/cards/agent';

type Profile = {
  name: string;
  priceUsdc?: string;
  category?: string;
  reputation?: {
    sales: number;
    volumeUsd: number;
    deliveredRate?: number | null;
  };
  registrations?: { agentId?: number }[];
};

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired(
      '0x7ab3d60d17f0eb9084142ca9a516b6ee5483d0cda5608f85df93c3343abe23d6',
    );
  }

  // Target agent: explicit body address, else the buyer's own agent.
  let target = req.headers.get('x-agent-buyer') ?? '';
  try {
    const body = (await req.json()) as { address?: string };
    if (body?.address) {
      target = String(body.address).trim();
    }
  } catch {
    // No/invalid body — buyer default stands.
  }
  try {
    target = normalizeSuiAddress(target);
  } catch {
    target = '';
  }
  if (!isValidSuiAddress(target)) {
    return Response.json(
      { error: 'Pass { "address": "0x…" } of a registered agent (or buy from an agent wallet to card yourself).' },
      { status: 400 },
    );
  }

  let p: Profile | null = null;
  try {
    const res = await fetch(`${API_BASE}/agents/${target}`, {
      next: { revalidate: 30 },
    });
    if (res.ok) {
      p = (await res.json()) as Profile;
    }
  } catch {
    p = null;
  }
  if (!p) {
    return Response.json(
      { error: `No Agent ID found for ${target} — register one free: t2 init` },
      { status: 404 },
    );
  }

  const numericId = p.registrations?.[0]?.agentId;
  const sales = p.reputation?.sales ?? 0;
  const delivered =
    typeof p.reputation?.deliveredRate === 'number'
      ? Math.round(p.reputation.deliveredRate * 100)
      : null;

  const cardUrl = `${CARD_BASE}/${target}`;
  const listingUrl = `https://agents.t2000.ai/${target}`;
  const idTag = numericId != null ? ` (#${numericId})` : '';
  const statsBit =
    sales > 0
      ? `${sales} sold${delivered != null ? `, ${delivered}% delivered` : ''}, receipts on Sui`
      : 'on-chain identity on the t2000 rail';
  const caption = p.priceUsdc
    ? `${p.name}${idTag} is selling on the t2000 agent rail — $${p.priceUsdc}/call, ${statsBit}. Hire it: ${listingUrl}`
    : `${p.name}${idTag} — ${statsBit}. ${listingUrl}`;

  return Response.json({
    agent: {
      address: target,
      name: p.name,
      numericId: numericId ?? null,
      category: p.category ?? null,
      priceUsdc: p.priceUsdc ?? null,
      sales,
      deliveredPct: delivered,
    },
    cardUrl,
    listingUrl,
    caption,
    note: 'cardUrl renders a live 1200×675 PNG of this agent — embed it, post it with the caption, or open it in a browser. It re-renders with fresh stats on every view.',
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
