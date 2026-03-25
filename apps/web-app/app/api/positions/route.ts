import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { NaviAdapter } from '@t2000/sdk/adapters';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

let _naviAdapter: NaviAdapter | null = null;
function getNaviAdapter(): NaviAdapter {
  if (!_naviAdapter) {
    _naviAdapter = new NaviAdapter();
    _naviAdapter.initSync(client);
  }
  return _naviAdapter;
}

/**
 * GET /api/positions?address=0x...
 *
 * Returns savings, borrows, rates, health factor, and max borrow from NAVI Protocol.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const navi = getNaviAdapter();

    const [positions, health, rewards] = await Promise.all([
      navi.getPositions(address),
      navi.getHealth(address).catch(() => null),
      navi.getPendingRewards(address).catch(() => []),
    ]);

    let savings = 0;
    let borrows = 0;
    let weightedRateSum = 0;

    const supplies: Array<{ asset: string; amount: number; amountUsd: number; apy: number }> = [];
    const borrowList: Array<{ asset: string; amount: number; amountUsd: number; apy: number }> = [];

    for (const s of positions.supplies) {
      const usd = s.amountUsd ?? s.amount;
      savings += usd;
      weightedRateSum += usd * s.apy;
      supplies.push({ asset: s.asset, amount: s.amount, amountUsd: usd, apy: s.apy });
    }
    for (const b of positions.borrows) {
      const usd = b.amountUsd ?? b.amount;
      borrows += usd;
      borrowList.push({ asset: b.asset, amount: b.amount, amountUsd: usd, apy: b.apy });
    }

    const savingsRate = savings > 0 ? weightedRateSum / savings : 0;
    const healthFactor = health?.healthFactor ?? (borrows > 0 ? null : Infinity);
    const maxBorrow = health?.maxBorrow ?? 0;
    const pendingRewards = rewards.reduce((sum, r) => sum + (r.estimatedValueUsd ?? 0), 0);

    return NextResponse.json({
      savings,
      borrows,
      savingsRate,
      healthFactor: healthFactor === Infinity ? null : healthFactor,
      maxBorrow,
      pendingRewards,
      supplies,
      borrows_detail: borrowList,
    });
  } catch {
    return NextResponse.json({ savings: 0, borrows: 0, savingsRate: 0, healthFactor: null, maxBorrow: 0, pendingRewards: 0 });
  }
}
