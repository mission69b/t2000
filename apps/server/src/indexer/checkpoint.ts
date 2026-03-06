import type { SuiJsonRpcClient, SuiTransactionBlockResponse, SuiEvent } from '@mysten/sui/jsonRpc';

export interface CheckpointBatch {
  checkpoints: ParsedCheckpoint[];
  nextCursor: string;
}

export interface ParsedCheckpoint {
  sequenceNumber: string;
  transactions: ParsedTransaction[];
}

export interface ParsedTransaction {
  digest: string;
  sender: string;
  timestamp: number;
  events: SuiEvent[];
  balanceChanges: Array<{
    owner: { AddressOwner: string } | { ObjectOwner: string } | { Shared: { initialSharedVersion: number } };
    coinType: string;
    amount: string;
  }>;
  moveCallTargets: string[];
}

export async function fetchCheckpoints(
  client: SuiJsonRpcClient,
  cursor: string | null,
  limit: number = 10,
): Promise<CheckpointBatch> {
  const checkpointsResp = await client.getCheckpoints({
    cursor: cursor ?? undefined,
    limit,
    descendingOrder: false,
  });

  const parsed: ParsedCheckpoint[] = [];

  for (const cp of checkpointsResp.data) {
    const txDigests = cp.transactions ?? [];
    if (txDigests.length === 0) {
      parsed.push({ sequenceNumber: cp.sequenceNumber, transactions: [] });
      continue;
    }

    const RPC_BATCH_LIMIT = 50;
    const txBlocks: SuiTransactionBlockResponse[] = [];
    for (let i = 0; i < txDigests.length; i += RPC_BATCH_LIMIT) {
      const batch = txDigests.slice(i, i + RPC_BATCH_LIMIT);
      const results = await client.multiGetTransactionBlocks({
        digests: batch,
        options: {
          showEvents: true,
          showBalanceChanges: true,
          showInput: true,
          showEffects: true,
        },
      });
      txBlocks.push(...results);
    }

    const transactions: ParsedTransaction[] = txBlocks.map((tx) => {
      const moveCallTargets: string[] = [];
      const txKind = tx.transaction?.data?.transaction;
      if (txKind && 'transactions' in txKind) {
        for (const cmd of (txKind as { transactions: Array<Record<string, unknown>> }).transactions) {
          if ('MoveCall' in cmd) {
            const mc = cmd.MoveCall as { package: string; module: string; function: string };
            moveCallTargets.push(`${mc.package}::${mc.module}::${mc.function}`);
          }
        }
      }
      return {
        digest: tx.digest,
        sender: tx.transaction?.data?.sender ?? '',
        timestamp: Number(tx.timestampMs ?? 0),
        events: tx.events ?? [],
        balanceChanges: (tx.balanceChanges ?? []) as ParsedTransaction['balanceChanges'],
        moveCallTargets,
      };
    });

    parsed.push({
      sequenceNumber: cp.sequenceNumber,
      transactions,
    });
  }

  return {
    checkpoints: parsed,
    nextCursor: checkpointsResp.nextCursor ?? checkpointsResp.data[checkpointsResp.data.length - 1]?.sequenceNumber ?? cursor ?? '0',
  };
}

export async function getLatestCheckpoint(client: SuiJsonRpcClient): Promise<string> {
  return client.getLatestCheckpointSequenceNumber();
}
