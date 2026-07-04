import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { readInput, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: Sui wallet structural read (S.624 Shelf v4).
// Public on-chain data only; explicitly NO identity claims.
// NOTE: JSON-RPC read methods — sweep to gRPC/GraphQL before the July 31
// JSON-RPC deactivation (greppable: fullnode.mainnet.sui.io).
export const dynamic = 'force-dynamic';

const SUI_RPC = 'https://fullnode.mainnet.sui.io';
const USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const SUI_TYPE = '0x2::sui::SUI';

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(SUI_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`sui rpc ${res.status}`);
  }
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error || json.result === undefined) {
    throw new Error(json.error?.message ?? 'rpc error');
  }
  return json.result;
}

type Balance = { coinType: string; totalBalance: string; coinObjectCount: number };

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  const raw = (await readInput(req, 'address'))?.trim() ?? '';
  let address = '';
  try {
    address = normalizeSuiAddress(raw);
  } catch {
    address = '';
  }
  if (!isValidSuiAddress(address)) {
    return Response.json(
      { error: 'Pass a Sui address: {"address":"0x…"}.' },
      { status: 400 },
    );
  }

  let balances: Balance[];
  let objectCount: number | null = null;
  try {
    balances = await rpc<Balance[]>('suix_getAllBalances', [address]);
  } catch {
    return upstreamDown('Sui RPC');
  }
  try {
    const objects = await rpc<{ data: unknown[]; hasNextPage: boolean }>(
      'suix_getOwnedObjects',
      [address, { options: {} }, null, 50],
    );
    objectCount = objects.data.length;
    if (objects.hasNextPage) {
      objectCount = 50; // reported as "50+"
    }
  } catch {
    objectCount = null;
  }

  const gaps = objectCount === null ? ['object-count lane unavailable'] : [];
  const sui = balances.find((b) => b.coinType === SUI_TYPE);
  const usdc = balances.find((b) => b.coinType === USDC_TYPE);
  const suiAmount = sui ? Number.parseInt(sui.totalBalance, 10) / 1e9 : 0;
  const usdcAmount = usdc ? Number.parseInt(usdc.totalBalance, 10) / 1e6 : 0;
  const coinTypes = balances.length;

  let profile: 'fresh' | 'dormant_holder' | 'active';
  if (coinTypes === 0 && (objectCount ?? 0) === 0) {
    profile = 'fresh';
  } else if ((objectCount ?? 0) >= 20 || coinTypes >= 4) {
    profile = 'active';
  } else {
    profile = 'dormant_holder';
  }

  return Response.json({
    report: 'wallet-health',
    address,
    generatedAt: new Date().toISOString(),
    method:
      'Public Sui mainnet reads: all coin balances (SUI + USDC highlighted; note Sui address-balances may hold funds beyond coin objects), owned-object count (capped at 50). Profile: fresh = nothing held; active = 20+ objects or 4+ coin types; else dormant_holder. A STRUCTURAL snapshot — no identity, reputation, or history claims. Research context only.',
    source: 'Sui mainnet RPC (public on-chain data)',
    profile,
    evidence: {
      coinTypesHeld: coinTypes,
      suiBalance: round(suiAmount, 4),
      usdcBalance: round(usdcAmount, 2),
      ownedObjects: objectCount === 50 ? '50+' : objectCount,
      topHoldings: balances
        .sort((a, b) => b.coinObjectCount - a.coinObjectCount)
        .slice(0, 8)
        .map((b) => ({
          coinType: `${b.coinType.slice(0, 20)}…${b.coinType.split('::').pop()}`,
          coinObjects: b.coinObjectCount,
        })),
    },
    dataGaps: gaps,
    read: `${address.slice(0, 10)}…: ${coinTypes} coin type${coinTypes === 1 ? '' : 's'} (${round(suiAmount, 2)} SUI, ${round(usdcAmount, 2)} USDC in coin objects), ${objectCount === null ? 'n/a' : objectCount === 50 ? '50+' : objectCount} objects → ${profile.replace(/_/g, ' ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
