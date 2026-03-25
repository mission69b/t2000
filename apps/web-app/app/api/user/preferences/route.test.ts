import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPreferences: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));

function buildGetRequest(address?: string): NextRequest {
  const url = address
    ? `http://localhost/api/user/preferences?address=${address}`
    : 'http://localhost/api/user/preferences';
  return new NextRequest(url, { method: 'GET' });
}

function buildPostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/user/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/user/preferences', () => {
  let GET: (req: Request) => Promise<Response>;
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./route');
    GET = mod.GET as unknown as (req: Request) => Promise<Response>;
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  describe('GET', () => {
    it('returns contacts, limits, and dcaSchedules for existing user', async () => {
      const contacts = [{ name: 'Alice', address: '0xabc' }];
      const dcaSchedules = [{ id: 'dca-1', strategy: 'bluechip', amount: 50, frequency: 'weekly' }];
      mockFindUnique.mockResolvedValueOnce({ contacts, limits: null, dcaSchedules });

      const res = await GET(buildGetRequest('0x1234'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.contacts).toEqual(contacts);
      expect(body.limits).toBeNull();
      expect(body.dcaSchedules).toEqual(dcaSchedules);
    });

    it('returns empty contacts and dcaSchedules for new user', async () => {
      mockFindUnique.mockResolvedValueOnce(null);

      const res = await GET(buildGetRequest('0xnewuser'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.contacts).toEqual([]);
      expect(body.limits).toBeNull();
      expect(body.dcaSchedules).toEqual([]);
    });

    it('returns 400 for missing address', async () => {
      const res = await GET(buildGetRequest());
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('Missing or invalid address');
    });

    it('returns 400 for invalid address (no 0x prefix)', async () => {
      const res = await GET(buildGetRequest('not-an-address'));
      expect(res.status).toBe(400);
    });
  });

  describe('POST', () => {
    it('upserts contacts for valid address', async () => {
      const contacts = [{ name: 'Bob', address: '0xbob' }];
      mockUpsert.mockResolvedValueOnce({ contacts, limits: null, dcaSchedules: [] });

      const res = await POST(buildPostRequest({ address: '0x1234', contacts }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.contacts).toEqual(contacts);
      expect(mockUpsert).toHaveBeenCalledOnce();
    });

    it('upserts limits for valid address', async () => {
      const limits = { dailySend: 1000 };
      mockUpsert.mockResolvedValueOnce({ contacts: [], limits, dcaSchedules: [] });

      const res = await POST(buildPostRequest({ address: '0x1234', limits }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.limits).toEqual(limits);
    });

    it('upserts dcaSchedules for valid address', async () => {
      const dcaSchedules = [{ id: 'dca-1', strategy: 'bluechip', amount: 25, frequency: 'weekly', enabled: true }];
      mockUpsert.mockResolvedValueOnce({ contacts: [], limits: null, dcaSchedules });

      const res = await POST(buildPostRequest({ address: '0x1234', dcaSchedules }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.dcaSchedules).toEqual(dcaSchedules);
      expect(mockUpsert).toHaveBeenCalledOnce();
    });

    it('returns 400 for missing address', async () => {
      const res = await POST(buildPostRequest({ contacts: [] }));
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('Missing or invalid address');
    });

    it('returns 400 for invalid address (no 0x prefix)', async () => {
      const res = await POST(buildPostRequest({ address: 'bad', contacts: [] }));
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid JSON body', async () => {
      const req = new NextRequest('http://localhost/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('Invalid JSON');
    });
  });
});
