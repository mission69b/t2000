import { API_BASE_URL } from '../constants.js';
import { T2000Error } from '../errors.js';
import { toBase64 } from '../utils/base64.js';

export type GasRequestType = 'bootstrap' | 'auto-topup' | 'fallback';

export interface GasSponsorResponse {
  txBytes: string;
  sponsorSignature: string;
  gasEstimateUsd: number;
  type: GasRequestType;
}

export interface GasStatusResponse {
  circuitBreaker: boolean;
  suiPrice: number;
  bootstrapUsed?: number;
  bootstrapRemaining?: number;
}

/**
 * Request gas sponsorship from the gas station.
 *
 * Sends `txJson` (preferred) or `txBcsBytes` (base64-encoded BCS from tx.build(),
 * used when serialize() fails due to v1/v2 SDK mismatch with aggregator).
 */
export async function requestGasSponsorship(
  txJson: string,
  sender: string,
  type?: GasRequestType,
  txBcsBytes?: string,
): Promise<GasSponsorResponse> {
  const payload: Record<string, unknown> = { sender, type };
  if (txBcsBytes) {
    payload.txBcsBytes = txBcsBytes;
  } else {
    payload.txJson = txJson;
    payload.txBytes = toBase64(new TextEncoder().encode(txJson));
  }

  const res = await fetch(`${API_BASE_URL}/api/gas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    const errorCode = data.error as string;

    if (errorCode === 'CIRCUIT_BREAKER' || errorCode === 'POOL_DEPLETED' || errorCode === 'PRICE_STALE') {
      throw new T2000Error(
        'GAS_STATION_UNAVAILABLE',
        (data.message as string) ?? 'Gas station temporarily unavailable',
        { retryAfter: data.retryAfter, reason: errorCode },
        true,
      );
    }
    if (errorCode === 'GAS_FEE_EXCEEDED') {
      throw new T2000Error(
        'GAS_FEE_EXCEEDED',
        (data.message as string) ?? 'Gas fee exceeds ceiling',
        { retryAfter: data.retryAfter },
        true,
      );
    }

    throw new T2000Error(
      'GAS_STATION_UNAVAILABLE',
      (data.message as string) ?? 'Gas sponsorship request failed',
      { reason: errorCode },
      true,
    );
  }

  return data as unknown as GasSponsorResponse;
}

export async function reportGasUsage(
  sender: string,
  txDigest: string,
  gasCostSui: number,
  usdcCharged: number,
  type: GasRequestType,
): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/gas/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender, txDigest, gasCostSui, usdcCharged, type }),
    });
  } catch {
    // Non-critical — best-effort reporting
  }
}

export async function getGasStatus(address?: string): Promise<GasStatusResponse> {
  const url = new URL(`${API_BASE_URL}/api/gas/status`);
  if (address) url.searchParams.set('address', address);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new T2000Error('GAS_STATION_UNAVAILABLE', 'Failed to fetch gas status', undefined, true);
  }

  return (await res.json()) as GasStatusResponse;
}
