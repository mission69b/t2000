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

  let body: {
    manageKey?: string;
    submissionId?: string;
    submissionIds?: string[];
    action?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json(
      {
        error:
          'POST JSON: {"manageKey","submissionId" | "submissionIds":[…],"action":"approve"|"reject"}',
      },
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
  // Single or batch (S.626.1 — a 100-follower task is 100 approvals; batch
  // makes the poster panel one click). Payouts stay sequential.
  const wanted = body.submissionIds ?? (body.submissionId ? [body.submissionId] : []);
  if (wanted.length === 0 || wanted.length > 50) {
    return Response.json({ error: 'Pass 1–50 submission ids.' }, { status: 400 });
  }

  const subs = await listSubmissions(id);
  const results: {
    submissionId: string;
    status: string;
    payoutTx?: string;
    error?: string;
  }[] = [];

  for (const subId of wanted) {
    const sub = subs.find((s) => s.id === subId);
    if (!sub) {
      results.push({ submissionId: subId, status: 'error', error: 'no such submission' });
      continue;
    }
    if (sub.status !== 'pending') {
      results.push({ submissionId: subId, status: sub.status, error: 'already handled' });
      continue;
    }

    if (action === 'reject') {
      sub.status = 'rejected';
      await updateSubmission(id, sub);
      results.push({ submissionId: subId, status: 'rejected' });
      continue;
    }

    // Approve: budget + completion guards, then the rail payout.
    const rewardMicros = Math.round(task.rewardUsd * 1e6);
    if (task.approvedCount >= task.maxCompletions) {
      results.push({ submissionId: subId, status: 'error', error: 'max completions reached' });
      continue;
    }
    if (task.spentMicros + rewardMicros > task.budgetMicros) {
      results.push({ submissionId: subId, status: 'error', error: 'budget exhausted' });
      continue;
    }

    // Reserve BEFORE paying (flip status as the cheap reservation, revert on
    // payout failure).
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
      results.push({ submissionId: subId, status: 'paid', payoutTx: digest });
    } catch (err) {
      sub.status = 'pending';
      await updateSubmission(id, sub);
      results.push({
        submissionId: subId,
        status: 'error',
        error: `payout failed (${err instanceof Error ? err.message : String(err)}) — back to pending, retry shortly`,
      });
    }
  }

  if (task.approvedCount >= task.maxCompletions) {
    await closeTask(task, 'closed');
  }
  const paid = results.filter((r) => r.status === 'paid').length;
  return Response.json({
    ok: results.every((r) => r.status !== 'error'),
    paid,
    results,
    taskStatus: task.status,
  });
}
