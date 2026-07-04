import { timingSafeEqual } from 'node:crypto';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { env } from '@/lib/env';
import {
  boardConfigured,
  getTask,
  listSubmissions,
  listTasksByPoster,
  publicTask,
  reviewSubmissions,
} from '@/lib/task-board';

// Poster proxy (S.626.2 — founder: "if I'm logged in via zkLogin why do I
// need a manageKey?"). The gateway cannot verify zkLogin signatures, but the
// CONSOLE's server can (it holds the Passport session) — so the console
// attests the poster's wallet over a shared secret, and the gateway scopes
// everything to tasks whose escrow was PAID BY that wallet. zkLogin posters
// never see a key; manageKey remains the CLI/machine path.
//   GET  ?address=0x…            → the poster's tasks + full submissions
//   POST { poster, taskId, submissionIds, action } → review (approve pays)
// Auth: `x-board-poster-proxy` header = BOARD_POSTER_PROXY_KEY.
export const dynamic = 'force-dynamic';

function proxyAuthed(req: Request): boolean {
  const expected = env.BOARD_POSTER_PROXY_KEY ?? '';
  const got = req.headers.get('x-board-poster-proxy') ?? '';
  if (!expected || !got) {
    return false;
  }
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseAddress(raw: string): string | null {
  try {
    const address = normalizeSuiAddress(raw.trim());
    return isValidSuiAddress(address) ? address : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  if (!boardConfigured()) {
    return Response.json({ error: 'Task board inactive.' }, { status: 503 });
  }
  if (!proxyAuthed(req)) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const address = parseAddress(new URL(req.url).searchParams.get('address') ?? '');
  if (!address) {
    return Response.json({ error: 'A valid `address` is required.' }, { status: 400 });
  }
  const tasks = await listTasksByPoster(address);
  const withSubs = await Promise.all(
    tasks.map(async (t) => ({
      ...publicTask(t),
      budgetUsd: t.budgetMicros / 1e6,
      spentUsd: t.spentMicros / 1e6,
      submissions: await listSubmissions(t.id),
    })),
  );
  return Response.json({ tasks: withSubs });
}

export async function POST(req: Request): Promise<Response> {
  if (!boardConfigured()) {
    return Response.json({ error: 'Task board inactive.' }, { status: 503 });
  }
  if (!proxyAuthed(req)) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 });
  }
  let body: {
    poster?: string;
    taskId?: string;
    submissionIds?: string[];
    action?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const poster = parseAddress(body.poster ?? '');
  if (!poster) {
    return Response.json({ error: 'A valid `poster` is required.' }, { status: 400 });
  }
  const action =
    body.action === 'approve' ? 'approve' : body.action === 'reject' ? 'reject' : null;
  if (!action) {
    return Response.json({ error: 'action must be "approve" or "reject".' }, { status: 400 });
  }
  const wanted = body.submissionIds ?? [];
  if (wanted.length === 0 || wanted.length > 50) {
    return Response.json({ error: 'Pass 1–50 submission ids.' }, { status: 400 });
  }
  const task = await getTask(body.taskId ?? '');
  if (!task) {
    return Response.json({ error: 'No such task.' }, { status: 404 });
  }
  // The ownership check: the attested wallet must be the one that PAID the
  // escrow. No key involved — the payment is the credential.
  if (task.poster.toLowerCase() !== poster.toLowerCase()) {
    return Response.json({ error: 'This wallet did not post that task.' }, { status: 403 });
  }

  const { results, paid } = await reviewSubmissions(task, wanted, action);
  return Response.json({
    ok: results.every((r) => r.status !== 'error'),
    paid,
    results,
    taskStatus: task.status,
  });
}
