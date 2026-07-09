import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { prisma } from '@/lib/prisma';

// GET /serve/logs?address=0x…&slug=…[&limit=50] — recent invocation log for
// `t2 agent serve logs` (S.694). Status + duration + truncated error only —
// request/response bodies are never stored (buyer inputs can be sensitive).

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
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit') ?? 50) || 50, 1),
    200,
  );

  const rows = await prisma.runInvocation.findMany({
    where: { agent: address, ...(slug ? { slug } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return Response.json({
    ok: true,
    agent: address,
    invocations: rows.map((r) => ({
      at: r.createdAt.toISOString(),
      slug: r.slug,
      status: r.status,
      durationMs: r.durationMs,
      ...(r.error ? { error: r.error } : {}),
    })),
  });
}
