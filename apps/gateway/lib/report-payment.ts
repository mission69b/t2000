import { SuiGrpcClient } from '@mysten/sui/grpc';
import { SUI_USDC_TYPE } from './constants';
import { getCatalog } from './catalog-live';
import { logPayment } from './log-payment';
import type { Service } from './services';

// ---------------------------------------------------------------------------
// Direct-seller payment reporting (S.743).
//
// Direct payments (catalog federation) settle client → seller origin — the
// gateway proxy never sees them, so `logPayment` never fires and the activity
// feed goes blind exactly where the marketplace story is. Clients close the
// gap by POSTing `{ digest, url }` to /api/mpp/report after a paid direct
// call. The report is only a POINTER: everything written to the feed (amount,
// sender) is read from the chain, and the digest must be a USDC transfer to
// the cataloged seller's pinned `payTo`. Unverifiable reports are dropped.
// ---------------------------------------------------------------------------

export type ReportOutcome =
  | { ok: true }
  | { ok: false; status: number; error: string };

/** Match a reported URL to a cataloged direct seller by origin (merged catalog — static ⊕ self-listed). */
export async function findDirectServiceByUrl(url: string): Promise<{ service: Service; endpoint: string } | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const catalog = await getCatalog();
  const service = catalog.find((s) => {
    if (!s.direct || !s.payTo) return false;
    try {
      return new URL(s.serviceUrl).origin === parsed.origin;
    } catch {
      return false;
    }
  });
  if (!service) return null;
  return { service, endpoint: parsed.pathname };
}

/**
 * Verify the digest on-chain (USDC inflow to the seller's pinned payTo) and
 * write the activity row. Amount + sender come from the chain's balance
 * changes, never from the reporter.
 */
// Reports race finality by construction: the seller settles and the client
// (or the relay's after() hook) reports within milliseconds — before the
// fullnode we read from has indexed the digest. A single not-found read used
// to drop the row forever (the 2026-07-27 Privi payments were lost exactly
// this way); every other failure mode is final and never retried.
const NOT_FOUND_ATTEMPTS = 4;
const NOT_FOUND_RETRY_DELAY_MS = 2_500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function verifyAndLogDirectPayment(input: {
  digest: string;
  url: string;
  client?: SuiGrpcClient; // injectable for tests
  retryDelayMs?: number; // injectable for tests
}): Promise<ReportOutcome> {
  const { digest, url } = input;
  if (typeof digest !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(digest)) {
    return { ok: false, status: 400, error: 'invalid digest' };
  }

  const match = await findDirectServiceByUrl(url);
  if (!match) {
    return { ok: false, status: 404, error: 'url does not match a cataloged direct seller' };
  }
  const { service, endpoint } = match;

  const client =
    input.client ??
    new SuiGrpcClient({ baseUrl: 'https://fullnode.mainnet.sui.io', network: 'mainnet' });

  const retryDelayMs = input.retryDelayMs ?? NOT_FOUND_RETRY_DELAY_MS;
  let changes: Array<{ coinType: string; address?: string | null; amount: string }> | undefined;
  for (let attempt = 1; attempt <= NOT_FOUND_ATTEMPTS; attempt++) {
    try {
      const result = await client.core.getTransaction({
        digest,
        include: { balanceChanges: true },
      });
      const txn = result.$kind === 'Transaction' ? result.Transaction : undefined;
      if (txn) {
        changes = txn.balanceChanges ?? [];
        break;
      }
    } catch {
      // Not indexed yet (or genuinely nonexistent) — retry below.
    }
    if (attempt < NOT_FOUND_ATTEMPTS) await sleep(retryDelayMs);
  }
  if (!changes) {
    return { ok: false, status: 422, error: 'transaction not found on-chain' };
  }

  const payTo = service.payTo!.toLowerCase();
  const usdcSuffix = SUI_USDC_TYPE.split('::').slice(1).join('::');
  const ZERO = BigInt(0);
  const isUsdc = (t: string) => t === SUI_USDC_TYPE || t.endsWith(usdcSuffix);
  const inflow = changes.find(
    (c) => BigInt(c.amount) > ZERO && (c.address ?? '').toLowerCase() === payTo && isUsdc(c.coinType),
  );
  if (!inflow) {
    return { ok: false, status: 422, error: 'digest is not a USDC payment to this seller' };
  }

  const sender =
    changes.find((c) => BigInt(c.amount) < ZERO && isUsdc(c.coinType))?.address ?? null;

  // 6dp USDC → decimal string matching the proxied rows ("0.02").
  const amount = (Number(BigInt(inflow.amount)) / 1_000_000).toString();

  await logPayment({ service: service.id, endpoint, amount, digest, sender });
  return { ok: true };
}
