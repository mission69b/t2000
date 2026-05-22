/**
 * Volo stake/unstake appender tests.
 *
 * 2026-05-22 — address-balance migration. Pre-flight now uses
 * `getBalance().totalBalance` (sums coins + address balance) and the
 * coin argument is built via `coinWithBalance({ type, balance })` from
 * `@mysten/sui/transactions`. The resolver runs at `tx.build()` time —
 * no `MergeCoins`/`SplitCoins` are emitted at PTB construction time, so
 * tests assert behavior (Move calls + errors), not in-memory PTB shapes.
 */
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

function mockClient(totalBalance: bigint): Parameters<typeof addStakeVSuiToTx>[1] {
  return {
    getBalance: vi.fn().mockResolvedValue({
      coinType: 'unused',
      coinObjectCount: totalBalance > 0n ? 1 : 0,
      totalBalance: totalBalance.toString(),
      lockedBalance: {},
    }),
    getCoins: vi.fn().mockResolvedValue({
      data: totalBalance > 0n
        ? [{ coinObjectId: '0x' + '1'.repeat(64), balance: totalBalance.toString() }]
        : [],
      nextCursor: null,
      hasNextPage: false,
    }),
  } as unknown as Parameters<typeof addStakeVSuiToTx>[1];
}

describe('buildStakeVSuiTx', () => {
  it('throws when amount is below MIN_STAKE_MIST', async () => {
    const client = mockClient(0n);
    await expect(buildStakeVSuiTx(client, VALID_ADDRESS, MIN_STAKE_MIST - 1n)).rejects.toThrow('Minimum stake');
  });

  it('returns a Transaction with sender set on valid stake', async () => {
    const client = mockClient(0n);
    const tx = await buildStakeVSuiTx(client, VALID_ADDRESS, MIN_STAKE_MIST);
    expect(tx).toBeInstanceOf(Transaction);
    expect(tx.getData().sender).toBe(VALID_ADDRESS);
  });
});

describe('addStakeVSuiToTx', () => {
  it('throws on amount < MIN_STAKE_MIST', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient(0n);
    await expect(
      addStakeVSuiToTx(tx, client, VALID_ADDRESS, { amountMist: MIN_STAKE_MIST - 1n }),
    ).rejects.toThrow('Minimum stake');
  });

  it('wallet mode: emits a Volo stake move call when balance is sufficient', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient(7_000_000_000n);

    const result = await addStakeVSuiToTx(tx, client, VALID_ADDRESS, { amountMist: MIN_STAKE_MIST });

    expect(result.coin).toBeDefined();
    expect(result.effectiveAmountMist).toBe(MIN_STAKE_MIST);

    const commands = tx.getData().commands as Array<Record<string, unknown>>;
    const hasStakeMoveCall = commands.some((c) => {
      const mc = c.MoveCall as { package?: string; module?: string; function?: string } | undefined;
      return mc?.package === VOLO_PKG && mc?.module === 'stake_pool' && mc?.function === 'stake';
    });
    expect(hasStakeMoveCall).toBe(true);
  });

  it('wallet mode: throws Insufficient SUI when balance is too low', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient(500_000_000n);

    await expect(
      addStakeVSuiToTx(tx, client, VALID_ADDRESS, { amountMist: MIN_STAKE_MIST }),
    ).rejects.toThrow('Insufficient SUI');
  });

  it('wallet mode: throws Insufficient SUI when balance is zero', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient(0n);

    await expect(
      addStakeVSuiToTx(tx, client, VALID_ADDRESS, { amountMist: MIN_STAKE_MIST }),
    ).rejects.toThrow('Insufficient SUI');
  });

  it('chain mode: consumes inputCoin directly, does NOT call getBalance', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient(0n);
    const [upstreamCoin] = tx.splitCoins(tx.gas, [MIN_STAKE_MIST]);

    const result = await addStakeVSuiToTx(tx, client, VALID_ADDRESS, {
      amountMist: MIN_STAKE_MIST,
      inputCoin: upstreamCoin,
    });

    expect(result.coin).toBeDefined();
    expect(result.effectiveAmountMist).toBe(MIN_STAKE_MIST);
    expect((client as unknown as { getBalance: ReturnType<typeof vi.fn> }).getBalance).not.toHaveBeenCalled();

    const commands = tx.getData().commands as Array<Record<string, unknown>>;
    const hasStakeMoveCall = commands.some((c) => {
      const mc = c.MoveCall as { package?: string; module?: string; function?: string } | undefined;
      return mc?.package === VOLO_PKG && mc?.module === 'stake_pool' && mc?.function === 'stake';
    });
    expect(hasStakeMoveCall).toBe(true);
  });
});

