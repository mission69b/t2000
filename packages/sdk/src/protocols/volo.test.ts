import { describe, it, expect, vi } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import {
  buildStakeVSuiTx,
  buildUnstakeVSuiTx,
  addStakeVSuiToTx,
  addUnstakeVSuiToTx,
  MIN_STAKE_MIST,
  VOLO_PKG,
} from './volo.js';

const VALID_ADDRESS = '0x' + 'a'.repeat(64);

function mockClient(coins: Array<{ coinObjectId: string; balance: string }>) {
  const getCoins = vi.fn().mockResolvedValue({
    data: coins,
    nextCursor: null,
    hasNextPage: false,
  });
  return { getCoins } as unknown as Parameters<typeof addStakeVSuiToTx>[1];
}

function paginatedClient(pages: Array<Array<{ coinObjectId: string; balance: string }>>) {
  let pageIndex = 0;
  const getCoins = vi.fn().mockImplementation(async () => {
    const data = pages[pageIndex] ?? [];
    const isLast = pageIndex === pages.length - 1;
    pageIndex += 1;
    return {
      data,
      nextCursor: isLast ? null : `cursor-${pageIndex}`,
      hasNextPage: !isLast,
    };
  });
  return {
    client: { getCoins } as unknown as Parameters<typeof addStakeVSuiToTx>[1],
    getCoins,
  };
}

describe('buildStakeVSuiTx (existing)', () => {
  it('throws when amount is below MIN_STAKE_MIST', async () => {
    const client = mockClient([]);
    await expect(buildStakeVSuiTx(client, VALID_ADDRESS, MIN_STAKE_MIST - 1n)).rejects.toThrow('Minimum stake');
  });

  it('returns a Transaction with sender set on valid stake', async () => {
    const client = mockClient([]);
    const tx = await buildStakeVSuiTx(client, VALID_ADDRESS, MIN_STAKE_MIST);
    expect(tx).toBeInstanceOf(Transaction);
    expect(tx.getData().sender).toBe(VALID_ADDRESS);
  });
});

describe('addStakeVSuiToTx (SPEC 7 P2.2.4 stake appender)', () => {
  it('throws on amount < MIN_STAKE_MIST', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([]);

    await expect(
      addStakeVSuiToTx(tx, client, VALID_ADDRESS, { amountMist: MIN_STAKE_MIST - 1n }),
    ).rejects.toThrow('Minimum stake');
  });

  it('wallet mode: fetches SUI coins, merges, splits, calls Volo stake', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([
      { coinObjectId: '0x' + '1'.repeat(64), balance: '5000000000' },
      { coinObjectId: '0x' + '2'.repeat(64), balance: '2000000000' },
    ]);

    const result = await addStakeVSuiToTx(tx, client, VALID_ADDRESS, {
      amountMist: MIN_STAKE_MIST,
    });

    expect(result.coin).toBeDefined();
    expect(result.effectiveAmountMist).toBe(MIN_STAKE_MIST);

    const commands = tx.getData().commands as Array<Record<string, unknown>>;
    const hasMerge = commands.some((c) => c.MergeCoins !== undefined);
    const hasSplit = commands.some((c) => c.SplitCoins !== undefined);
    const hasStakeMoveCall = commands.some((c) => {
      const mc = c.MoveCall as { package?: string; module?: string; function?: string } | undefined;
      return mc?.package === VOLO_PKG && mc?.module === 'stake_pool' && mc?.function === 'stake';
    });
    expect(hasMerge).toBe(true);
    expect(hasSplit).toBe(true);
    expect(hasStakeMoveCall).toBe(true);
  });

  it('wallet mode: throws when no SUI coins found', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([]);

    await expect(
      addStakeVSuiToTx(tx, client, VALID_ADDRESS, { amountMist: MIN_STAKE_MIST }),
    ).rejects.toThrow('No SUI coins found');
  });

  it('wallet mode: throws when total SUI balance is insufficient', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([
      { coinObjectId: '0x' + '1'.repeat(64), balance: '500000000' },
    ]);

    await expect(
      addStakeVSuiToTx(tx, client, VALID_ADDRESS, { amountMist: MIN_STAKE_MIST }),
    ).rejects.toThrow('Insufficient SUI');
  });

  it('chain mode: consumes inputCoin directly, does NOT call getCoins', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([]);
    const [upstreamCoin] = tx.splitCoins(tx.gas, [MIN_STAKE_MIST]);

    const result = await addStakeVSuiToTx(tx, client, VALID_ADDRESS, {
      amountMist: MIN_STAKE_MIST,
      inputCoin: upstreamCoin,
    });

    expect(result.coin).toBeDefined();
    expect(result.effectiveAmountMist).toBe(MIN_STAKE_MIST);
    expect((client as unknown as { getCoins: ReturnType<typeof vi.fn> }).getCoins).not.toHaveBeenCalled();

    const commands = tx.getData().commands as Array<Record<string, unknown>>;
    const hasStakeMoveCall = commands.some((c) => {
      const mc = c.MoveCall as { package?: string; module?: string; function?: string } | undefined;
      return mc?.package === VOLO_PKG && mc?.module === 'stake_pool' && mc?.function === 'stake';
    });
    expect(hasStakeMoveCall).toBe(true);
  });

  it('paginates getCoins until hasNextPage=false', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const { client, getCoins } = paginatedClient([
      [{ coinObjectId: '0x' + '1'.repeat(64), balance: '500000000' }],
      [{ coinObjectId: '0x' + '2'.repeat(64), balance: '600000000' }],
    ]);

    const result = await addStakeVSuiToTx(tx, client, VALID_ADDRESS, {
      amountMist: MIN_STAKE_MIST,
    });

    expect(getCoins).toHaveBeenCalledTimes(2);
    expect(result.effectiveAmountMist).toBe(MIN_STAKE_MIST);
  });
});

