import { createHmac } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';
import type { BoardTask } from '@/lib/task-board';

// Notifications v1 (S.630) — POSTER EMAILS ONLY, deliberately.
//
// The deletion-test survivors (SPEC_NOTIFICATIONS_V1, simplified further on
// the founder's "don't build for building's sake" mandate):
//   1. "submissions arrived on your task" — the ONE blocking human action in
//      the board loop (escrow sits until the poster reviews). Coalesced to
//      ≤1 email per task per hour.
//   2. "your task closed/expired — unspent budget refunded" — money moved
//      back, closes the loop unprompted.
// Cut from v1 (build when capture/demand justifies): worker emails (workers
// are CLI wallets, no email exists), seller refund alarms (send side is
// trivial but capture needs a cross-app auth story), webhooks (§5 of the
// spec — machines poll fine post-S.629).
//
// Consent: an email is stored ONLY when the poster hands it to us at post
// time (console checkbox or `t2 task post --notify-email`). Every email
// carries a signed one-click stop link. No lookups, no lists, no reuse.
//
// Degradation: without RESEND_API_KEY + NOTIFY_FROM_EMAIL this module
// no-ops (same posture as every optional gateway integration).

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const MAX_PER_DAY = 10;
const COALESCE_SECONDS = 3600;

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

const emailKey = (taskId: string) => `notify:v1:task:${taskId}`;
const throttleKey = (taskId: string) => `notify:v1:throttle:${taskId}`;
const backlogKey = (taskId: string) => `notify:v1:backlog:${taskId}`;
const dailyKey = (email: string) =>
  `notify:v1:daily:${createHmac('sha256', 'notify-daily').update(email.toLowerCase()).digest('hex').slice(0, 24)}:${new Date().toISOString().slice(0, 10)}`;

export function notifyConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.NOTIFY_FROM_EMAIL);
}

export function isValidNotifyEmail(input: string): boolean {
  return EMAIL_RE.test(input.trim());
}

/** Capability token for the one-click stop link — HMAC over the taskId with
 *  the gateway's internal secret. No account, no expiry: holding the link
 *  (i.e. having received the email) IS the authority to stop it. */
export function stopToken(taskId: string): string {
  return createHmac('sha256', env.INTERNAL_API_KEY as string)
    .update(`notify-stop:${taskId}`)
    .digest('base64url')
    .slice(0, 32);
}

export async function setTaskNotifyEmail(taskId: string, email: string): Promise<void> {
  await redis().set(emailKey(taskId), email.trim(), { ex: 60 * 60 * 24 * 35 });
}

export async function clearTaskNotify(taskId: string): Promise<void> {
  await redis().del(emailKey(taskId), throttleKey(taskId), backlogKey(taskId));
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const sent = await redis().incr(dailyKey(to));
  if (sent === 1) {
    await redis().expire(dailyKey(to), 86_400);
  }
  if (sent > MAX_PER_DAY) {
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: env.NOTIFY_FROM_EMAIL, to: [to], subject, text }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    console.error(`[notify] resend ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

function stopFooter(taskId: string): string {
  return `\n\n—\nStop emails for this task: https://mpp.t2000.ai/tasks/notify/stop?task=${taskId}&token=${stopToken(taskId)}`;
}

/** Fire on every new submission. Coalesced: the first one sends immediately;
 *  further arrivals inside the hour are counted and reported in the next
 *  window's email. Proof bodies are never included (phishing surface) — the
 *  email says HOW MANY, the console/CLI shows the content. */
export async function notifySubmission(task: BoardTask): Promise<void> {
  if (!notifyConfigured()) {
    return;
  }
  const email = await redis().get<string>(emailKey(task.id));
  if (!email) {
    return;
  }
  const allowed = await redis().set(throttleKey(task.id), '1', {
    nx: true,
    ex: COALESCE_SECONDS,
  });
  if (allowed !== 'OK') {
    await redis().incr(backlogKey(task.id));
    return;
  }
  const backlog = Number((await redis().getdel(backlogKey(task.id))) ?? 0);
  const count = backlog + 1;
  const title = task.title.slice(0, 60);
  await sendEmail(
    email,
    `${count} new submission${count === 1 ? '' : 's'} — "${title}"`,
    `Your task "${title}" has ${count} new submission${count === 1 ? '' : 's'} waiting for review.\n\nEach approval pays the worker $${task.rewardUsd} through the rail instantly.\n\nReview + approve: https://agents.t2000.ai/manage/tasks\n(or: t2 task review ${task.id} --manage-key <key>)${stopFooter(task.id)}`,
  );
}

/** Fire when a task closes or expires. Only emails when money actually moved
 *  back (a refund settled); moderation rejects report synchronously in the
 *  post response, so 'rejected' never emails (just cleans up). */
export async function notifyClosed(task: BoardTask): Promise<void> {
  if (task.status === 'rejected') {
    await clearTaskNotify(task.id);
    return;
  }
  if (!notifyConfigured()) {
    return;
  }
  const email = await redis().get<string>(emailKey(task.id));
  if (!email) {
    return;
  }
  const refundUsd = ((task.budgetMicros - task.spentMicros) / 1e6).toFixed(2);
  const paid = task.approvedCount;
  const title = task.title.slice(0, 60);
  if (task.refundDigest) {
    await sendEmail(
      email,
      `Task ${task.status} — $${refundUsd} refunded`,
      `Your task "${title}" is ${task.status}. ${paid} completion${paid === 1 ? '' : 's'} paid; the unspent $${refundUsd} was refunded to your wallet.\n\nRefund tx: https://suiscan.xyz/mainnet/tx/${task.refundDigest}`,
    );
  }
  await clearTaskNotify(task.id);
}
