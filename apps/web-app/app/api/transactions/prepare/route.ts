import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
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
 * Builds a Sui transaction server-side using the SDK's protocol adapters,
 * then returns serialized transaction bytes for client-side signing.
 */
export async function POST(request: NextRequest) {
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
    let tx: Transaction;

    switch (type) {
      case 'send': {
        if (!recipient || !recipient.startsWith('0x')) {
          return NextResponse.json({ error: 'Invalid recipient' }, { status: 400 });
        }
        tx = new Transaction();
        tx.setSender(address);

        const assetKey = asset ?? 'SUI';
        if (assetKey === 'SUI') {
          const rawAmount = BigInt(Math.round(amount * MIST_PER_SUI));
          const [coin] = tx.splitCoins(tx.gas, [rawAmount]);
          tx.transferObjects([coin], recipient);
        } else {
          const rawAmount = BigInt(Math.round(amount * 1_000_000));
          const coins = await client.getCoins({ owner: address, coinType: USDC_TYPE });
          if (!coins.data.length) {
            return NextResponse.json({ error: 'No USDC coins found' }, { status: 400 });
          }
          const coinIds = coins.data.map(c => c.coinObjectId);
          if (coinIds.length > 1) {
            tx.mergeCoins(tx.object(coinIds[0]), coinIds.slice(1).map(id => tx.object(id)));
          }
          const [split] = tx.splitCoins(tx.object(coinIds[0]), [rawAmount]);
          tx.transferObjects([split], recipient);
        }
        break;
      }

      case 'save': {
        const { NaviAdapter } = await import('@t2000/sdk/adapters');
        const navi = new NaviAdapter();
        navi.initSync(client);
        const result = await navi.buildSaveTx(address, amount, 'USDC');
        tx = result.tx;
        tx.setSender(address);
        break;
      }

      case 'withdraw': {
        const { NaviAdapter } = await import('@t2000/sdk/adapters');
        const navi = new NaviAdapter();
        navi.initSync(client);
        const result = await navi.buildWithdrawTx(address, amount, 'USDC');
        tx = result.tx;
        tx.setSender(address);
        break;
      }

      case 'borrow': {
        const { NaviAdapter } = await import('@t2000/sdk/adapters');
        const navi = new NaviAdapter();
        navi.initSync(client);
        const result = await navi.buildBorrowTx(address, amount, 'USDC');
        tx = result.tx;
        tx.setSender(address);
        break;
      }

      case 'repay': {
        const { NaviAdapter } = await import('@t2000/sdk/adapters');
        const navi = new NaviAdapter();
        navi.initSync(client);
        const result = await navi.buildRepayTx(address, amount, 'USDC');
        tx = result.tx;
        tx.setSender(address);
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown transaction type: ${type}` }, { status: 400 });
    }

    const txBytes = await tx.build({ client });
    const serialized = Buffer.from(txBytes).toString('base64');

    return NextResponse.json({ txBytes: serialized });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transaction build failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
