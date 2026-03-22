import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const limit = Math.min(Number(params.get('limit') ?? 20), 50);
  const offset = Number(params.get('offset') ?? 0);
  const service = params.get('service');
  const search = params.get('search')?.trim();

  const conditions: Prisma.MppPaymentWhereInput[] = [];

  if (service) conditions.push({ service });

  if (search) {
    conditions.push({
      OR: [
        { digest: { contains: search, mode: 'insensitive' } },
        { sender: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  const where: Prisma.MppPaymentWhereInput =
    conditions.length > 0 ? { AND: conditions } : {};

  const [payments, total] = await Promise.all([
    prisma.mppPayment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        service: true,
        endpoint: true,
        amount: true,
        digest: true,
        sender: true,
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
