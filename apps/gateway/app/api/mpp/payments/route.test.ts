import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/mpp/payments');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const fakePayment = {
  id: '1',
  service: 'openai',
  endpoint: '/v1/chat/completions',
  amount: '0.01',
  digest: 'txdigest123',
  sender: '0xabc',
  createdAt: new Date('2026-02-01'),
};

describe('GET /api/mpp/payments', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockCount.mockReset();
  });

  it('returns paginated payments with defaults', async () => {
    mockFindMany.mockResolvedValue([fakePayment] as never);
    mockCount.mockResolvedValue(1 as never);

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.payments).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.hasMore).toBe(false);
    expect(data.payments[0].service).toBe('openai');
  });

  it('respects limit and offset params', async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(100 as never);

    await GET(makeRequest({ limit: '10', offset: '20' }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        skip: 20,
      }),
    );
  });

  it('clamps limit to 50', async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await GET(makeRequest({ limit: '200' }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it('filters by service', async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await GET(makeRequest({ service: 'brave' }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ service: 'brave' }] },
      }),
    );
  });

  it('filters by search (digest or sender)', async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await GET(makeRequest({ search: '0xabc' }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { digest: { contains: '0xabc', mode: 'insensitive' } },
                { sender: { contains: '0xabc', mode: 'insensitive' } },
              ],
            },
          ],
        },
      }),
    );
  });

  it('combines service + search filters', async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await GET(makeRequest({ service: 'openai', search: 'abc' }));

    const call = mockFindMany.mock.calls[0]![0] as { where: { AND: unknown[] } };
    expect(call.where.AND).toHaveLength(2);
  });

  it('reports hasMore correctly', async () => {
    mockFindMany.mockResolvedValue([fakePayment] as never);
    mockCount.mockResolvedValue(25 as never);

    const res = await GET(makeRequest({ limit: '10', offset: '0' }));
    const data = await res.json();
    expect(data.hasMore).toBe(true);
  });
});
