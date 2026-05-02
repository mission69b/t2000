import { describe, it, expect, vi } from 'vitest';
import { savingsInfoTool } from '../tools/savings.js';
import type { ServerPositionData } from '../types.js';

// SPEC 7 P2.7 soak finding F9 (2026-05-02): a NAVI position whose `amount`
// is non-zero but rounds to 0 raw units after `addWithdrawToTx`'s dust-buffer
// math throws `NO_COLLATERAL: Nothing to withdraw for X on NAVI`. The fix
// filters those positions from `savings_info` so the LLM never proposes
// a withdraw the SDK will reject. See `withdraw.ts` description rewrite for
// the matching F8 fix (USDe legacy positions are read-only via Audric).

const USER_ADDR = `0x${'a'.repeat(64)}`;

function ctx(positionFetcher: (addr: string) => Promise<ServerPositionData>) {
  return {
    walletAddress: USER_ADDR,
    positionFetcher,
  } as Parameters<typeof savingsInfoTool.call>[1];
}

interface SavingsResult {
  data: {
    positions: Array<{ symbol: string; amount: number; valueUsd: number; type: string }>;
    fundStatus: { supplied: number; apy: number };
    earnings: { supplied: number; currentApy: number };
  };
  displayText: string;
}

describe('[F9] savings_info filters phantom-dust positions (raw amount === 0)', () => {
  it('drops the F9 phantom 0.001 USDsui position — matches SDK NO_COLLATERAL math', async () => {
    // USDsui has 6 decimals. SDK math:
    //   dustBuffer = 1000 / 10^6 = 0.001
    //   effective  = max(0, 0.001 - 0.001) = 0
    //   raw        = Math.floor(0 * 1e6) = 0 → SDK throws NO_COLLATERAL.
    // The exact bug discovered during P2.7 soak (RUNBOOK §F9). amountUsd is
    // just above the legacy $0.01 USD-dust threshold so we exercise the
    // on-chain dust path, not the USD dust path.
    const fetcher = vi.fn(
      async (): Promise<ServerPositionData> => ({
        savings: 100.5,
        borrows: 0,
        pendingRewards: 0,
        healthFactor: null,
        maxBorrow: 0,
        supplies: [
          { protocol: 'navi', asset: 'USDC', amount: 100.5, amountUsd: 100.5, apy: 0.046 },
          { protocol: 'navi', asset: 'USDsui', amount: 0.001, amountUsd: 0.011, apy: 0.038 },
        ],
        borrows_detail: [],
        savingsRate: 0.046,
      }),
    );

    const res = (await savingsInfoTool.call({}, ctx(fetcher))) as SavingsResult;

    expect(res.data.positions).toHaveLength(1);
    expect(res.data.positions[0].symbol).toBe('USDC');
    expect(res.displayText).not.toContain('USDsui');
  });

  it('keeps a USDsui supply whose amount yields > 0 raw units after dustBuffer subtraction', async () => {
    // 0.005 USDsui (6 decimals) → effective = 0.005 - 0.001 = 0.004
    // → Math.floor(0.004 * 1e6) = 4000 raw → SDK accepts → keep.
    const fetcher = vi.fn(
      async (): Promise<ServerPositionData> => ({
        savings: 100.5,
        borrows: 0,
        pendingRewards: 0,
        healthFactor: null,
        maxBorrow: 0,
        supplies: [
          { protocol: 'navi', asset: 'USDC', amount: 100.5, amountUsd: 100.5, apy: 0.046 },
          { protocol: 'navi', asset: 'USDsui', amount: 0.005, amountUsd: 0.05, apy: 0.038 },
        ],
        borrows_detail: [],
        savingsRate: 0.046,
      }),
    );

    const res = (await savingsInfoTool.call({}, ctx(fetcher))) as SavingsResult;

    expect(res.data.positions).toHaveLength(2);
    const usdsui = res.data.positions.find((p) => p.symbol === 'USDsui');
    expect(usdsui).toBeDefined();
  });

  it('recomputes fundStatus.supplied + APY from the filtered position list (does not trust sp.savings)', async () => {
    // sp.savings claims $50.51 (USDC + the dust USDsui), but the dust filter
    // removes USDsui. Headline number must reflect filtered positions, not
    // the stale aggregate — otherwise the LLM sees a phantom $0.01 in savings.
    const fetcher = vi.fn(
      async (): Promise<ServerPositionData> => ({
        savings: 50.51,
        borrows: 0,
        pendingRewards: 0,
        healthFactor: null,
        maxBorrow: 0,
        supplies: [
          { protocol: 'navi', asset: 'USDC', amount: 50.5, amountUsd: 50.5, apy: 0.046 },
          { protocol: 'navi', asset: 'USDsui', amount: 0.001, amountUsd: 0.011, apy: 0.038 },
        ],
        borrows_detail: [],
        savingsRate: 0.046,
      }),
    );

    const res = (await savingsInfoTool.call({}, ctx(fetcher))) as SavingsResult;

    expect(res.data.fundStatus.supplied).toBeCloseTo(50.5, 4);
    expect(res.data.fundStatus.apy).toBeCloseTo(0.046, 4);
    expect(res.data.earnings.supplied).toBeCloseTo(50.5, 4);
  });

  it('treats unknown asset symbols as dust (fail-closed)', async () => {
    // resolveTokenType returns null for unknown symbols → isDustOnChain
    // returns true → position is filtered. This stops the LLM from proposing
    // a withdraw against an asset the SDK doesn't recognise.
    const fetcher = vi.fn(
      async (): Promise<ServerPositionData> => ({
        savings: 100,
        borrows: 0,
        pendingRewards: 0,
        healthFactor: null,
        maxBorrow: 0,
        supplies: [
          { protocol: 'navi', asset: 'USDC', amount: 100, amountUsd: 100, apy: 0.046 },
          { protocol: 'navi', asset: 'WEIRD', amount: 5, amountUsd: 5, apy: 0.01 },
        ],
        borrows_detail: [],
        savingsRate: 0.046,
      }),
    );

    const res = (await savingsInfoTool.call({}, ctx(fetcher))) as SavingsResult;

    expect(res.data.positions).toHaveLength(1);
    expect(res.data.positions[0].symbol).toBe('USDC');
  });

  it('does not filter borrow positions (dust-on-chain check is supply-only)', async () => {
    // Borrows are debt — even tiny ones must remain visible so the user
    // knows to repay. The dust-on-chain filter applies to supplies only.
    const fetcher = vi.fn(
      async (): Promise<ServerPositionData> => ({
        savings: 100,
        borrows: 0.5,
        pendingRewards: 0,
        healthFactor: 5.0,
        maxBorrow: 50,
        supplies: [
          { protocol: 'navi', asset: 'USDC', amount: 100, amountUsd: 100, apy: 0.046 },
        ],
        borrows_detail: [
          { protocol: 'navi', asset: 'USDC', amount: 0.5, amountUsd: 0.5, apy: 0.07 },
        ],
        savingsRate: 0.046,
      }),
    );

    const res = (await savingsInfoTool.call({}, ctx(fetcher))) as SavingsResult;

    const borrows = res.data.positions.filter((p) => p.type === 'borrow');
    expect(borrows).toHaveLength(1);
    expect(borrows[0].symbol).toBe('USDC');
  });
});
