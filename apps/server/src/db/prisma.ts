import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function testDatabaseConnection(): Promise<void> {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    console.log('[db] Database connection verified');
  } catch (err) {
    console.error('[db] Database connection failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
