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
  /** Set when the x402 entry is JOB-CLASS (`extra.escrow` — SPEC_A2A_ESCROW):
   *  the endpoint sells deliverable work settled through an on-chain escrow
   *  Job object, not an instant settle-then-serve call. */
  escrow?: ProbedEscrowTerms;
  issues: string[];
}

export interface ProbedEscrowTerms {
  deliverWithinMs: number;
  reviewWindowMs: number;
  rejectSplitBps: number;
}

interface X402Accepts {
  scheme?: string;
  network?: string;
  payTo?: string;
  maxAmountRequired?: string;
  extra?: { escrow?: Partial<ProbedEscrowTerms>; suimpp?: Record<string, unknown> };
}

/** True when the entry carries a COMPLETE instant-settlement challenge —
 *  `extra.suimpp` exactly as `createX402Requirements` emits it. A bare
 *  exact/sui:mainnet entry without it is decorative: the payer SDK has no
 *  challenge to bind a payment to, and stamping it dialect:x402 put an
 *  unpayable seller in the Passport catalog (JMPR, live 2026-07-27). */
function hasCompleteSuimppChallenge(extra: X402Accepts['extra']): boolean {
  const s = extra?.suimpp;
  return (
    !!s &&
    typeof s.challengeId === 'string' &&
    s.challengeId.length > 0 &&
    typeof s.nonce === 'number' &&
    typeof s.chain === 'string' &&
    s.chain.length > 0 &&
    typeof s.minEpoch === 'string' &&
    typeof s.maxEpoch === 'string'
  );
}

/** Validate the advertised job terms — a job-class listing with nonsense
 *  terms is unbuyable, so malformed terms fail the probe (fail closed). */
function parseEscrowTerms(
  extra: X402Accepts['extra'],
): { terms?: ProbedEscrowTerms; issue?: string } {
  const e = extra?.escrow;
  if (!e) return {};
  const { deliverWithinMs, reviewWindowMs, rejectSplitBps } = e;
  if (
    typeof deliverWithinMs !== 'number' ||
    deliverWithinMs <= 0 ||
    typeof reviewWindowMs !== 'number' ||
    reviewWindowMs < 0 ||
    typeof rejectSplitBps !== 'number' ||
    !Number.isInteger(rejectSplitBps) ||
    rejectSplitBps < 0 ||
    rejectSplitBps > 10_000
  ) {
    return {
      issue:
        'the 402 advertises escrow terms but they are malformed — extra.escrow needs ' +
        'deliverWithinMs > 0, reviewWindowMs ≥ 0, and integer rejectSplitBps 0–10000',
    };
  }
  return { terms: { deliverWithinMs, reviewWindowMs, rejectSplitBps } };
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

  // Dialect 1 — x402 body envelope (instant OR job-class escrow entry).
  // "x402 accepts[]" means a COMPLETE entry: a usable extra.suimpp challenge
  // (instant) or valid extra.escrow terms (job-class). A decorative
  // exact+sui:mainnet with neither is NOT x402 — fall through to the header
  // dialect so the payer contract and the catalog stamp agree.
  let incompleteX402 = false;
  try {
    const body = (await response.clone().json()) as { accepts?: X402Accepts[] };
    const exact = body.accepts?.find((a) => a.scheme === 'exact' && a.network === 'sui:mainnet');
    if (exact?.payTo && exact.maxAmountRequired) {
      const price = atomicToDecimal(exact.maxAmountRequired);
      if (price) {
        const { terms, issue } = parseEscrowTerms(exact.extra);
        if (issue) return { ok: false, payTo: exact.payTo.toLowerCase(), issues: [issue] };
        if (terms || hasCompleteSuimppChallenge(exact.extra)) {
          return {
            ok: true,
            payTo: exact.payTo.toLowerCase(),
            priceUsdc: price,
            dialect: 'x402',
            escrow: terms,
            issues: [],
          };
        }
        incompleteX402 = true;
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

  if (incompleteX402) {
    return {
      ok: false,
      issues: [
        "the 402's x402 accepts[] entry is incomplete — instant x402 needs extra.suimpp " +
          '(challengeId/nonce/chain/minEpoch/maxEpoch, the createX402Requirements shape) and ' +
          'job-class needs extra.escrow terms; a bare exact+sui:mainnet entry is not payable',
      ],
    };
  }
  return {
    ok: false,
    issues: [
      "402 carries neither an x402 'exact' sui:mainnet requirement in the body nor an MPP 'sui' challenge in WWW-Authenticate — nothing t2 pay can pay",
    ],
  };
}
