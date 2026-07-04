import {
  boardConfigured,
  getTask,
  hashManageKey,
  reviewSubmissions,
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

  const { results, paid } = await reviewSubmissions(task, wanted, action);
  return Response.json({
    ok: results.every((r) => r.status !== 'error'),
    paid,
    results,
    taskStatus: task.status,
  });
}
