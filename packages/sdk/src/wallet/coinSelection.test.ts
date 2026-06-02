/**
 * selectAndSplitCoin — sponsored coin-object-only path (issue #93).
 *
 * Locks in the fix for the Enoki "Invalid bcs bytes for TransactionData"
 * failure: under `sponsoredContext`, coin sourcing must come from discrete
 * coin objects (SplitCoins/MergeCoins), never `coinWithBalance` (which reaches
 * into the address balance and emits a `FundsWithdrawal` reservation Enoki's
 * gas station can't deserialize). Address-balance-only wallets must get a clear
 * `ADDRESS_BALANCE_UNSPONSORABLE` error instead of the cryptic Enoki failure.
 */
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { describe, expect, it, vi } from 'vitest';
import { T2000Error } from '../errors.js';
import { selectAndSplitCoin, selectSuiCoin } from './coinSelection.js';

const OWNER = `0x${'a'.repeat(64)}`;
const USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

function mockClient(opts: {
  coins?: Array<{ coinObjectId: string; balance: string }>;
  totalBalance?: string;
}): SuiJsonRpcClient {
  const coins = opts.coins ?? [];
  return {
    getCoins: async () => ({ data: coins, nextCursor: null, hasNextPage: false }),
    getBalance: async ({ coinType }: { coinType: string }) => ({
      coinType,
      coinObjectCount: coins.length,
      totalBalance: opts.totalBalance ?? coins.reduce((a, c) => a + BigInt(c.balance), 0n).toString(),
      lockedBalance: {},
    }),
  } as unknown as SuiJsonRpcClient;
}

function commandKinds(tx: Transaction): string[] {
  return tx.getData().commands.map((c) => c.$kind);
}

describe('selectAndSplitCoin — sponsoredContext (coin objects only)', () => {
  it('splits an exact amount from coin objects (no CoinWithBalance intent)', async () => {
    const tx = new Transaction();
    tx.setSender(OWNER);
    const client = mockClient({ coins: [{ coinObjectId: `0x${'1'.repeat(64)}`, balance: '5000000' }] });

    const r = await selectAndSplitCoin(tx, client, OWNER, USDC, 1_000_000n, {
      sponsoredContext: true,
    });

    expect(r.effectiveAmount).toBe(1_000_000n);
    expect(r.swapAll).toBe(false);
    const kinds = commandKinds(tx);
    expect(kinds).toContain('SplitCoins');
    expect(kinds).not.toContain('$Intent'); // no coinWithBalance → no FundsWithdrawal
  });

  it('merges multiple coin objects before splitting', async () => {
    const tx = new Transaction();
    tx.setSender(OWNER);
    const client = mockClient({
      coins: [
        { coinObjectId: `0x${'1'.repeat(64)}`, balance: '600000' },
        { coinObjectId: `0x${'2'.repeat(64)}`, balance: '600000' },
      ],
    });

    const r = await selectAndSplitCoin(tx, client, OWNER, USDC, 1_000_000n, {
      sponsoredContext: true,
    });

    expect(r.effectiveAmount).toBe(1_000_000n);
    const kinds = commandKinds(tx);
    expect(kinds).toContain('MergeCoins');
    expect(kinds).toContain('SplitCoins');
  });

  it("consumes the whole balance for amount 'all' without splitting", async () => {
    const tx = new Transaction();
    tx.setSender(OWNER);
    const client = mockClient({ coins: [{ coinObjectId: `0x${'1'.repeat(64)}`, balance: '3000000' }] });

    const r = await selectAndSplitCoin(tx, client, OWNER, USDC, 'all', { sponsoredContext: true });

    expect(r.swapAll).toBe(true);
    expect(r.effectiveAmount).toBe(3_000_000n);
    expect(commandKinds(tx)).not.toContain('SplitCoins');
  });

  it('throws ADDRESS_BALANCE_UNSPONSORABLE when funds are address-balance-only', async () => {
    const tx = new Transaction();
    tx.setSender(OWNER);
    // getCoins returns nothing (address balance is excluded by getCoins), but
    // getBalance reports funds — the classic gasless-receive situation.
    const client = mockClient({ coins: [], totalBalance: '13936476' });

    await expect(
      selectAndSplitCoin(tx, client, OWNER, USDC, 1_000_000n, { sponsoredContext: true }),
    ).rejects.toMatchObject({ code: 'ADDRESS_BALANCE_UNSPONSORABLE' } as Partial<T2000Error>);
  });

  it('throws ADDRESS_BALANCE_UNSPONSORABLE when coin objects under-cover the amount', async () => {
    const tx = new Transaction();
    tx.setSender(OWNER);
    const client = mockClient({ coins: [{ coinObjectId: `0x${'1'.repeat(64)}`, balance: '500000' }] });

    await expect(
      selectAndSplitCoin(tx, client, OWNER, USDC, 1_000_000n, { sponsoredContext: true }),
    ).rejects.toMatchObject({ code: 'ADDRESS_BALANCE_UNSPONSORABLE' } as Partial<T2000Error>);
  });

  it('non-sponsored path still uses coinWithBalance (address-balance capable)', async () => {
    const tx = new Transaction();
    tx.setSender(OWNER);
    const client = mockClient({ coins: [{ coinObjectId: `0x${'1'.repeat(64)}`, balance: '5000000' }] });

    const r = await selectAndSplitCoin(tx, client, OWNER, USDC, 1_000_000n);

    expect(r.effectiveAmount).toBe(1_000_000n);
    expect(commandKinds(tx)).toContain('$Intent'); // coinWithBalance intent
  });
});

