import { describe, it, expect, vi } from 'vitest';
import { parseAmountToRaw, fetchCoins } from './utils.js';

describe('parseAmountToRaw', () => {
  it('converts whole number', () => {
    expect(parseAmountToRaw('1', 6)).toBe(1_000_000n);
  });

  it('converts cents', () => {
    expect(parseAmountToRaw('0.01', 6)).toBe(10_000n);
  });

  it('converts smallest USDC unit', () => {
    expect(parseAmountToRaw('0.000001', 6)).toBe(1n);
  });

  it('converts dollars and cents', () => {
    expect(parseAmountToRaw('100.50', 6)).toBe(100_500_000n);
  });

  it('truncates below precision', () => {
    expect(parseAmountToRaw('0.0000001', 6)).toBe(0n);
  });
});

describe('fetchCoins', () => {
  it('returns all coins from single page', async () => {
    const coins = [
      { coinObjectId: '0xa', balance: '500000' },
      { coinObjectId: '0xb', balance: '300000' },
    ];
    const mockClient = {
      getCoins: vi.fn().mockResolvedValue({
        data: coins,
        hasNextPage: false,
        nextCursor: null,
      }),
    };

    const result = await fetchCoins(
      mockClient as any,
      '0xowner',
      '0x::usdc::USDC',
    );
    expect(result).toEqual(coins);
    expect(mockClient.getCoins).toHaveBeenCalledTimes(1);
  });

  it('paginates across multiple pages', async () => {
    const page1 = [{ coinObjectId: '0xa', balance: '500000' }];
    const page2 = [{ coinObjectId: '0xb', balance: '300000' }];
    const mockClient = {
      getCoins: vi
        .fn()
        .mockResolvedValueOnce({
          data: page1,
          hasNextPage: true,
          nextCursor: 'cursor1',
        })
        .mockResolvedValueOnce({
          data: page2,
          hasNextPage: false,
          nextCursor: null,
        }),
    };

    const result = await fetchCoins(
      mockClient as any,
      '0xowner',
      '0x::usdc::USDC',
    );
    expect(result).toEqual([...page1, ...page2]);
    expect(mockClient.getCoins).toHaveBeenCalledTimes(2);
  });

  it('returns empty array when no coins', async () => {
    const mockClient = {
      getCoins: vi.fn().mockResolvedValue({
        data: [],
        hasNextPage: false,
        nextCursor: null,
      }),
    };

    const result = await fetchCoins(
      mockClient as any,
      '0xowner',
      '0x::usdc::USDC',
    );
    expect(result).toEqual([]);
  });
});
