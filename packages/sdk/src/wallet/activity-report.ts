// Attributed x402.paid activity reporting (SPEC_T2_ACTIVITY_X402 §7, B2).
// After a successful pay, the buyer side fire-and-forgets the settlement
// digest to the t2000.ai report endpoint, which CHAIN-VERIFIES the digest
// before recording anything — this call carries claims, not trust, and a
// dead report never affects the payment or the caller. Browser-safe: no
// blind process.env read (the env override only applies where process
// exists); hosts can pass an explicit URL or disable with `false`.

export const DEFAULT_ACTIVITY_REPORT_URL = 'https://t2000.ai/api/activity/x402';

export type ActivityReportSource = 'pay' | 'try-it' | 'connect';

/** Per-call reporting config on PayOptions: override the URL/source, or
 *  `false` to opt out entirely. */
export type ActivityReportConfig =
  | { url?: string; source?: ActivityReportSource }
  | false;

export interface X402ActivityPayload {
  digest: string;
  payTo: string;
  payer?: string;
  amountMicroUsdc: number;
  network: string;
  route?: string;
  source: ActivityReportSource;
}

/** Resolve the report URL: explicit override → T2000_ACTIVITY_REPORT_URL
 *  (Node-like runtimes only) → the production default. */
export function resolveActivityReportUrl(override?: string): string {
  if (override) return override;
  const env =
    typeof process !== 'undefined' && process.env
      ? process.env.T2000_ACTIVITY_REPORT_URL?.trim()
      : undefined;
  return env && env.length > 0 ? env : DEFAULT_ACTIVITY_REPORT_URL;
}

/** Fire-and-forget report — short timeout, every failure swallowed. */
export function reportX402Activity(payload: X402ActivityPayload, url?: string): void {
  try {
    void fetch(resolveActivityReportUrl(url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1500),
    }).catch(() => undefined);
  } catch {
    // even a sync throw must never reach the caller
  }
}
