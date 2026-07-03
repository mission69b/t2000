import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: cross-chain fee gauge (§II.17 Shelf v3).
// Sold by the "Gas Gauge" seed agent — reachable ONLY through the paid
// commerce delivery leg (signed x-t2000-delivery header).
//
// One call → the current cost to transact on Bitcoin, Ethereum, and Sui:
// per-chain fee state (cheap / normal / congested), a USD estimate for a
// simple transfer, and which chain is cheapest right now. Built for agents
// that move money and care when they do it. No input needed.
export const dynamic = 'force-dynamic';

const MEMPOOL = 'https://mempool.space/api/v1/fees/recommended';
const ETH_RPC = 'https://ethereum-rpc.publicnode.com';
const SUI_RPC = 'https://fullnode.mainnet.sui.io';
const CG_PRICES =
  'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,sui&vs_currencies=usd';

// Simple-transfer cost models (disclosed): BTC P2WPKH ~140 vB; ETH transfer
// 21k gas; Sui transfer ~0.0035 SUI total budget at the reference price.
const BTC_TRANSFER_VBYTES = 140;
const ETH_TRANSFER_GAS = 21_000;
const SUI_TRANSFER_SUI = 0.0035;

type MempoolFees = { fastestFee: number; halfHourFee: number; hourFee: number };
type FeeHistory = { result?: { baseFeePerGas?: string[] } };
type SuiGas = { result?: string };
type Prices = Record<string, { usd?: number }>;

function feeState(value: number, cheap: number, normal: number): 'cheap' | 'normal' | 'congested' {
  if (value <= cheap) {
    return 'cheap';
  }
  if (value <= normal) {
    return 'normal';
  }
  return 'congested';
}

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  const [btcR, ethR, suiR, priceR] = await Promise.allSettled([
    fetch(MEMPOOL, { headers: { accept: 'application/json' }, next: { revalidate: 120 } }).then(
      async (r) => {
        if (!r.ok) {
          throw new Error(`mempool ${r.status}`);
        }
        return (await r.json()) as MempoolFees;
      },
    ),
    fetch(ETH_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_feeHistory',
        params: ['0xa', 'latest', [50]],
      }),
      next: { revalidate: 120 },
    }).then(async (r) => {
      if (!r.ok) {
        throw new Error(`eth rpc ${r.status}`);
      }
      return (await r.json()) as FeeHistory;
    }),
    fetch(SUI_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'suix_getReferenceGasPrice',
        params: [],
      }),
      next: { revalidate: 600 },
    }).then(async (r) => {
      if (!r.ok) {
        throw new Error(`sui rpc ${r.status}`);
      }
      return (await r.json()) as SuiGas;
    }),
    fetch(CG_PRICES, { headers: { accept: 'application/json' }, next: { revalidate: 600 } }).then(
      async (r) => {
        if (!r.ok) {
          throw new Error(`prices ${r.status}`);
        }
        return (await r.json()) as Prices;
      },
    ),
  ]);

  const gaps: string[] = [];
  const prices = priceR.status === 'fulfilled' ? priceR.value : null;
  if (!prices) {
    gaps.push('USD price lane unavailable — per-chain fee states still valid');
  }

  const chains: Record<string, unknown>[] = [];

  // Bitcoin
  if (btcR.status === 'fulfilled') {
    const satPerVb = btcR.value.fastestFee;
    const btcUsd = prices?.bitcoin?.usd;
    const transferUsd = btcUsd
      ? (satPerVb * BTC_TRANSFER_VBYTES * btcUsd) / 1e8
      : null;
    chains.push({
      chain: 'bitcoin',
      state: feeState(satPerVb, 5, 40),
      fastestSatPerVb: satPerVb,
      halfHourSatPerVb: btcR.value.halfHourFee,
      simpleTransferUsd: transferUsd === null ? null : Number(transferUsd.toFixed(2)),
    });
  } else {
    gaps.push('bitcoin lane unavailable');
  }

  // Ethereum
  if (ethR.status === 'fulfilled' && ethR.value.result?.baseFeePerGas?.length) {
    const bases = ethR.value.result.baseFeePerGas.map((h) => Number.parseInt(h, 16) / 1e9);
    const baseNow = bases.at(-1) as number;
    const baseAvg10 = bases.reduce((a, b) => a + b, 0) / bases.length;
    const ethUsd = prices?.ethereum?.usd;
    // Priority tip ~0.5 gwei on top of base for a plain transfer.
    const gweiTotal = baseNow + 0.5;
    const transferUsd = ethUsd ? (gweiTotal * ETH_TRANSFER_GAS * ethUsd) / 1e9 : null;
    chains.push({
      chain: 'ethereum',
      state: feeState(baseNow, 3, 25),
      baseFeeGwei: Number(baseNow.toFixed(2)),
      baseFeeTrend10Blocks: baseNow > baseAvg10 * 1.15 ? 'rising' : baseNow < baseAvg10 * 0.85 ? 'falling' : 'stable',
      simpleTransferUsd: transferUsd === null ? null : Number(transferUsd.toFixed(2)),
    });
  } else {
    gaps.push('ethereum lane unavailable');
  }

  // Sui
  if (suiR.status === 'fulfilled' && suiR.value.result) {
    const refPriceMist = Number.parseInt(suiR.value.result, 10);
    const suiUsd = prices?.sui?.usd;
    const transferUsd = suiUsd ? SUI_TRANSFER_SUI * suiUsd : null;
    chains.push({
      chain: 'sui',
      state: 'cheap',
      referenceGasPriceMist: refPriceMist,
      simpleTransferUsd: transferUsd === null ? null : Number(transferUsd.toFixed(4)),
      note: 'Sui fees are flat + predictable; USDC/USDsui sends via the t2000 rail are gasless entirely.',
    });
  } else {
    gaps.push('sui lane unavailable');
  }

  if (chains.length === 0) {
    return Response.json(
      { error: 'All chain fee lanes unavailable — try again shortly.' },
      { status: 502 },
    );
  }

  const priced = chains.filter((c) => typeof c.simpleTransferUsd === 'number') as {
    chain: string;
    simpleTransferUsd: number;
  }[];
  const cheapest = priced.length
    ? priced.reduce((a, b) => (a.simpleTransferUsd <= b.simpleTransferUsd ? a : b)).chain
    : null;

  return Response.json({
    report: 'gas-gauge',
    generatedAt: new Date().toISOString(),
    method:
      'BTC = mempool.space recommended fees (cheap ≤ 5 sat/vB fastest, congested > 40), transfer modeled at 140 vB. ETH = eth_feeHistory base fee over 10 blocks + 0.5 gwei tip (cheap ≤ 3 gwei, congested > 25), transfer at 21k gas. Sui = on-chain reference gas price, transfer modeled at 0.0035 SUI. USD via live prices. Thresholds disclosed; states valid without the price lane.',
    source:
      'mempool.space (open) · Ethereum JSON-RPC (PublicNode) · Sui mainnet RPC · prices provided by CoinGecko (https://www.coingecko.com/en/api)',
    chains,
    cheapestChain: cheapest,
    dataGaps: gaps,
    read: `${chains
      .map((c) => `${c.chain as string}: ${c.state as string}${typeof c.simpleTransferUsd === 'number' ? ` (~$${c.simpleTransferUsd} transfer)` : ''}`)
      .join(' · ')}${cheapest ? ` → cheapest to move value: ${cheapest}` : ''}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
