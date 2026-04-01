import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { getSessionStore } from '@/lib/engine/engine-factory';
import { UpstashSessionStore } from '@/lib/engine/upstash-session-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.nextUrl.searchParams.get('address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Valid address required' }, { status: 400 });
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`engine-sessions:${ip}`, 10, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const store = getSessionStore();
  if (!(store instanceof UpstashSessionStore)) {
    return NextResponse.json({ sessions: [] });
  }

  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10) || 20,
    50,
  );

  const sessionIds = await store.listByUser(address, limit);

  const sessions = await Promise.all(
    sessionIds.map(async (id) => {
      const data = await store.get(id);
      if (!data) return null;
      const firstUserMsg = data.messages?.find((m) => m.role === 'user');
      let preview = 'Conversation';
      if (firstUserMsg?.content) {
        const textBlock = firstUserMsg.content.find(
          (b: { type: string }) => b.type === 'text',
        ) as { type: 'text'; text: string } | undefined;
        if (textBlock?.text) {
          preview = textBlock.text.slice(0, 80);
        }
      }
      return {
        id: data.id,
        preview,
        messageCount: data.messages?.length ?? 0,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    }),
  );

  return NextResponse.json({
    sessions: sessions.filter(Boolean),
  });
}
