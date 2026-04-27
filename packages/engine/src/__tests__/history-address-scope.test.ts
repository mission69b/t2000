import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transactionHistoryTool } from '../tools/history.js';

/**
 * [v0.48 — bug 1] Regression suite for address-scoped transaction history.
 *
 * Pre-v0.48 the tool was hardcoded to `context.walletAddress` and only
 * queried `FromAddress`, so:
 *
 *   - Asking "show 0x40cd…'s transactions" returned the SIGNED-IN
 *     USER's history (no address parameter existed; the LLM
 *     literally narrated this in its reasoning trace).
 *   - Date-scoped queries undercounted on days with inbound txs because
 *     pure-receive transactions (someone pays you, no balance-affecting
 *     outbound from your account) never appeared in `FromAddress` results.
 *     User report: "Apr 24, I had 15, you returned 13" — the 2 missing
 *     rows were inbound.
 *
 * v0.48 adds three capabilities, each pinned by tests below:
 *
 *   1. Optional `address` input → query a different wallet's history.
 *   2. Optional `counterparty` input → filter rows by who the queried
 *      address transacted with.
 *   3. Dual-direction RPC query (`FromAddress` ‖ `ToAddress`) with
 *      digest dedupe so pure-receive transactions are included.
 */

const USER_ADDR = `0x${'a'.repeat(64)}`;
const FUNKII_ADDR = `0x${'b'.repeat(64)}`;
const STRANGER_ADDR = `0x${'c'.repeat(64)}`;
const USDC = '0x2::usdc::USDC';

const baseCtx = {
  walletAddress: USER_ADDR,
  suiRpcUrl: 'https://stub',
} as Parameters<typeof transactionHistoryTool.call>[1];

interface BalanceChange {
  owner: string;
  coinType: string;
  amount: string;
}

function makeRpcTx(opts: {
  digest: string;
  /**
   * Owner address used for the move-call function/module choice. The
   * label classifier doesn't matter for these tests — we set
   * `transferObjects` so rows classify as plain transfers.
   */
  balanceChanges: BalanceChange[];
}) {
  return {
    digest: opts.digest,
    timestampMs: String(Date.now()),
    effects: { gasUsed: { computationCost: '1000', storageCost: '1000', storageRebate: '0' } },
    transaction: { data: { transaction: { commands: [{ TransferObjects: {} }] } } },
    balanceChanges: opts.balanceChanges.map((c) => ({
      owner: { AddressOwner: c.owner },
      coinType: c.coinType,
      amount: c.amount,
    })),
  };
}

/**
 * Direction-aware fetch mock. Inspects the JSON body to decide whether
 * the route is querying `FromAddress` or `ToAddress`, returns different
 * rows per direction. Lets us pin the dual-direction merge contract
 * without spinning up a fake RPC.
 */
