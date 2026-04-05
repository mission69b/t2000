import { z } from 'zod';
import { getDecimalsForCoinType, resolveSymbol, SUI_TYPE } from '@t2000/sdk';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

const SUI_MAINNET_URL = 'https://fullnode.mainnet.sui.io:443';

const KNOWN_TARGETS: [RegExp, string][] = [
  [/::suilend|::obligation/, 'lending'],
  [/::navi|::incentive_v\d+|::oracle_pro/, 'lending'],
  [/::cetus|::pool/, 'swap'],
  [/::deepbook/, 'swap'],
  [/::transfer::public_transfer/, 'send'],
];

interface RpcBalanceChange {
  owner: { AddressOwner?: string } | string;
  coinType: string;
  amount: string;
}

interface RpcTxBlock {
  digest: string;
  timestampMs?: string;
  transaction?: unknown;
  effects?: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } };
  balanceChanges?: RpcBalanceChange[];
}

interface TxRecord {
  digest: string;
  action: string;
  amount?: number;
  asset?: string;
  recipient?: string;
  timestamp: number;
  gasCost?: number;
}

function resolveOwner(owner: RpcBalanceChange['owner']): string | null {
  if (typeof owner === 'object' && owner.AddressOwner) return owner.AddressOwner;
  if (typeof owner === 'string') return owner;
  return null;
}

function classifyAction(targets: string[], commandTypes: string[]): string {
  for (const target of targets) {
    for (const [pattern, label] of KNOWN_TARGETS) {
      if (pattern.test(target)) return label;
    }
  }
  if (commandTypes.includes('TransferObjects') && !commandTypes.includes('MoveCall')) return 'send';
  return 'transaction';
}

function parseRpcTx(tx: RpcTxBlock, address: string): TxRecord {
  const gasUsed = tx.effects?.gasUsed;
  const gasCost = gasUsed
    ? (Number(gasUsed.computationCost) + Number(gasUsed.storageCost) - Number(gasUsed.storageRebate)) / 1e9
    : undefined;

  const moveCallTargets: string[] = [];
  const commandTypes: string[] = [];
  try {
    const data = (tx.transaction as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const inner = data?.transaction as Record<string, unknown> | undefined;
    const commands = inner?.commands as Record<string, unknown>[] | undefined;
    if (commands) {
      for (const cmd of commands) {
        if (cmd.MoveCall) {
          const mc = cmd.MoveCall as { package: string; module: string; function: string };
          moveCallTargets.push(`${mc.package}::${mc.module}::${mc.function}`);
          commandTypes.push('MoveCall');
        } else if (cmd.TransferObjects) {
          commandTypes.push('TransferObjects');
        }
      }
    }
  } catch { /* best effort */ }

  const changes = tx.balanceChanges ?? [];
  const outflows = changes.filter((c) => resolveOwner(c.owner) === address && BigInt(c.amount) < 0n);
  const inflows = changes.filter((c) => resolveOwner(c.owner) !== address && BigInt(c.amount) > 0n);
  const primaryOutflow = outflows.filter((c) => c.coinType !== SUI_TYPE).sort((a, b) => Number(BigInt(a.amount) - BigInt(b.amount)))[0] ?? outflows[0];

  let amount: number | undefined;
  let asset: string | undefined;
  let recipient: string | undefined;

  if (primaryOutflow) {
    const coinType = primaryOutflow.coinType;
    const decimals = getDecimalsForCoinType(coinType);
    amount = Math.abs(Number(BigInt(primaryOutflow.amount))) / 10 ** decimals;
    asset = resolveSymbol(coinType);
    const recipientChange = inflows.find((c) => c.coinType === coinType);
    recipient = recipientChange ? resolveOwner(recipientChange.owner) ?? undefined : undefined;
  }

  return {
    digest: tx.digest,
    action: classifyAction(moveCallTargets, commandTypes),
    amount,
    asset,
    recipient,
    timestamp: Number(tx.timestampMs ?? 0),
    gasCost,
  };
}

async function queryHistoryRpc(rpcUrl: string, address: string, limit: number): Promise<TxRecord[]> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_queryTransactionBlocks',
      params: [
        { filter: { FromAddress: address }, options: { showEffects: true, showInput: true, showBalanceChanges: true } },
        null,
        limit,
        true,
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Sui RPC error: ${res.status}`);

  const json = (await res.json()) as { result?: { data: RpcTxBlock[] }; error?: { message: string } };
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);

  return (json.result?.data ?? []).map((tx) => parseRpcTx(tx, address));
}

export const transactionHistoryTool = buildTool({
  name: 'transaction_history',
  description:
    'Retrieve recent transaction history: past sends, saves, withdrawals, borrows, repayments, and rewards claims. Optionally limit the number of results.',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of transactions to return (1-50, default 10)',
      },
    },
  },
  isReadOnly: true,

  async call(input, context) {
    const limit = input.limit ?? 10;

    if (context.agent) {
      const agent = requireAgent(context);
      const records = await agent.history({ limit });
      return {
        data: { transactions: records, count: records.length },
        displayText: `${records.length} recent transaction(s)`,
      };
    }

    if (!context.walletAddress || !context.suiRpcUrl) {
      throw new Error('Transaction history requires a wallet address');
    }

    const records = await queryHistoryRpc(context.suiRpcUrl, context.walletAddress, limit);
    return {
      data: { transactions: records, count: records.length },
      displayText: `${records.length} recent transaction(s)`,
    };
  },
});
