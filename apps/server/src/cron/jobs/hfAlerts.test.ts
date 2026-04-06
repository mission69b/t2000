import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@t2000/sdk', () => ({
  getFinancialSummary: vi.fn(),
  HF_WARN_THRESHOLD: 1.8,
}));

vi.mock('../../services/email.js', () => ({
  sendEmail: vi.fn(),
}));

import { getFinancialSummary } from '@t2000/sdk';
import { sendEmail } from '../../services/email.js';
import { runHFAlerts } from './hfAlerts.js';
import type { NotificationUser } from '../types.js';

const mockClient = {} as never;

function makeUser(overrides: Partial<NotificationUser> = {}): NotificationUser {
  return {
    userId: 'u1',
    email: 'test@example.com',
    walletAddress: '0xwallet1',
    allowanceId: null,
    timezoneOffset: 0,
    prefs: {},
    ...overrides,
  };
}

function makeSummary(hfLevel: 'none' | 'warn' | 'critical', hf = 2.0) {
  return {
    walletAddress: '0xwallet1',
    usdcAvailable: 100,
    savingsBalance: 500,
    debtBalance: hfLevel === 'none' ? 0 : 300,
    idleUsdc: 50,
    healthFactor: hf,
    hfAlertLevel: hfLevel,
    saveApy: 0.05,
    borrowApy: 0.08,
    dailyYield: 0.07,
    gasReserveSui: 1.0,
    gasReserveUsd: 0.5,
    allowanceBalance: null,
    fetchedAt: Date.now(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runHFAlerts', () => {
  it('sends warn-level alert', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue(makeSummary('warn', 1.3));
    vi.mocked(sendEmail).mockResolvedValue('email-002');

    const result = await runHFAlerts(mockClient, [makeUser()]);

    expect(result.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toContain('low');
    expect(vi.mocked(sendEmail).mock.calls[0][0].tags).toEqual([
      { name: 'category', value: 'hf_alert' },
      { name: 'level', value: 'warn' },
    ]);
  });

  it('skips critical alerts (handled by real-time indexer hook)', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue(makeSummary('critical', 1.05));

    const result = await runHFAlerts(mockClient, [makeUser()]);

    expect(result.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('skips users with healthy HF', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue(makeSummary('none', 3.5));

    const result = await runHFAlerts(mockClient, [makeUser()]);

    expect(result.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('skips users who opted out', async () => {
    const user = makeUser({ prefs: { hf_alert: false } });

    const result = await runHFAlerts(mockClient, [user]);

    expect(result.processed).toBe(0);
    expect(getFinancialSummary).not.toHaveBeenCalled();
  });

  it('counts email failures as errors', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue(makeSummary('warn', 1.3));
    vi.mocked(sendEmail).mockResolvedValue(null);

    const result = await runHFAlerts(mockClient, [
      makeUser({ userId: 'u-email-fail', walletAddress: '0xemailfail' }),
    ]);

    expect(result.sent).toBe(0);
    expect(result.errors).toBe(1);
  });

  it('handles getFinancialSummary failure gracefully', async () => {
    vi.mocked(getFinancialSummary).mockRejectedValue(new Error('RPC down'));

    const result = await runHFAlerts(mockClient, [
      makeUser({ userId: 'u-rpc-fail', walletAddress: '0xrpcfail' }),
    ]);

    expect(result.sent).toBe(0);
    expect(result.errors).toBe(1);
  });

  it('processes multiple users with concurrency', async () => {
    vi.mocked(getFinancialSummary)
      .mockResolvedValueOnce(makeSummary('warn', 1.3))
      .mockResolvedValueOnce(makeSummary('none', 2.5))
      .mockResolvedValueOnce(makeSummary('warn', 1.4));

    vi.mocked(sendEmail).mockResolvedValue('email-ok');

    const users = [
      makeUser({ userId: 'u-batch-1', walletAddress: '0xb1' }),
      makeUser({ userId: 'u-batch-2', walletAddress: '0xb2' }),
      makeUser({ userId: 'u-batch-3', walletAddress: '0xb3' }),
    ];

    const result = await runHFAlerts(mockClient, users);

    expect(result.processed).toBe(3);
    expect(result.sent).toBe(2); // two warn, one healthy
    expect(getFinancialSummary).toHaveBeenCalledTimes(3);
  });
});
