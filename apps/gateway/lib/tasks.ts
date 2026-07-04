import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';

// Tasks engine (SPEC_AGENT_COMMERCE §II.16 v2 — rail-native, founder-approved
// 2026-07-03). A task completion is t2000 BUYING from the worker's agent
// through the standard commerce flow: the runner wallet pays
// `commerce/pay/{worker}` like any buyer (escrow semantics, on-chain receipt,
// the worker's seller reputation accrues). There is NO separate payout
// system and NO cron:
//   - Ledger tasks (first-sale / agent-hire / agent-card) are triggered
//     INLINE by our own settlement route — the qualifying event IS a receipt
//     we just wrote, so `commerce/pay` fires a post-response check for the
//     buyer + seller wallets (see the `after()` hook there).
//   - External on-chain tasks (buy-manifest / buy-sui) are claim-triggered:
//     the worker POSTs their tx digest to /tasks/claim and verification +
//     payment happen in that request.
//   - X-proof tasks (verify-confidential) are claim-triggered too: the worker
//     POSTs their X post URL; the gateway reads the post keylessly (public
//     syndication CDN, lib/x-proof.ts), verifies the receipt trustlessly via
//     the SDK, and pays in the same request. No weekly review queue.
// Payments are idempotent (one per wallet per task, reserved atomically) and
// budget-capped per task; the runner wallet's balance is the hard ceiling.

const RAIL_BASE = 'https://x402.t2000.ai';

// Post-launch receipts only — no retroactive claims for activity that
// predates the tasks program.
export const TASKS_LAUNCH_AT = new Date('2026-07-03T08:00:00Z');

// The reward is stated NET (what lands with the worker). The rail's 2.5% fee
// applies to task payments like every other sale, so the runner grosses up.
const FEE_RATE = 0.025;

export type TaskId =
  | 'first-sale'
  | 'agent-hire'
  | 'agent-card'
  | 'buy-manifest'
  | 'buy-sui'
  | 'verify-confidential'
  | 'share-your-agent';

export type TaskDef = {
  id: TaskId;
  /** Net reward (USD) the worker receives. */
  rewardNetUsd: number;
  /** Gross spend cap (USD) — the task auto-pauses when reached. */
  budgetUsd: number;
  kind: 'ledger' | 'claim' | 'x-proof';
};

// Founder-set scale (2026-07-03 night, raised from $350): ~2,900 payout
// capacity per task on a $1,000 TOTAL envelope → micro-rewards. Deliberate:
// when the reward ≈ the cost of the qualifying action, farming is
// indistinguishable from participating (agent-card is literal cashback), and
// "thousands of agents paid on-chain" is the stat. verify-confidential
// (2026-07-03, was "manual, reviewed weekly") is auto-verified end-to-end:
// X post read keylessly + receipt re-verified trustlessly, so its reward
// dropped from the $2 manual-era rate into micro-reward territory.
export const TASKS: TaskDef[] = [
  { id: 'first-sale', rewardNetUsd: 0.1, budgetUsd: 300, kind: 'ledger' },
  { id: 'agent-hire', rewardNetUsd: 0.05, budgetUsd: 150, kind: 'ledger' },
  { id: 'agent-card', rewardNetUsd: 0.02, budgetUsd: 60, kind: 'ledger' },
  { id: 'buy-manifest', rewardNetUsd: 0.08, budgetUsd: 230, kind: 'claim' },
  { id: 'buy-sui', rewardNetUsd: 0.08, budgetUsd: 230, kind: 'claim' },
  { id: 'verify-confidential', rewardNetUsd: 0.25, budgetUsd: 30, kind: 'x-proof' },
  // S.623 marketing task: post YOUR listing on X — the listing URL in the
  // post carries the full wallet address (the claim binding).
  { id: 'share-your-agent', rewardNetUsd: 0.1, budgetUsd: 30, kind: 'x-proof' },
];

// Velocity throttle — the farm-spike tripwire at 1000-capacity tasks: at most
// this many payouts per task per hour; past it, payment attempts are skipped
// (not reserved — they retry via /tasks/claim or the next settlement) and the
// overflow is logged loudly. A full budget drain now takes >33 hours of
// sustained visible activity instead of one scripted burst.
const MAX_PAYOUTS_PER_TASK_PER_HOUR = 30;

const taskById = new Map(TASKS.map((t) => [t.id, t]));

export function getTask(id: string): TaskDef | undefined {
  return taskById.get(id as TaskId);
}

