import {
  boardConfigured,
  closeTask,
  getTask,
  hashManageKey,
  listSubmissions,
  payWorker,
  saveTask,
  updateSubmission,
} from '@/lib/task-board';

// POST /tasks/board/{id}/approve — the POSTER's review action (manageKey
// capability auth). Approve pays the worker through the rail from the
// treasury escrow; reject just marks. When approvals hit maxCompletions the
// task closes (remainder auto-refunds — normally $0 by construction).
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

  let body: { manageKey?: string; submissionId?: string; action?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json(
      { error: 'POST JSON: {"manageKey","submissionId","action":"approve"|"reject"}' },
      { status: 400 },
    );
  }
  if (!body.manageKey || hashManageKey(body.manageKey) !== task.manageKeyHash) {
    return Response.json({ error: 'Invalid manageKey.' }, { status: 403 });
  }
  const action = body.action === 'approve' ? 'approve' : body.action === 'reject' ? 'reject' : null;
  if (!action) {
    return Response.json({ error: 'action must be "approve" or "reject".' }, { status: 400 });
  }

  const subs = await listSubmissions(id);
  const sub = subs.find((s) => s.id === body.submissionId);
  if (!sub) {
    return Response.json({ error: 'No such submission.' }, { status: 404 });
  }
  if (sub.status !== 'pending') {
    return Response.json(
      { error: `Submission already ${sub.status} — nothing to do.` },
      { status: 409 },
    );
  }

  if (action === 'reject') {
    sub.status = 'rejected';
    await updateSubmission(id, sub);
    return Response.json({ ok: true, submissionId: sub.id, status: 'rejected' });
  }

  // Approve: budget + completion guards, then the rail payout.
  const rewardMicros = Math.round(task.rewardUsd * 1e6);
  if (task.approvedCount >= task.maxCompletions) {
    return Response.json({ error: 'Task already reached its max completions.' }, { status: 409 });
  }
  if (task.spentMicros + rewardMicros > task.budgetMicros) {
    return Response.json({ error: 'Task budget exhausted.' }, { status: 409 });
  }

  // Reserve BEFORE paying (a concurrent approve of the same submission loses
  // on the pending check above only within this request — flip status first
  // as the cheap reservation, revert on payout failure).
  sub.status = 'approved';
  await updateSubmission(id, sub);
  try {
    const digest = await payWorker(sub.worker, task.rewardUsd);
    sub.status = 'paid';
    sub.payoutDigest = digest;
    await updateSubmission(id, sub);
    task.approvedCount += 1;
    task.spentMicros += rewardMicros;
    await saveTask(task);
    if (task.approvedCount >= task.maxCompletions) {
      await closeTask(task, 'closed');
    }
    return Response.json({
      ok: true,
      submissionId: sub.id,
      status: 'paid',
      payoutTx: digest,
      suiscan: `https://suiscan.xyz/mainnet/tx/${digest}`,
      taskStatus: task.status,
    });
  } catch (err) {
    sub.status = 'pending';
    await updateSubmission(id, sub);
    return Response.json(
      {
        error: `Payout failed (${err instanceof Error ? err.message : String(err)}) — the submission is back to pending; retry shortly.`,
      },
      { status: 502 },
    );
  }
}
