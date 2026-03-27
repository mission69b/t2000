import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { prisma } from '../db/prisma.js';
import type { ProtocolRegistry as RegistryType } from '@t2000/sdk/adapters';

const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let timer: ReturnType<typeof setInterval> | null = null;
let registry: RegistryType | null = null;

function getClient(): SuiJsonRpcClient {
  const url = process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl('mainnet');
  return new SuiJsonRpcClient({ url, network: 'mainnet' });
}

async function getRegistry(client: SuiJsonRpcClient): Promise<RegistryType> {
  if (registry) return registry;

  const { ProtocolRegistry, NaviAdapter } = await import('@t2000/sdk/adapters');
  registry = new ProtocolRegistry();

  const navi = new NaviAdapter();
  await navi.init(client);
  registry.registerLending(navi);

  try {
    const { SuilendAdapter } = await import('@t2000/sdk/adapters');
    const suilend = new SuilendAdapter();
    await suilend.init(client);
    registry.registerLending(suilend);
  } catch (err) {
    console.warn('[yield] Suilend adapter failed to load — running with NAVI only:', err instanceof Error ? err.message : err);
  }

  return registry;
}

async function getPositionsForAgent(
  reg: RegistryType,
  agentAddress: string,
): Promise<{ supplied: number; apy: number } | null> {
  try {
    const allPos = await reg.allPositions(agentAddress);
    let totalSupplied = 0;
    let weightedApy = 0;

    for (const protocolEntry of allPos) {
      for (const supply of protocolEntry.positions.supplies) {
        totalSupplied += supply.amount;
        weightedApy += supply.amount * supply.apy;
      }
    }

    const apy = totalSupplied > 0 ? weightedApy / totalSupplied : 0;
    return { supplied: totalSupplied, apy };
  } catch {
    return null;
  }
}

async function takeSnapshots(): Promise<void> {
  const agents = await prisma.agent.findMany({ select: { address: true } });
  if (agents.length === 0) return;

  const client = getClient();
  const reg = await getRegistry(client);
  let snapshotCount = 0;

  for (const agent of agents) {
    try {
      const position = await getPositionsForAgent(reg, agent.address);
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
          apy: position.apy.toFixed(2),
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

const INITIAL_DELAY_MS = 30 * 60 * 1000; // 30 min — let indexer catch up first

export function startYieldSnapshotter(): void {
  if (timer) return;
  console.log(`[yield] Starting yield snapshotter (first run in ${INITIAL_DELAY_MS / 60_000}min, then hourly)`);

  setTimeout(() => {
    takeSnapshots().catch(console.error);
    timer = setInterval(() => {
      takeSnapshots().catch(console.error);
    }, SNAPSHOT_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}

export function stopYieldSnapshotter(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
