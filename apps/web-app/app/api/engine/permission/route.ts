import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt } from '@/lib/auth';
import { resolveBridge } from '@/lib/engine/bridge-registry';

export const runtime = 'nodejs';

interface PermissionRequestBody {
  sessionId: string;
  permissionId: string;
  approved: boolean;
}

export async function POST(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  let body: PermissionRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sessionId, permissionId, approved } = body;

  if (!sessionId || !permissionId || typeof approved !== 'boolean') {
    return NextResponse.json(
      { error: 'sessionId, permissionId, and approved (boolean) are required' },
      { status: 400 },
    );
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`engine-perm:${ip}`, 30, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const resolved = resolveBridge(sessionId, permissionId, approved);

  if (!resolved) {
    return NextResponse.json(
      { error: 'Permission request not found or already resolved' },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, permissionId, approved });
}
