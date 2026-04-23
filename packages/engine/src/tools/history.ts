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

/**
 * [v1.5.3] Finer-grained display labels — derived from MoveCall
 * function names. The card renders `label ?? action`, so when this
 * map matches we get "Deposit" / "Withdraw" / "Borrow" / "Repay" /
 * "Payment link" instead of the generic "Lending" or "Transaction".
 *
 * Order matters: more specific patterns first. Each entry is
 * (regex, label) where the regex is matched against the
 * fully-qualified MoveCall target `pkg::module::function`.
 */
const LABEL_PATTERNS: [RegExp, string][] = [
  [/::pay(?:ment_kit|_kit)?::|::create_payment_link|::pay_link/, 'payment_link'],
  [/::create_invoice|::invoice::/, 'invoice'],
  [/::deposit|::supply|::mint_ctokens/, 'deposit'],
  [/::withdraw|::redeem|::redeem_ctokens/, 'withdraw'],
  [/::borrow/, 'borrow'],
  [/::repay/, 'repay'],
  [/::claim_reward|::claim::|::claim_incentive/, 'claim'],
  [/::stake/, 'stake'],
  [/::unstake|::burn::/, 'unstake'],
  [/::liquidate/, 'liquidate'],
];

/**
 * [v1.5.3] Fallback label when no `LABEL_PATTERNS` match.
 *
 * Returns the first MoveCall's *module* name (e.g. "navi", "cetus",
 * "spam") so the card shows something more useful than the literal
 * word "transaction". When no MoveCall exists, returns 'on-chain'
 * instead — that's strictly more informative than "transaction" and
 * matches the language users intuit for "did something on-chain".
 */
function fallbackLabel(targets: string[]): string {
  if (!targets.length) return 'on-chain';
  const first = targets[0];
  const parts = first.split('::');
  if (parts.length >= 2 && parts[1]) return parts[1].toLowerCase();
  return 'on-chain';
}

function classifyLabel(targets: string[], commandTypes: string[]): string {
  for (const target of targets) {
    for (const [pattern, label] of LABEL_PATTERNS) {
      if (pattern.test(target)) return label;
    }
  }
  if (commandTypes.includes('TransferObjects') && !commandTypes.includes('MoveCall')) return 'send';
  return fallbackLabel(targets);
}

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
  const action = classifyAction(moveCallTargets, commandTypes);
  let label = classifyLabel(moveCallTargets, commandTypes);

  /**
   * [v1.5.3] Balance-direction tiebreaker for ambiguous lending
   * calls. Many lending modules expose generic entry points
   * (`navi::lending::entry_*`, NAVI's bundled flash actions, etc.)
   * that don't carry a `deposit`/`withdraw`/`borrow`/`repay` keyword
   * in the function name. When `classifyLabel` falls back to a bare
   * module name like `"lending"` for a known lending tx, we infer
   * direction from the user's non-SUI balance change:
   *   - net outflow of the supplied asset → deposit OR repay
   *     (both reduce wallet balance into the protocol). We pick
   *     deposit because it's the dominant case at this stage of
   *     Audric usage; repay-without-keyword is essentially never
   *     emitted by NAVI.
   *   - net inflow of the supplied asset → withdraw OR borrow.
   *     Same reasoning — withdraw dominates.
   * If `LABEL_PATTERNS` matched a specific keyword, we keep that
   * label and skip the inference entirely.
   */
  const labelMatchedSpecific = LABEL_PATTERNS.some(([p]) => moveCallTargets.some((t) => p.test(t)));
  if (action === 'lending' && !labelMatchedSpecific) {
    const userNonSuiOutflow = changes.find((c) =>
      resolveOwner(c.owner) === address && c.coinType !== SUI_TYPE && BigInt(c.amount) < 0n,
    );
    const userNonSuiInflow = changes.find((c) =>
      resolveOwner(c.owner) === address && c.coinType !== SUI_TYPE && BigInt(c.amount) > 0n,
    );
    if (userNonSuiOutflow) label = 'deposit';
    else if (userNonSuiInflow) label = 'withdraw';
  }

  return {
    digest: tx.digest,
    action,
    label,
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
