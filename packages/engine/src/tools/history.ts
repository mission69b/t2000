import { z } from 'zod';
import {
  classifyTransaction,
  extractTransferDetails,
  type ClassifyBalanceChange,
  type TxDirection,
} from '@t2000/sdk';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

const SUI_MAINNET_URL = 'https://fullnode.mainnet.sui.io:443';

type RpcBalanceChange = ClassifyBalanceChange;

interface RpcTxBlock {
  digest: string;
  timestampMs?: string;
  transaction?: unknown;
  effects?: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } };
  balanceChanges?: RpcBalanceChange[];
}

interface TxRecord {
  digest: string;
  /**
   * [v1.4] Coarse bucket — one of `'send' | 'lending' | 'swap' |
   * 'transaction'`. Used by the ACI `action` filter and persisted
   * downstream queries depend on these values, so they are STABLE.
   */
  action: string;
  /**
   * [v1.5.3] Finer-grained display label derived from the
   * Move-call function name (e.g. `'deposit'`, `'withdraw'`,
   * `'payment_link'`, `'on-chain'`). Optional — frontends should
   * fall back to `action` when missing. Never used by filters.
   */
  label?: string;
  amount?: number;
  asset?: string;
  recipient?: string;
  /**
   * [v0.46.2] Direction of the user's principal balance change on
   * this tx (`'in'` → user received, `'out'` → user spent). Lets the
   * card render the correct sign without parsing the textual label.
   */
  direction?: TxDirection;
  timestamp: number;
  date?: string;
  gasCost?: number;
}