function mockFetchByDirection(opts: {
  fromTxs: ReturnType<typeof makeRpcTx>[];
  toTxs: ReturnType<typeof makeRpcTx>[];
}) {
  global.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse((init?.body as string) ?? '{}') as {
      params?: [{ filter?: { FromAddress?: string; ToAddress?: string } }];
    };
    const filter = body.params?.[0]?.filter ?? {};
    const data = filter.FromAddress
      ? opts.fromTxs
      : filter.ToAddress
        ? opts.toTxs
        : [];
    return new Response(
      JSON.stringify({ result: { data, nextCursor: null, hasNextPage: false } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;
}

describe('[v0.48 — bug 1] transaction_history address scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to context.walletAddress when `address` is omitted', async () => {
    mockFetchByDirection({
      fromTxs: [
        makeRpcTx({
          digest: '0xself-out',
          balanceChanges: [
            { owner: USER_ADDR, coinType: USDC, amount: '-1000000' },
            { owner: STRANGER_ADDR, coinType: USDC, amount: '1000000' },
          ],
        }),
      ],
      toTxs: [],
    });

    const res = await transactionHistoryTool.call({ limit: 10 }, baseCtx);
    const data = res.data as { transactions: { digest: string }[]; isSelfQuery: boolean; address: string };
    expect(data.transactions[0]?.digest).toBe('0xself-out');
    expect(data.isSelfQuery).toBe(true);
    expect(data.address).toBe(USER_ADDR);
  });

  it('queries the explicitly-passed address when `address` is set', async () => {
    /**
     * The mock returns DIFFERENT digests for the user's address vs
     * funkii's. If the tool ignored `address` and queried the user, we'd
     * see 0xself-* digests; with the new param we should see 0xfunkii-*.
     */
    global.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}') as {
        params?: [{ filter?: { FromAddress?: string; ToAddress?: string } }];
      };
      const filter = body.params?.[0]?.filter ?? {};
      const queriedAddr = filter.FromAddress ?? filter.ToAddress;
      const isFunkii = queriedAddr?.toLowerCase() === FUNKII_ADDR.toLowerCase();
      const txs = isFunkii
        ? [
            makeRpcTx({
              digest: '0xfunkii-tx',
              balanceChanges: [{ owner: FUNKII_ADDR, coinType: USDC, amount: '5000000' }],
            }),
          ]
        : [
            makeRpcTx({
              digest: '0xself-tx',
              balanceChanges: [{ owner: USER_ADDR, coinType: USDC, amount: '5000000' }],
            }),
          ];
      return new Response(
        JSON.stringify({ result: { data: filter.FromAddress ? txs : [], nextCursor: null, hasNextPage: false } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const res = await transactionHistoryTool.call(
      { limit: 10, address: FUNKII_ADDR },
      baseCtx,
    );
    const data = res.data as { transactions: { digest: string }[]; isSelfQuery: boolean; address: string };
    expect(data.transactions[0]?.digest).toBe('0xfunkii-tx');
    expect(data.isSelfQuery).toBe(false);
    expect(data.address).toBe(FUNKII_ADDR);
  });

  it('dedupes by digest when a tx appears in both FromAddress and ToAddress results', async () => {
    /**
     * Self-sends are the canonical case (rare in practice). More common:
     * Sui RPC sometimes returns the same digest for both filters when
     * the address is both signer and recipient of a balance change.
     * Whatever the source, the tool must dedupe.
     */
    const sharedTx = makeRpcTx({
      digest: '0xshared',
      balanceChanges: [{ owner: USER_ADDR, coinType: USDC, amount: '-1000000' }],
    });

    mockFetchByDirection({
      fromTxs: [sharedTx],
      toTxs: [sharedTx],
    });

    const res = await transactionHistoryTool.call({ limit: 10 }, baseCtx);
    const data = res.data as { transactions: { digest: string }[] };
    const sharedRows = data.transactions.filter((t) => t.digest === '0xshared');
    expect(sharedRows.length).toBe(1);
  });

  it('includes pure-receive transactions that only appear in ToAddress results', async () => {
    /**
     * The "Apr 24 — 13 of 15" undercount: pre-v0.48 the tool only
     * queried FromAddress, so a tx where someone else paid the user
     * (no user-side outbound, gas paid by sender or sponsor) was
     * silently missing. This test fakes exactly that shape: zero
     * FromAddress rows, one ToAddress row.
     */
    mockFetchByDirection({
      fromTxs: [],
      toTxs: [
        makeRpcTx({
          digest: '0xinbound',
          balanceChanges: [{ owner: USER_ADDR, coinType: USDC, amount: '5000000' }],
        }),
      ],
    });

    const res = await transactionHistoryTool.call({ limit: 10 }, baseCtx);
    const data = res.data as { transactions: { digest: string }[] };
    const digests = data.transactions.map((t) => t.digest);
    expect(digests).toContain('0xinbound');
  });

  it('exposes filter metadata on the result for the frontend card', async () => {
    mockFetchByDirection({ fromTxs: [], toTxs: [] });
    const res = await transactionHistoryTool.call(
      { limit: 5, address: FUNKII_ADDR, counterparty: STRANGER_ADDR },
      baseCtx,
    );
    const data = res.data as {
      address: string;
      counterparty: string | null;
      isSelfQuery: boolean;
    };
    expect(data.address).toBe(FUNKII_ADDR);
    expect(data.counterparty).toBe(STRANGER_ADDR);
    expect(data.isSelfQuery).toBe(false);
  });
});

describe('[v0.48 — bug 1] transaction_history counterparty filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps only rows whose recipient matches the counterparty (case-insensitive)', async () => {
    /**
     * Two outbound USDC sends — one to STRANGER_ADDR, one to
     * FUNKII_ADDR. Filtering by counterparty=funkii should return only
     * the second row.
     */
    mockFetchByDirection({
      fromTxs: [
        makeRpcTx({
          digest: '0xto-stranger',
          balanceChanges: [
            { owner: USER_ADDR, coinType: USDC, amount: '-2000000' },
            { owner: STRANGER_ADDR, coinType: USDC, amount: '2000000' },
          ],
        }),
        makeRpcTx({
          digest: '0xto-funkii',
          balanceChanges: [
            { owner: USER_ADDR, coinType: USDC, amount: '-1000000' },
            { owner: FUNKII_ADDR, coinType: USDC, amount: '1000000' },
          ],
        }),
      ],
      toTxs: [],
    });

    const res = await transactionHistoryTool.call(
      { limit: 10, counterparty: FUNKII_ADDR.toUpperCase() },
      baseCtx,
    );
    const data = res.data as { transactions: { digest: string }[] };
    const digests = data.transactions.map((t) => t.digest);
    expect(digests).toEqual(['0xto-funkii']);
  });

  it('excludes rows with no recipient (e.g. NAVI lending operations against a shared object)', async () => {
    /**
     * NAVI deposits don't have a counterparty — the funds go to a
     * shared lending pool object, not another user address. Asking
     * "show transactions WITH funkii" should NOT return these rows
     * because they aren't with anyone.
     */
    mockFetchByDirection({
      fromTxs: [
        // NAVI-shaped row: balance change is user-only (no counterparty)
        makeRpcTx({
          digest: '0xnavi-deposit',
          balanceChanges: [{ owner: USER_ADDR, coinType: USDC, amount: '-10000000' }],
        }),
        // Real send to funkii
        makeRpcTx({
          digest: '0xto-funkii',
          balanceChanges: [
            { owner: USER_ADDR, coinType: USDC, amount: '-1000000' },
            { owner: FUNKII_ADDR, coinType: USDC, amount: '1000000' },
          ],
        }),
      ],
      toTxs: [],
    });

    const res = await transactionHistoryTool.call(
      { limit: 10, counterparty: FUNKII_ADDR },
      baseCtx,
    );
    const data = res.data as { transactions: { digest: string }[] };
    const digests = data.transactions.map((t) => t.digest);
    expect(digests).not.toContain('0xnavi-deposit');
    expect(digests).toContain('0xto-funkii');
  });
});
