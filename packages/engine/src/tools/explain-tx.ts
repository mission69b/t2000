import { z } from 'zod';
import { getDecimalsForCoinType, resolveSymbol } from '@t2000/sdk';
import { buildTool } from '../tool.js';

const inputSchema = z.object({
  digest: z.string().describe('Sui transaction digest to explain'),
});

interface TxEffect {
  type: string;
  description: string;
}

interface ExplainedTx {
  digest: string;
  sender: string;
  status: string;
  gasUsed: string;
  timestamp?: string;
  effects: TxEffect[];
  summary: string;
}

export const explainTxTool = buildTool({
  name: 'explain_tx',
  description:
    'Explain a Sui transaction in plain English. Provide a transaction digest and get a human-readable breakdown of what happened — transfers, swaps, deposits, etc.',
  inputSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      digest: { type: 'string', description: 'Sui transaction digest' },
    },
    required: ['digest'],
  },
  isReadOnly: true,
  async call(input, context) {
    const rpcUrl = context.suiRpcUrl ?? 'https://fullnode.mainnet.sui.io:443';

    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getTransactionBlock',
        params: [
          input.digest,
          {
            showInput: true,
            showEffects: true,
            showEvents: true,
            showBalanceChanges: true,
            showObjectChanges: true,
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`Sui RPC error: HTTP ${res.status}`);
    const json = await res.json() as { result?: Record<string, unknown>; error?: { message: string } };

    if (json.error) throw new Error(json.error.message);
    if (!json.result) throw new Error('Transaction not found');

    const tx = json.result;
    const txInput = tx.transaction as Record<string, unknown> | undefined;
    const effects = tx.effects as Record<string, unknown> | undefined;
    const balanceChanges = tx.balanceChanges as Array<{ owner: Record<string, string>; coinType: string; amount: string }> | undefined;
    const events = tx.events as Array<{ type: string; parsedJson?: Record<string, unknown> }> | undefined;

    const txData = txInput?.data as Record<string, unknown> | undefined;
    const sender = txData?.sender as string ?? 'unknown';
    const gasData = txData?.gasData as Record<string, unknown> | undefined;
    const gasPayer = gasData?.owner as string ?? sender;
    const status = (effects?.status as Record<string, string>)?.status ?? 'unknown';
    const gasUsed = effects?.gasUsed as Record<string, string> | undefined;
    const gasCost = gasUsed
      ? (Number(gasUsed.computationCost ?? 0) + Number(gasUsed.storageCost ?? 0) - Number(gasUsed.storageRebate ?? 0)) / 1e9
      : 0;
    const timestamp = tx.timestampMs ? new Date(Number(tx.timestampMs)).toISOString() : undefined;

    const txEffects: TxEffect[] = [];

    if (balanceChanges?.length) {
      for (const bc of balanceChanges) {
        const ownerAddr = bc.owner?.AddressOwner ?? bc.owner?.ObjectOwner ?? 'unknown';
        // Use the canonical token registry so user-facing symbols are
        // friendly (e.g. `0x...::cert::CERT` → `vSUI`). Falls back to the
        // last `::` segment when the coin isn't in the registry.
        const symbol = resolveSymbol(bc.coinType);
        const amount = Number(bc.amount);
        const isNegative = amount < 0;
        const decimals = getDecimalsForCoinType(bc.coinType);
        const absHuman = Math.abs(amount / 10 ** decimals);

        if (bc.coinType.endsWith('::sui::SUI') && isNegative) {
          if (ownerAddr === gasPayer) {
            const netTransfer = absHuman - gasCost;
            if (netTransfer < 0.0001) continue;
            txEffects.push({
              type: 'send',
              description: `${ownerAddr.slice(0, 8)}...${ownerAddr.slice(-4)} sent ${netTransfer.toFixed(4)} ${symbol}`,
            });
          } else {
            txEffects.push({
              type: 'send',
              description: `${ownerAddr.slice(0, 8)}...${ownerAddr.slice(-4)} sent ${absHuman.toFixed(4)} ${symbol}`,
            });
          }
          continue;
        }

        txEffects.push({
          type: isNegative ? 'send' : 'receive',
          description: `${ownerAddr.slice(0, 8)}...${ownerAddr.slice(-4)} ${isNegative ? 'sent' : 'received'} ${absHuman.toFixed(decimals > 6 ? 4 : 2)} ${symbol}`,
        });
      }
    }

    if (events?.length) {
      for (const evt of events.slice(0, 5)) {
        const eventParts = evt.type.split('::');
        const eventName = eventParts[eventParts.length - 1] ?? evt.type;
        txEffects.push({
          type: 'event',
          description: `Event: ${eventName}`,
        });
      }
    }

    const summary = txEffects.length > 0
      ? txEffects.filter((e) => e.type !== 'event').map((e) => e.description).join('; ')
      : `Transaction ${status}`;

    const result: ExplainedTx = {
      digest: input.digest,
      sender,
      status,
      gasUsed: `${gasCost.toFixed(6)} SUI`,
      timestamp,
      effects: txEffects,
      summary,
    };

    return {
      data: result,
      displayText: `**Tx ${input.digest.slice(0, 8)}...** (${status})\nSender: ${sender}\nGas: ${result.gasUsed}\n${summary}`,
    };
  },
});
