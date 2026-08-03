import { SUI_ADDRESS_REGEX, KNOWN_SUI_CURRENCIES, VALIDATION_CODES } from './constants.js';
import type { ProbeResult, ValidationIssue } from './types.js';

interface MppChallenge {
  amount?: string;
  currency?: string;
  recipient?: string;
  realm?: string;
  network?: string;
  [key: string]: unknown;
}

function decodeRequest(encoded: string): Record<string, string> {
  try {
    const json = Buffer.from(encoded, 'base64').toString('utf-8');
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return {};
}

interface X402Accept {
  scheme?: unknown;
  network?: unknown;
  payTo?: unknown;
  asset?: unknown;
  maxAmountRequired?: unknown;
  resource?: unknown;
}

/** x402 `accepts[]` entry → the MPP challenge shape the rest of probe() reads.
 *  `maxAmountRequired` is raw 6-decimal USDC units; the header dialect's
 *  `amount` is a decimal string — convert (known-USDC only) so `amount` means
 *  the same thing whichever dialect answered. */
function challengeFromAccepts(accepts: unknown): MppChallenge | null {
  if (!Array.isArray(accepts)) return null;
  const sui = accepts.filter(
    (a: X402Accept) =>
      a &&
      typeof a === 'object' &&
      a.scheme === 'exact' &&
      typeof a.network === 'string' &&
      a.network.startsWith('sui'),
  ) as X402Accept[];
  const entry = sui.find(a => a.network === 'sui:mainnet') ?? sui[0];
  if (!entry || typeof entry.payTo !== 'string') return null;

  const challenge: MppChallenge = { recipient: entry.payTo };
  if (typeof entry.asset === 'string') challenge.currency = entry.asset;
  if (typeof entry.maxAmountRequired === 'string' && /^\d+$/.test(entry.maxAmountRequired)) {
    challenge.amount =
      typeof entry.asset === 'string' && KNOWN_SUI_CURRENCIES.has(entry.asset)
        ? (Number(entry.maxAmountRequired) / 1_000_000).toString()
        : entry.maxAmountRequired;
  }
  if (typeof entry.resource === 'string') {
    try {
      challenge.realm = new URL(entry.resource).hostname;
    } catch {}
  }
  return challenge;
}

function extractChallenge(headers: Headers, body: unknown): MppChallenge | null {
  const wwwAuth = headers.get('www-authenticate');
  if (wwwAuth) {
    const params: Record<string, string> = {};
    for (const match of wwwAuth.matchAll(/(\w+)="([^"]*)"/g)) {
      params[match[1]] = match[2];
    }

    // mppx encodes amount/currency/recipient inside a base64 `request` field
    if (params.request) {
      const decoded = decodeRequest(params.request);
      Object.assign(params, decoded);
    }

    if (params.recipient || params.currency) return params;
  }

  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (b.recipient || b.currency || b.amount) return b as MppChallenge;

    if (b.paymentRequirements && typeof b.paymentRequirements === 'object') {
      return b.paymentRequirements as MppChallenge;
    }

    // x402 body-only sellers (@t2000/serve emits accepts[] and no
    // WWW-Authenticate) — the dialect this probe rejected until 0.2.2.
    const fromAccepts = challengeFromAccepts(b.accepts);
    if (fromAccepts) return fromAccepts;
  }

  return null;
}

export async function probe(url: string, expectedOrigin?: string): Promise<ProbeResult> {
  const issues: ValidationIssue[] = [];

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    });

    if (res.status !== 402) {
      return {
        ok: false,
        url,
        statusCode: res.status,
        hasSuiPayment: false,
        issues: [
          {
            code: VALIDATION_CODES.PROBE_NOT_402,
            severity: 'error',
            message: `Expected 402 Payment Required, got ${res.status}`,
          },
        ],
      };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    const challenge = extractChallenge(res.headers, body);
    if (!challenge) {
      return {
        ok: false,
        url,
        statusCode: 402,
        hasSuiPayment: false,
        issues: [
          {
            code: VALIDATION_CODES.PROBE_FAILED,
            severity: 'error',
            message: 'Got 402 but could not extract payment challenge from headers or body',
          },
        ],
      };
    }

    if (challenge.recipient && !SUI_ADDRESS_REGEX.test(challenge.recipient)) {
      issues.push({
        code: VALIDATION_CODES.PROBE_INVALID_RECIPIENT,
        severity: 'error',
        message: `Recipient "${challenge.recipient}" is not a valid Sui address`,
      });
    }

    if (challenge.currency && !KNOWN_SUI_CURRENCIES.has(challenge.currency)) {
      issues.push({
        code: VALIDATION_CODES.PROBE_UNKNOWN_CURRENCY,
        severity: 'warning',
        message: `Currency "${challenge.currency}" is not a recognized Sui USDC type`,
      });
    }

    if (expectedOrigin && challenge.realm) {
      const expectedHost = new URL(expectedOrigin).hostname;
      if (challenge.realm !== expectedHost && !challenge.realm.endsWith(`.${expectedHost}`)) {
        issues.push({
          code: VALIDATION_CODES.PROBE_REALM_MISMATCH,
          severity: 'error',
          message: `Payment realm "${challenge.realm}" does not match origin host "${expectedHost}"`,
        });
      }
    }

    const hasErrors = issues.some(i => i.severity === 'error');

    return {
      ok: !hasErrors,
      url,
      statusCode: 402,
      hasSuiPayment: true,
      recipient: challenge.recipient,
      currency: challenge.currency,
      amount: challenge.amount,
      realm: challenge.realm,
      issues,
    };
  } catch (err) {
    return {
      ok: false,
      url,
      statusCode: 0,
      hasSuiPayment: false,
      issues: [
        {
          code: VALIDATION_CODES.PROBE_FAILED,
          severity: 'error',
          message: `Probe failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }
}
