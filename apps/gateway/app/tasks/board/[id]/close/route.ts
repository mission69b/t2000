import { boardConfigured, closeTask, getTask, hashManageKey } from '@/lib/task-board';

// POST /tasks/board/{id}/close — poster closes early; unspent budget
// auto-refunds to the poster's wallet.
export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!boardConfigured()) {
    return Response.json({ error: 'Task board inactive.' }, { status: 503 });
  }
  const { id } = await ctx.params;
  const task = await getTask(id);
  if (!task) {
    return Response.json({ error: 'No such task.' }, { status: 404 });
  }
  let body: { manageKey?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!body.manageKey || hashManageKey(body.manageKey) !== task.manageKeyHash) {
    return Response.json({ error: 'Invalid manageKey.' }, { status: 403 });
  }
  if (task.status !== 'live' && task.status !== 'pending_review') {
    return Response.json(
      { error: `Task is already ${task.status.replace(/_/g, ' ')}.` },
      { status: 409 },
    );
  }
  const closed = await closeTask(task, 'closed');
  return Response.json({
    ok: true,
    status: closed.status,
    refunded: Boolean(closed.refundDigest),
    ...(closed.refundDigest
      ? { refundTx: closed.refundDigest, suiscan: `https://suiscan.xyz/mainnet/tx/${closed.refundDigest}` }
      : {}),
  });
}
