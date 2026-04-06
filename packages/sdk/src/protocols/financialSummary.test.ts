import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFinancialSummary, HF_WARN_THRESHOLD, HF_CRITICAL_THRESHOLD } from './financialSummary.js';

vi.mock('./navi.js', () => ({
  getHealthFactor: vi.fn(),
  getRates: vi.fn(),
}));

vi.mock('./allowance.js', () => ({
  getAllowanceBalance: vi.fn(),
}));

import { getHealthFactor, getRates } from './navi.js';
import { getAllowanceBalance } from './allowance.js';

function mockClient(usdcBalance = '5000000', suiBalance = '500000000') {
  return {
    getBalance: vi.fn().mockImplementation(({ coinType }: { coinType: string }) => {
      if (coinType.includes('usdc') || coinType.includes('USDC')) {
        return Promise.resolve({ totalBalance: usdcBalance });
      }
      return Promise.resolve({ totalBalance: suiBalance });
    }),
  } as unknown as Parameters<typeof getFinancialSummary>[0];
}

function setupMocks(overrides: {
  supplied?: number;
  borrowed?: number;
  hf?: number;
  saveApy?: number;
  borrowApy?: number;
  allowance?: bigint | null;
} = {}) {
  vi.mocked(getHealthFactor).mockResolvedValue({
    healthFactor: overrides.hf ?? Infinity,
    supplied: overrides.supplied ?? 100,
    borrowed: overrides.borrowed ?? 0,
    maxBorrow: 50,
    liquidationThreshold: 0.75,
  });

  vi.mocked(getRates).mockResolvedValue({
    USDC: {
      saveApy: overrides.saveApy ?? 0.05,
      borrowApy: overrides.borrowApy ?? 0.08,
    },
  });

  if (overrides.allowance !== undefined) {
    vi.mocked(getAllowanceBalance).mockResolvedValue(overrides.allowance!);
  }
}

describe('getFinancialSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns complete financial snapshot', async () => {
    setupMocks({ supplied: 500, borrowed: 0, saveApy: 0.05 });
    const client = mockClient('10000000', '1000000000');

    const summary = await getFinancialSummary(client, '0xuser');

    expect(summary.walletAddress).toBe('0xuser');
    expect(summary.usdcAvailable).toBe(10);
    expect(summary.savingsBalance).toBe(500);
    expect(summary.debtBalance).toBe(0);
    expect(summary.saveApy).toBe(0.05);
    expect(summary.borrowApy).toBe(0.08);
    expect(summary.dailyYield).toBeCloseTo(500 * 0.05 / 365, 4);
    expect(summary.gasReserveSui).toBe(1);
    expect(summary.hfAlertLevel).toBe('none');
    expect(summary.allowanceBalance).toBeNull();
    expect(summary.fetchedAt).toBeGreaterThan(0);
  });

  it('classifies HF as warn when below 1.8', async () => {
    setupMocks({ supplied: 100, borrowed: 50, hf: 1.6 });

    const summary = await getFinancialSummary(mockClient(), '0xuser');
    expect(summary.hfAlertLevel).toBe('warn');
  });

  it('classifies HF as critical when below 1.3', async () => {
    setupMocks({ supplied: 100, borrowed: 80, hf: 1.1 });

    const summary = await getFinancialSummary(mockClient(), '0xuser');
    expect(summary.hfAlertLevel).toBe('critical');
  });

  it('HF is none when no borrows even with low HF', async () => {
    setupMocks({ supplied: 100, borrowed: 0, hf: 0.5 });

    const summary = await getFinancialSummary(mockClient(), '0xuser');
    expect(summary.hfAlertLevel).toBe('none');
  });

  it('includes allowance balance when allowanceId provided', async () => {
    setupMocks({ allowance: 5_000_000n });

    const summary = await getFinancialSummary(mockClient(), '0xuser', {
      allowanceId: '0xallowance',
    });

    expect(summary.allowanceBalance).toBe(5_000_000n);
    expect(getAllowanceBalance).toHaveBeenCalledWith(expect.anything(), '0xallowance');
  });

  it('returns null allowance when fetch fails', async () => {
    vi.mocked(getAllowanceBalance).mockRejectedValue(new Error('not found'));
    setupMocks();

    const summary = await getFinancialSummary(mockClient(), '0xuser', {
      allowanceId: '0xbad',
    });

    expect(summary.allowanceBalance).toBeNull();
  });

  it('handles RPC failures gracefully', async () => {
    setupMocks();
    const client = {
      getBalance: vi.fn().mockRejectedValue(new Error('RPC timeout')),
    } as unknown as Parameters<typeof getFinancialSummary>[0];

    const summary = await getFinancialSummary(client, '0xuser');

    expect(summary.usdcAvailable).toBe(0);
    expect(summary.gasReserveSui).toBe(0);
  });

  it('computes idle USDC correctly', async () => {
    setupMocks({ supplied: 500 });
    const client = mockClient('44000000'); // 44 USDC

    const summary = await getFinancialSummary(client, '0xuser');
    expect(summary.idleUsdc).toBe(44);
  });
});

describe('threshold constants', () => {
  it('warn threshold is 1.8', () => {
    expect(HF_WARN_THRESHOLD).toBe(1.8);
  });

  it('critical threshold is 1.3', () => {
    expect(HF_CRITICAL_THRESHOLD).toBe(1.3);
  });
});