describe('addUnstakeVSuiToTx (SPEC 7 P2.2.4 unstake appender)', () => {
  it('wallet mode (specific amount): fetches vSUI, merges, splits, calls Volo unstake', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([
      { coinObjectId: '0x' + '1'.repeat(64), balance: '3000000000' },
      { coinObjectId: '0x' + '2'.repeat(64), balance: '1000000000' },
    ]);

    const result = await addUnstakeVSuiToTx(tx, client, VALID_ADDRESS, {
      amountMist: 2_000_000_000n,
    });

    expect(result.coin).toBeDefined();
    expect(result.effectiveAmountMist).toBe(2_000_000_000n);

    const commands = tx.getData().commands as Array<Record<string, unknown>>;
    const hasMerge = commands.some((c) => c.MergeCoins !== undefined);
    const hasSplit = commands.some((c) => c.SplitCoins !== undefined);
    const hasUnstakeMoveCall = commands.some((c) => {
      const mc = c.MoveCall as { package?: string; module?: string; function?: string } | undefined;
      return mc?.package === VOLO_PKG && mc?.module === 'stake_pool' && mc?.function === 'unstake';
    });
    expect(hasMerge).toBe(true);
    expect(hasSplit).toBe(true);
    expect(hasUnstakeMoveCall).toBe(true);
  });

  it("wallet mode ('all'): consumes the merged primary without splitting", async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([
      { coinObjectId: '0x' + '1'.repeat(64), balance: '3000000000' },
      { coinObjectId: '0x' + '2'.repeat(64), balance: '1000000000' },
    ]);

    const result = await addUnstakeVSuiToTx(tx, client, VALID_ADDRESS, {
      amountMist: 'all',
    });

    expect(result.effectiveAmountMist).toBe('all');

    const commands = tx.getData().commands as Array<Record<string, unknown>>;
    const splitCount = commands.filter((c) => c.SplitCoins !== undefined).length;
    const mergeCount = commands.filter((c) => c.MergeCoins !== undefined).length;
    expect(splitCount).toBe(0);
    expect(mergeCount).toBe(1);
  });

  it('wallet mode (single coin): no merge needed', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([
      { coinObjectId: '0x' + '1'.repeat(64), balance: '3000000000' },
    ]);

    const result = await addUnstakeVSuiToTx(tx, client, VALID_ADDRESS, {
      amountMist: 'all',
    });

    expect(result.effectiveAmountMist).toBe('all');
    const commands = tx.getData().commands as Array<Record<string, unknown>>;
    const mergeCount = commands.filter((c) => c.MergeCoins !== undefined).length;
    expect(mergeCount).toBe(0);
  });

  it('wallet mode: throws when no vSUI found', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([]);

    await expect(
      addUnstakeVSuiToTx(tx, client, VALID_ADDRESS, { amountMist: 'all' }),
    ).rejects.toThrow('No vSUI found');
  });

  it('chain mode (specific amount): splits inputCoin and unstakes the split portion', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([]);
    const [upstreamCoin] = tx.splitCoins(tx.gas, [5_000_000_000n]);

    const result = await addUnstakeVSuiToTx(tx, client, VALID_ADDRESS, {
      amountMist: 2_000_000_000n,
      inputCoin: upstreamCoin,
    });

    expect(result.coin).toBeDefined();
    expect(result.effectiveAmountMist).toBe(2_000_000_000n);
    expect((client as unknown as { getCoins: ReturnType<typeof vi.fn> }).getCoins).not.toHaveBeenCalled();

    const commands = tx.getData().commands as Array<Record<string, unknown>>;
    const hasUnstakeMoveCall = commands.some((c) => {
      const mc = c.MoveCall as { package?: string; module?: string; function?: string } | undefined;
      return mc?.package === VOLO_PKG && mc?.module === 'stake_pool' && mc?.function === 'unstake';
    });
    expect(hasUnstakeMoveCall).toBe(true);
  });

  it("chain mode ('all'): consumes inputCoin entirely without splitting it", async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient([]);
    const [upstreamCoin] = tx.splitCoins(tx.gas, [5_000_000_000n]);

    const splitCountBefore = (tx.getData().commands as Array<Record<string, unknown>>)
      .filter((c) => c.SplitCoins !== undefined).length;

    const result = await addUnstakeVSuiToTx(tx, client, VALID_ADDRESS, {
      amountMist: 'all',
      inputCoin: upstreamCoin,
    });

    expect(result.effectiveAmountMist).toBe('all');
    const splitCountAfter = (tx.getData().commands as Array<Record<string, unknown>>)
      .filter((c) => c.SplitCoins !== undefined).length;
    expect(splitCountAfter).toBe(splitCountBefore);
  });

  it('paginates getCoins until hasNextPage=false', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const { client, getCoins } = paginatedClient([
      [{ coinObjectId: '0x' + '1'.repeat(64), balance: '1000000000' }],
      [{ coinObjectId: '0x' + '2'.repeat(64), balance: '500000000' }],
    ]);

    const result = await addUnstakeVSuiToTx(tx, client, VALID_ADDRESS, {
      amountMist: 'all',
    });

    expect(getCoins).toHaveBeenCalledTimes(2);
    expect(result.effectiveAmountMist).toBe('all');
  });
});

describe('buildUnstakeVSuiTx (regression after fetchCoinsByType refactor)', () => {
  it('throws when no vSUI is found in wallet', async () => {
    const client = mockClient([]);
    await expect(buildUnstakeVSuiTx(client, VALID_ADDRESS, 'all')).rejects.toThrow('No vSUI found');
  });

  it('returns a Transaction when vSUI exists', async () => {
    const client = mockClient([
      { coinObjectId: '0x' + '1'.repeat(64), balance: '3000000000' },
    ]);
    const tx = await buildUnstakeVSuiTx(client, VALID_ADDRESS, 'all');
    expect(tx).toBeInstanceOf(Transaction);
    expect(tx.getData().sender).toBe(VALID_ADDRESS);
  });
});
