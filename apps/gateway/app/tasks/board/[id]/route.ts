import {
  boardConfigured,
  getTask,
  hashManageKey,
  listSubmissions,
  publicTask,
} from '@/lib/task-board';

// GET /tasks/board/{id} — public task detail. With a valid ?manageKey= the
// poster also sees full submissions (worker addresses + proof) for review.
export const dynamic = 'force-dynamic';

export async function GET(
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
  const subs = await listSubmissions(id);
  const manageKey = new URL(req.url).searchParams.get('manageKey') ?? '';
  const isPoster =
    manageKey.length > 0 && hashManageKey(manageKey) === task.manageKeyHash;

  return Response.json({
    task: publicTask(task),
    submissions: isPoster
      ? subs
      : subs.map((s) => ({
          id: s.id,
          worker: `${s.worker.slice(0, 6)}…${s.worker.slice(-4)}`,
          status: s.status,
          at: s.at,
        })),
    ...(isPoster
      ? {
          posterView: true,
          approveShape:
            'POST /tasks/board/{id}/approve {"manageKey","submissionId","action":"approve"|"reject"}',
        }
      : {}),
  });
}
