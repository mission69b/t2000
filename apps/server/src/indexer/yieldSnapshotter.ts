import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { getLendingState } from '@naviprotocol/lending';
import { prisma } from '../db/prisma.js';

const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const NAVI_BALANCE_DECIMALS = 9;

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

let timer: ReturnType<typeof setInterval> | null = null;

function getClient(): SuiClient {
  const url = process.env.SUI_RPC_URL ?? getFullnodeUrl('mainnet');
  return new SuiClient({ url });
}

async function getNaviPositionForAgent(
  client: SuiClient,
  agentAddress: string,
): Promise<{ supplied: number } | null> {
  try {
    const state = await getLendingState(agentAddress, {
      client,
      env: 'prod' as const,
      disableCache: true,
    });

    if (!state || state.length === 0) return null;

    const usdcPos = state.find(
      (p) => p.pool.token?.symbol === 'USDC' || p.pool.coinType?.toLowerCase().includes('usdc'),
    );

    if (!usdcPos) return { supplied: 0 };

    const supplied = Number(usdcPos.supplyBalance) / 10 ** NAVI_BALANCE_DECIMALS;
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
