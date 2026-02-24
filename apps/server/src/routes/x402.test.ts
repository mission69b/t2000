import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

type Json = Record<string, unknown>;

vi.mock('../db/prisma.js', () => ({
  prisma: {
    x402Payment: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('../lib/wallets.js', () => ({
  getSuiClient: vi.fn(() => ({})),
}));

vi.mock('@t2000/x402', () => ({
  verifyPayment: vi.fn(),
}));

import { prisma } from '../db/prisma.js';
import { verifyPayment } from '@t2000/x402';
import { x402 } from './x402.js';

const app = new Hono().route('/', x402);

function post(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /x402/settle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks a verified payment as settled', async () => {
    vi.mocked(prisma.x402Payment.findUnique).mockResolvedValue({
      nonce: 'test-nonce-001',
      txHash: '0xabc',
      payTo: '0xrecipient',
      amount: '0.01',
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 300_000),
      settled: false,
    });
    vi.mocked(prisma.x402Payment.update).mockResolvedValue({} as never);

    const res = await post('/x402/settle', { nonce: 'test-nonce-001' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ settled: true });
    expect(prisma.x402Payment.update).toHaveBeenCalledWith({
      where: { nonce: 'test-nonce-001' },
      data: { settled: true },
    });
  });

  it('is idempotent — re-settling returns settled: true without DB write', async () => {
    vi.mocked(prisma.x402Payment.findUnique).mockResolvedValue({
      nonce: 'test-nonce-002',
      txHash: '0xabc',
      payTo: '0xrecipient',
      amount: '0.01',
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 300_000),
      settled: true,
    });

    const res = await post('/x402/settle', { nonce: 'test-nonce-002' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ settled: true });
    expect(prisma.x402Payment.update).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown nonce', async () => {
    vi.mocked(prisma.x402Payment.findUnique).mockResolvedValue(null);

    const res = await post('/x402/settle', { nonce: 'nonexistent' });

    expect(res.status).toBe(404);
    const body = (await res.json()) as Json;
    expect(body.error).toBe('NOT_FOUND');
  });

  it('returns 400 when nonce is missing', async () => {
    const res = await post('/x402/settle', {});

    expect(res.status).toBe(400);
    const body = (await res.json()) as Json;
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await app.request('/x402/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as Json;
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 500 when database throws', async () => {
    vi.mocked(prisma.x402Payment.findUnique).mockRejectedValue(
      new Error('Connection refused'),
    );

    const res = await post('/x402/settle', { nonce: 'test-nonce-db-err' });

    expect(res.status).toBe(500);
    const body = (await res.json()) as Json;
    expect(body.error).toBe('INTERNAL_ERROR');
  });
});

describe('POST /x402/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validBody = {
    txHash: '0xdigest123',
    network: 'sui',
    amount: '0.01',
    asset: 'USDC',
    payTo: '0xrecipient',
    nonce: 'verify-nonce-001',
    expiresAt: Math.floor(Date.now() / 1000) + 300,
  };

  it('verifies a valid payment and logs to audit table', async () => {
    vi.mocked(verifyPayment as ReturnType<typeof vi.fn>).mockResolvedValue({
      verified: true,
      txHash: '0xdigest123',
      settledAmount: '0.01',
      settledAt: 1708300000,
    });
    vi.mocked(prisma.x402Payment.upsert).mockResolvedValue({} as never);

    const res = await post('/x402/verify', validBody);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect(body.verified).toBe(true);
    expect(prisma.x402Payment.upsert).toHaveBeenCalled();
  });

  it('returns verification failure without logging', async () => {
    vi.mocked(verifyPayment as ReturnType<typeof vi.fn>).mockResolvedValue({
      verified: false,
      reason: 'amount_mismatch',
    });

    const res = await post('/x402/verify', validBody);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect(body.verified).toBe(false);
    expect(body.reason).toBe('amount_mismatch');
    expect(prisma.x402Payment.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await post('/x402/verify', { txHash: '0xabc' });

    expect(res.status).toBe(400);
    const body = (await res.json()) as Json;
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('still verifies even if audit log write fails', async () => {
    vi.mocked(verifyPayment as ReturnType<typeof vi.fn>).mockResolvedValue({
      verified: true,
      txHash: '0xdigest123',
      settledAmount: '0.01',
      settledAt: 1708300000,
    });
    vi.mocked(prisma.x402Payment.upsert).mockRejectedValue(
      new Error('DB unavailable'),
    );

    const res = await post('/x402/verify', validBody);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect(body.verified).toBe(true);
  });
});
