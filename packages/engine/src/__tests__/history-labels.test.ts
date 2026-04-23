import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transactionHistoryTool } from '../tools/history.js';

/**
 * [v1.5.3] Regression suite for the finer-grained `label` field on
 * `TxRecord`. Pre-v1.5.3 the engine returned only the coarse `action`
 * bucket (send/lending/swap/transaction), so the rich card showed
 * "Lending" for both deposits and withdrawals and "Transaction" for
 * anything not on NAVI/Cetus/transfer. Now `parseRpcTx` also emits
 * `label` derived from the MoveCall function name + balance direction.
 *
 * Frontend renders `label ?? action`, so these tests pin the label
 * contract per common Audric tx pattern.
 */

const ADDR = '0xabc';
const baseCtx = {
  walletAddress: ADDR,
  suiRpcUrl: 'https://stub',
} as Parameters<typeof transactionHistoryTool.call>[1];

interface MoveCmd {
  package: string;
  module: string;
  function: string;
}

function makeRpcTx(opts: {
  digest: string;
  moveCalls?: MoveCmd[];
  transferObjects?: boolean;
  /** balance changes — positive amount is owner credit, negative is debit */
  balanceChanges?: { owner: string; coinType: string; amount: string }[];
  /**
   * Field name for the programmable-tx command list. Prod Sui RPC
   * uses the legacy `transactions` key; the SDK-builder side uses
   * `commands`. Default `commands` mirrors the existing tests; flip
   * to `transactions` to exercise the legacy-shape regression guard.
   */
  cmdField?: 'commands' | 'transactions';
}) {
  const cmds: unknown[] = [];
  if (opts.moveCalls) for (const mc of opts.moveCalls) cmds.push({ MoveCall: mc });
  if (opts.transferObjects) cmds.push({ TransferObjects: {} });
  const inner =
    opts.cmdField === 'transactions' ? { transactions: cmds } : { commands: cmds };
  return {
    digest: opts.digest,
    timestampMs: String(Date.now()),
    effects: { gasUsed: { computationCost: '1000', storageCost: '1000', storageRebate: '0' } },
    transaction: { data: { transaction: inner } },
    balanceChanges: (opts.balanceChanges ?? []).map((c) => ({
      owner: { AddressOwner: c.owner },
      coinType: c.coinType,
      amount: c.amount,
    })),
  };
}

