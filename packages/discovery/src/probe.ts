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

function extractChallenge(headers: Headers, body: unknown): MppChallenge | null {
  const wwwAuth = headers.get('www-authenticate');
  if (wwwAuth) {
    const params: Record<string, string> = {};
    for (const match of wwwAuth.matchAll(/(\w+)="([^"]*)"/g)) {
      params[match[1]] = match[2];
    }
    if (params.recipient || params.currency) return params;
  }

  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (b.recipient || b.currency || b.amount) return b as MppChallenge;

    if (b.paymentRequirements && typeof b.paymentRequirements === 'object') {
      return b.paymentRequirements as MppChallenge;
    }
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
