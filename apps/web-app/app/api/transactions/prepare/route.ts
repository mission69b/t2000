import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import {
  depositCoinPTB,
  withdrawCoinPTB,
  borrowCoinPTB,
  repayCoinPTB,
  getPools,
  getLendingPositions,
  updateOraclePriceBeforeUserOperationPTB,
} from '@naviprotocol/lending';

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
const USDC_DECIMALS = 6;
const MIST_PER_SUI = 1_000_000_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function naviOpts(): { env: 'prod'; client: any; cacheTime: number; disableCache: boolean } {
  return { env: 'prod', client, cacheTime: 0, disableCache: true };
}

async function fetchCoins(
  owner: string,
  coinType: string,
): Promise<Array<{ coinObjectId: string; balance: string }>> {
  const all: Array<{ coinObjectId: string; balance: string }> = [];
  let cursor: string | null | undefined;
  let hasNext = true;
  while (hasNext) {
    const page = await client.getCoins({ owner, coinType, cursor: cursor ?? undefined });
    all.push(...page.data.map((c) => ({ coinObjectId: c.coinObjectId, balance: c.balance })));
    cursor = page.nextCursor;
    hasNext = page.hasNextPage;
  }
  return all;
}

function mergeCoins(
  tx: Transaction,
  coins: Array<{ coinObjectId: string }>,
): TransactionObjectArgument {
  const primary = tx.object(coins[0].coinObjectId);
  if (coins.length > 1) {
    tx.mergeCoins(primary, coins.slice(1).map((c) => tx.object(c.coinObjectId)));
  }
  return primary;
}

async function refreshOracle(tx: Transaction, address: string): Promise<void> {
  const origInfo = console.info;
  const origWarn = console.warn;
  console.info = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('stale price feed')) return;
    origInfo.apply(console, args);
  };
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('price feed')) return;
    origWarn.apply(console, args);
  };
  try {
    const pools = await getPools(naviOpts());
    await updateOraclePriceBeforeUserOperationPTB(tx, address, pools, {
      ...naviOpts(),
      throws: false,
    });
  } catch {
    // Best-effort: operation may succeed if on-chain prices are fresh
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
  }
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
      const decimals = assetKey === 'SUI' ? 9 : USDC_DECIMALS;
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
      const coins = await fetchCoins(address, USDC_TYPE);
      if (coins.length === 0) throw new Error('No USDC coins found');

      const coinObj = mergeCoins(tx, coins);
      const rawAmount = Math.round(amount * 10 ** USDC_DECIMALS);

      await depositCoinPTB(tx, USDC_TYPE, coinObj as never, {
        ...naviOpts(),
        amount: rawAmount,
      });
      return tx;
    }

    case 'withdraw': {
      const positions = await getLendingPositions(address, {
        ...naviOpts(),
        markets: ['main'],
      });

      let deposited = 0;
      for (const pos of positions) {
        const data = pos['navi-lending-supply'] ?? pos['navi-lending-emode-supply'];
        if (!data) continue;
        const coinSuffix = (data.token?.coinType ?? '').split('::').slice(1).join('::').toLowerCase();
        if (coinSuffix === 'usdc::usdc') {
          deposited = parseFloat(data.amount);
        }
      }

      const dustBuffer = 1000 / 10 ** USDC_DECIMALS;
      const effectiveAmount = Math.min(amount, Math.max(0, deposited - dustBuffer));
      if (effectiveAmount <= 0) throw new Error('Nothing to withdraw from NAVI');

      const rawAmount = Math.round(effectiveAmount * 10 ** USDC_DECIMALS);

      await refreshOracle(tx, address);

      const coin = await withdrawCoinPTB(tx, USDC_TYPE, rawAmount, naviOpts());
      tx.transferObjects([coin as TransactionObjectArgument], address);
      return tx;
    }

    case 'borrow': {
      const rawAmount = Math.round(amount * 10 ** USDC_DECIMALS);

      await refreshOracle(tx, address);

      const borrowedCoin = await borrowCoinPTB(tx, USDC_TYPE, rawAmount, naviOpts());
      tx.transferObjects([borrowedCoin as TransactionObjectArgument], address);
      return tx;
    }

    case 'repay': {
      const coins = await fetchCoins(address, USDC_TYPE);
      if (coins.length === 0) throw new Error('No USDC coins to repay with');

      const coinObj = mergeCoins(tx, coins);
      const rawAmount = Math.round(amount * 10 ** USDC_DECIMALS);
      const [repayCoin] = tx.splitCoins(coinObj, [rawAmount]);

      await refreshOracle(tx, address);

      await repayCoinPTB(tx, USDC_TYPE, repayCoin as never, {
        ...naviOpts(),
        amount: rawAmount,
      });
      return tx;
    }

    default:
      throw new Error(`Unknown transaction type: ${type}`);
  }

  return tx;
}
