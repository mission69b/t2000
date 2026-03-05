import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { TransactionRecord } from '../types.js';

export async function queryHistory(
  client: SuiJsonRpcClient,
  address: string,
  limit = 20,
): Promise<TransactionRecord[]> {
  const txns = await client.queryTransactionBlocks({
    filter: { FromAddress: address },
    options: { showEffects: true, showInput: true },
    limit,
    order: 'descending',
  });

  return txns.data.map((tx) => {
    const gasUsed = tx.effects?.gasUsed;
    const gasCost = gasUsed
      ? (Number(gasUsed.computationCost) +
          Number(gasUsed.storageCost) -
          Number(gasUsed.storageRebate)) /
        1e9
      : undefined;

    return {
      digest: tx.digest,
      action: inferAction(tx.transaction),
      timestamp: Number(tx.timestampMs ?? 0),
      gasCost,
    };
  });
}

function inferAction(txBlock: unknown): string {
  if (!txBlock || typeof txBlock !== 'object') return 'unknown';
  const data = 'data' in txBlock ? (txBlock as { data?: unknown }).data : undefined;
  if (!data || typeof data !== 'object') return 'unknown';
  const inner = 'transaction' in data ? (data as { transaction?: unknown }).transaction : undefined;
  if (!inner || typeof inner !== 'object') return 'unknown';

  const kind = 'kind' in inner ? (inner as { kind: string }).kind : undefined;
  if (kind === 'ProgrammableTransaction') return 'transaction';
  return kind ?? 'unknown';
}
