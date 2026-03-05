import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { prisma } from '../db/prisma.js';
import { fetchCheckpoints, getLatestCheckpoint } from './checkpoint.js';
import { parseFeeEvents, parseTransfers } from './eventParser.js';

const POLL_INTERVAL_MS = parseInt(process.env.INDEXER_POLL_INTERVAL_MS ?? '2000', 10);
const BATCH_SIZE = 10;

let running = false;

function getClient(): SuiJsonRpcClient {
  const url = process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl('mainnet');
  return new SuiJsonRpcClient({ url, network: 'mainnet' });
}

async function getOrCreateCursor(): Promise<string | null> {
  const cursor = await prisma.indexerCursor.findUnique({
    where: { cursorName: 'main' },
  });

  if (cursor) return cursor.lastCheckpoint.toString();

  // First run — start from current checkpoint
  const client = getClient();
  const latest = await getLatestCheckpoint(client);

  await prisma.indexerCursor.create({
    data: {
      cursorName: 'main',
      lastCheckpoint: BigInt(latest),
    },
  });

  console.log(`[indexer] Initialized cursor at checkpoint ${latest}`);
  return latest;
}

async function getKnownAgents(): Promise<Set<string>> {
  const agents = await prisma.agent.findMany({ select: { address: true } });
  return new Set(agents.map((a: { address: string }) => a.address));
}

async function processCheckpoints(
  client: SuiJsonRpcClient,
  cursor: string,
  knownAgents: Set<string>,
): Promise<string> {
  const batch = await fetchCheckpoints(client, cursor, BATCH_SIZE);

  if (batch.checkpoints.length === 0) return cursor;

  let feeCount = 0;
  let txCount = 0;
  let lastSeq = cursor;

  for (const cp of batch.checkpoints) {
    for (const tx of cp.transactions) {
      // Parse fee events
      const fees = parseFeeEvents(tx);
      for (const fee of fees) {
        try {
          await prisma.protocolFeeLedger.upsert({
            where: { txDigest: fee.txDigest } as never,
            update: {},
            create: {
              agentAddress: fee.agentAddress,
              operation: fee.operation,
              feeAmount: fee.feeAmount,
              feeRate: '0',
              txDigest: fee.txDigest,
            },
          });
          feeCount++;
        } catch {
          // Duplicate or FK constraint — skip
        }
      }

      // Parse transfers for known agents
      const transfers = parseTransfers(tx, knownAgents);
      for (const transfer of transfers) {
        try {
          await prisma.transaction.upsert({
            where: { txDigest: transfer.txDigest },
            update: {},
            create: {
              agentAddress: transfer.agentAddress,
              txDigest: transfer.txDigest,
              action: transfer.action,
              asset: transfer.asset,
              amount: transfer.amount,
              gasMethod: transfer.gasMethod,
              executedAt: new Date(transfer.timestamp),
            },
          });
          txCount++;
        } catch {
          // Duplicate — skip
        }
      }
    }

    lastSeq = cp.sequenceNumber;
  }

  // Atomically update cursor
  await prisma.indexerCursor.update({
    where: { cursorName: 'main' },
    data: {
      lastCheckpoint: BigInt(lastSeq),
      lastProcessedAt: new Date(),
    },
  });

  if (feeCount > 0 || txCount > 0) {
    console.log(`[indexer] Checkpoint ${lastSeq}: ${feeCount} fees, ${txCount} txs`);
  }

  return batch.nextCursor;
}

async function pollLoop(): Promise<void> {
  const client = getClient();
  let cursor = await getOrCreateCursor();
  let knownAgents = await getKnownAgents();
  let agentRefreshCounter = 0;

  console.log(`[indexer] Starting from checkpoint ${cursor}`);

  while (running) {
    try {
      // Refresh known agents every 100 iterations (~200s at 2s poll)
      if (agentRefreshCounter++ % 100 === 0) {
        knownAgents = await getKnownAgents();
      }

      cursor = await processCheckpoints(client, cursor!, knownAgents);
    } catch (err) {
      console.error('[indexer] Error:', err instanceof Error ? err.message : err);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

export function startIndexer(): void {
  if (running) return;
  running = true;
  console.log('[indexer] Starting checkpoint indexer...');
  pollLoop().catch((err) => {
    console.error('[indexer] Fatal error:', err);
    running = false;
  });
}

export function stopIndexer(): void {
  running = false;
}

export async function getIndexerStatus(): Promise<{
  lastCheckpoint: string;
  latestCheckpoint: string;
  lag: number;
  lastProcessedAt: string;
} | null> {
  try {
    const cursor = await prisma.indexerCursor.findUnique({
      where: { cursorName: 'main' },
    });
    if (!cursor) return null;

    const client = getClient();
    const latest = await getLatestCheckpoint(client);
    const lag = Number(BigInt(latest) - cursor.lastCheckpoint);

    return {
      lastCheckpoint: cursor.lastCheckpoint.toString(),
      latestCheckpoint: latest,
      lag,
      lastProcessedAt: cursor.lastProcessedAt.toISOString(),
    };
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
