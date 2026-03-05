import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { prisma } from '../db/prisma.js';

const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const NAVI_BALANCE_DECIMALS = 9;
const RATE_DECIMALS = 27;

const CONFIG_API = 'https://open-api.naviprotocol.io/api/navi/config?env=prod';
const POOLS_API = 'https://open-api.naviprotocol.io/api/navi/pools?env=prod';

const UserStateInfo = bcs.struct('UserStateInfo', {
  asset_id: bcs.u8(),
  borrow_balance: bcs.u256(),
  supply_balance: bcs.u256(),
});

let timer: ReturnType<typeof setInterval> | null = null;

function getClient(): SuiJsonRpcClient {
  const url = process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl('mainnet');
  return new SuiJsonRpcClient({ url, network: 'mainnet' });
}

async function getNaviPositionForAgent(
  client: SuiJsonRpcClient,
  agentAddress: string,
): Promise<{ supplied: number } | null> {
  try {
    const [configRes, poolsRes] = await Promise.all([
      fetch(CONFIG_API).then((r) => r.json() as Promise<{ data: { storage: string; uiGetter: string } }>),
      fetch(POOLS_API).then((r) => r.json() as Promise<{ data: Array<{ id: number; token: { symbol: string }; currentSupplyIndex: string; coinType: string }> }>),
    ]);

    const config = configRes.data;
    const pools = poolsRes.data;
    const usdcPool = pools.find(
      (p) => p.token?.symbol === 'USDC' || p.coinType?.toLowerCase().includes('usdc'),
    );
    if (!usdcPool) return { supplied: 0 };

    const tx = new Transaction();
    tx.moveCall({
      target: `${config.uiGetter}::getter_unchecked::get_user_state`,
      arguments: [tx.object(config.storage), tx.pure.address(agentAddress)],
    });

    const result = await client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: agentAddress,
    });

    if (result.error || !result.results?.[0]?.returnValues?.[0]) return null;
    const bytes = Uint8Array.from(result.results[0].returnValues[0][0]);
    const states = bcs.vector(UserStateInfo).parse(bytes);

    const usdcState = states.find((s: { asset_id: number }) => s.asset_id === usdcPool.id);
    if (!usdcState || String(usdcState.supply_balance) === '0') return { supplied: 0 };

    const supplyBal = BigInt(String(usdcState.supply_balance));
    const scale = BigInt('1' + '0'.repeat(RATE_DECIMALS));
    const half = scale / 2n;
    const compounded = (supplyBal * scale + half) / BigInt(usdcPool.currentSupplyIndex);
    const supplied = Number(compounded) / 10 ** NAVI_BALANCE_DECIMALS;

    return { supplied };
  } catch {
    return null;
  }
}

async function takeSnapshots(): Promise<void> {
  const agents = await prisma.agent.findMany({ select: { address: true } });
  if (agents.length === 0) return;

  const client = getClient();
  let snapshotCount = 0;

  for (const agent of agents) {
    try {
      const position = await getNaviPositionForAgent(client, agent.address);
      if (!position || position.supplied <= 0) continue;

      const lastSnapshot = await prisma.yieldSnapshot.findFirst({
        where: { agentAddress: agent.address },
        orderBy: { snapshotAt: 'desc' },
      });

      const previousSupplied = lastSnapshot ? Number(lastSnapshot.suppliedUsd) : 0;
      const yieldEarned = Math.max(0, position.supplied - previousSupplied);

      await prisma.yieldSnapshot.create({
        data: {
          agentAddress: agent.address,
          suppliedUsd: position.supplied.toString(),
          yieldEarned: yieldEarned.toString(),
          apy: '4.5',
        },
      });

      snapshotCount++;
    } catch (err) {
      console.error(`[yield] Error for ${agent.address}:`, err instanceof Error ? err.message : err);
    }
  }

  if (snapshotCount > 0) {
    console.log(`[yield] Took ${snapshotCount} snapshots`);
  }
}

export function startYieldSnapshotter(): void {
  if (timer) return;
  console.log('[yield] Starting yield snapshotter (hourly)');

  setTimeout(() => {
    takeSnapshots().catch(console.error);
  }, 5 * 60 * 1000);

  timer = setInterval(() => {
    takeSnapshots().catch(console.error);
  }, SNAPSHOT_INTERVAL_MS);
}

export function stopYieldSnapshotter(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
