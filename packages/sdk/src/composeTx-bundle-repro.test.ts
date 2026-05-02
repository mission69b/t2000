/**
 * SPEC 7 P2.7 — multi-write bundle merge-cache regression.
 *
 * Locks down the fix for the live failure observed 2026-05-02 during the
 * P2.7 soak window:
 *
 *   "Swap $5 USDC into SUI, save $10 USDC, then send $1 USDC to ossy.sui"
 *   → Enoki dry_run_failed: CommandArgumentError { arg_idx: 1, kind:
 *      ArgumentWithoutValue } in command 9
 *
 * Root cause: every wallet-mode coin selection call (`selectAndSplitCoin`
 * + the inline equivalent inside `addSwapToTx` pre-fix) re-emitted
 * `mergeCoins(primary, [secondaries])` against the SAME on-chain coin IDs.
 * In a single-write PTB that's harmless. In a multi-write bundle that
 * touches the same coin type twice (swap+save, save+send, etc.) the
 * second `mergeCoins` references `Input(secondary)` slots that the FIRST
 * `mergeCoins` already consumed — Sui's PTB validator rejects with
 * `ArgumentWithoutValue`.
 *
 * The fix is a per-PTB merge cache keyed by `(sender, coinType)` inside
 * `selectAndSplitCoin`. First call merges + caches the primary; subsequent
 * calls split from the cached primary directly (no re-fetch, no re-merge).
 * `addSwapToTx`'s wallet-mode prelude was refactored to call
 * `selectAndSplitCoin` so it shares the same cache.
 *
 * Invariants asserted here:
 *   1. The assembled PTB contains AT MOST ONE `MergeCoins` per coinType,
 *      regardless of how many bundle steps consume that coin type.
 *   2. Every step's split references the cached primary input (not a
 *      different ObjectArgument from a re-fetch).
 *   3. The single-coin-wallet case (no merge needed) still composes
 *      cleanly — no regression.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';

const VALID_ADDRESS = '0x' + 'a'.repeat(64);
const RECIPIENT_ADDRESS = '0x' + 'b'.repeat(64);
const FEE_WALLET = '0x' + 'c'.repeat(64);
const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

function mockRpcClient(coins: Record<string, Array<{ coinObjectId: string; balance: string }>>): SuiJsonRpcClient {
  const getCoins = vi.fn(async ({ coinType }: { coinType: string }) => ({
    data: coins[coinType] ?? [],
    nextCursor: null,
    hasNextPage: false,
  }));
  return { getCoins } as unknown as SuiJsonRpcClient;
}

function mockNaviAdapter() {
  vi.doMock('@naviprotocol/lending', () => ({
    depositCoinPTB: vi.fn(async (tx: Transaction) => {
      tx.moveCall({
        target: '0x1e4a13a0494d5facdbe8473e74127b838c2d446ecec0ce262e2eddafa77259cb::incentive_v3::entry_deposit',
        arguments: [],
      });
      return undefined;
    }),
    updateOraclePriceBeforeUserOperationPTB: vi.fn(async () => undefined),
    getLendingPositions: vi.fn(async () => []),
    getPools: vi.fn(async () => []),
    getHealthFactor: vi.fn(async () => 1e18),
  }));
}

function mockCetus() {
  vi.doMock('@cetusprotocol/aggregator-sdk', () => ({
    AggregatorClient: class {
      async findRouters() {
        return {
          amountIn: '5000000', amountOut: '5447737842',
          insufficientLiquidity: false, deviationRatio: 0.0000001,
          paths: [
            { provider: 'BLUEFIN' },
            { provider: 'FERRADLMM' },
            { provider: 'CETUS' },
          ],
        };
      }
      async routerSwap({ txb, inputCoin }: { txb: Transaction; inputCoin: TransactionObjectArgument }) {
        txb.moveCall({
          target: '0xde5d696a79714ca5cb910b9aed99d41f67353abb00715ceaeb0663d57ee39640::router::new_swap_context',
          arguments: [inputCoin],
        });
        txb.moveCall({
          target: '0x4e7c4ba436f8fd5b3c6bb514880ccd11c5109c83c45b5e037394b94204dbbb80::bluefin::swap',
          arguments: [],
        });
        txb.moveCall({
          target: '0x3aeee81b8b88da7e9b4b22ceca217fc198dac1e5be61e417a8cb7733acb1b8a8::ferra_dlmm::swap',
          arguments: [],
        });
        txb.moveCall({
          target: '0x721d950e57259cd97d41010887ab502ee7753b0a3deb4b6a80099aad0c833928::cetus::swap',
          arguments: [],
        });
        const [outputCoin] = txb.moveCall({
          target: '0xde5d696a79714ca5cb910b9aed99d41f67353abb00715ceaeb0663d57ee39640::router::confirm_swap',
          arguments: [],
        });
        return outputCoin;
      }
    },
    Env: { Mainnet: 'mainnet' },
    getProvidersExcluding: (excluded: string[]) =>
      ['BLUEFIN', 'FERRADLMM', 'CETUS', 'KRIYAV3'].filter((p) => !excluded.includes(p)),
  }));
}

const STUB_BYTES = new Uint8Array([1, 2, 3, 4]);

/** Helper: count `MergeCoins` commands in the assembled PTB. */
function countMerges(tx: Transaction): number {
  return tx.getData().commands.filter((c) => '$kind' in c && (c as { $kind: string }).$kind === 'MergeCoins').length;
}

