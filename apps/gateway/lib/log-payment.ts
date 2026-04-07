import { prisma } from './prisma';

export async function logPayment(data: {
  service: string;
  endpoint: string;
  amount: string;
  digest: string | null;
  sender?: string | null;
}) {
  try {
    await prisma.mppPayment.create({
      data: {
        service: data.service,
        endpoint: data.endpoint,
        amount: data.amount,
        digest: data.digest,
        sender: data.sender ?? undefined,
      },
    });
  } catch (err) {
    console.error('[logPayment] failed:', err instanceof Error ? err.message : err);
  }
}
