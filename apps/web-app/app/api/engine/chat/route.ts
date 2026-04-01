import { NextRequest } from 'next/server';
import { engineToSSE } from '@t2000/engine';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import {
  createEngine,
  getSessionStore,
  generateSessionId,
} from '@/lib/engine/engine-factory';
import { UpstashSessionStore } from '@/lib/engine/upstash-session-store';
import { getBridge, cleanupBridge } from '@/lib/engine/bridge-registry';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ChatRequestBody {
  message: string;
  address: string;
  sessionId?: string;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const { message, address, sessionId: requestedSessionId } = body;

  if (!message?.trim() || !address) {
    return jsonError('message and address are required', 400);
  }

  if (!isValidSuiAddress(address)) {
    return jsonError('Invalid Sui address', 400);
  }

  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`engine:${ip}`, 20, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const store = getSessionStore();
  const sessionId = requestedSessionId || generateSessionId();

  const session = requestedSessionId
    ? await store.get(requestedSessionId)
    : null;

  try {
    const engine = await createEngine(address, session);
    const bridge = getBridge(sessionId);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          controller.enqueue(
            encoder.encode(
              `event: session\ndata: ${JSON.stringify({ sessionId })}\n\n`,
            ),
          );

          for await (const chunk of engineToSSE(
            engine.submitMessage(message.trim()),
            bridge,
          )) {
            controller.enqueue(encoder.encode(chunk));
          }

          const updatedSession = {
            id: sessionId,
            messages: [...engine.getMessages()],
            usage: engine.getUsage(),
            createdAt: session?.createdAt ?? Date.now(),
            updatedAt: Date.now(),
            metadata: { address },
          };

          await store.set(updatedSession);

          if (!requestedSessionId && store instanceof UpstashSessionStore) {
            await store.addToUserIndex(address, sessionId);
          }
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : 'Engine error';
          console.error('[engine/chat] stream error:', errorMsg);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },

      cancel() {
        cleanupBridge(sessionId);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Session-Id': sessionId,
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Engine initialization failed';
    console.error('[engine/chat] init error:', errorMsg);
    return jsonError(errorMsg, 500);
  }
}
