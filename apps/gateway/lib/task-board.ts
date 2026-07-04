import { createHash, randomBytes } from 'node:crypto';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';
import { refundsEnabled, treasurySendUsdc } from '@/lib/refund';

// Task Marketplace v1 (SPEC_AGENT_COMMERCE §II.19, S.625 — founder-greenlit
// after real buyer demand; the §II.16 demand gate is MET).
//
// The shape: poster funds the FULL budget up front through the rail (x402
// collect to the treasury — funding IS the spam filter) → t2000 moderation
// before visibility (OKX's board carries literal credential-phishing tasks;
// pre-moderation is the lesson of record) → workers submit proof → the
// POSTER approves (t2000 never arbitrates) → approval pays the worker as a
// standard rail buy from the treasury escrow (receipt, reputation, the
// worker's 2.5% fee side — disclosed) → close/expiry auto-refunds the
// unspent budget to the poster.
//
// Poster auth = a capability token (`manageKey`) returned ONCE in the
// funding response and stored hashed — works for CLI keypairs AND zkLogin
// posters (no personal-message-signature plumbing).

const NETWORK = (env.NEXT_PUBLIC_SUI_NETWORK as 'mainnet' | 'testnet') ?? 'mainnet';
const RAIL_BASE = 'https://x402.t2000.ai';

// v1 bounds — small, honest, abuse-resistant.
export const BOARD_LIMITS = {
  minRewardUsd: 0.01,
  maxRewardUsd: 50,
  maxCompletions: 100,
  maxBudgetUsd: 500,
  maxExpiryDays: 30,
  maxOpenPerPoster: 3,
  titleMax: 80,
  descriptionMax: 1000,
  proofMax: 600,
} as const;

export const BOARD_CATEGORIES = [
  'research',
  'data',
  'marketing',
  'dev',
  'creative',
  'other',
] as const;

export type BoardTaskStatus =
  | 'pending_review'
  | 'live'
  | 'rejected'
  | 'closed'
  | 'expired';

export type BoardTask = {
  id: string;
  title: string;
  description: string;
  category: (typeof BOARD_CATEGORIES)[number];
  rewardUsd: number;
  maxCompletions: number;
  approvedCount: number;
  poster: string;
  budgetMicros: number;
  spentMicros: number;
  status: BoardTaskStatus;
  manageKeyHash: string;
  collectDigest: string;
  createdAt: string;
  expiresAt: string;
  refundDigest?: string | null;
};

export type BoardSubmission = {
  id: string;
  worker: string;
  proof: string;
  url: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  at: string;
  payoutDigest?: string | null;
};

let _redis: Redis | undefined;
function redis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: env.KV_REST_API_URL as string,
      token: env.KV_REST_API_TOKEN as string,
    });
  }
  return _redis;
}

const taskKey = (id: string) => `board:v1:task:${id}`;
const subsKey = (id: string) => `board:v1:subs:${id}`;
const subWalletsKey = (id: string) => `board:v1:subwallets:${id}`;
const LIVE_SET = 'board:v1:live';
const PENDING_SET = 'board:v1:pending';
const posterKey = (addr: string) => `board:v1:poster:${addr.toLowerCase()}`;

export function boardConfigured(): boolean {
  return Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN && refundsEnabled());
}

