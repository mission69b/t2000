import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@t2000/sdk', () => ({
  getFinancialSummary: vi.fn(),
}));

import { getFinancialSummary } from '@t2000/sdk';
import { checkCriticalHF } from './hfHook.js';

const mockClient = {} as never;
const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubEnv('AUDRIC_INTERNAL_URL', 'https://test.audric.ai');
  vi.stubEnv('AUDRIC_INTERNAL_KEY', 'test-key');
  globalThis.fetch = mockFetch;
  vi.clearAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

function makeSummary(level: 'none' | 'warn' | 'critical', hf = 2.0) {
  return {
    walletAddress: '0xtest',
    usdcAvailable: 100,
    savingsBalance: 500,
    debtBalance: 300,
    idleUsdc: 50,
    healthFactor: hf,
    hfAlertLevel: level,
    saveApy: 0.05,
    borrowApy: 0.08,
    dailyYield: 0.07,
    gasReserveSui: 1.0,
    gasReserveUsd: 0.5,
    allowanceBalance: null,
    fetchedAt: Date.now(),
  };
}

describe('checkCriticalHF', () => {
  it('dispatches alert for critical HF after borrow', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue(makeSummary('critical', 1.05));
    mockFetch.mockResolvedValue({ ok: true });

    const results = await checkCriticalHF(mockClient, [
      { agentAddress: '0xagent1', action: 'borrow' },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].isCritical).toBe(true);
    expect(results[0].emailSent).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://test.audric.ai/api/internal/hf-alert');
    expect(JSON.parse(opts.body).level).toBe('critical');
  });

  it('skips non-lending actions', async () => {
    const results = await checkCriticalHF(mockClient, [
      { agentAddress: '0xagent1', action: 'send' },
      { agentAddress: '0xagent2', action: 'pay' },
    ]);

    expect(results).toEqual([]);
    expect(getFinancialSummary).not.toHaveBeenCalled();
  });

  it('skips healthy agents', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue(makeSummary('none', 3.5));

    const results = await checkCriticalHF(mockClient, [
      { agentAddress: '0xhealthy-agent', action: 'repay' },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].isCritical).toBe(false);
    expect(results[0].emailSent).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles getFinancialSummary error gracefully', async () => {
    vi.mocked(getFinancialSummary).mockRejectedValue(new Error('RPC error'));

    const results = await checkCriticalHF(mockClient, [
      { agentAddress: '0xagent1', action: 'withdraw' },
    ]);

    expect(results).toEqual([]);
  });

  it('handles dispatch failure gracefully', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue(makeSummary('critical', 1.05));
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const results = await checkCriticalHF(mockClient, [
      { agentAddress: '0xagent-fail', action: 'borrow' },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].isCritical).toBe(true);
    expect(results[0].emailSent).toBe(false);
  });

  it('deduplicates addresses in same batch', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue(makeSummary('critical', 1.05));
    mockFetch.mockResolvedValue({ ok: true });

    const results = await checkCriticalHF(mockClient, [
      { agentAddress: '0xsame', action: 'borrow' },
      { agentAddress: '0xsame', action: 'repay' },
    ]);

    expect(getFinancialSummary).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
  });
});
