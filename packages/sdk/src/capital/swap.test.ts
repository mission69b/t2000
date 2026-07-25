import { describe, expect, it } from 'vitest';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { T2000Error } from '../errors.js';
import { buildDirectPoolSwapTx } from './swap.js';
import { USDC_TYPE } from '../token-registry.js';

const SENDER = normalizeSuiAddress('0xf00d');
const POOL = normalizeSuiAddress('0x60b5');
const FS = '0x710139ce3bd82616da6ba6930d0259ccf3f744724badf5b916524921a261d497::fs::FS';

const fakeClient = (poolType: string | null) =>
  ({
    core: {
      getObject: async () =>
        poolType ? { object: { type: poolType } } : null,
      getBalance: async () => ({ balance: { balance: 100_000_000_000n } }),
      getCoins: async () => ({
        objects: [
          {
            id: normalizeSuiAddress('0x61'),
            version: '1',
            digest: 'A'.repeat(44),
            balance: 100_000_000_000n,
          },
        ],
        hasNextPage: false,
      }),
    },
  }) as never;

const poolType = `0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb::pool::Pool<${USDC_TYPE}, ${FS}>`;

describe('buildDirectPoolSwapTx', () => {
  it('buy on Pool<USDC, FS> → swap_a2b with min sqrt limit', async () => {
    const tx = await buildDirectPoolSwapTx({
      client: fakeClient(poolType),
      sender: SENDER,
      poolId: POOL,
      direction: 'buy',
      amountIn: 1_000_000n,
      minOut: 0n,
    });
    const call = tx.getData().commands.find((c) => c.MoveCall)?.MoveCall;
    expect(call?.function).toBe('swap_a2b');
    expect(call?.typeArguments).toEqual([USDC_TYPE, FS]);
  });

  it('sell on Pool<USDC, FS> → swap_b2a', async () => {
    const tx = await buildDirectPoolSwapTx({
      client: fakeClient(poolType),
      sender: SENDER,
      poolId: POOL,
      direction: 'sell',
      amountIn: 1_000_000_000n,
      minOut: 0n,
    });
    const call = tx.getData().commands.find((c) => c.MoveCall)?.MoveCall;
    expect(call?.function).toBe('swap_b2a');
  });

  it('rejects non-USDC pools and non-pools', async () => {
    await expect(
      buildDirectPoolSwapTx({
        client: fakeClient(`Pool<${FS}, 0x2::sui::SUI>`),
        sender: SENDER,
        poolId: POOL,
        direction: 'buy',
        amountIn: 1n,
        minOut: 0n,
      }),
    ).rejects.toThrow(T2000Error);
    await expect(
      buildDirectPoolSwapTx({
        client: fakeClient(null),
        sender: SENDER,
        poolId: POOL,
        direction: 'buy',
        amountIn: 1n,
        minOut: 0n,
      }),
    ).rejects.toThrow(T2000Error);
  });
});
