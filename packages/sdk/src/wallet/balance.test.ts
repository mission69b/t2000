import { describe, it, expect, vi } from 'vitest';
import { queryBalance } from './balance.js';
import { SUPPORTED_ASSETS } from '../constants.js';
import type { SuiCoreClient } from '../utils/sui.js';

const FAITH_TYPE = '0xabc::faith::FAITH';

function mockClient(balances: Array<{ coinType: string; balance: string }>): SuiCoreClient {
  return {
    core: {
      listBalances: vi.fn(async () => ({
        balances: balances.map((b) => ({
          coinType: b.coinType,
          balance: b.balance,
          coinBalance: b.balance,
          addressBalance: '0',
        })),
        hasNextPage: false,
        cursor: null,
      })),
      // No pool fields → fetchSuiPrice falls back to $1.00 (deterministic).
      getObject: vi.fn(async () => ({ object: { json: null } })),
      // Only hit for non-registry tokens (FAITH).
      getCoinMetadata: vi.fn(async () => ({ metadata: { decimals: 6 } })),
    },
  } as unknown as SuiCoreClient;
}

describe('queryBalance', () => {
  it('partitions stables, SUI, and other tokens; total counts priced holdings only', async () => {
    const client = mockClient([
      { coinType: SUPPORTED_ASSETS.USDC.type, balance: '5000000' }, // 5 USDC (6 dec)
      { coinType: SUPPORTED_ASSETS.SUI.type, balance: '2000000000' }, // 2 SUI (9 dec)
      { coinType: FAITH_TYPE, balance: '39511023' }, // 39.511023 FAITH (6 dec, on-chain)
      { coinType: SUPPORTED_ASSETS.USDsui.type, balance: '0' }, // dust — filtered
    ]);

    const bal = await queryBalance(client, '0xowner');

    expect(bal.stables.USDC).toBe(5);
    expect(bal.available).toBe(5);
    expect(bal.sui.amount).toBe(2);
    expect(bal.sui.usdValue).toBe(2); // $1 fallback × 2 SUI

    // Other token surfaced amount-only, no guessed price.
    expect(bal.tokens).toHaveLength(1);
    expect(bal.tokens[0]).toMatchObject({
      coinType: FAITH_TYPE,
      symbol: 'FAITH',
      usdValue: null,
    });
    expect(bal.tokens[0].amount).toBeCloseTo(39.511023, 6);

    // Honest total: stables + SUI only; FAITH excluded (no price).
    expect(bal.totalUsd).toBe(7);
  });

  it('returns empty tokens + zero total for a fresh wallet', async () => {
    const bal = await queryBalance(mockClient([]), '0xowner');
    expect(bal.tokens).toEqual([]);
    expect(bal.available).toBe(0);
    expect(bal.totalUsd).toBe(0);
  });
});
