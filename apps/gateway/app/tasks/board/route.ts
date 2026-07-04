import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { USDC } from '@suimpp/mpp/server';
import {
  createX402Requirements,
  parseX402Header,
  X402_PAYMENT_HEADER,
  X402_VERSION,
} from '@suimpp/mpp/x402';
import { env } from '@/lib/env';
import { TREASURY_ADDRESS } from '@/lib/constants';
import {
  BOARD_CATEGORIES,
  BOARD_LIMITS,
  type BoardTask,
  boardConfigured,
  closeTask,
  createTask,
  hashManageKey,
  listLive,
  moderateTaskWithLLM,
  newId,
  openTaskCountFor,
  publicTask,
  sanitizeText,
  setModeration,
} from '@/lib/task-board';
import {
  getChainInfo,
  hasX402Payment,
  settleX402Request,
  withX402Receipt,
} from '@/lib/x402-dialect';

// GET  /tasks/board — the public community task board (live tasks).
// POST /tasks/board — post a task: no payment → x402 402 for the FULL budget
//   (reward × maxCompletions, collected to the treasury escrow); paid POST →
//   task created in pending_review (t2000 moderation before visibility —
//   §II.19: OKX's board carries credential-phishing tasks; ours doesn't).
//   The response returns the ONE-TIME manageKey (approve/reject/close auth).
export const dynamic = 'force-dynamic';

const NETWORK = (env.NEXT_PUBLIC_SUI_NETWORK as 'mainnet' | 'testnet') ?? 'mainnet';
const CHALLENGE_SECRET = env.MPP_CHALLENGE_SECRET;

function challengeSig(nonce: string): string {
  return createHmac('sha256', CHALLENGE_SECRET ?? '')
    .update(`${nonce}:task-board`)
    .digest('base64url')
    .slice(0, 22);
}

function issueChallengeId(): string {
  const nonce = randomBytes(12).toString('base64url');
  return CHALLENGE_SECRET ? `${nonce}.${challengeSig(nonce)}` : nonce;
}

