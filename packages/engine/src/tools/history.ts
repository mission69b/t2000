import { z } from 'zod';
import {
  classifyTransaction,
  extractTransferDetails,
  type ClassifyBalanceChange,
  type TxDirection,
} from '@t2000/sdk';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';
import { fetchAudricHistory } from '../audric-api.js';

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

/**
 * RPC query direction. `from` queries `FromAddress` (txs the address sent /
 * signed); `to` queries `ToAddress` (txs the address received). Pre-v0.48
 * the tool only used `from`, which silently dropped pure-receive
 * transactions (someone pays you, no balance-affecting outbound from your
 * account) — so user-reported counts like "I had 15 txs that day, you
 * showed 13" lined up with the missing inbound rows. The dual-direction
 * query parallelizes both filters and dedupes by `digest` since txs
 * involving two of the user's own addresses (rare) or self-sends would
 * appear in both result sets.
 */
type QueryDirection = 'from' | 'to';

async function queryHistoryPage(
  rpcUrl: string,
  address: string,
  direction: QueryDirection,
  limit: number,
  cursor: string | null,
): Promise<{ data: RpcTxBlock[]; nextCursor: string | null; hasNextPage: boolean }> {
  const filter = direction === 'from' ? { FromAddress: address } : { ToAddress: address };
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_queryTransactionBlocks',
      params: [
        { filter, options: { showEffects: true, showInput: true, showBalanceChanges: true } },
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

/**
 * Merge two arrays of RPC txs by `digest`, preserving the most-recent
 * timestamp ordering. Each digest appears at most once in the output.
 */
function mergeAndDedupe(a: RpcTxBlock[], b: RpcTxBlock[]): RpcTxBlock[] {
  const byDigest = new Map<string, RpcTxBlock>();
  for (const tx of [...a, ...b]) {
    if (!byDigest.has(tx.digest)) byDigest.set(tx.digest, tx);
  }
  return [...byDigest.values()].sort((x, y) => Number(y.timestampMs ?? 0) - Number(x.timestampMs ?? 0));
}

async function queryHistoryRpc(rpcUrl: string, address: string, limit: number): Promise<TxRecord[]> {
  // Over-fetch each direction by `limit` (Sui RPC caps page size, but most
  // active wallets won't hit it) so the merged set still has at least
  // `limit` rows after dedupe.
  const [fromPage, toPage] = await Promise.all([
    queryHistoryPage(rpcUrl, address, 'from', limit, null).catch(() => ({ data: [] as RpcTxBlock[], nextCursor: null, hasNextPage: false })),
    queryHistoryPage(rpcUrl, address, 'to', limit, null).catch(() => ({ data: [] as RpcTxBlock[], nextCursor: null, hasNextPage: false })),
  ]);
  const merged = mergeAndDedupe(fromPage.data, toPage.data);
  return merged.slice(0, limit).map((tx) => parseRpcTx(tx, address));
}

/**
 * Paginate backwards through transaction history (both directions in
 * parallel) to find transactions on a specific calendar day. Returns up
 * to `limit` transactions from that day. Each direction stops paginating
 * once it reaches a tx older than `dayStart` — the merge happens at the
 * end so neither direction exits the loop early just because the OTHER
 * direction's page contained newer rows.
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

  async function paginateDirection(direction: QueryDirection): Promise<RpcTxBlock[]> {
    const collected: RpcTxBlock[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      let res: Awaited<ReturnType<typeof queryHistoryPage>>;
      try {
        res = await queryHistoryPage(rpcUrl, address, direction, PAGE_SIZE, cursor);
      } catch {
        break;
      }
      if (res.data.length === 0) break;

      let reachedOld = false;
      for (const tx of res.data) {
        const ts = Number(tx.timestampMs ?? 0);
        if (ts === 0) continue;
        if (ts < dayStart) { reachedOld = true; break; }
        if (ts >= dayStart && ts < dayEnd) collected.push(tx);
      }

      if (reachedOld || !res.hasNextPage || !res.nextCursor) break;
      cursor = res.nextCursor;
    }
    return collected;
  }

  const [fromTxs, toTxs] = await Promise.all([
    paginateDirection('from'),
    paginateDirection('to'),
  ]);
  const merged = mergeAndDedupe(fromTxs, toTxs);
  return merged.slice(0, limit).map((tx) => parseRpcTx(tx, address));
}

/**
 * [v1.4 ACI] Allowed values for the `action` filter — kept in sync with
 * `classifyAction` above (the labels it can return).
 */
const HISTORY_ACTIONS = ['send', 'lending', 'swap', 'transaction'] as const;
type HistoryAction = (typeof HISTORY_ACTIONS)[number];

const DEFAULT_LOOKBACK_DAYS = 30;

/**
 * Sui address regex — used for the new `address` and `counterparty`
 * params. Pre-v0.48 the tool only ever queried `context.walletAddress`,
 * so address validation was implicit. Now that callers can pass a third
 * party (a watched address, a saved contact), reject anything that isn't
 * the canonical 0x + 64 hex-char shape so a typo can't silently fall
 * back to "the user's own history" — that masquerade would put the
 * wrong card in front of the user.
 */
const SUI_ADDRESS_REGEX = /^0x[0-9a-fA-F]{64}$/;

export const transactionHistoryTool = buildTool({
  name: 'transaction_history',
  description:
    'Retrieve recent transaction history (last 30 days by default): sends, saves, withdrawals, borrows, repayments, swaps, and rewards claims. Renders a rich transaction card.\n\n' +
    'By default, queries the SIGNED-IN USER\'S history. To inspect another wallet (a saved contact, a watched address, any public Sui address), pass `address` — e.g. user asks "show funkii\'s recent transactions" with funkii at 0x40cd…3e62, call with `address: "0x40cd…3e62"`. To filter the user\'s own history to a specific counterparty (user asks "show transactions WITH funkii"), pass `counterparty` — keeps the query rooted in the user\'s wallet but shows only rows where funkii is the recipient or sender.\n\n' +
    'Filter args: `date` (YYYY-MM-DD), `action` (send/lending/swap), `minUsd` (minimum amount in USD — use this for "transactions over $X" instead of post-filtering), `assetSymbol` (e.g. "USDC", "SUI"), `direction` ("in" or "out"). The card itself respects all filters — never re-list the rows in narration.\n\n' +
    'Internally queries both `FromAddress` and `ToAddress` filters in parallel and dedupes by digest, so pure-receive transactions (someone sends to the queried address with no balance-affecting outbound) are no longer dropped.',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).optional(),
    address: z
      .string()
      .regex(SUI_ADDRESS_REGEX, 'Must be a 0x-prefixed 64-hex Sui address')
      .optional()
      .describe('Sui address to query history FOR. When omitted, defaults to the signed-in user\'s wallet. Pass this when the user asks about a contact\'s, watched address\'s, or any other public wallet\'s history.'),
    counterparty: z
      .string()
      .regex(SUI_ADDRESS_REGEX, 'Must be a 0x-prefixed 64-hex Sui address')
      .optional()
      .describe('Sui address to filter rows by — only transactions where the queried address sent to or received from this counterparty are returned. Use for "show transactions with <contact>" queries. Compares against `tx.recipient` (case-insensitive).'),
    date: z.string().optional().describe('Specific date to search for transactions (YYYY-MM-DD format). Paginates back to find that day.'),
    action: z.enum(HISTORY_ACTIONS).optional().describe('Filter by action: send, lending, swap, or transaction.'),
    minUsd: z.number().min(0).optional().describe('Minimum transaction amount in USD. Use this for "transactions over $X" — the amount is converted to USD using the asset price snapshot.'),
    assetSymbol: z.string().optional().describe('Filter to a single asset symbol (case-insensitive, e.g. "USDC", "SUI", "LOFI"). Matches `tx.asset` exactly.'),
    direction: z.enum(['in', 'out']).optional().describe('Filter by user-side balance flow: "in" = received, "out" = spent.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of transactions to return (1-50, default 10)',
      },
      address: {
        type: 'string',
        description: 'Sui address to query history FOR (defaults to the signed-in user when omitted). Use for queries about a contact\'s, watched address\'s, or any other wallet\'s history.',
      },
      counterparty: {
        type: 'string',
        description: 'Sui address to filter rows by — only transactions where the queried address sent to or received from this counterparty are returned. Use for "show transactions with <contact>" queries.',
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
      minUsd: {
        type: 'number',
        description: 'Minimum transaction amount in USD. Use this for "transactions over $X" queries.',
      },
      assetSymbol: {
        type: 'string',
        description: 'Filter to a single asset symbol (case-insensitive, e.g. "USDC", "SUI").',
      },
      direction: {
        type: 'string',
        enum: ['in', 'out'],
        description: 'Filter by direction of user balance change: "in" = received, "out" = spent.',
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
    const assetSymbol = input.assetSymbol?.toLowerCase();
    const direction = input.direction;
    const minUsd = input.minUsd;
    const counterpartyLower = input.counterparty?.toLowerCase();

    /**
     * Resolve the address whose history we're fetching. `input.address`
     * (when present and Zod-validated) takes precedence; falls back to
     * the signed-in user. Tracking `isSelfQuery` lets the result payload
     * advertise whether the rows belong to the user or a third party,
     * which the frontend card uses to title itself ("Recent
     * Transactions" vs "0x40cd…3e62 — Recent Transactions") and which
     * the LLM uses to narrate correctly without re-typing the address.
     */
    const targetAddress = input.address ?? context.walletAddress;
    const isSelfQuery =
      !!targetAddress &&
      !!context.walletAddress &&
      targetAddress.toLowerCase() === context.walletAddress.toLowerCase();

    /**
     * [v0.46.6] Price snapshot for `minUsd` filtering. Sourced from the
     * session-injected token-price map (populated by the prefetch step
     * in audric's engine-factory). Falls back to "no USD value known"
     * when the asset isn't in the snapshot — those rows skip the
     * `minUsd` filter rather than being silently dropped, since we
     * don't have ground truth.
     */
    const prices: Record<string, number> | undefined = (
      context as unknown as { tokenPrices?: Record<string, number> }
    ).tokenPrices;
    const priceFor = (sym: string | undefined): number | undefined => {
      if (!sym || !prices) return undefined;
      return prices[sym.toUpperCase()] ?? prices[sym.toLowerCase()] ?? prices[sym];
    };

    /**
     * [v1.4] After fetching, narrow by `action` (when supplied), and trim
     * to a `DEFAULT_LOOKBACK_DAYS` window when no explicit date is given —
     * keeps results recent and bounded so the LLM doesn't over-summarize.
     *
     * [v0.46.6] Now also honors `assetSymbol`, `direction`, and `minUsd`
     * so single questions like "show transactions over $5" or "show my
     * USDC sends" produce a card whose rows already match the question —
     * the LLM never needs to filter in narration.
     */
    const finalize = (records: TxRecord[]): TxRecord[] => {
      let scoped = records;
      if (action) scoped = scoped.filter((r) => r.action === action);
      if (assetSymbol) {
        scoped = scoped.filter((r) => r.asset?.toLowerCase() === assetSymbol);
      }
      if (direction) {
        scoped = scoped.filter((r) => r.direction === direction);
      }
      if (counterpartyLower) {
        // [v0.48] The `counterparty` filter is intentionally narrow: it
        // matches `tx.recipient` (the parsed counterparty extracted from
        // balance changes by `extractTransferDetails`) — not raw RPC
        // sender/receiver fields, since those reflect signer addresses
        // (often sponsor wallets) rather than the actual fund flow.
        // Rows with no counterparty (e.g. NAVI lending operations against
        // a shared object) are excluded — the user asked "show
        // transactions with <X>", and a NAVI deposit isn't with anyone.
        scoped = scoped.filter((r) => r.recipient?.toLowerCase() === counterpartyLower);
      }
      if (minUsd != null && minUsd > 0) {
        scoped = scoped.filter((r) => {
          if (r.amount == null) return false;
          // For USD-pegged assets we treat the unit amount as USD value.
          // For others, multiply by the snapshot price when known.
          const sym = r.asset?.toUpperCase() ?? '';
          const isStableLike =
            sym === 'USDC' || sym === 'USDT' || sym === 'WUSDC' || sym === 'WUSDT' ||
            sym === 'SUIUSDT' || sym === 'USDY' || sym === 'USDSUI' || sym === 'USDE' ||
            sym === 'AUSD' || sym === 'FDUSD' || sym === 'BUCK';
          const usd = isStableLike ? r.amount : (priceFor(sym) ?? 0) * r.amount;
          // When we genuinely don't know the price, KEEP the row rather
          // than silently dropping it — better to over-include than to
          // hide transactions the user expects to see.
          if (!isStableLike && priceFor(sym) == null) return true;
          return usd >= minUsd;
        });
      }
      return scoped.slice(0, limit);
    };

    const filterMeta = {
      date: input.date ?? null,
      action: action ?? null,
      minUsd: minUsd ?? null,
      assetSymbol: input.assetSymbol ?? null,
      direction: direction ?? null,
      counterparty: input.counterparty ?? null,
      address: targetAddress ?? null,
      isSelfQuery,
    };

    /**
     * The agent path (used in CLI / SDK direct-tool mode) doesn't
     * support arbitrary-address queries today — the agent's `history()`
     * call is hardwired to its own wallet. Reject explicit `address`
     * usage here rather than silently returning the wrong rows. Callers
     * needing third-party history should use the RPC path (web).
     */
    if (context.agent) {
      if (input.address && !isSelfQuery) {
        throw new Error(
          'transaction_history `address` parameter is not supported in CLI/SDK agent mode — only the signed-in user\'s history is available. Use the web client for third-party address queries.',
        );
      }
      const agent = requireAgent(context);
      const records = await agent.history({ limit: input.date ? limit : Math.max(limit * 4, 50) });
      const filtered = finalize(records);
      return {
        data: { transactions: filtered, count: filtered.length, ...filterMeta },
        displayText: `${filtered.length} recent transaction(s)`,
      };
    }

    if (!targetAddress) {
      throw new Error('Transaction history requires a wallet address');
    }

    // [single-source-of-truth — Apr 2026] Try audric's canonical
    // `/api/history` first. The route already merges FromAddress +
    // ToAddress, dedupes by digest, and runs the same `parseSuiRpcTx`
    // parser the engine uses, so the wire shape is a 1:1 match. Returns
    // null in CLI / MCP / standalone mode → falls through to the
    // existing Sui-RPC path below.
    //
    // Note: the date-paginated path (`input.date`) keeps using direct
    // RPC because audric's `/api/history` doesn't currently expose a
    // date filter. Same goes for the standalone-engine fallback.
    if (!input.date) {
      const audricRecords = await fetchAudricHistory(
        targetAddress,
        { limit: Math.max(limit * 4, 50) },
        context.env,
        context.signal,
      );
      if (audricRecords) {
        const cutoffMs = Date.now() - DEFAULT_LOOKBACK_DAYS * 86_400_000;
        const recent = audricRecords.filter((r) => r.timestamp >= cutoffMs);
        const filtered = finalize(recent);
        return {
          data: {
            transactions: filtered,
            count: filtered.length,
            ...filterMeta,
            lookbackDays: DEFAULT_LOOKBACK_DAYS,
          },
          displayText: `${filtered.length} transaction(s) in the last ${DEFAULT_LOOKBACK_DAYS} days`,
        };
      }
    }

    if (!context.suiRpcUrl) {
      throw new Error('Transaction history requires a Sui RPC URL when audric API is unavailable');
    }

    if (input.date) {
      const records = await queryHistoryByDate(
        context.suiRpcUrl,
        targetAddress,
        input.date,
        Math.max(limit * 4, 50),
      );
      const filtered = finalize(records);
      const dateLabel = new Date(input.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      return {
        data: { transactions: filtered, count: filtered.length, ...filterMeta },
        displayText: filtered.length > 0
          ? `${filtered.length} transaction(s) on ${dateLabel}`
          : `No transactions found on ${dateLabel}`,
      };
    }

    // No date — last 30 days. Over-fetch then trim by lookback window.
    const cutoffMs = Date.now() - DEFAULT_LOOKBACK_DAYS * 86_400_000;
    const records = await queryHistoryRpc(
      context.suiRpcUrl,
      targetAddress,
      Math.max(limit * 4, 50),
    );
    const recent = records.filter((r) => r.timestamp >= cutoffMs);
    const filtered = finalize(recent);
    return {
      data: {
        transactions: filtered,
        count: filtered.length,
        ...filterMeta,
        lookbackDays: DEFAULT_LOOKBACK_DAYS,
      },
      displayText: `${filtered.length} transaction(s) in the last ${DEFAULT_LOOKBACK_DAYS} days`,
    };
  },
});