function parseRpcTx(tx: RpcTxBlock, address: string): TxRecord {
  const gasUsed = tx.effects?.gasUsed;
  const gasCost = gasUsed
    ? (Number(gasUsed.computationCost) + Number(gasUsed.storageCost) - Number(gasUsed.storageRebate)) / 1e9
    : undefined;

  const moveCallTargets: string[] = [];
  const commandTypes: string[] = [];
  try {
    /**
     * Sui JSON-RPC `suix_queryTransactionBlocks` returns the
     * ProgrammableTransaction body with the legacy field name
     * `transactions` (plural). Newer SDK-side types refer to the same
     * data as `commands`. Cover both — the v1.5.3 engine path was
     * only checking `commands`, which always returned empty for prod
     * RPC responses, so every row in the transaction history card
     * fell back to `label: 'on-chain'`.
     */
    const data = (tx.transaction as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const inner = data?.transaction as Record<string, unknown> | undefined;
    const commands = (inner?.commands ?? inner?.transactions) as Record<string, unknown>[] | undefined;
    if (Array.isArray(commands)) {
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
  const { amount, asset, recipient, direction } = extractTransferDetails(changes, address);

  const timestampMs = Number(tx.timestampMs ?? 0);
  const { action, label } = classifyTransaction(moveCallTargets, commandTypes, changes, address);

  return {
    digest: tx.digest,
    action,
    label,
    amount,
    asset,
    recipient,
    direction,
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

/**
 * [v1.4 ACI] Allowed values for the `action` filter — kept in sync with
 * `classifyAction` above (the labels it can return).
 */
const HISTORY_ACTIONS = ['send', 'lending', 'swap', 'transaction'] as const;
type HistoryAction = (typeof HISTORY_ACTIONS)[number];

const DEFAULT_LOOKBACK_DAYS = 30;

export const transactionHistoryTool = buildTool({
  name: 'transaction_history',
  description:
    'Retrieve recent transaction history (last 30 days by default): sends, saves, withdrawals, borrows, repayments, and rewards claims. Pass `date` (YYYY-MM-DD) for a specific day, `action` to filter by category (send/lending/swap), or both.',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).optional(),
    date: z.string().optional().describe('Specific date to search for transactions (YYYY-MM-DD format). Paginates back to find that day.'),
    action: z.enum(HISTORY_ACTIONS).optional().describe('Filter by action: send, lending, swap, or transaction.'),
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
      action: {
        type: 'string',
        enum: [...HISTORY_ACTIONS],
        description: 'Filter results by action category: send, lending, swap, or transaction.',
      },
    },
  },
  isReadOnly: true,
  maxResultSizeChars: 8_000,
  // [v1.5.1] New transactions land continuously. Even with an explicit
  // `date` filter the dedupe is wrong post-write because the just-
  // executed write may now be in history. Never dedupe.
  cacheable: false,
  /**
   * [v1.5.2] Custom truncation that preserves the structured shape.
   *
   * The default `budgetToolResult` slices the JSON string at the byte
   * limit, appends a "[Truncated…]" note, and tries `JSON.parse` — which
   * always fails for sliced JSON, so the engine falls back to returning
   * the raw string. The frontend's `transaction_history` card renderer
   * then sees `typeof data !== 'object'` and bails, so the rich card
   * never renders even though the LLM has the full text.
   *
   * Strategy: progressively halve the `transactions` array until the
   * serialized payload fits, then stamp `_truncated: true` and the
   * original length so the LLM knows to recall with `limit` if it needs
   * older entries. Result is always valid JSON, always object-shaped.
   */
  summarizeOnTruncate(serialized, maxChars) {
    type ParsedHistory = {
      transactions: unknown[];
      count: number;
      [k: string]: unknown;
    };
    let parsed: ParsedHistory;
    try {
      parsed = JSON.parse(serialized) as ParsedHistory;
    } catch {
      return JSON.stringify({
        transactions: [],
        count: 0,
        _truncated: true,
        _note: 'Result exceeded size budget and could not be summarized.',
      });
    }
    const original = Array.isArray(parsed.transactions) ? parsed.transactions : [];
    let trimmed = original.slice();
    let payload = JSON.stringify({ ...parsed, transactions: trimmed, _truncated: true, _originalCount: original.length });
    while (payload.length > maxChars && trimmed.length > 1) {
      trimmed = trimmed.slice(0, Math.max(1, Math.floor(trimmed.length / 2)));
      payload = JSON.stringify({ ...parsed, transactions: trimmed, _truncated: true, _originalCount: original.length });
    }
    return payload;
  },

  async call(
    input,
    context,
  ): Promise<{ data: Record<string, unknown>; displayText: string }> {
    const limit = input.limit ?? 10;
    const action = input.action as HistoryAction | undefined;

    /**
     * [v1.4] After fetching, narrow by `action` (when supplied), and trim
     * to a `DEFAULT_LOOKBACK_DAYS` window when no explicit date is given —
     * keeps results recent and bounded so the LLM doesn't over-summarize.
     */
    const finalize = (records: TxRecord[]): TxRecord[] => {
      let scoped = records;
      if (action) scoped = scoped.filter((r) => r.action === action);
      return scoped.slice(0, limit);
    };

    if (context.agent) {
      const agent = requireAgent(context);
      const records = await agent.history({ limit: input.date ? limit : Math.max(limit * 4, 50) });
      const filtered = finalize(records);
      return {
        data: { transactions: filtered, count: filtered.length, date: input.date ?? null, action: action ?? null },
        displayText: `${filtered.length} recent transaction(s)`,
      };
    }

    if (!context.walletAddress || !context.suiRpcUrl) {
      throw new Error('Transaction history requires a wallet address');
    }

    if (input.date) {
      const records = await queryHistoryByDate(
        context.suiRpcUrl,
        context.walletAddress,
        input.date,
        Math.max(limit * 4, 50),
      );
      const filtered = finalize(records);
      const dateLabel = new Date(input.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      return {
        data: { transactions: filtered, count: filtered.length, date: input.date, action: action ?? null },
        displayText: filtered.length > 0
          ? `${filtered.length} transaction(s) on ${dateLabel}`
          : `No transactions found on ${dateLabel}`,
      };
    }

    // No date — last 30 days. Over-fetch then trim by lookback window.
    const cutoffMs = Date.now() - DEFAULT_LOOKBACK_DAYS * 86_400_000;
    const records = await queryHistoryRpc(
      context.suiRpcUrl,
      context.walletAddress,
      Math.max(limit * 4, 50),
    );
    const recent = records.filter((r) => r.timestamp >= cutoffMs);
    const filtered = finalize(recent);
    return {
      data: {
        transactions: filtered,
        count: filtered.length,
        date: null,
        action: action ?? null,
        lookbackDays: DEFAULT_LOOKBACK_DAYS,
      },
      displayText: `${filtered.length} transaction(s) in the last ${DEFAULT_LOOKBACK_DAYS} days`,
    };
  },
});