function verifyChallengeId(challengeId: string): boolean {
  if (!CHALLENGE_SECRET) {
    return true;
  }
  const [nonce, sig] = challengeId.split('.');
  if (!(nonce && sig)) {
    return false;
  }
  const expected = challengeSig(nonce);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type PostBody = {
  title?: string;
  description?: string;
  category?: string;
  rewardUsd?: number;
  maxCompletions?: number;
  expiryDays?: number;
};

function validate(body: PostBody):
  | { ok: true; title: string; description: string; category: (typeof BOARD_CATEGORIES)[number]; rewardUsd: number; maxCompletions: number; expiryDays: number; budgetUsd: number }
  | { ok: false; error: string } {
  const title = sanitizeText(body.title ?? '', BOARD_LIMITS.titleMax);
  const description = sanitizeText(body.description ?? '', BOARD_LIMITS.descriptionMax);
  if (title.length < 8) {
    return { ok: false, error: 'title must be 8+ characters' };
  }
  if (description.length < 30) {
    return { ok: false, error: 'description must be 30+ characters (what exactly must the worker deliver, and what proof)' };
  }
  const category = (BOARD_CATEGORIES as readonly string[]).includes(body.category ?? '')
    ? (body.category as (typeof BOARD_CATEGORIES)[number])
    : 'other';
  const rewardUsd = Number(body.rewardUsd);
  if (
    !Number.isFinite(rewardUsd) ||
    rewardUsd < BOARD_LIMITS.minRewardUsd ||
    rewardUsd > BOARD_LIMITS.maxRewardUsd
  ) {
    return { ok: false, error: `rewardUsd must be $${BOARD_LIMITS.minRewardUsd}–$${BOARD_LIMITS.maxRewardUsd}` };
  }
  const maxCompletions = Math.floor(Number(body.maxCompletions ?? 1));
  if (!Number.isFinite(maxCompletions) || maxCompletions < 1 || maxCompletions > BOARD_LIMITS.maxCompletions) {
    return { ok: false, error: `maxCompletions must be 1–${BOARD_LIMITS.maxCompletions}` };
  }
  const budgetUsd = Math.round(rewardUsd * maxCompletions * 1e6) / 1e6;
  if (budgetUsd > BOARD_LIMITS.maxBudgetUsd) {
    return { ok: false, error: `budget (reward × completions) exceeds $${BOARD_LIMITS.maxBudgetUsd}` };
  }
  const expiryDays = Math.floor(Number(body.expiryDays ?? 7));
  if (!Number.isFinite(expiryDays) || expiryDays < 1 || expiryDays > BOARD_LIMITS.maxExpiryDays) {
    return { ok: false, error: `expiryDays must be 1–${BOARD_LIMITS.maxExpiryDays}` };
  }
  return { ok: true, title, description, category, rewardUsd, maxCompletions, expiryDays, budgetUsd };
}

export async function GET(): Promise<Response> {
  if (!boardConfigured()) {
    return Response.json({ tasks: [], active: false });
  }
  const tasks = await listLive();
  return Response.json({
    active: true,
    note:
      'Community tasks — posted and funded by anyone, moderated by t2000 before listing, approved by the POSTER (t2000 does not arbitrate). Rewards settle through the rail (2.5% fee on the worker side). Submit: POST /tasks/board/{id}/submit {"address","proof","url?"}.',
    tasks: tasks.map(publicTask),
  });
}

export async function POST(req: Request): Promise<Response> {
  if (!boardConfigured()) {
    return Response.json(
      { error: 'The task board is not accepting posts right now.' },
      { status: 503 },
    );
  }

  let body: PostBody;
  try {
    body = (await req.clone().json()) as PostBody;
  } catch {
    return Response.json(
      {
        error:
          'POST JSON: {"title","description","rewardUsd","maxCompletions","expiryDays?","category?"} — the x402 402 that follows collects the FULL budget (reward × completions) into escrow.',
      },
      { status: 400 },
    );
  }
  const v = validate(body);
  if (!v.ok) {
    return Response.json({ error: v.error }, { status: 400 });
  }
  const amount = v.budgetUsd.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');

  // No payment → the x402 challenge for the full budget.
  if (!hasX402Payment(req)) {
    const { chain, epoch } = await getChainInfo(NETWORK);
    const requirements = createX402Requirements({
      challengeId: issueChallengeId(),
      amount,
      currency: USDC,
      recipient: TREASURY_ADDRESS,
      resource: req.url,
      network: NETWORK,
      chain,
      currentEpoch: epoch,
    });
    return Response.json(
      {
        x402Version: X402_VERSION,
        error: 'Payment required',
        note: `Task budget: $${amount} (${v.maxCompletions} × $${v.rewardUsd}). Funding is escrowed; unspent budget auto-refunds at expiry/close. Your task goes live after a t2000 moderation pass.`,
        accepts: [requirements],
      },
      { status: 402 },
    );
  }

  try {
    const parsed = parseX402Header(req.headers.get(X402_PAYMENT_HEADER) ?? '');
    if (!verifyChallengeId(parsed.payload.challengeId)) {
      return Response.json({ error: 'Payment challenge invalid or mismatched.' }, { status: 402 });
    }
  } catch {
    return Response.json({ error: 'Malformed X-PAYMENT header.' }, { status: 400 });
  }

  let settled: Awaited<ReturnType<typeof settleX402Request>>;
  try {
    settled = await settleX402Request(req, {
      amount,
      currency: USDC,
      recipient: TREASURY_ADDRESS,
      network: NETWORK,
    });
  } catch (err) {
    return Response.json(
      { error: `Payment settlement rejected: ${err instanceof Error ? err.message : String(err)}` },
      { status: 402 },
    );
  }
  const { settle, report } = settled;
  const posterRaw = report.sender ?? settle.payer;
  let poster: string;
  try {
    poster = normalizeSuiAddress(posterRaw);
  } catch {
    poster = '';
  }
  if (!isValidSuiAddress(poster)) {
    return Response.json({ error: 'Could not resolve the paying wallet.' }, { status: 400 });
  }

  // Per-poster open cap — checked AFTER payment would be wrong; check is
  // cheap so do it before creating (over-cap → the task is rejected and the
  // budget refunds via the standard close path).
  const openCount = await openTaskCountFor(poster);
  const manageKey = `bmk_${randomBytes(18).toString('base64url')}`;
  const task: BoardTask = {
    id: newId('task'),
    title: v.title,
    description: v.description,
    category: v.category,
    rewardUsd: v.rewardUsd,
    maxCompletions: v.maxCompletions,
    approvedCount: 0,
    poster,
    budgetMicros: Math.round(v.budgetUsd * 1e6),
    spentMicros: 0,
    status: 'pending_review',
    manageKeyHash: hashManageKey(manageKey),
    collectDigest: settle.transaction,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + v.expiryDays * 86_400_000).toISOString(),
  };

  if (openCount >= BOARD_LIMITS.maxOpenPerPoster) {
    // Refund path: create-then-close keeps the audit trail + reuses the
    // close/refund machinery.
    await createTask(task);
    await closeTask(task, 'rejected');
    return withX402Receipt(
      Response.json(
        {
          error: `You already have ${BOARD_LIMITS.maxOpenPerPoster} open tasks — budget refunded.`,
          refunded: Boolean(task.refundDigest),
        },
        { status: 429 },
      ),
      settle,
    );
  }

  await createTask(task);

  // Auto-moderation (S.626): screen at post time — PASS lists instantly,
  // FAIL auto-refunds with the reason, engine-down leaves the manual queue.
  const screened = await moderateTaskWithLLM(task);
  if (screened.verdict === 'approve') {
    await setModeration(task, true);
  } else if (screened.verdict === 'reject') {
    await closeTask(task, 'rejected');
    return withX402Receipt(
      Response.json(
        {
          error: `Task rejected by the moderation screen: ${screened.reason} Full budget refunded.`,
          refunded: Boolean(task.refundDigest),
          ...(task.refundDigest ? { refundTx: task.refundDigest } : {}),
        },
        { status: 422 },
      ),
      settle,
    );
  }

  return withX402Receipt(
    Response.json({
      ok: true,
      task: publicTask(task),
      manageKey,
      manageKeyNote:
        'SAVE THIS — it is shown once. It authorizes approve/reject/close on this task: POST /tasks/board/{id}/approve {"manageKey","submissionId","action"} and /close {"manageKey"}.',
      moderation:
        task.status === 'live'
          ? 'Your task passed the automatic moderation screen and is LIVE now.'
          : 'The moderation screen is briefly unavailable — your task is queued for review and will list shortly.',
      escrow: {
        collectDigest: settle.transaction,
        budgetUsd: v.budgetUsd,
      },
    }),
    settle,
  );
}
