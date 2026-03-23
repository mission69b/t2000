import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const ENOKI_SECRET_KEY = process.env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';

const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

type TxType = 'send' | 'save' | 'withdraw' | 'borrow' | 'repay';

interface BuildRequest {
  type: TxType;
  address: string;
  amount: number;
  recipient?: string;
  asset?: string;
}

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const MIST_PER_SUI = 1_000_000_000;

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

  let body: BuildRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, address, amount, recipient, asset } = body;

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  try {
    const tx = await buildTransaction({ type, address, amount, recipient, asset });

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

      const assetKey = asset ?? 'SUI';
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
      const { NaviAdapter } = await import('@t2000/sdk/adapters');
      const navi = new NaviAdapter();
      navi.initSync(client);
      const result = await navi.buildSaveTx(address, amount, 'USDC');
      return result.tx;
    }

    case 'withdraw': {
      const { NaviAdapter } = await import('@t2000/sdk/adapters');
      const navi = new NaviAdapter();
      navi.initSync(client);
      const result = await navi.buildWithdrawTx(address, amount, 'USDC');
      return result.tx;
    }

    case 'borrow': {
      const { NaviAdapter } = await import('@t2000/sdk/adapters');
      const navi = new NaviAdapter();
      navi.initSync(client);
      const result = await navi.buildBorrowTx(address, amount, 'USDC');
      return result.tx;
    }

    case 'repay': {
      const { NaviAdapter } = await import('@t2000/sdk/adapters');
      const navi = new NaviAdapter();
      navi.initSync(client);
      const result = await navi.buildRepayTx(address, amount, 'USDC');
      return result.tx;
    }

    default:
      throw new Error(`Unknown transaction type: ${type}`);
  }

  return tx;
}