// Card Forge — the seller whose receipts qualify `agent-card`.
export const CARD_FORGE_ADDRESS =
  '0x7ab3d60d17f0eb9084142ca9a516b6ee5483d0cda5608f85df93c3343abe23d6';

// Wallets that can never EARN a task reward: the runner itself, the treasury,
// and the t2000-operated seed agents (we don't pay ourselves for growth).
const EXCLUDED_WALLETS = new Set(
  [
    // task runner
    '0x7d7946813d086ff4e29283566cfacad5981465b68c115d975fbf5bae3e5cbc2f',
    // t2000 seed agents (S.601/S.611 shelf)
    CARD_FORGE_ADDRESS,
    '0x9af2e1821b7dad818d288f1cc2248c1ccf1e535b3a55ef7b742ea379664ca101', // stable yields
    '0x7642b3862769d5cfd8587525350df72676ba7ab3a5b558aa8607bf990f20796a', // funding radar
    '0x9134caa730cdf29043559461cde0c59c48e9354798c5dfb6ed969c0f81e091be', // tech pulse
    '0x875d87c0b442a4e86390c85ae0f57c770a76614bf597ef1f98eb374503c5acd0', // fx rates
    '0x37dd2bd8b17165185419880e3eed7a32209dbc3f7acec877bf6a44c66beab433', // coin quotes
    '0x4529c9134627ada1e8bc8c4e6273573a312235a36135290be9c0a682cdfa6ecf', // funkii-agnt-cli
    '0x74188c6d996307d92b1791407f5a989f498e8460a5d476167a3e18278cad549c', // macro liquidity
    '0x84ed0c5512e7cd60e884c137366b46e3b5dde04ae1f866b3558cb29553b95ce8', // market regime
    '0x8e5189d1c1a9e31192fd14d2048f9f8fbdd92713b8db17697998601963573153', // trend align
    '0x1479ed9f8e0b04f2fd935a39a22a285031ea9d24f73f3631c32a68b43863d96a', // sui pulse
    // S.621 Shelf v3 seeds
    '0x02d11a50c3d61300cce481de0d56685f4d0c3dc24e199c878e7371528ebf98ca', // perp pressure
    '0xde9a239ca904f8d3a56d12847760f6c7b3b9c891242e63b4ff265768189f0537', // stable flows
    '0xf6dacfdf02546db19d7b304eb5a95b4667582f7fff90b8c72884d33ecbca0eb1', // sector radar
    '0xd0f40349893a551f02016432a8a791fa62b71e3958d8b6b4f819093c628bbead', // dex pulse
    '0x95a32163a7ae0f53f8adaf711a94eabb4961eddcc536fef1d91a0bde50ac5ae6', // gas gauge
    '0xce1682bda0adab069b0fe6f2d7e4f7217feb391fee8332fab6adaea2f49894af', // book depth
  ].map((a) => a.toLowerCase()),
);

export function isTasksConfigured(): boolean {
  return Boolean(env.TASK_RUNNER_KEY && env.KV_REST_API_URL && env.KV_REST_API_TOKEN);
}

export function runnerAddress(): string | null {
  if (!env.TASK_RUNNER_KEY) {
    return null;
  }
  try {
    return Ed25519Keypair.fromSecretKey(env.TASK_RUNNER_KEY)
      .getPublicKey()
      .toSuiAddress();
  } catch {
    return null;
  }
}

/** Gross the net reward up so the worker nets the advertised amount after the
 *  rail's 2.5% fee. Ceil at 4dp (the rail settles in USDC micros, so sub-cent
 *  precision is exact) — never under-pay the stated reward. */
export function grossRewardUsd(netUsd: number): number {
  return Math.ceil((netUsd / (1 - FEE_RATE)) * 10_000) / 10_000;
}

// ── Redis attribution store ─────────────────────────────────────────────────
// The RECEIPT is the money truth (on-chain + CommerceReceipt row); these
// records are the task-attribution join: which wallet was paid for which task,
// pointing at which receipt.

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

const paidKey = (task: TaskId) => `tasks:v1:paid:${task}`;
const spentKey = (task: TaskId) => `tasks:v1:spent:${task}`; // gross micros
// x-proof dedupe dimensions (beyond one-per-wallet): one payout per X
// account and one per receipt id — a handle can't farm N receipts and a
// public receipt id can't be re-posted by N wallets.
const xHandleKey = (task: TaskId) => `tasks:v1:xhandle:${task}`;
const xReceiptKey = (task: TaskId) => `tasks:v1:xreceipt:${task}`;

