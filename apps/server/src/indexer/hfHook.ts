import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getFinancialSummary } from '@t2000/sdk';

const DEDUP_CRITICAL_MS = 30 * 60 * 1000; // max one critical per 30 min per address
const HF_TRIGGER_ACTIONS = new Set(['borrow', 'repay', 'withdraw', 'save']);

const lastCriticalSent = new Map<string, number>();

function shouldSendCritical(address: string): boolean {
  const last = lastCriticalSent.get(address);
  if (!last) return true;
  return Date.now() - last > DEDUP_CRITICAL_MS;
}

interface HFCheckResult {
  address: string;
  healthFactor: number;
  isCritical: boolean;
  emailSent: boolean;
}

/**
 * Check if any agent addresses in the current batch need a critical HF alert.
 * Called after transaction parsing — only triggers on lending-related actions.
 */
export async function checkCriticalHF(
  client: SuiJsonRpcClient,
  transfers: Array<{ agentAddress: string; action: string }>,
): Promise<HFCheckResult[]> {
  const addressesNeedingCheck = new Set<string>();

  for (const t of transfers) {
    if (HF_TRIGGER_ACTIONS.has(t.action)) {
      addressesNeedingCheck.add(t.agentAddress);
    }
  }

  if (addressesNeedingCheck.size === 0) return [];

  const results: HFCheckResult[] = [];

  for (const address of addressesNeedingCheck) {
    if (!shouldSendCritical(address)) continue;

    try {
      const summary = await getFinancialSummary(client, address);

      if (summary.hfAlertLevel !== 'critical') {
        results.push({ address, healthFactor: summary.healthFactor, isCritical: false, emailSent: false });
        continue;
      }

      // Dispatch critical alert via audric internal API
      const sent = await dispatchCriticalAlert(address, summary.healthFactor, summary.debtBalance);

      if (sent) {
        lastCriticalSent.set(address, Date.now());
      }

      results.push({ address, healthFactor: summary.healthFactor, isCritical: true, emailSent: sent });
    } catch (err) {
      console.error(`[hf-hook] Error checking ${address}:`, err instanceof Error ? err.message : err);
    }
  }

  return results;
}

/**
 * Ask the audric app to send a critical HF alert.
 * The audric app looks up the user's email and sends via its own Resend integration.
 * Falls back gracefully if the internal API is unavailable.
 */
async function dispatchCriticalAlert(
  walletAddress: string,
  healthFactor: number,
  debtBalance: number,
): Promise<boolean> {
  const url = process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
  const key = process.env.AUDRIC_INTERNAL_KEY ?? '';

  try {
    const res = await fetch(`${url}/api/internal/hf-alert`, {
      method: 'POST',
      headers: {
        'x-internal-key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        walletAddress,
        healthFactor,
        debtBalance,
        level: 'critical',
        triggeredAt: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      console.error(`[hf-hook] Alert dispatch failed for ${walletAddress}: ${res.status}`);
      return false;
    }

    console.log(`[hf-hook] Critical HF alert dispatched for ${walletAddress} (HF=${healthFactor.toFixed(2)})`);
    return true;
  } catch (err) {
    console.error('[hf-hook] Dispatch error:', err instanceof Error ? err.message : err);
    return false;
  }
}
