import { tool } from 'ai';
import { z } from 'zod';
import { getDecimalsForCoinType, resolveSymbol } from '@t2000/sdk';
// [SPEC AI SDK HARDENING P4.1 Batch 3 / 2026-05-25] Native AI SDK shape.
import {
  wrapEngineExecute,
  buildNeedsApproval,
} from '../v2/tool-helpers.js';
import type { ToolContext, ToolResult } from '../types.js';

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

// ---------------------------------------------------------------------------
// Shared business logic — same body backs the native + legacy exports
// ---------------------------------------------------------------------------
const explainTxDescription =
  'Decode an ARBITRARY Sui transaction digest (one the user pasted, received from a friend, or pulled off a block explorer) into plain English — transfers, swaps, deposits, status, gas. Use ONLY when the user supplies a specific tx digest from outside Audric. For the user\'s OWN recent activity, use `transaction_history` instead — it already decodes their txs with friendlier symbols, timestamps, and grouping. Do not call `explain_tx` to "verify" a write the user just made through Audric (the engine\'s post-write refresh + receipt card already handle that).';

type ExplainTxInput = z.infer<typeof inputSchema>;

async function explainTxCallBody(
  input: ExplainTxInput,
  context: ToolContext,
): Promise<ToolResult<ExplainedTx>> {
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
}

export const explainTxTool = tool({
  description: explainTxDescription,
  inputSchema,
  needsApproval: buildNeedsApproval('explain_tx'),
  execute: wrapEngineExecute<ExplainTxInput, ExplainedTx>('explain_tx', {
    call: explainTxCallBody,
  }),
});
