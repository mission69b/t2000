import { prisma } from './prisma';

export async function logPayment(data: {
  service: string;
  endpoint: string;
  amount: string;
  digest: string | null;
}) {
  try {
    await prisma.mppPayment.create({
      data: {
        service: data.service,
        endpoint: data.endpoint,
        amount: data.amount,
        digest: data.digest,
      },
    });
  } catch {
    // fire-and-forget — never break payment flow
  }
}
