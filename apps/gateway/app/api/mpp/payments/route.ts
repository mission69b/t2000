import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const limit = Math.min(Number(params.get('limit') ?? 20), 50);
  const offset = Number(params.get('offset') ?? 0);
  const service = params.get('service');

  const where = service ? { service } : {};

  const [payments, total] = await Promise.all([
    prisma.mppPayment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        service: true,
        endpoint: true,
        amount: true,
        digest: true,
        createdAt: true,
      },
    }),
    prisma.mppPayment.count({ where }),
  ]);

  return Response.json({
    payments,
    total,
    hasMore: offset + limit < total,
  });
}
