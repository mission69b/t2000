import { describe, it, expect } from 'vitest';
import { TxMutex } from './mutex.js';

describe('TxMutex', () => {
  it('should serialize concurrent operations', async () => {
    const mutex = new TxMutex();
    const order: number[] = [];

    const p1 = mutex.run(async () => {
      await new Promise(r => setTimeout(r, 50));
      order.push(1);
      return 'first';
    });

    const p2 = mutex.run(async () => {
      order.push(2);
      return 'second';
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('first');
    expect(r2).toBe('second');
    expect(order).toEqual([1, 2]);
  });

  it('should release lock even if operation throws', async () => {
    const mutex = new TxMutex();

    await expect(
      mutex.run(async () => { throw new Error('fail'); }),
    ).rejects.toThrow('fail');

    const result = await mutex.run(async () => 'recovered');
    expect(result).toBe('recovered');
  });

  it('should handle sequential operations', async () => {
    const mutex = new TxMutex();
    const r1 = await mutex.run(async () => 1);
    const r2 = await mutex.run(async () => 2);
    expect(r1).toBe(1);
    expect(r2).toBe(2);
  });
});