describe('composeTx — P2.7 multi-write bundle merge cache', () => {
  beforeEach(() => {
    vi.resetModules();
    mockNaviAdapter();
    mockCetus();
    vi.spyOn(Transaction.prototype, 'build').mockResolvedValue(STUB_BYTES);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SINGLE-COIN wallet: [swap+save+send USDC] composes with ZERO mergeCoins', async () => {
    const { composeTx } = await import('./composeTx.js');
    const { addFeeTransfer } = await import('./protocols/protocolFee.js');

    const client = mockRpcClient({
      [USDC_TYPE]: [{ coinObjectId: '0x' + '1'.repeat(64), balance: '20250000' }],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [
        { toolName: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 5 } },
        { toolName: 'save_deposit', input: { amount: 10, asset: 'USDC' } },
        { toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 1, asset: 'USDC' } },
      ],
      overlayFee: { rate: 0.001, receiver: FEE_WALLET },
      feeHooks: {
        save_deposit: ({ tx, coin, input }) => {
          if (input.asset === 'USDC' || input.asset === undefined) {
            addFeeTransfer(tx, coin, 10n, FEE_WALLET, input.amount);
          }
        },
      },
    });

    expect(countMerges(result.tx)).toBe(0);
  });

  it('TWO-COIN wallet: [swap+save+send USDC] composes with EXACTLY ONE mergeCoins (live failure repro)', async () => {
    const { composeTx } = await import('./composeTx.js');
    const { addFeeTransfer } = await import('./protocols/protocolFee.js');

    const client = mockRpcClient({
      [USDC_TYPE]: [
        { coinObjectId: '0x' + '1'.repeat(64), balance: '15000000' },
        { coinObjectId: '0x' + '2'.repeat(64), balance: '5250000' },
      ],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [
        { toolName: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 5 } },
        { toolName: 'save_deposit', input: { amount: 10, asset: 'USDC' } },
        { toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 1, asset: 'USDC' } },
      ],
      overlayFee: { rate: 0.001, receiver: FEE_WALLET },
      feeHooks: {
        save_deposit: ({ tx, coin, input }) => {
          if (input.asset === 'USDC' || input.asset === undefined) {
            addFeeTransfer(tx, coin, 10n, FEE_WALLET, input.amount);
          }
        },
      },
    });

    // The whole point of the cache: regardless of how many bundle steps
    // consume USDC, the merge happens exactly ONCE.
    expect(countMerges(result.tx)).toBe(1);

    // Every USDC split (swap, save, send) must reference the same primary —
    // Input(0) is the merge destination, used as `coin` in all 3 splits.
    const splitCommandSources = result.tx
      .getData()
      .commands.filter(
        (c) => '$kind' in c && (c as { $kind: string }).$kind === 'SplitCoins',
      )
      .map((c) => (c as { SplitCoins: { coin: unknown } }).SplitCoins.coin);
    const inputBackedSplits = splitCommandSources.filter(
      (src) => (src as { $kind?: string }).$kind === 'Input',
    );
    // Three USDC splits (swap, save, send) all reference Input(0) (the cached primary).
    // The fee split inside save_deposit's feeHook references a NestedResult
    // (the just-split saveCoin), not Input(0) — so it's NOT counted here.
    expect(inputBackedSplits.length).toBe(3);
    expect(
      inputBackedSplits.every((src) => (src as { Input: number }).Input === 0),
    ).toBe(true);
  });

  it('FOUR-COIN wallet: [swap+save+send USDC] composes with EXACTLY ONE mergeCoins consuming 3 secondaries', async () => {
    const { composeTx } = await import('./composeTx.js');
    const { addFeeTransfer } = await import('./protocols/protocolFee.js');

    const client = mockRpcClient({
      [USDC_TYPE]: [
        { coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' },
        { coinObjectId: '0x' + '2'.repeat(64), balance: '5000000' },
        { coinObjectId: '0x' + '3'.repeat(64), balance: '3000000' },
        { coinObjectId: '0x' + '4'.repeat(64), balance: '2250000' },
      ],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [
        { toolName: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 5 } },
        { toolName: 'save_deposit', input: { amount: 10, asset: 'USDC' } },
        { toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 1, asset: 'USDC' } },
      ],
      overlayFee: { rate: 0.001, receiver: FEE_WALLET },
      feeHooks: {
        save_deposit: ({ tx, coin, input }) => {
          if (input.asset === 'USDC' || input.asset === undefined) {
            addFeeTransfer(tx, coin, 10n, FEE_WALLET, input.amount);
          }
        },
      },
    });

    expect(countMerges(result.tx)).toBe(1);
    const merge = result.tx
      .getData()
      .commands.find((c) => '$kind' in c && (c as { $kind: string }).$kind === 'MergeCoins') as
      | { MergeCoins: { sources: unknown[] } }
      | undefined;
    expect(merge?.MergeCoins.sources.length).toBe(3);
  });

  it('TWO-STEP bundle [save+send USDC] also avoids the double-merge bug', async () => {
    const { composeTx } = await import('./composeTx.js');
    const { addFeeTransfer } = await import('./protocols/protocolFee.js');

    const client = mockRpcClient({
      [USDC_TYPE]: [
        { coinObjectId: '0x' + '1'.repeat(64), balance: '15000000' },
        { coinObjectId: '0x' + '2'.repeat(64), balance: '5000000' },
      ],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [
        { toolName: 'save_deposit', input: { amount: 10, asset: 'USDC' } },
        { toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 1, asset: 'USDC' } },
      ],
      feeHooks: {
        save_deposit: ({ tx, coin, input }) => {
          addFeeTransfer(tx, coin, 10n, FEE_WALLET, input.amount);
        },
      },
    });

    expect(countMerges(result.tx)).toBe(1);
  });

  it('repeated single-asset writes [send+send+send USDC] also share the cache', async () => {
    const { composeTx } = await import('./composeTx.js');

    const client = mockRpcClient({
      [USDC_TYPE]: [
        { coinObjectId: '0x' + '1'.repeat(64), balance: '15000000' },
        { coinObjectId: '0x' + '2'.repeat(64), balance: '5000000' },
      ],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [
        { toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 1, asset: 'USDC' } },
        { toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 2, asset: 'USDC' } },
        { toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 3, asset: 'USDC' } },
      ],
    });

    expect(countMerges(result.tx)).toBe(1);
  });

  it('isolation: separate composeTx calls do NOT share cache (different Transaction instances)', async () => {
    const { composeTx } = await import('./composeTx.js');

    const client = mockRpcClient({
      [USDC_TYPE]: [
        { coinObjectId: '0x' + '1'.repeat(64), balance: '15000000' },
        { coinObjectId: '0x' + '2'.repeat(64), balance: '5000000' },
      ],
    });

    // Each composeTx call constructs a fresh Transaction. The WeakMap-keyed
    // cache must NOT leak across calls — every fresh PTB starts with an
    // empty cache and emits its own (single) merge.
    const a = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 1, asset: 'USDC' } }],
    });
    const b = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 1, asset: 'USDC' } }],
    });

    expect(countMerges(a.tx)).toBe(1);
    expect(countMerges(b.tx)).toBe(1);
  });
});
