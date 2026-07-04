import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import {
  addSubmission,
  BOARD_LIMITS,
  boardConfigured,
  getTask,
  newId,
  sanitizeText,
} from '@/lib/task-board';

// POST /tasks/board/{id}/submit — a worker submits proof of completion.
// One submission per wallet per task; the POSTER approves (t2000 does not
// arbitrate) and approval pays through the rail.
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
  if (task.status !== 'live') {
    return Response.json(
      { error: `Task is ${task.status.replace(/_/g, ' ')} — not accepting submissions.` },
      { status: 409 },
    );
  }
  if (Date.parse(task.expiresAt) <= Date.now()) {
    return Response.json({ error: 'Task expired — not accepting submissions.' }, { status: 409 });
  }

  let body: { address?: string; proof?: string; url?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json(
      { error: 'POST JSON: {"address":"0x… (your payout wallet)","proof":"what you did + how to verify","url?":"https://…"}' },
      { status: 400 },
    );
  }
  let worker: string;
  try {
    worker = normalizeSuiAddress((body.address ?? '').trim());
  } catch {
    worker = '';
  }
  if (!isValidSuiAddress(worker)) {
    return Response.json({ error: 'A valid Sui `address` is required (your payout wallet).' }, { status: 400 });
  }
  if (worker.toLowerCase() === task.poster.toLowerCase()) {
    return Response.json({ error: 'Posters cannot submit to their own task.' }, { status: 400 });
  }
  const proof = sanitizeText(body.proof ?? '', BOARD_LIMITS.proofMax);
  if (proof.length < 10) {
    return Response.json(
      { error: 'proof must be 10+ characters — say what you did and how the poster can verify it.' },
      { status: 400 },
    );
  }
  let url: string | null = null;
  if (body.url) {
    try {
      const parsed = new URL(body.url);
      if (parsed.protocol === 'https:') {
        url = sanitizeText(parsed.toString(), 300);
      }
    } catch {
      url = null;
    }
  }

  const sub = {
    id: newId('sub'),
    worker,
    proof,
    url,
    status: 'pending' as const,
    at: new Date().toISOString(),
  };
  const result = await addSubmission(id, sub);
  if (result === 'duplicate') {
    return Response.json(
      { error: 'This wallet already submitted to this task (one submission per wallet).' },
      { status: 409 },
    );
  }
  return Response.json({
    ok: true,
    submissionId: sub.id,
    note: `Submitted. The poster reviews and approves — approval pays $${task.rewardUsd} through the rail to ${worker.slice(0, 10)}… (2.5% rail fee applies on the worker side). t2000 does not arbitrate.`,
  });
}
