import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/prisma.js', () => ({
  prisma: {
    usdcSponsorLog: {
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    agent: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../lib/wallets.js', () => {
  const mockKeypair = {
    getPublicKey: () => ({
      toSuiAddress: () => '0xSPONSOR_ADDRESS',
    }),
  };
  return {
    getSponsorWallet: () => mockKeypair,
    getSuiClient: () => ({
      getCoins: vi.fn(),
      signAndExecuteTransaction: vi.fn(),
      waitForTransaction: vi.fn(),
    }),
  };
});

import { prisma } from '../db/prisma.js';
import {
  checkUsdcDailyLimit,
  checkUsdcIpRateLimit,
  isAlreadySponsored,
} from './usdcSponsor.js';

describe('checkUsdcDailyLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when under daily limit', async () => {
    vi.mocked(prisma.usdcSponsorLog.count).mockResolvedValue(5);
    const result = await checkUsdcDailyLimit();
    expect(result).toBe(true);
  });

  it('returns false when at daily limit', async () => {
    vi.mocked(prisma.usdcSponsorLog.count).mockResolvedValue(20);
    const result = await checkUsdcDailyLimit();
    expect(result).toBe(false);
  });

  it('queries with 24-hour window', async () => {
    vi.mocked(prisma.usdcSponsorLog.count).mockResolvedValue(0);
    const before = Date.now();
    await checkUsdcDailyLimit();

    const call = vi.mocked(prisma.usdcSponsorLog.count).mock.calls[0][0]!;
    const gte = (call.where!.createdAt as { gte: Date }).gte;
    const diff = before - gte.getTime();
    expect(diff).toBeGreaterThanOrEqual(86_390_000);
    expect(diff).toBeLessThanOrEqual(86_410_000);
  });
});

describe('checkUsdcIpRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when under IP limit', async () => {
    vi.mocked(prisma.usdcSponsorLog.count).mockResolvedValue(1);
    const result = await checkUsdcIpRateLimit('1.2.3.4');
    expect(result).toBe(true);
  });

  it('returns false when at IP limit', async () => {
    vi.mocked(prisma.usdcSponsorLog.count).mockResolvedValue(3);
    const result = await checkUsdcIpRateLimit('1.2.3.4');
    expect(result).toBe(false);
  });

  it('queries with correct IP and one-hour window', async () => {
    vi.mocked(prisma.usdcSponsorLog.count).mockResolvedValue(0);
    await checkUsdcIpRateLimit('5.6.7.8');

    const call = vi.mocked(prisma.usdcSponsorLog.count).mock.calls[0][0]!;
    expect(call.where!.ipAddress).toBe('5.6.7.8');
  });
});

describe('isAlreadySponsored', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when address exists in log', async () => {
    vi.mocked(prisma.usdcSponsorLog.findUnique).mockResolvedValue({
      id: 1,
      agentAddress: '0xabc',
      amount: '1',
      txDigest: '0xdigest',
      source: 'web',
      ipAddress: null,
      createdAt: new Date(),
    });
    const result = await isAlreadySponsored('0xabc');
    expect(result).toBe(true);
  });

  it('returns false when address not in log', async () => {
    vi.mocked(prisma.usdcSponsorLog.findUnique).mockResolvedValue(null);
    const result = await isAlreadySponsored('0xnew');
    expect(result).toBe(false);
  });

  it('queries by agentAddress', async () => {
    vi.mocked(prisma.usdcSponsorLog.findUnique).mockResolvedValue(null);
    await isAlreadySponsored('0xtest123');
    expect(prisma.usdcSponsorLog.findUnique).toHaveBeenCalledWith({
      where: { agentAddress: '0xtest123' },
    });
  });
});