export function hashManageKey(key: string): string {
  return createHash('sha256').update(`board-manage:${key}`).digest('hex');
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

/** Strip control chars + collapse whitespace + cap — board text is untrusted
 *  and may be read by agents (the S.611 lesson applies to task text too). */
export function sanitizeText(value: string, maxLen: number): string {
  const flat = value
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars from untrusted text is the point
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > maxLen ? `${flat.slice(0, maxLen - 1)}…` : flat;
}

export async function getTask(id: string): Promise<BoardTask | null> {
  return await redis().get<BoardTask>(taskKey(id));
}

export async function saveTask(task: BoardTask): Promise<void> {
  await redis().set(taskKey(task.id), task);
}

export async function createTask(task: BoardTask): Promise<void> {
  await redis().set(taskKey(task.id), task);
  await redis().sadd(PENDING_SET, task.id);
  await redis().sadd(posterKey(task.poster), task.id);
}

export async function openTaskCountFor(poster: string): Promise<number> {
  const ids = await redis().smembers(posterKey(poster));
  if (ids.length === 0) {
    return 0;
  }
  const tasks = await Promise.all(ids.map((id) => getTask(id)));
  return tasks.filter(
    (t) => t && (t.status === 'pending_review' || t.status === 'live'),
  ).length;
}

export async function setModeration(
  task: BoardTask,
  approve: boolean,
): Promise<BoardTask> {
  await redis().srem(PENDING_SET, task.id);
  task.status = approve ? 'live' : 'rejected';
  if (approve) {
    await redis().sadd(LIVE_SET, task.id);
  }
  await saveTask(task);
  return task;
}

export async function listPending(): Promise<BoardTask[]> {
  const ids = await redis().smembers(PENDING_SET);
  const tasks = await Promise.all(ids.map((id) => getTask(id)));
  return tasks.filter((t): t is BoardTask => t !== null);
}

/** Live tasks, with lazy expiry: anything past its expiresAt flips to
 *  expired and refunds its remainder (fire-and-forget best effort). */
export async function listLive(): Promise<BoardTask[]> {
  const ids = await redis().smembers(LIVE_SET);
  const tasks = (await Promise.all(ids.map((id) => getTask(id)))).filter(
    (t): t is BoardTask => t !== null,
  );
  const now = Date.now();
  const out: BoardTask[] = [];
  for (const task of tasks) {
    if (Date.parse(task.expiresAt) <= now && task.status === 'live') {
      // Best-effort — a failed refund leaves the task expired with the
      // remainder logged for manual follow-up (refund_due posture).
      closeTask(task, 'expired').catch((err) =>
        console.error(
          `[board] expiry close failed ${task.id}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      continue;
    }
    if (task.status === 'live') {
      out.push(task);
    }
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function listSubmissions(taskId: string): Promise<BoardSubmission[]> {
  const all = await redis().hgetall<Record<string, BoardSubmission>>(subsKey(taskId));
  return all
    ? Object.values(all).sort((a, b) => (a.at < b.at ? 1 : -1))
    : [];
}

export async function addSubmission(
  taskId: string,
  sub: BoardSubmission,
): Promise<'ok' | 'duplicate'> {
  const fresh = await redis().sadd(subWalletsKey(taskId), sub.worker.toLowerCase());
  if (fresh !== 1) {
    return 'duplicate';
  }
  await redis().hset(subsKey(taskId), { [sub.id]: sub });
  return 'ok';
}

export async function updateSubmission(
  taskId: string,
  sub: BoardSubmission,
): Promise<void> {
  await redis().hset(subsKey(taskId), { [sub.id]: sub });
}

// ── Money legs ───────────────────────────────────────────────────────────────

/**
 * Pay an approved worker THROUGH the rail from the treasury escrow — a
 * standard commerce buy (receipted on Sui, builds the worker's record; the
 * rail's 2.5% comes out of the reward, disclosed on the board).
 *
 * Two legs (S.625 finding): the rail collects to the TREASURY, so the
 * treasury cannot be the x402 payer itself (a self-transfer nets zero and
 * the settle validation rightly refuses it). Instead the escrow FLOATS the
 * exact reward to the task-runner wallet, and the runner makes the rail buy
 * — the same payThroughRail mechanics as the t2000-tasks engine. A stranded
 * float (leg 1 ok, leg 2 fails) is logged loudly and retried on the next
 * approve attempt.
 */
export async function payWorker(
  worker: string,
  rewardUsd: number,
): Promise<string> {
  if (!env.TASK_RUNNER_KEY) {
    throw new Error('payouts unavailable (no runner key configured)');
  }
  const runner = Ed25519Keypair.fromSecretKey(env.TASK_RUNNER_KEY);
  const runnerAddress = runner.getPublicKey().toSuiAddress();
  const amount = rewardUsd.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');

  // Leg 1 — float the reward from the treasury escrow to the runner.
  await treasurySendUsdc({ to: runnerAddress, amount, network: NETWORK });

  // Leg 2 — the runner pays the worker through the rail.
  const [{ payWithMpp, KeypairSigner }, { SuiGrpcClient }] = await Promise.all([
    import('@t2000/sdk'),
    import('@mysten/sui/grpc'),
  ]);
  const signer = new KeypairSigner(runner);
  const client = new SuiGrpcClient({
    baseUrl: 'https://fullnode.mainnet.sui.io',
    network: 'mainnet',
  });
  const result = await payWithMpp({
    signer,
    client,
    options: {
      url: `${RAIL_BASE}/commerce/pay/${worker}?amount=${amount}`,
      method: 'POST',
      maxPrice: rewardUsd,
    },
  });
  const body = result.body as
    | { receipt?: { collectDigest?: string } }
    | undefined;
  const digest = body?.receipt?.collectDigest;
  if (!(result.paid && digest)) {
    console.error(
      `[board] payout_float_stranded runner=${runnerAddress} amount=${amount} worker=${worker} — leg 2 failed (paid=${result.paid}, status=${result.status}); float stays at the runner and the retry re-floats.`,
    );
    throw new Error(`payout did not settle (paid=${result.paid}, status=${result.status})`);
  }
  return digest;
}

/** Close a task (poster close / moderation reject / expiry) and refund the
 *  unspent budget to the poster. Idempotent on status. */
export async function closeTask(
  task: BoardTask,
  status: 'closed' | 'rejected' | 'expired',
): Promise<BoardTask> {
  if (task.status === 'closed' || task.status === 'rejected' || task.status === 'expired') {
    return task;
  }
  await redis().srem(LIVE_SET, task.id);
  await redis().srem(PENDING_SET, task.id);
  task.status = status;
  const remainderMicros = task.budgetMicros - task.spentMicros;
  if (remainderMicros >= 10_000) {
    // ≥ $0.01 — the gasless refund floor.
    const amount = (remainderMicros / 1e6).toFixed(6);
    try {
      task.refundDigest = await treasurySendUsdc({
        to: task.poster,
        amount,
        network: NETWORK,
      });
    } catch (err) {
      task.refundDigest = null;
      console.error(
        `[board] refund_due task=${task.id} poster=${task.poster} amount=${amount}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  await saveTask(task);
  return task;
}

/** Public card shape — never leaks manageKeyHash or poster internals. */
export function publicTask(task: BoardTask) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    category: task.category,
    rewardUsd: task.rewardUsd,
    maxCompletions: task.maxCompletions,
    approvedCount: task.approvedCount,
    remainingCompletions: Math.max(
      0,
      Math.min(
        task.maxCompletions - task.approvedCount,
        Math.floor((task.budgetMicros - task.spentMicros) / Math.round(task.rewardUsd * 1e6)),
      ),
    ),
    poster: `${task.poster.slice(0, 6)}…${task.poster.slice(-4)}`,
    status: task.status,
    createdAt: task.createdAt,
    expiresAt: task.expiresAt,
  };
}