export type TaskPayoutRecord = {
  wallet: string;
  /** Collect-leg digest of the reward payment — the on-chain receipt. */
  digest: string;
  grossUsd: number;
  netUsd: number;
  at: string;
};

export async function spentGrossMicros(task: TaskId): Promise<number> {
  const v = await redis().get<number>(spentKey(task));
  return typeof v === 'number' ? v : Number.parseInt(String(v ?? '0'), 10) || 0;
}

export async function listPayouts(task: TaskId): Promise<TaskPayoutRecord[]> {
  const all = await redis().hgetall<Record<string, TaskPayoutRecord | 'pending'>>(
    paidKey(task),
  );
  if (!all) {
    return [];
  }
  return Object.values(all)
    .filter((v): v is TaskPayoutRecord => typeof v === 'object' && v !== null && 'digest' in v)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

// ── Qualification (ledger tasks) ────────────────────────────────────────────

async function qualifiesLedger(task: TaskId, wallet: string): Promise<boolean> {
  const runner = runnerAddress();
  const notOurs = { notIn: [...EXCLUDED_WALLETS, ...(runner ? [runner] : [])] };
  if (task === 'first-sale') {
    // A settled DELIVERED sale (endpoint present → resource recorded) to a
    // buyer that isn't the seller, us, or the runner (reward buys must never
    // qualify anyone — that would be a loop).
    const row = await prisma.commerceReceipt.findFirst({
      where: {
        seller: wallet,
        status: 'settled',
        resource: { not: null },
        buyer: { not: wallet, ...notOurs },
        createdAt: { gte: TASKS_LAUNCH_AT },
      },
      select: { id: true },
    });
    return Boolean(row);
  }
  if (task === 'agent-hire') {
    // A settled DELIVERED purchase from any seller ≠ self. Buying a t2000
    // seed counts (that's the point); being paid by the runner does not.
    const row = await prisma.commerceReceipt.findFirst({
      where: {
        buyer: wallet,
        status: 'settled',
        resource: { not: null },
        seller: { not: wallet },
        createdAt: { gte: TASKS_LAUNCH_AT },
      },
      select: { id: true },
    });
    return Boolean(row);
  }
  if (task === 'agent-card') {
    const row = await prisma.commerceReceipt.findFirst({
      where: {
        buyer: wallet,
        seller: CARD_FORGE_ADDRESS,
        status: 'settled',
        createdAt: { gte: TASKS_LAUNCH_AT },
      },
      select: { id: true },
    });
    return Boolean(row);
  }
  return false;
}

// ── Payment (through the rail — the whole point) ────────────────────────────

async function payThroughRail(
  task: TaskDef,
  wallet: string,
): Promise<TaskPayoutRecord | null> {
  const key = env.TASK_RUNNER_KEY as string;
  const grossUsd = grossRewardUsd(task.rewardNetUsd);

  // Budget gate on the GROSS spend cap.
  const spent = await spentGrossMicros(task.id);
  if (spent + Math.round(grossUsd * 1e6) > Math.round(task.budgetUsd * 1e6)) {
    return null;
  }

  // Velocity throttle (checked BEFORE reserving, so throttled wallets retry
  // cleanly later). Counter self-expires with its hour bucket.
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  const rateKey = `tasks:v1:rate:${task.id}:${hourBucket}`;
  const inThisHour = await redis().incr(rateKey);
  if (inThisHour === 1) {
    await redis().expire(rateKey, 3900);
  }
  if (inThisHour > MAX_PAYOUTS_PER_TASK_PER_HOUR) {
    console.error(
      `[tasks] VELOCITY LIMIT ${task.id}: ${inThisHour} qualifying payouts this hour (cap ${MAX_PAYOUTS_PER_TASK_PER_HOUR}) — deferring ${wallet}. Possible farm spike; inspect /tasks/stats.`,
    );
    return null;
  }

  // Atomic one-per-wallet reservation — a concurrent settle/claim for the
  // same wallet loses the HSETNX and walks away.
  const reserved = await redis().hsetnx(paidKey(task.id), wallet, 'pending');
  if (reserved !== 1) {
    return null;
  }

  try {
    const [{ payWithMpp, KeypairSigner }, { SuiGrpcClient }] = await Promise.all([
      import('@t2000/sdk'),
      import('@mysten/sui/grpc'),
    ]);
    const signer = new KeypairSigner(Ed25519Keypair.fromSecretKey(key));
    const client = new SuiGrpcClient({
      baseUrl: 'https://fullnode.mainnet.sui.io',
      network: 'mainnet',
    });
    const result = await payWithMpp({
      signer,
      client,
      options: {
        // The standard buy every rail client makes — worker as seller. If the
        // worker runs a service endpoint, the reward arrives as a DELIVERED
        // purchase of their service; otherwise the payment-only path forwards.
        url: `${RAIL_BASE}/commerce/pay/${wallet}?amount=${grossUsd}`,
        method: 'POST',
        maxPrice: grossUsd,
      },
    });
    const body = result.body as
      | { ok?: boolean; receipt?: { collectDigest?: string } }
      | undefined;
    const digest = body?.receipt?.collectDigest;
    if (!(result.paid && digest)) {
      throw new Error(
        `reward payment did not settle (paid=${result.paid}, status=${result.status})`,
      );
    }
    const record: TaskPayoutRecord = {
      wallet,
      digest,
      grossUsd,
      netUsd: task.rewardNetUsd,
      at: new Date().toISOString(),
    };
    await redis().hset(paidKey(task.id), { [wallet]: record });
    await redis().incrby(spentKey(task.id), Math.round(grossUsd * 1e6));
    console.log(`[tasks] paid ${task.id} → ${wallet} ($${grossUsd} gross, tx ${digest})`);
    return record;
  } catch (err) {
    // Release the reservation so the worker can retry via /tasks/claim.
    await redis().hdel(paidKey(task.id), wallet).catch(() => undefined);
    console.error(
      `[tasks] payment failed ${task.id} → ${wallet}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/** Pay `wallet` for `task` if qualified + unpaid + within budget. Returns the
 *  payout record when a payment happened in this call. */
export async function settleTaskIfQualified(
  task: TaskDef,
  wallet: string,
): Promise<TaskPayoutRecord | null> {
  const w = wallet.toLowerCase();
  const runner = runnerAddress();
  if (!isTasksConfigured() || EXCLUDED_WALLETS.has(w) || w === runner?.toLowerCase()) {
    return null;
  }
  const already = await redis().hget(paidKey(task.id), wallet);
  if (already) {
    return null;
  }
  if (task.kind === 'ledger' && !(await qualifiesLedger(task.id, wallet))) {
    return null;
  }
  return await payThroughRail(task, wallet);
}

/**
 * Settle an x-proof task: the route has already verified the post content and
 * the receipt — this adds the handle + receipt-id dedupe reservations around
 * the standard payment. Returns a string reason when not paid.
 */
export async function settleXProofTask(
  task: TaskDef,
  wallet: string,
  xHandle: string,
  receiptId: string,
): Promise<TaskPayoutRecord | { reason: string }> {
  const already = await redis().hget(paidKey(task.id), wallet);
  if (already) {
    return { reason: 'This wallet was already paid for this task.' };
  }
  const handleNew = await redis().sadd(xHandleKey(task.id), xHandle);
  if (handleNew !== 1) {
    return { reason: `@${xHandle} already earned this task (one per X account).` };
  }
  const receiptNew = await redis().sadd(xReceiptKey(task.id), receiptId);
  if (receiptNew !== 1) {
    await redis().srem(xHandleKey(task.id), xHandle);
    return { reason: 'That receipt id was already used for a claim.' };
  }
  const record = await settleTaskIfQualified(task, wallet);
  if (!record) {
    // Release both reservations so an honest retry (throttle window, budget
    // refill, endpoint blip) can succeed later.
    await redis().srem(xHandleKey(task.id), xHandle).catch(() => undefined);
    await redis().srem(xReceiptKey(task.id), receiptId).catch(() => undefined);
    return {
      reason:
        'Post verified, but the payment did not go through (budget spent, velocity limit, or a transient failure) — retry later.',
    };
  }
  return record;
}

/**
 * The settlement hook (fired via `after()` from commerce/pay): a receipt was
 * just written — check whether its buyer or seller newly qualifies for any
 * ledger task. Never throws; never runs for the runner's own buys.
 */
export async function runTaskChecksForWallets(wallets: string[]): Promise<void> {
  if (!isTasksConfigured()) {
    return;
  }
  const runner = runnerAddress()?.toLowerCase();
  const unique = [...new Set(wallets.map((w) => w.toLowerCase()))].filter(
    (w) => w && w !== runner && !EXCLUDED_WALLETS.has(w),
  );
  for (const wallet of unique) {
    for (const task of TASKS.filter((t) => t.kind === 'ledger')) {
      try {
        await settleTaskIfQualified(task, wallet);
      } catch (err) {
        console.error(
          `[tasks] check failed ${task.id}/${wallet}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
