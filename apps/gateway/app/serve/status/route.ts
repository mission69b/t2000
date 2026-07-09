import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { prisma } from '@/lib/prisma';

// GET /serve/status?address=0x…[&slug=…] — public read of an agent's hosted
// handlers (S.694): what's deployed, sizes, last-invocation stats. Nothing
// secret lives here (script code is never returned).

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const address = normalizeSuiAddress(
    String(url.searchParams.get('address') ?? '').trim(),
  );
  if (!isValidSuiAddress(address)) {
    return Response.json(
      { error: 'A valid agent Sui address is required.' },
      { status: 400 },
    );
  }
  const slug = String(url.searchParams.get('slug') ?? '')
    .trim()
    .toLowerCase();

  const deployments = await prisma.runDeployment.findMany({
    where: { agent: address, ...(slug ? { slug } : {}) },
    orderBy: { updatedAt: 'desc' },
  });

  const withStats = await Promise.all(
    deployments.map(async (d) => {
      const [invocations, last] = await Promise.all([
        prisma.runInvocation.count({
          where: { agent: address, slug: d.slug },
        }),
        prisma.runInvocation.findFirst({
          where: { agent: address, slug: d.slug },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      return {
        slug: d.slug,
        active: d.active,
        sizeBytes: d.sizeBytes,
        deployedAt: d.updatedAt.toISOString(),
        invocations,
        lastInvocation: last
          ? {
              at: last.createdAt.toISOString(),
              status: last.status,
              durationMs: last.durationMs,
              ...(last.error ? { error: last.error } : {}),
            }
          : null,
      };
    }),
  );

  return Response.json({ ok: true, agent: address, handlers: withStats });
}
