import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { prisma } from '../db/prisma.js';

const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const USDC_DECIMALS = 6;

const SUILEND_LENDING_MARKET = '0x84030d26d85eaa7035084a057f2f11f701b7e2e4eda87551becbc7c97505ece1';
const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

let timer: ReturnType<typeof setInterval> | null = null;

function getClient(): SuiClient {
  const url = process.env.SUI_RPC_URL ?? getFullnodeUrl('mainnet');
  return new SuiClient({ url });
}

async function getObligationForAgent(
  client: SuiClient,
  agentAddress: string,
): Promise<{ supplied: number } | null> {
  try {
    const ownedObjects = await client.getOwnedObjects({
      owner: agentAddress,
      filter: { StructType: `0x06b1e3fe0a0410add53e62183390362a94ee64c6a3a60f27c07e3253c5a85baa::lending_market::ObligationOwnerCap<${SUILEND_LENDING_MARKET}>` },
      options: { showContent: true },
    });

    if (ownedObjects.data.length === 0) return null;

    const cap = ownedObjects.data[0];
    if (!cap?.data?.content || cap.data.content.dataType !== 'moveObject') return null;

    const fields = cap.data.content.fields as Record<string, unknown>;
    const obligationId = String(fields.obligation_id ?? '');
    if (!obligationId) return null;

    const obligation = await client.getObject({
      id: obligationId,
      options: { showContent: true },
    });

    if (!obligation.data?.content || obligation.data.content.dataType !== 'moveObject') return null;

    const oblFields = obligation.data.content.fields as Record<string, unknown>;
    const deposits = oblFields.deposits as Array<Record<string, unknown>> | undefined;

    if (!deposits || deposits.length === 0) return { supplied: 0 };

    let supplied = 0;
    for (const deposit of deposits) {
      const ctokenAmount = Number(deposit.deposited_ctoken_amount ?? deposit.depositedCtokenAmount ?? 0) / 10 ** USDC_DECIMALS;
      supplied += ctokenAmount;
    }

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
      const position = await getObligationForAgent(client, agent.address);
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
