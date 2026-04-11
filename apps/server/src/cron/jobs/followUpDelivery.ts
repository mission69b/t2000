import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { JobResult } from '../types.js';

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

interface PendingFollowUp {
  id: string;
  userId: string;
  triggerType: string;
  adviceLogId: string | null;
  message: string;
  ctaType: string | null;
  ctaAmount: number | null;
  priority: string;
  deliveryMethod: string;
}

async function fetchPendingFollowUps(): Promise<PendingFollowUp[]> {
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/follow-up-queue?pending=true`, {
      headers: { 'x-internal-key': getInternalKey() },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: PendingFollowUp[] };
    return data.entries ?? [];
  } catch {
    return [];
  }
}

async function storeAppEvent(
  walletAddress: string,
  type: string,
  title: string,
  details?: unknown,
): Promise<boolean> {
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/app-event`, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address: walletAddress, type, title, details }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getUserAddress(userId: string): Promise<string | null> {
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/user-address?userId=${userId}`, {
      headers: { 'x-internal-key': getInternalKey() },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { address?: string };
    return data.address ?? null;
  } catch {
    return null;
  }
}

async function markFollowUpSent(followUpId: string): Promise<void> {
  try {
    await fetch(`${getInternalUrl()}/api/internal/follow-up-queue/${followUpId}`, {
      method: 'PATCH',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sentAt: new Date().toISOString() }),
    });
  } catch { /* best effort */ }
}

export async function deliverFollowUps(
  _client: SuiJsonRpcClient,
): Promise<JobResult> {
  const pending = await fetchPendingFollowUps();
  if (pending.length === 0) {
    return { job: 'follow_up_delivery', processed: 0, sent: 0, errors: 0 };
  }

  let sent = 0;
  let errors = 0;

  for (const followUp of pending) {
    try {
      const address = await getUserAddress(followUp.userId);
      if (!address) {
        errors++;
        continue;
      }

      const delivered = await storeAppEvent(address, 'follow_up', followUp.message, {
        ctaType: followUp.ctaType,
        ctaAmount: followUp.ctaAmount,
        adviceLogId: followUp.adviceLogId,
        triggerType: followUp.triggerType,
        priority: followUp.priority,
      });

      if (delivered) {
        await markFollowUpSent(followUp.id);
        sent++;
      } else {
        errors++;
      }
    } catch (err) {
      console.error(`[follow-up-delivery] Error for ${followUp.id}:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  return { job: 'follow_up_delivery', processed: pending.length, sent, errors };
}
