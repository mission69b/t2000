import { round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: Sui network vitals (S.624 Shelf v4).
// NOTE: JSON-RPC read — sweep to gRPC/GraphQL before the July 31 JSON-RPC
// deactivation (greppable: fullnode.mainnet.sui.io).
export const dynamic = 'force-dynamic';

const SUI_RPC = 'https://fullnode.mainnet.sui.io';

type SystemState = {
  epoch: string;
  epochStartTimestampMs: string;
  epochDurationMs: string;
  referenceGasPrice: string;
  activeValidators: { name: string; nextEpochStake: string }[];
};

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  let state: SystemState;
  try {
    const res = await fetch(SUI_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'suix_getLatestSuiSystemState',
        params: [],
      }),
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      throw new Error(`sui rpc ${res.status}`);
    }
    const json = (await res.json()) as { result?: SystemState };
    if (!json.result) {
      throw new Error('empty result');
    }
    state = json.result;
  } catch {
    return upstreamDown('Sui RPC');
  }

  const start = Number.parseInt(state.epochStartTimestampMs, 10);
  const duration = Number.parseInt(state.epochDurationMs, 10);
  const remainingH = Math.max((start + duration - Date.now()) / 3_600_000, 0);
  const stakes = state.activeValidators
    .map((v) => ({ name: v.name, stake: Number.parseInt(v.nextEpochStake, 10) / 1e9 }))
    .sort((a, b) => b.stake - a.stake);
  const totalStake = stakes.reduce((a, v) => a + v.stake, 0);
  const top10Pct = round(
    (stakes.slice(0, 10).reduce((a, v) => a + v.stake, 0) / totalStake) * 100,
    1,
  );

  return Response.json({
    report: 'sui-epoch',
    generatedAt: new Date().toISOString(),
    method:
      'Sui system state, one read: current epoch + hours remaining (start + duration vs now), reference gas price (MIST), validator count, total stake, and top-10 stake concentration. Network vitals — no price lane. Public on-chain data.',
    source: 'Sui mainnet RPC',
    epoch: Number.parseInt(state.epoch, 10),
    epochHoursRemaining: round(remainingH, 1),
    referenceGasPriceMist: Number.parseInt(state.referenceGasPrice, 10),
    validators: {
      count: state.activeValidators.length,
      totalStakeSui: Math.round(totalStake),
      top10StakePct: top10Pct,
      largest: stakes.slice(0, 5).map((v) => ({ name: v.name, stakeSui: Math.round(v.stake) })),
    },
    dataGaps: [],
    read: `Epoch ${state.epoch}, ~${round(remainingH, 1)}h left; ref gas ${state.referenceGasPrice} MIST; ${state.activeValidators.length} validators, top-10 hold ${top10Pct}% of stake.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
