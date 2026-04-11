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
  date?: string;
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

  const timestampMs = Number(tx.timestampMs ?? 0);
  return {
    digest: tx.digest,
    action: classifyAction(moveCallTargets, commandTypes),
    amount,
    asset,
    recipient,
    timestamp: timestampMs,
    date: timestampMs > 0 ? new Date(timestampMs).toISOString() : undefined,
    gasCost,
  };
}

async function queryHistoryPage(
  rpcUrl: string,
  address: string,
  limit: number,
  cursor: string | null,
): Promise<{ data: RpcTxBlock[]; nextCursor: string | null; hasNextPage: boolean }> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_queryTransactionBlocks',
      params: [
        { filter: { FromAddress: address }, options: { showEffects: true, showInput: true, showBalanceChanges: true } },
        cursor,
        limit,
        true,
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Sui RPC error: ${res.status}`);
  const json = (await res.json()) as {
    result?: { data: RpcTxBlock[]; nextCursor: string | null; hasNextPage: boolean };
    error?: { message: string };
  };
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return {
    data: json.result?.data ?? [],
    nextCursor: json.result?.nextCursor ?? null,
    hasNextPage: json.result?.hasNextPage ?? false,
  };
}

async function queryHistoryRpc(rpcUrl: string, address: string, limit: number): Promise<TxRecord[]> {
  const page = await queryHistoryPage(rpcUrl, address, limit, null);
  return page.data.map((tx) => parseRpcTx(tx, address));
}

/**
 * Paginate backwards through transaction history to find transactions
 * around a specific date. Returns up to `limit` transactions from that day.
 */
async function queryHistoryByDate(
  rpcUrl: string,
  address: string,
  targetDate: string,
  limit: number,
): Promise<TxRecord[]> {
  const target = new Date(targetDate);
  const dayStart = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const dayEnd = dayStart + 86_400_000;
  const MAX_PAGES = 20;
  const PAGE_SIZE = 50;

  const results: TxRecord[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await queryHistoryPage(rpcUrl, address, PAGE_SIZE, cursor);
    if (res.data.length === 0) break;

    for (const tx of res.data) {
      const ts = Number(tx.timestampMs ?? 0);
      if (ts === 0) continue;

      if (ts < dayStart) {
        return results.slice(0, limit);
      }

      if (ts >= dayStart && ts < dayEnd) {
        results.push(parseRpcTx(tx, address));
      }
    }

    if (!res.hasNextPage || !res.nextCursor) break;
    cursor = res.nextCursor;
  }

  return results.slice(0, limit);
}

export const transactionHistoryTool = buildTool({
  name: 'transaction_history',
  description:
    'Retrieve transaction history: past sends, saves, withdrawals, borrows, repayments, and rewards claims. Pass a date (YYYY-MM-DD) to find transactions from a specific day, or omit for the most recent.',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).optional(),
    date: z.string().optional().describe('Specific date to search for transactions (YYYY-MM-DD format). Paginates back to find that day.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of transactions to return (1-50, default 10)',
      },
      date: {
        type: 'string',
        description: 'Specific date to search for transactions (YYYY-MM-DD format). Paginates back to find that day.',
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

    if (input.date) {
      const records = await queryHistoryByDate(context.suiRpcUrl, context.walletAddress, input.date, limit);
      const dateLabel = new Date(input.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      return {
        data: { transactions: records, count: records.length, date: input.date },
        displayText: records.length > 0
          ? `${records.length} transaction(s) on ${dateLabel}`
          : `No transactions found on ${dateLabel}`,
      };
    }

    const records = await queryHistoryRpc(context.suiRpcUrl, context.walletAddress, limit);
    return {
      data: { transactions: records, count: records.length },
      displayText: `${records.length} recent transaction(s)`,
    };
  },
});
