import { vi } from 'vitest';

export const prisma = {
  mppPayment: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
};
