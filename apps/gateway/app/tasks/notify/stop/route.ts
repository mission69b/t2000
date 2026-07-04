import { timingSafeEqual } from 'node:crypto';
import { clearTaskNotify, stopToken } from '@/lib/notify';

// GET /tasks/notify/stop?task=…&token=… — the one-click unsubscribe from
// every S.630 email footer. The token is an HMAC capability over the taskId:
// holding the link (i.e. having received the email) IS the authority. No
// account, no confirmation page — it deletes the stored email and says so.
export const dynamic = 'force-dynamic';

export function GET(req: Request): Promise<Response> | Response {
  const url = new URL(req.url);
  const taskId = url.searchParams.get('task') ?? '';
  const token = url.searchParams.get('token') ?? '';
  if (!(taskId && token)) {
    return new Response('Missing task or token.', { status: 400 });
  }
  const expected = stopToken(taskId);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response('Invalid stop link.', { status: 403 });
  }
  return clearTaskNotify(taskId).then(
    () =>
      new Response(
        `Done — no more emails for this task.\n\nYour task is unaffected; review submissions any time at https://agents.t2000.ai/manage/tasks\n`,
        { headers: { 'content-type': 'text/plain; charset=utf-8' } },
      ),
  );
}