describe('addUnstakeVSuiToTx', () => {
  it('wallet mode (specific amount): emits Volo unstake move call', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient(4_000_000_000n);

    const result = await addUnstakeVSuiToTx(tx, client, VALID_ADDRESS, {
      amountMist: 2_000_000_000n,
    });

    expect(result.coin).toBeDefined();
    expect(result.effectiveAmountMist).toBe(2_000_000_000n);

    const commands = tx.getData().commands as Array<Record<string, unknown>>;
    const hasUnstakeMoveCall = commands.some((c) => {
      const mc = c.MoveCall as { package?: string; module?: string; function?: string } | undefined;
      return mc?.package === VOLO_PKG && mc?.module === 'stake_pool' && mc?.function === 'unstake';
    });
    expect(hasUnstakeMoveCall).toBe(true);
  });

  it("wallet mode ('all'): emits Volo unstake move call without a separate split", async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient(4_000_000_000n);

    const result = await addUnstakeVSuiToTx(tx, client, VALID_ADDRESS, { amountMist: 'all' });

    expect(result.effectiveAmountMist).toBe('all');

    const commands = tx.getData().commands as Array<Record<string, unknown>>;
    const hasUnstakeMoveCall = commands.some((c) => {
      const mc = c.MoveCall as { package?: string; module?: string; function?: string } | undefined;
      return mc?.package === VOLO_PKG && mc?.module === 'stake_pool' && mc?.function === 'unstake';
    });
    expect(hasUnstakeMoveCall).toBe(true);
  });

  it('wallet mode: throws when no vSUI found', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient(0n);

    await expect(
      addUnstakeVSuiToTx(tx, client, VALID_ADDRESS, { amountMist: 'all' }),
    ).rejects.toThrow('No vSUI found');
  });

  it('chain mode (specific amount): splits inputCoin and unstakes the split portion', async () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const client = mockClient(0n);
    const [upstreamCoin] = tx.splitCoins(tx.gas, [5_000_000_000n]);

    const result = await addUnstakeVSuiToTx(tx, client, VALID_ADDRESS, {
      amountMist: 2_000_000_000n,
      inputCoin: upstreamCoin,
    });

    expect(result.coin).toBeDefined();
    expect(result.effectiveAmountMist).toBe(2_000_000_000n);
    expect((client as unknown as { getBalance: ReturnType<typeof vi.fn> }).getBalance).not.toHaveBeenCalled();

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
    const client = mockClient(0n);
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
});

describe('buildUnstakeVSuiTx', () => {
  it('throws when no vSUI is found in wallet', async () => {
    const client = mockClient(0n);
    await expect(buildUnstakeVSuiTx(client, VALID_ADDRESS, 'all')).rejects.toThrow('No vSUI found');
  });

  it('returns a Transaction when vSUI exists', async () => {
    const client = mockClient(3_000_000_000n);
    const tx = await buildUnstakeVSuiTx(client, VALID_ADDRESS, 'all');
    expect(tx).toBeInstanceOf(Transaction);
    expect(tx.getData().sender).toBe(VALID_ADDRESS);
  });
});