describe('selectSuiCoin — sponsored (coin objects only, no GasCoin)', () => {
  it('splits SUI from coin objects, never tx.gas or coinWithBalance', async () => {
    const tx = new Transaction();
    tx.setSender(OWNER);
    const client = mockClient({ coins: [{ coinObjectId: `0x${'5'.repeat(64)}`, balance: '5000000000' }] });

    const r = await selectSuiCoin(tx, client, OWNER, 1_000_000_000n, true);

    expect(r.effectiveAmount).toBe(1_000_000_000n);
    const kinds = commandKinds(tx);
    expect(kinds).toContain('SplitCoins');
    expect(kinds).not.toContain('$Intent'); // no coinWithBalance
    expect(JSON.stringify(tx.getData().commands)).not.toContain('GasCoin');
  });

  it('throws ADDRESS_BALANCE_UNSPONSORABLE when SUI is address-balance-only', async () => {
    const tx = new Transaction();
    tx.setSender(OWNER);
    const client = mockClient({ coins: [], totalBalance: '9000000000' });

    await expect(
      selectSuiCoin(tx, client, OWNER, 1_000_000_000n, true),
    ).rejects.toMatchObject({ code: 'ADDRESS_BALANCE_UNSPONSORABLE' } as Partial<T2000Error>);
  });

  it('self-funded path splits from tx.gas (no getCoins)', async () => {
    const tx = new Transaction();
    tx.setSender(OWNER);
    const getCoins = vi.fn();
    const client = { getCoins } as unknown as Parameters<typeof selectSuiCoin>[1];

    const r = await selectSuiCoin(tx, client, OWNER, 1_000_000_000n, false);

    expect(r.effectiveAmount).toBe(1_000_000_000n);
    expect(getCoins).not.toHaveBeenCalled();
    expect(JSON.stringify(tx.getData().commands)).toContain('GasCoin');
  });
});