function mockFetchOnce(rpcResults: ReturnType<typeof makeRpcTx>[]) {
  global.fetch = vi.fn(async () =>
    new Response(
      JSON.stringify({ result: { data: rpcResults, nextCursor: null, hasNextPage: false } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  ) as typeof fetch;
}

const USDC = '0x2::usdc::USDC';
const SUI = '0x2::sui::SUI';

describe('[v1.5.3] transaction_history label classifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('labels NAVI deposit calls as "deposit" via function-name match', async () => {
    mockFetchOnce([
      makeRpcTx({
        digest: '0xdep',
        moveCalls: [{ package: '0xpkg', module: 'navi', function: 'deposit' }],
        balanceChanges: [{ owner: ADDR, coinType: USDC, amount: '-10000000' }],
      }),
    ]);
    const res = await transactionHistoryTool.call({ limit: 10 }, baseCtx);
    const data = res.data as { transactions: { action: string; label?: string }[] };
    expect(data.transactions[0].action).toBe('lending');
    expect(data.transactions[0].label).toBe('deposit');
  });

  it('labels NAVI withdraw calls as "withdraw" via function-name match', async () => {
    mockFetchOnce([
      makeRpcTx({
        digest: '0xwd',
        moveCalls: [{ package: '0xpkg', module: 'navi', function: 'withdraw' }],
        balanceChanges: [{ owner: ADDR, coinType: USDC, amount: '10000000' }],
      }),
    ]);
    const res = await transactionHistoryTool.call({ limit: 10 }, baseCtx);
    const data = res.data as { transactions: { label?: string }[] };
    expect(data.transactions[0].label).toBe('withdraw');
  });

  it('labels NAVI borrow as "borrow" and repay as "repay"', async () => {
    mockFetchOnce([
      makeRpcTx({
        digest: '0xb',
        moveCalls: [{ package: '0xpkg', module: 'navi', function: 'borrow' }],
        balanceChanges: [{ owner: ADDR, coinType: USDC, amount: '5000000' }],
      }),
      makeRpcTx({
        digest: '0xr',
        moveCalls: [{ package: '0xpkg', module: 'navi', function: 'repay' }],
        balanceChanges: [{ owner: ADDR, coinType: USDC, amount: '-5000000' }],
      }),
    ]);
    const res = await transactionHistoryTool.call({ limit: 10 }, baseCtx);
    const data = res.data as { transactions: { digest: string; label?: string }[] };
    const byDigest = Object.fromEntries(data.transactions.map((t) => [t.digest, t.label]));
    expect(byDigest['0xb']).toBe('borrow');
    expect(byDigest['0xr']).toBe('repay');
  });

  it('labels payment-kit calls as "payment_link"', async () => {
    mockFetchOnce([
      makeRpcTx({
        digest: '0xpl',
        moveCalls: [{ package: '0xmysten', module: 'payment_kit', function: 'create' }],
        balanceChanges: [{ owner: ADDR, coinType: USDC, amount: '-1000000' }],
      }),
    ]);
    const res = await transactionHistoryTool.call({ limit: 10 }, baseCtx);
    const data = res.data as { transactions: { label?: string }[] };
    expect(data.transactions[0].label).toBe('payment_link');
  });

  it('uses balance-direction tiebreaker when lending fn name is generic', async () => {
    /**
     * NAVI's bundled entry points (e.g. `entry_deposit_with_account_cap`)
     * sometimes carry generic names that fall through `LABEL_PATTERNS`.
     * The tiebreaker uses the user's non-SUI balance change direction.
     */
    mockFetchOnce([
      makeRpcTx({
        digest: '0xgen-out',
        moveCalls: [{ package: '0xpkg', module: 'navi', function: 'entry_action_a' }],
        balanceChanges: [{ owner: ADDR, coinType: USDC, amount: '-25000000' }],
      }),
      makeRpcTx({
        digest: '0xgen-in',
        moveCalls: [{ package: '0xpkg', module: 'navi', function: 'entry_action_b' }],
        balanceChanges: [{ owner: ADDR, coinType: USDC, amount: '25000000' }],
      }),
    ]);
    const res = await transactionHistoryTool.call({ limit: 10 }, baseCtx);
    const data = res.data as { transactions: { digest: string; label?: string }[] };
    const byDigest = Object.fromEntries(data.transactions.map((t) => [t.digest, t.label]));
    expect(byDigest['0xgen-out']).toBe('deposit');
    expect(byDigest['0xgen-in']).toBe('withdraw');
  });

  it('plain transfer without MoveCall labels as "send"', async () => {
    mockFetchOnce([
      makeRpcTx({
        digest: '0xsend',
        transferObjects: true,
        balanceChanges: [
          { owner: ADDR, coinType: USDC, amount: '-1000000' },
          { owner: '0xrecipient', coinType: USDC, amount: '1000000' },
        ],
      }),
    ]);
    const res = await transactionHistoryTool.call({ limit: 10 }, baseCtx);
    const data = res.data as { transactions: { action: string; label?: string }[] };
    expect(data.transactions[0].action).toBe('send');
    expect(data.transactions[0].label).toBe('send');
  });

  it('unknown module falls back to module name (better than literal "transaction")', async () => {
    mockFetchOnce([
      makeRpcTx({
        digest: '0xspam',
        moveCalls: [{ package: '0xspam', module: 'spam_token', function: 'do_thing' }],
        balanceChanges: [],
      }),
    ]);
    const res = await transactionHistoryTool.call({ limit: 10 }, baseCtx);
    const data = res.data as { transactions: { action: string; label?: string }[] };
    expect(data.transactions[0].action).toBe('transaction');
    expect(data.transactions[0].label).toBe('spam_token');
  });

  it('preserves the coarse `action` bucket so existing filters still work', async () => {
    /**
     * Regression guard for the v1.4 ACI `action` filter: callers can pass
     * `action: 'lending'` to narrow results, and that filter compares
     * against the coarse bucket. Adding `label` must not change `action`.
     */
    mockFetchOnce([
      makeRpcTx({
        digest: '0xx',
        moveCalls: [{ package: '0xpkg', module: 'navi', function: 'deposit' }],
        balanceChanges: [{ owner: ADDR, coinType: USDC, amount: '-10000000' }],
      }),
    ]);
    const res = await transactionHistoryTool.call({ limit: 10, action: 'lending' }, baseCtx);
    const data = res.data as { transactions: { action: string; label?: string }[] };
    expect(data.transactions.length).toBe(1);
    expect(data.transactions[0].action).toBe('lending');
    expect(data.transactions[0].label).toBe('deposit');
  });

  it('parses commands when RPC uses legacy `transactions` field name', async () => {
    /**
     * Regression guard for the v0.46.0 deploy where every row in the
     * card rendered as "On-chain". Root cause: prod `suix_queryTransactionBlocks`
     * serializes the programmable-tx body with the legacy field name
     * `transactions` (plural), but `parseRpcTx` was only checking
     * `commands`. With no MoveCall targets extracted, every tx fell
     * through to `fallbackLabel([])` → 'on-chain'.
     */
    mockFetchOnce([
      makeRpcTx({
        digest: '0xlegacy',
        moveCalls: [{ package: '0xpkg', module: 'navi', function: 'deposit' }],
        balanceChanges: [{ owner: ADDR, coinType: USDC, amount: '-10000000' }],
        cmdField: 'transactions',
      }),
    ]);
    const res = await transactionHistoryTool.call({ limit: 10 }, baseCtx);
    const data = res.data as { transactions: { action: string; label?: string }[] };
    expect(data.transactions[0].action).toBe('lending');
    expect(data.transactions[0].label).toBe('deposit');
  });

  it('SUI-only balance changes do not trigger lending tiebreaker', async () => {
    /**
     * Gas-only SUI deltas appear on every tx. The tiebreaker explicitly
     * excludes SUI to avoid mislabeling a no-op lending call as a
     * deposit just because gas was paid.
     */
    mockFetchOnce([
      makeRpcTx({
        digest: '0xnoop',
        moveCalls: [{ package: '0xpkg', module: 'navi', function: 'entry_noop' }],
        balanceChanges: [{ owner: ADDR, coinType: SUI, amount: '-5000' }],
      }),
    ]);
    const res = await transactionHistoryTool.call({ limit: 10 }, baseCtx);
    const data = res.data as { transactions: { action: string; label?: string }[] };
    expect(data.transactions[0].action).toBe('lending');
    // No deposit/withdraw classification — tiebreaker skipped.
    // Falls back to module name 'navi'.
    expect(['lending', 'on-chain', 'navi']).toContain(data.transactions[0].label);
  });
});
