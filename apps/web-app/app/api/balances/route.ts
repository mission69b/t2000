import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const USDC_DECIMALS = 6;
const MIST_PER_SUI = 1_000_000_000;

const TRADEABLE_COINS: Record<string, { type: string; decimals: number }> = {
  USDT: { type: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT', decimals: 6 },
  BTC: { type: '0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC', decimals: 8 },
  ETH: { type: '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH', decimals: 8 },
  GOLD: { type: '0x9d297676e7a4b771ab023291377b2adfaa4938fb9080b8d12430e4b108b836a9::xaum::XAUM', decimals: 9 },
};

/**
 * GET /api/balances?address=0x...
 *
 * Returns raw token balances for SUI, USDC, and tradeable assets.
 * Used by the agent tool executor for get_balance / get_portfolio.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const tradeableEntries = Object.entries(TRADEABLE_COINS);

    const [suiBal, usdcBal, ...tradeableBals] = await Promise.all([
      client.getBalance({ owner: address, coinType: '0x2::sui::SUI' }),
      client.getBalance({ owner: address, coinType: USDC_TYPE }).catch(() => ({ totalBalance: '0' })),
      ...tradeableEntries.map(([, info]) =>
        client.getBalance({ owner: address, coinType: info.type }).catch(() => ({ totalBalance: '0' })),
      ),
    ]);

    const sui = Number(suiBal.totalBalance) / MIST_PER_SUI;
    const usdc = Number(usdcBal.totalBalance) / (10 ** USDC_DECIMALS);

    const assets: Record<string, number> = {};
    tradeableEntries.forEach(([symbol, info], idx) => {
      assets[symbol] = Number(tradeableBals[idx].totalBalance) / 10 ** info.decimals;
    });

    return NextResponse.json({
      SUI: Math.round(sui * 1e4) / 1e4,
      USDC: Math.round(usdc * 100) / 100,
      ...Object.fromEntries(
        Object.entries(assets).map(([k, v]) => [k, Math.round(v * 1e8) / 1e8]),
      ),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('[balances] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to fetch balances' }, { status: 500 });
  }
}
