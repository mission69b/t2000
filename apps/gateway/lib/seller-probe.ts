// [SPEC_CATALOG_SELF_LISTING] Dual-dialect 402 probe for seller ingest.
//
// Mirrors the payer contract (S.740): an endpoint qualifies if its 402
// carries EITHER an x402 `accepts[]` body entry (scheme "exact", network
// "sui:mainnet") OR an MPP `WWW-Authenticate: Payment` header challenge with
// method "sui". `@suimpp/discovery`'s probe() only speaks the header/body-MPP
// shapes — this probe adds the x402 side so anything `t2 pay` can pay is
// listable, and nothing listable is unpayable.
import { Challenge } from 'mppx';

const PROBE_TIMEOUT_MS = 15_000;

export interface SellerProbeResult {
  ok: boolean;
  /** The Sui wallet the challenge pays (x402 `payTo` / MPP `recipient`). */
  payTo?: string;
  /** Decimal USDC price quoted by the challenge, e.g. "0.02". */
  priceUsdc?: string;
  dialect?: 'x402' | 'mpp-header';
  issues: string[];
}

interface X402Accepts {
  scheme?: string;
  network?: string;
  payTo?: string;
  maxAmountRequired?: string;
}

/** Atomic 6dp USDC → decimal string ("20000" → "0.02"). */
function atomicToDecimal(atomic: string): string | undefined {
  try {
    return (Number(BigInt(atomic)) / 1_000_000).toString();
  } catch {
    return undefined;
  }
}

export async function probeSellerEndpoint(url: string): Promise<SellerProbeResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, issues: [`endpoint unreachable: ${err instanceof Error ? err.message : String(err)}`] };
  }

  if (response.status !== 402) {
    return { ok: false, issues: [`expected 402 payment challenge, got ${response.status}`] };
  }

  // Dialect 1 — x402 body envelope.
  try {
    const body = (await response.clone().json()) as { accepts?: X402Accepts[] };
    const exact = body.accepts?.find((a) => a.scheme === 'exact' && a.network === 'sui:mainnet');
    if (exact?.payTo && exact.maxAmountRequired) {
      const price = atomicToDecimal(exact.maxAmountRequired);
      if (price) {
        return { ok: true, payTo: exact.payTo.toLowerCase(), priceUsdc: price, dialect: 'x402', issues: [] };
      }
    }
  } catch {
    // Not JSON / no envelope — fall through to the header dialect.
  }

  // Dialect 2 — MPP WWW-Authenticate header.
  try {
    const challenges = Challenge.fromResponseList(response);
    const sui = challenges.find((c) => c.method === 'sui' && c.intent === 'charge');
    const req = sui?.request as Record<string, unknown> | undefined;
    if (typeof req?.amount === 'string' && typeof req?.recipient === 'string') {
      return {
        ok: true,
        payTo: req.recipient.toLowerCase(),
        priceUsdc: req.amount,
        dialect: 'mpp-header',
        issues: [],
      };
    }
  } catch {
    // No parseable header challenge either.
  }

  return {
    ok: false,
    issues: [
      "402 carries neither an x402 'exact' sui:mainnet requirement in the body nor an MPP 'sui' challenge in WWW-Authenticate — nothing t2 pay can pay",
    ],
  };
}
