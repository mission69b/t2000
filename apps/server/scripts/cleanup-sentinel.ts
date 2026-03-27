/**
 * One-time cleanup: delete all sentinel transactions from the database.
 *
 * Usage:  npx tsx scripts/cleanup-sentinel.ts
 *
 * Safe to run multiple times — subsequent runs will delete 0 rows.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const deleted = await prisma.transaction.deleteMany({
    where: {
      OR: [
        { action: { in: ['sentinel_attack', 'sentinel_settle'] } },
        { protocol: 'sentinel' },
      ],
    },
  });

  console.log(`Deleted ${deleted.count} sentinel transactions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
