import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { NaviAdapter, CetusAdapter } from '@t2000/sdk/adapters';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress, validateAmount } from '@/lib/auth';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const ENOKI_SECRET_KEY = process.env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';

const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

type TxType = 'send' | 'save' | 'withdraw' | 'borrow' | 'repay' | 'swap' | 'claim-rewards';

interface BuildRequest {
  type: TxType;
  address: string;
  amount: number;
  recipient?: string;
  asset?: string;
  fromAsset?: string;
  toAsset?: string;
}

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const SUI_TYPE = '0x2::sui::SUI';
const MIST_PER_SUI = 1_000_000_000;

const ASSET_COIN_TYPES: Record<string, { type: string; decimals: number }> = {
  USDC: { type: USDC_TYPE, decimals: 6 },
  USDT: { type: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT', decimals: 6 },
  SUI: { type: SUI_TYPE, decimals: 9 },
  BTC: { type: '0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC', decimals: 8 },
  ETH: { type: '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH', decimals: 8 },
  GOLD: { type: '0x9d297676e7a4b771ab023291377b2adfaa4938fb9080b8d12430e4b108b836a9::xaum::XAUM', decimals: 9 },
};

function getNaviAdapter(): NaviAdapter {
  const navi = new NaviAdapter();
  navi.initSync(client);
  return navi;
}

let _cetusAdapter: CetusAdapter | null = null;
function getCetusAdapter(): CetusAdapter {
  if (!_cetusAdapter) {
    _cetusAdapter = new CetusAdapter();
    _cetusAdapter.initSync(client);
  }
  return _cetusAdapter;
}

function extractMoveCallTargets(tx: Transaction): string[] {
  const data = tx.getData();
  const targets = new Set<string>();
  for (const cmd of data.commands) {
    if (cmd.$kind === 'MoveCall') {
      targets.add(`${cmd.MoveCall.package}::${cmd.MoveCall.module}::${cmd.MoveCall.function}`);
    }
  }
  return [...targets];
}

/**
 * POST /api/transactions/prepare
 *
 * 1. Builds a Sui transaction kind server-side
 * 2. Sponsors it via Enoki (gasless for the user)
 * 3. Returns { bytes, digest } for client-side signing
 */
export async function POST(request: NextRequest) {
  if (!ENOKI_SECRET_KEY) {
    return NextResponse.json({ error: 'Sponsorship service not configured' }, { status: 500 });
  }

  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  let body: BuildRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, address, amount, recipient, asset } = body;

  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  // 10 transactions per minute per address
  const rl = rateLimit(`tx:${address}`, 10, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  if (type !== 'claim-rewards' && (!amount || amount <= 0)) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }
  if (type !== 'claim-rewards') {
    const amountCheck = validateAmount(type, amount);
    if (!amountCheck.valid) {
      return NextResponse.json({ error: amountCheck.reason }, { status: 400 });
    }
  }
  if (recipient && !isValidSuiAddress(recipient)) {
    return NextResponse.json({ error: 'Invalid recipient address' }, { status: 400 });
  }

  try {
    const tx = await buildTransaction({ type, address, amount, recipient, asset, fromAsset: body.fromAsset, toAsset: body.toAsset });

    const moveCallTargets = extractMoveCallTargets(tx);
    if (moveCallTargets.length > 0) {
      console.log(`[prepare] ${type} targets (${moveCallTargets.length}):`, moveCallTargets);
    }

    const txKindBytes = await tx.build({ client, onlyTransactionKind: true });
    const txKindBase64 = toBase64(txKindBytes);

    const sponsorHeaders: Record<string, string> = {
      Authorization: `Bearer ${ENOKI_SECRET_KEY}`,
      'Content-Type': 'application/json',
    };
    if (jwt) {
      sponsorHeaders['zklogin-jwt'] = jwt;
    }

    const sponsorBody: Record<string, unknown> = {
      network: SUI_NETWORK,
      transactionBlockKindBytes: txKindBase64,
      sender: address,
    };

    if (moveCallTargets.length > 0) {
      sponsorBody.allowedMoveCallTargets = moveCallTargets;
    }

    if (recipient) {
      sponsorBody.allowedAddresses = [recipient];
    }

    const sponsorRes = await fetch(`${ENOKI_BASE}/transaction-blocks/sponsor`, {
      method: 'POST',
      headers: sponsorHeaders,
      body: JSON.stringify(sponsorBody),
    });

    if (!sponsorRes.ok) {
      const errorBody = await sponsorRes.text().catch(() => '');
      console.error(`[sponsor] Enoki error (${sponsorRes.status}):`, errorBody);

      let parsed: { message?: string } = {};
      try { parsed = JSON.parse(errorBody); } catch {}

      if (sponsorRes.status === 429) {
        return NextResponse.json(
          { error: 'Too many transactions. Please try again shortly.' },
          { status: 429 },
        );
      }

      return NextResponse.json(
        { error: parsed.message ?? `Sponsorship failed (${sponsorRes.status})` },
        { status: sponsorRes.status >= 500 ? 502 : sponsorRes.status },
      );
    }

    const { data } = await sponsorRes.json();

    return NextResponse.json({
      bytes: data.bytes,
      digest: data.digest,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transaction build failed';
    const stack = err instanceof Error ? err.stack : '';
    console.error('[prepare] Error:', message, stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function buildTransaction(params: BuildRequest): Promise<Transaction> {
  const { type, address, amount, recipient, asset } = params;
  const tx = new Transaction();
  tx.setSender(address);

  switch (type) {
    case 'send': {
      if (!recipient || !recipient.startsWith('0x')) {
        throw new Error('Invalid recipient');
      }

      const assetKey = asset ?? 'USDC';
      const coinType = assetKey === 'SUI' ? '0x2::sui::SUI' : USDC_TYPE;
      const decimals = assetKey === 'SUI' ? 9 : 6;
      const rawAmount = BigInt(Math.round(amount * 10 ** decimals));

      const coins = await client.getCoins({ owner: address, coinType });
      if (!coins.data.length) {
        throw new Error(`No ${assetKey} coins found`);
      }

      const coinIds = coins.data.map(c => c.coinObjectId);
      if (coinIds.length > 1) {
        tx.mergeCoins(tx.object(coinIds[0]), coinIds.slice(1).map(id => tx.object(id)));
      }
      const [split] = tx.splitCoins(tx.object(coinIds[0]), [rawAmount]);
      tx.transferObjects([split], recipient);
      break;
    }

    case 'save': {
      const navi = getNaviAdapter();
      const result = await navi.buildSaveTx(address, amount, asset ?? 'USDC', { sponsored: true });
      return result.tx;
    }

    case 'withdraw': {
      const navi = getNaviAdapter();
      const result = await navi.buildWithdrawTx(address, amount, asset ?? 'USDC', { sponsored: true });
      return result.tx;
    }

    case 'borrow': {
      const navi = getNaviAdapter();
      const result = await navi.buildBorrowTx(address, amount, asset ?? 'USDC', { sponsored: true });
      return result.tx;
    }

    case 'repay': {
      const navi = getNaviAdapter();
      const result = await navi.buildRepayTx(address, amount, asset ?? 'USDC', { sponsored: true });
      return result.tx;
    }

    case 'swap': {
      const from = params.fromAsset ?? 'USDC';
      const to = params.toAsset ?? 'SUI';
      const fromInfo = ASSET_COIN_TYPES[from];
      if (!fromInfo) throw new Error(`Unsupported asset: ${from}`);

      const rawAmount = BigInt(Math.round(amount * 10 ** fromInfo.decimals));
      const coins = await client.getCoins({ owner: address, coinType: fromInfo.type });
      if (!coins.data.length) throw new Error(`No ${from} coins found`);

      const coinIds = coins.data.map((c) => c.coinObjectId);
      if (coinIds.length > 1) {
        tx.mergeCoins(tx.object(coinIds[0]), coinIds.slice(1).map((id) => tx.object(id)));
      }
      const [inputCoin] = tx.splitCoins(tx.object(coinIds[0]), [rawAmount]);

      const cetus = getCetusAdapter();
      const { outputCoin } = await cetus.addSwapToTx(tx, address, inputCoin, from, to, amount);
      tx.transferObjects([outputCoin], address);
      break;
    }

    case 'claim-rewards': {
      const navi = getNaviAdapter();
      const claimed = await navi.addClaimRewardsToTx(tx, address);
      if (claimed.length === 0) {
        throw new Error('No rewards available to claim');
      }
      break;
    }

    default:
      throw new Error(`Unknown transaction type: ${type}`);
  }

  return tx;
}
