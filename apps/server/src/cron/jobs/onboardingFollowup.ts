import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getFinancialSummary } from '@t2000/sdk';
import { sendEmail } from '../../services/email.js';
import type { JobResult } from '../types.js';
import { sleep, withRetry } from '../utils.js';

const CONCURRENCY = 3;
const BATCH_DELAY_MS = 2000;
const JOB_NAME = 'onboarding_followup';

interface FollowupUser {
  userId: string;
  email: string;
  walletAddress: string;
  timezoneOffset: number;
}

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

async function fetchFollowupUsers(): Promise<FollowupUser[]> {
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/onboarding-followup`, {
      headers: { 'x-internal-key': getInternalKey() },
    });
    if (!res.ok) {
      console.error(`[${JOB_NAME}] Failed to fetch users: ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { users?: FollowupUser[] };
    return data.users ?? [];
  } catch (err) {
    console.error(`[${JOB_NAME}] Error fetching users:`, err instanceof Error ? err.message : err);
    return [];
  }
}

async function storeFollowupEvent(walletAddress: string): Promise<void> {
  try {
    await fetch(`${getInternalUrl()}/api/internal/app-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': getInternalKey(),
      },
      body: JSON.stringify({
        address: walletAddress,
        type: 'onboarding_followup',
        title: 'Onboarding follow-up email sent',
      }),
    });
  } catch {
    // Best-effort — idempotency is handled by the audric endpoint
  }
}

type FollowupVariant = 'saved' | 'idle' | 'zero';

function deriveVariant(summary: { savingsBalance: number; idleUsdc: number }): FollowupVariant {
  if (summary.savingsBalance > 0.01) return 'saved';
  if (summary.idleUsdc > 0.01) return 'idle';
  return 'zero';
}

function buildSubject(variant: FollowupVariant): string {
  if (variant === 'saved') return 'Your USDC is earning — here\'s what else Audric can do';
  if (variant === 'idle') return 'Your USDC is waiting — start earning in one tap';
  return 'Welcome to Audric — fund your wallet to get started';
}

function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n > 0) return `$${n.toFixed(4).replace(/0+$/, '')}`;
  return '$0.00';
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function buildEmailHtml(variant: FollowupVariant, summary: { savingsBalance: number; idleUsdc: number; saveApy: number }): string {
  const appUrl = 'https://audric.ai';

  let heroText: string;
  let ctaText: string;
  let ctaUrl: string;

  if (variant === 'saved') {
    heroText = `Your ${fmtUsd(summary.savingsBalance)} USDC is earning ${fmtPct(summary.saveApy)} APY. But Audric does more than save — try asking it to translate something, check the weather, or swap tokens.`;
    ctaText = 'Ask Audric something';
    ctaUrl = `${appUrl}/new?prefill=${encodeURIComponent('What can you do?')}`;
  } else if (variant === 'idle') {
    heroText = `You have ${fmtUsd(summary.idleUsdc)} idle USDC. Save it to start earning ${fmtPct(summary.saveApy)} APY — that's ~${fmtUsd(summary.idleUsdc * (summary.saveApy / 365))} per day.`;
    ctaText = 'Save your USDC';
    ctaUrl = `${appUrl}/action?type=save`;
  } else {
    heroText = 'Send USDC to your Audric wallet to start saving, swapping, and paying with your AI copilot.';
    ctaText = 'Open Audric';
    ctaUrl = appUrl;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome to Audric</title></head>
<body style="margin:0;padding:0;background:#09090b;color:#a1a1aa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;padding:32px 20px">
  <tr><td>
    <p style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#71717a;margin:0 0 24px">AUDRIC</p>
    <h1 style="font-size:20px;color:#fafafa;font-weight:600;margin:0 0 16px;line-height:1.4">Your next step with Audric</h1>
    <p style="font-size:14px;line-height:1.7;color:#a1a1aa;margin:0 0 24px">${heroText}</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 32px"><tr><td>
      <a href="${ctaUrl}" style="display:inline-block;background:#fafafa;color:#09090b;font-size:13px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.03em">${ctaText} →</a>
    </td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #27272a;padding-top:20px">
      <tr><td>
        <p style="font-size:12px;color:#71717a;margin:0 0 4px">What else you can do:</p>
        <p style="font-size:13px;color:#a1a1aa;margin:0;line-height:1.8">
          💰 Save — earn yield while you sleep<br>
          💱 Swap — trade tokens in one message<br>
          💸 Send — pay anyone, anywhere<br>
          🤖 Ask — translate, weather, images
        </p>
      </td></tr>
    </table>
    <p style="font-size:10px;color:#52525b;margin:32px 0 0;line-height:1.6">
      You're receiving this because you signed up for Audric. This is a one-time email.<br>
      <a href="${appUrl}/settings" style="color:#71717a;text-decoration:underline">Manage notifications</a>
    </p>
  </td></tr>
</table>
</body></html>`;
}

async function processUser(
  client: SuiJsonRpcClient,
  user: FollowupUser,
): Promise<'sent' | 'skipped' | 'error'> {
  try {
    const summary = await withRetry(() => getFinancialSummary(client, user.walletAddress));
    const variant = deriveVariant(summary);
    const subject = buildSubject(variant);
    const html = buildEmailHtml(variant, summary);

    const emailId = await sendEmail({
      to: user.email,
      subject,
      html,
      tags: [
        { name: 'job', value: JOB_NAME },
        { name: 'variant', value: variant },
      ],
    });

    if (!emailId) {
      console.error(`[${JOB_NAME}] Email send failed for ${user.walletAddress}`);
      return 'error';
    }

    await storeFollowupEvent(user.walletAddress);
    return 'sent';
  } catch (err) {
    console.error(`[${JOB_NAME}] Error for ${user.walletAddress}:`, err instanceof Error ? err.message : err);
    return 'error';
  }
}

export async function runOnboardingFollowup(client: SuiJsonRpcClient): Promise<JobResult> {
  const users = await fetchFollowupUsers();
  const result: JobResult = { job: JOB_NAME, processed: users.length, sent: 0, errors: 0 };

  if (users.length === 0) return result;

  console.log(`[${JOB_NAME}] Processing ${users.length} users`);

  for (let i = 0; i < users.length; i += CONCURRENCY) {
    if (i > 0) await sleep(BATCH_DELAY_MS);

    const batch = users.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.allSettled(
      batch.map((u) => processUser(client, u)),
    );
    for (const o of outcomes) {
      if (o.status === 'fulfilled') {
        if (o.value === 'sent') result.sent++;
        if (o.value === 'error') result.errors++;
      } else {
        result.errors++;
      }
    }
  }

  return result;
}
