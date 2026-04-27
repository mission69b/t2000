import { describe, it, expect, vi, beforeEach } from 'vitest';
import { savingsInfoTool } from '../tools/savings.js';
import type { ServerPositionData } from '../types.js';

/**
 * [v0.49] Regression suite for address-scoped savings_info.
 *
 * Pre-v0.49 the tool only ever queried `context.walletAddress`. v0.49
 * adds an optional `address` input and stamps `address` + `isSelfQuery`
 * on the result.
 */

const USER_ADDR = `0x${'a'.repeat(64)}`;
const FUNKII_ADDR = `0x${'b'.repeat(64)}`;

const positionFetcher = vi.fn(async (_address: string): Promise<ServerPositionData> => ({
  savings: 1234.56,
  borrows: 0,
  pendingRewards: 0,
  healthFactor: null,
  maxBorrow: 0,
  supplies: [
    { protocol: 'navi', asset: 'USDC', amount: 1234.56, amountUsd: 1234.56, apy: 0.045 },
  ],
  borrows_detail: [],
  savingsRate: 0.045,
}));

function ctx(opts: { wallet?: string } = {}) {
  return {
    walletAddress: opts.wallet === undefined ? USER_ADDR : opts.wallet,
    positionFetcher,
  } as Parameters<typeof savingsInfoTool.call>[1];
}

interface SavingsResult {
  data: { address: string; isSelfQuery: boolean; positions: unknown[] };
  displayText: string;
}

describe('[v0.49] savings_info address scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to context.walletAddress when input.address is omitted', async () => {
    const res = (await savingsInfoTool.call({}, ctx())) as SavingsResult;
    expect(res.data.address).toBe(USER_ADDR);
    expect(res.data.isSelfQuery).toBe(true);
    expect(positionFetcher).toHaveBeenCalledWith(USER_ADDR);
  });

  it('honors explicit input.address (the fix)', async () => {
    const res = (await savingsInfoTool.call({ address: FUNKII_ADDR }, ctx())) as SavingsResult;
    expect(res.data.address).toBe(FUNKII_ADDR);
    expect(res.data.isSelfQuery).toBe(false);
    expect(positionFetcher).toHaveBeenCalledWith(FUNKII_ADDR);
  });

  it('case-insensitive equality decides isSelfQuery', async () => {
    const res = (await savingsInfoTool.call(
      { address: USER_ADDR.toUpperCase() },
      ctx(),
    )) as SavingsResult;
    expect(res.data.isSelfQuery).toBe(true);
  });

  it('prefixes the displayText with a truncated-address subject for non-self queries', async () => {
    const res = (await savingsInfoTool.call(
      { address: FUNKII_ADDR },
      ctx(),
    )) as SavingsResult;
    expect(res.displayText).toContain(FUNKII_ADDR.slice(0, 6));
    expect(res.displayText).toContain(FUNKII_ADDR.slice(-4));
  });

});
