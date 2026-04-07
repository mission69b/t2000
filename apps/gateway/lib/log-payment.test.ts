import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./prisma', () => ({
  prisma: {
    mppPayment: {
      create: vi.fn(),
    },
  },
}));

import { logPayment } from './log-payment';
import { prisma } from './prisma';

const mockCreate = vi.mocked(prisma.mppPayment.create);

describe('logPayment', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('creates a payment record with all fields', async () => {
    mockCreate.mockResolvedValue({} as never);

    await logPayment({
      service: 'openai',
      endpoint: '/v1/chat/completions',
      amount: '0.01',
      digest: 'abc123',
      sender: '0xsender',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        service: 'openai',
        endpoint: '/v1/chat/completions',
        amount: '0.01',
        digest: 'abc123',
        sender: '0xsender',
      },
    });
  });

  it('handles null digest', async () => {
    mockCreate.mockResolvedValue({} as never);

    await logPayment({
      service: 'brave',
      endpoint: '/v1/web/search',
      amount: '0.005',
      digest: null,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ digest: null }),
    });
  });

  it('does not throw when create fails', async () => {
    mockCreate.mockRejectedValue(new Error('DB connection lost'));

    await expect(
      logPayment({
        service: 'openai',
        endpoint: '/v1/chat/completions',
        amount: '0.01',
        digest: 'abc',
      }),
    ).resolves.toBeUndefined();
  });
});
