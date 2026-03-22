import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    mppPayment: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { GET } from './route';
import { prisma } from '@/lib/prisma';

const mockFindMany = vi.mocked(prisma.mppPayment.findMany);
const mockCount = vi.mocked(prisma.mppPayment.count);

describe('GET /api/mpp/stats', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockCount.mockReset();
  });

  it('returns totals and per-service breakdown', async () => {
    mockCount.mockResolvedValue(3 as never);
    mockFindMany.mockResolvedValue([
      { service: 'openai', amount: '0.10' },
      { service: 'openai', amount: '0.20' },
      { service: 'brave', amount: '0.05' },
    ] as never);

    const res = await GET();
    const data = await res.json();

    expect(data.totalPayments).toBe(3);
    expect(data.totalVolume).toBe('0.35');
    expect(data.services).toHaveLength(2);

    const openai = data.services.find((s: { service: string }) => s.service === 'openai');
    expect(openai.count).toBe(2);
    expect(openai.volume).toBe('0.30');
  });

  it('returns empty state when no payments exist', async () => {
    mockCount.mockResolvedValue(0 as never);
    mockFindMany.mockResolvedValue([] as never);

    const res = await GET();
    const data = await res.json();

    expect(data.totalPayments).toBe(0);
    expect(data.totalVolume).toBe('0.00');
    expect(data.services).toEqual([]);
  });

  it('sorts services by count descending', async () => {
    mockCount.mockResolvedValue(6 as never);
    mockFindMany.mockResolvedValue([
      { service: 'brave', amount: '0.005' },
      { service: 'openai', amount: '0.01' },
      { service: 'openai', amount: '0.01' },
      { service: 'openai', amount: '0.01' },
      { service: 'fal', amount: '0.03' },
      { service: 'fal', amount: '0.03' },
    ] as never);

    const res = await GET();
    const data = await res.json();

    expect(data.services[0].service).toBe('openai');
    expect(data.services[1].service).toBe('fal');
    expect(data.services[2].service).toBe('brave');
  });

  it('handles payments with zero/invalid amounts', async () => {
    mockCount.mockResolvedValue(2 as never);
    mockFindMany.mockResolvedValue([
      { service: 'openai', amount: '0' },
      { service: 'openai', amount: 'invalid' },
    ] as never);

    const res = await GET();
    const data = await res.json();

    expect(data.totalPayments).toBe(2);
    expect(data.totalVolume).toBe('0.00');
  });
});
