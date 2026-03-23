import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { NaviAdapter } from '@t2000/sdk/adapters';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

/**
 * GET /api/positions?address=0x...
 *
 * Returns savings/borrows totals from NAVI Protocol.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const navi = new NaviAdapter();
    navi.initSync(client);
    const positions = await navi.getPositions(address);

    let savings = 0;
    let borrows = 0;
    for (const s of positions.supplies) {
      savings += s.amountUsd ?? s.amount;
    }
    for (const b of positions.borrows) {
      borrows += b.amountUsd ?? b.amount;
    }

    return NextResponse.json({ savings, borrows });
  } catch {
    return NextResponse.json({ savings: 0, borrows: 0 });
  }
}
