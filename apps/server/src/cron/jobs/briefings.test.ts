import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@t2000/sdk', () => ({
  getFinancialSummary: vi.fn(),
  buildDeductAllowanceTx: vi.fn(),
  ALLOWANCE_FEATURES: { BRIEFING: 0 },
}));

vi.mock('../../services/email.js', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('../../services/sui-executor.js', () => ({
  executeAdminTx: vi.fn(),
}));

// Mock fetch for internal API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { getFinancialSummary, buildDeductAllowanceTx } from '@t2000/sdk';
import { sendEmail } from '../../services/email.js';
import { executeAdminTx } from '../../services/sui-executor.js';
import { runBriefings, buildBriefingContent, deriveCta, deriveVariant } from './briefings.js';
import type { NotificationUser } from '../types.js';

const mockClient = {} as never;

function makeUser(overrides: Partial<NotificationUser> = {}): NotificationUser {
  return {
    userId: 'u1',
    email: 'test@example.com',
    walletAddress: '0xwallet1',
    allowanceId: '0xallowance1',
    timezoneOffset: 0,
    prefs: {},
    ...overrides,
  };
}

function makeSummary(overrides: Record<string, unknown> = {}) {
  return {
    walletAddress: '0xwallet1',
    usdcAvailable: 100,
    savingsBalance: 500,
    debtBalance: 0,
    idleUsdc: 50,
    healthFactor: 5.0,
    hfAlertLevel: 'none',
    saveApy: 0.05,
    borrowApy: 0.08,
    dailyYield: 0.068,
    gasReserveSui: 1.0,
    gasReserveUsd: 0.5,
    allowanceBalance: 5_000_000n,
    fetchedAt: Date.now(),
    ...overrides,
  };
}

function mockTx() {
  return { setSender: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildDeductAllowanceTx).mockReturnValue(mockTx() as never);
  // Default: internal API calls succeed
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/internal/briefing') && !url.includes('?')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    }
    if (typeof url === 'string' && url.includes('/api/internal/briefing?')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ exists: false }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

describe('buildBriefingContent', () => {
  it('builds savings variant with CTA when idle USDC > 5', () => {
    const content = buildBriefingContent({
      savingsBalance: 500,
      dailyYield: 0.068,
      saveApy: 0.05,
      idleUsdc: 44,
      healthFactor: 5.0,
      debtBalance: 0,
    });

    expect(content.variant).toBe('savings');
    expect(content.earned).toBe(0.068);
    expect(content.cta).toEqual({ type: 'save', label: 'Save idle USDC', amount: 44 });
  });

  it('builds idle variant when no savings', () => {
    const content = buildBriefingContent({
      savingsBalance: 0,
      dailyYield: 0,
      saveApy: 0.05,
      idleUsdc: 100,
      healthFactor: 5.0,
      debtBalance: 0,
    });

    expect(content.variant).toBe('idle');
    expect(content.cta?.type).toBe('save');
  });

  it('builds debt_warning variant when HF < 2', () => {
    const content = buildBriefingContent({
      savingsBalance: 500,
      dailyYield: 0.068,
      saveApy: 0.05,
      idleUsdc: 10,
      healthFactor: 1.5,
      debtBalance: 300,
    });

    expect(content.variant).toBe('debt_warning');
    expect(content.cta).toEqual({ type: 'repay', label: 'Repay debt' });
  });

  it('omits CTA when idle USDC <= 5 and no debt', () => {
    const content = buildBriefingContent({
      savingsBalance: 500,
      dailyYield: 0.068,
      saveApy: 0.05,
      idleUsdc: 3,
      healthFactor: 5.0,
      debtBalance: 0,
    });

    expect(content.cta).toBeNull();
  });
});

describe('deriveCta', () => {
  it('prioritizes repay over save when HF is low', () => {
    const cta = deriveCta({
      earned: 0.068,
      savingsBalance: 500,
      saveApy: 0.05,
      idleUsdc: 100,
      projectedDailyGain: 0.01,
      healthFactor: 1.5,
      debtBalance: 300,
      cta: null,
      variant: 'debt_warning',
    });

    expect(cta?.type).toBe('repay');
  });
});

describe('deriveVariant', () => {
  it('returns savings when savings > 0', () => {
    expect(deriveVariant({ savingsBalance: 100, healthFactor: 5.0, debtBalance: 0 })).toBe('savings');
  });

  it('returns idle when no savings', () => {
    expect(deriveVariant({ savingsBalance: 0, healthFactor: 5.0, debtBalance: 0 })).toBe('idle');
  });

  it('returns debt_warning when HF < 2 with debt', () => {
    expect(deriveVariant({ savingsBalance: 500, healthFactor: 1.5, debtBalance: 300 })).toBe('debt_warning');
  });
});

describe('runBriefings', () => {
  it('sends briefing for user with savings', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue(makeSummary() as never);
    vi.mocked(executeAdminTx).mockResolvedValue({ digest: '0xtxdigest', status: 'success' });
    vi.mocked(sendEmail).mockResolvedValue('email-001');

    const result = await runBriefings(mockClient, [makeUser()]);

    expect(result.sent).toBe(1);
    expect(result.errors).toBe(0);
    expect(getFinancialSummary).toHaveBeenCalledOnce();
    expect(executeAdminTx).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it('skips user with no allowance', async () => {
    const result = await runBriefings(mockClient, [makeUser({ allowanceId: null })]);

    expect(result.sent).toBe(0);
    expect(getFinancialSummary).not.toHaveBeenCalled();
    expect(executeAdminTx).not.toHaveBeenCalled();
  });

  it('skips user who opted out of briefing', async () => {
    const user = makeUser({ prefs: { briefing: false } });

    const result = await runBriefings(mockClient, [user]);

    expect(result.processed).toBe(0);
    expect(getFinancialSummary).not.toHaveBeenCalled();
  });

  it('skips user with no savings and insufficient idle USDC', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue(
      makeSummary({ savingsBalance: 0, idleUsdc: 0.5 }) as never,
    );

    const result = await runBriefings(mockClient, [makeUser()]);

    expect(result.sent).toBe(0);
    expect(executeAdminTx).not.toHaveBeenCalled();
  });

  it('skips user when allowance charge fails', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue(makeSummary() as never);
    vi.mocked(executeAdminTx).mockResolvedValue({ digest: '0xfailed', status: 'failure' });

    const result = await runBriefings(mockClient, [makeUser()]);

    expect(result.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('skips user when allowance charge throws', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue(makeSummary() as never);
    vi.mocked(executeAdminTx).mockRejectedValue(new Error('Insufficient balance'));

    const result = await runBriefings(mockClient, [makeUser()]);

    expect(result.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('skips if briefing already exists for today (idempotency)', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/internal/briefing?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ exists: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const result = await runBriefings(mockClient, [makeUser()]);

    expect(result.sent).toBe(0);
    expect(executeAdminTx).not.toHaveBeenCalled();
  });

  it('counts RPC errors as errors', async () => {
    vi.mocked(getFinancialSummary).mockRejectedValue(new Error('RPC down'));

    const result = await runBriefings(mockClient, [makeUser()]);

    expect(result.sent).toBe(0);
    expect(result.errors).toBe(1);
  });

  it('processes multiple users with bounded concurrency', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue(makeSummary() as never);
    vi.mocked(executeAdminTx).mockResolvedValue({ digest: '0xok', status: 'success' });
    vi.mocked(sendEmail).mockResolvedValue('email-ok');

    const users = [
      makeUser({ userId: 'u1', walletAddress: '0xb1' }),
      makeUser({ userId: 'u2', walletAddress: '0xb2' }),
      makeUser({ userId: 'u3', walletAddress: '0xb3' }),
    ];

    const result = await runBriefings(mockClient, users);

    expect(result.processed).toBe(3);
    expect(result.sent).toBe(3);
    expect(getFinancialSummary).toHaveBeenCalledTimes(3);
    expect(executeAdminTx).toHaveBeenCalledTimes(3);
  });

  it('still stores briefing even if email send fails', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue(makeSummary() as never);
    vi.mocked(executeAdminTx).mockResolvedValue({ digest: '0xcharged', status: 'success' });
    vi.mocked(sendEmail).mockResolvedValue(null); // email fails

    const result = await runBriefings(mockClient, [makeUser()]);

    // Charge succeeded, so we count as sent (briefing stored even if email failed)
    expect(result.sent).toBe(1);
    const storeCalls = mockFetch.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/api/internal/briefing') && !(call[0] as string).includes('?'),
    );
    expect(storeCalls.length).toBe(1);
  });
});
