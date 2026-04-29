import { writeFileSync } from 'node:fs';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { prisma } from '../db/prisma.js';
import { fetchCheckpoints, getLatestCheckpoint } from './checkpoint.js';
import { parseFeeEvents, parseTransfers } from './eventParser.js';

const POLL_INTERVAL_MS = parseInt(process.env.INDEXER_POLL_INTERVAL_MS ?? '2000', 10);
const BATCH_SIZE = parseInt(process.env.INDEXER_BATCH_SIZE ?? '10', 10);
const CATCHUP_BATCH_SIZE = 50;
const CATCHUP_THRESHOLD = 1000;
const HEARTBEAT_PATH = '/tmp/indexer-heartbeat';

let running = false;

function getClient(): SuiJsonRpcClient {
  const url = process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl('mainnet');
  return new SuiJsonRpcClient({ url, network: 'mainnet' });
}

function writeHeartbeat(): void {
  try {
    writeFileSync(HEARTBEAT_PATH, Date.now().toString());
  } catch { /* non-critical */ }
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
  batchSize: number = BATCH_SIZE,
): Promise<string> {
  const batch = await fetchCheckpoints(client, cursor, batchSize);

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
      const seenAgents = new Set<string>();
      for (const transfer of transfers) {
        try {
          await prisma.transaction.upsert({
            where: { txDigest: transfer.txDigest },
            update: {},
            create: {
              agentAddress: transfer.agentAddress,
              txDigest: transfer.txDigest,
              action: transfer.action,
              protocol: transfer.protocol,
              asset: transfer.asset,
              amount: transfer.amount,
              executedAt: new Date(transfer.timestamp),
            },
          });
          seenAgents.add(transfer.agentAddress);
          txCount++;
        } catch {
          // Duplicate — skip
        }
      }

      for (const addr of seenAgents) {
        await prisma.agent.update({
          where: { address: addr },
          data: { lastSeen: new Date(tx.timestamp) },
        }).catch(() => {});
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

async function withStartupRetry<T>(label: string, fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === maxRetries) throw err;
      const delay = Math.min(10_000, 2000 * attempt);
      console.warn(`[indexer] ${label} failed (attempt ${attempt}/${maxRetries}): ${msg} — retrying in ${delay / 1000}s`);
      await sleep(delay);
    }
  }
  throw new Error('unreachable');
}

async function pollLoop(): Promise<void> {
  const client = getClient();
  let cursor = await withStartupRetry('getOrCreateCursor', () => getOrCreateCursor());
  let knownAgents = await withStartupRetry('getKnownAgents', () => getKnownAgents());
  let agentRefreshCounter = 0;
  let consecutiveErrors = 0;
  let skipCount = 0;

  console.log(`[indexer] Starting from checkpoint ${cursor}`);

  while (running) {
    try {
      if (agentRefreshCounter++ % 100 === 0) {
        knownAgents = await getKnownAgents();
      }

      const latest = await getLatestCheckpoint(client);
      const lag = Number(BigInt(latest) - BigInt(cursor!));
      const batchSize = lag > CATCHUP_THRESHOLD ? CATCHUP_BATCH_SIZE : BATCH_SIZE;

      if (lag > CATCHUP_THRESHOLD && agentRefreshCounter % 50 === 1) {
        console.log(`[indexer] Catch-up mode: ${lag} checkpoints behind (batch=${batchSize})`);
      }

      cursor = await processCheckpoints(client, cursor!, knownAgents, batchSize);
      consecutiveErrors = 0;
      writeHeartbeat();

      const sleepMs = lag > CATCHUP_THRESHOLD ? 500 : POLL_INTERVAL_MS;
      await sleep(sleepMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes('429') || msg.includes('Too Many Requests')) {
        console.warn(`[indexer] Rate limited — backing off 10s`);
        await sleep(10_000);
        writeHeartbeat();
      } else if (msg.includes('effect is empty') || msg.includes('balance/object changes')) {
        skipCount++;
        const advanced = BigInt(cursor!) + 1n;
        console.warn(`[indexer] Skipping checkpoint ${cursor} (empty effects, ${skipCount} total skips)`);
        await prisma.indexerCursor.update({
          where: { cursorName: 'main' },
          data: { lastCheckpoint: advanced, lastProcessedAt: new Date() },
        });
        cursor = advanced.toString();
        writeHeartbeat();
      } else {
        consecutiveErrors++;
        console.error(`[indexer] Error (${consecutiveErrors}x): ${msg}`);
        if (consecutiveErrors >= 20) {
          console.error('[indexer] 20 consecutive errors — exiting for ECS restart');
          process.exit(1);
        }
        if (consecutiveErrors >= 5) {
          const backoff = Math.min(30_000, 2000 * 2 ** (consecutiveErrors - 5));
          await sleep(backoff);
        }
      }

      await sleep(POLL_INTERVAL_MS);
    }
  }
}

export function startIndexer(): void {
  if (running) return;
  running = true;
  console.log('[indexer] Starting checkpoint indexer...');
  writeHeartbeat();
  pollLoop().catch((err) => {
    console.error('[indexer] Fatal error — exiting for ECS restart:', err);
    process.exit(1);
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