describe('selectSuiCoin — sponsored merge cache (multi-leg bundle)', () => {
  function countingClient(coins: Array<{ coinObjectId: string; balance: string }>) {
    const getCoins = vi.fn(async () => ({ data: coins, nextCursor: null, hasNextPage: false }));
    const client = {
      getCoins,
      getBalance: async ({ coinType }: { coinType: string }) => ({
        coinType,
        coinObjectCount: coins.length,
        totalBalance: coins.reduce((a, c) => a + BigInt(c.balance), 0n).toString(),
        lockedBalance: {},
      }),
    } as unknown as SuiJsonRpcClient;
    return { client, getCoins };
  }

  it('merges the SUI coin objects exactly ONCE across two legs (the bundle fix)', async () => {
    const tx = new Transaction();
    tx.setSender(OWNER);
    // Two discrete SUI coin objects — the case that triggered the original
    // ArgumentWithoutValue (the second leg re-merged already-consumed coins).
    const { client, getCoins } = countingClient([
      { coinObjectId: `0x${'5'.repeat(64)}`, balance: '20000000000' },
      { coinObjectId: `0x${'6'.repeat(64)}`, balance: '14000000000' },
    ]);
    const cache = new Map() as Parameters<typeof selectSuiCoin>[5];

    // Leg 1 (SUI → WAL) and Leg 2 (SUI → DEEP), same PTB, shared cache.
    await selectSuiCoin(tx, client, OWNER, 1_700_000_000n, true, cache);
    await selectSuiCoin(tx, client, OWNER, 1_700_000_000n, true, cache);

    const kinds = commandKinds(tx);
    // Exactly one merge for both legs; one split per leg.
    expect(kinds.filter((k) => k === 'MergeCoins')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'SplitCoins')).toHaveLength(2);
    // Second leg reused the cache → no second getCoins round-trip.
    expect(getCoins).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(tx.getData().commands)).not.toContain('GasCoin');
  });

  it('without a shared cache, each leg re-merges (reproduces the pre-fix double-merge)', async () => {
    const tx = new Transaction();
    tx.setSender(OWNER);
    const { client } = countingClient([
      { coinObjectId: `0x${'5'.repeat(64)}`, balance: '20000000000' },
      { coinObjectId: `0x${'6'.repeat(64)}`, balance: '14000000000' },
    ]);

    await selectSuiCoin(tx, client, OWNER, 1_700_000_000n, true);
    await selectSuiCoin(tx, client, OWNER, 1_700_000_000n, true);

    // Two independent merges of the same coins → the invalid PTB shape.
    expect(commandKinds(tx).filter((k) => k === 'MergeCoins')).toHaveLength(2);
  });

  it('throws ADDRESS_BALANCE_UNSPONSORABLE when a later leg over-draws the merged primary', async () => {
    const tx = new Transaction();
    tx.setSender(OWNER);
    const { client } = countingClient([
      { coinObjectId: `0x${'5'.repeat(64)}`, balance: '2000000000' },
    ]);
    const cache = new Map() as Parameters<typeof selectSuiCoin>[5];

    await selectSuiCoin(tx, client, OWNER, 1_500_000_000n, true, cache);
    // Only 0.5 SUI remains on the merged primary; asking for 1 SUI fails.
    await expect(
      selectSuiCoin(tx, client, OWNER, 1_000_000_000n, true, cache),
    ).rejects.toMatchObject({ code: 'ADDRESS_BALANCE_UNSPONSORABLE' } as Partial<T2000Error>);
  });

  it('single coin object: still merges once and splits twice (no merge with one object)', async () => {
    const tx = new Transaction();
    tx.setSender(OWNER);
    const { client, getCoins } = countingClient([
      { coinObjectId: `0x${'5'.repeat(64)}`, balance: '34000000000' },
    ]);
    const cache = new Map() as Parameters<typeof selectSuiCoin>[5];

    await selectSuiCoin(tx, client, OWNER, 1_700_000_000n, true, cache);
    await selectSuiCoin(tx, client, OWNER, 1_700_000_000n, true, cache);

    const kinds = commandKinds(tx);
    // One object → no merge needed; two splits from the cached primary.
    expect(kinds.filter((k) => k === 'MergeCoins')).toHaveLength(0);
    expect(kinds.filter((k) => k === 'SplitCoins')).toHaveLength(2);
    expect(getCoins).toHaveBeenCalledTimes(1);
  });
});
