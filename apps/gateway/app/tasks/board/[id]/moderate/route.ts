import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import {
  boardConfigured,
  closeTask,
  getTask,
  listPending,
  setModeration,
} from '@/lib/task-board';

// POST /tasks/board/{id}/moderate — the t2000 moderation pass (§II.19:
// pre-moderation is non-negotiable; OKX's board carries credential-phishing
// tasks). Auth = INTERNAL_API_KEY (founder ops — one curl per task; a
// console admin surface can come later if volume earns it).
//   {"key": "...", "action": "approve"|"reject"}
// GET with ?key= lists the pending queue (id = "queue").
export const dynamic = 'force-dynamic';

function keyOk(key: string): boolean {
  const expected = env.INTERNAL_API_KEY ?? '';
  const a = Buffer.from(key);
  const b = Buffer.from(expected);
  return expected.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (id !== 'queue') {
    return Response.json({ error: 'GET /tasks/board/queue/moderate?key= lists the pending queue.' }, { status: 404 });
  }
  const key = new URL(req.url).searchParams.get('key') ?? '';
  if (!keyOk(key)) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const pending = await listPending();
  return Response.json({
    pending: pending.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      category: t.category,
      rewardUsd: t.rewardUsd,
      maxCompletions: t.maxCompletions,
      poster: t.poster,
      budgetUsd: t.budgetMicros / 1e6,
      createdAt: t.createdAt,
    })),
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!boardConfigured()) {
    return Response.json({ error: 'Task board inactive.' }, { status: 503 });
  }
  const { id } = await ctx.params;
  let body: { key?: string; action?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!keyOk(body.key ?? '')) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const task = await getTask(id);
  if (!task) {
    return Response.json({ error: 'No such task.' }, { status: 404 });
  }
  // approve: pending_review only. reject: pending_review OR open — the
  // S.677 takedown path for spam that slips the LLM gate (founder-keyed,
  // refunds the poster's remaining escrow through the close machinery).
  if (body.action === 'approve') {
    if (task.status !== 'pending_review') {
      return Response.json({ error: `Task is ${task.status}, not pending review.` }, { status: 409 });
    }
    const updated = await setModeration(task, true);
    return Response.json({ ok: true, status: updated.status });
  }
  if (body.action === 'reject') {
    if (task.status !== 'pending_review' && task.status !== 'open') {
      return Response.json({ error: `Task is ${task.status} — nothing to take down.` }, { status: 409 });
    }
    const updated = await closeTask(task, 'rejected');
    return Response.json({
      ok: true,
      status: updated.status,
      refunded: Boolean(updated.refundDigest),
      ...(updated.refundDigest ? { refundTx: updated.refundDigest } : {}),
    });
  }
  return Response.json({ error: 'action must be "approve" or "reject".' }, { status: 400 });
}
