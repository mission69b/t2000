import type { SuiGrpcClient } from '@mysten/sui/grpc';

// Digest → created-object resolution (S.906 SSOT). Three consumers used to
// hand-copy this walk — the CLI's `t2 job open`, audric's hire-submit route
// and the Connect MCP's `t2000_job_open` — so the marker walk lives HERE
// once. Best-effort by design: a slow indexer returns `undefined` and the
// digest alone is still a receipt (callers must never block a successful
// escrow post on resolution).

/** The shared `Opening` object minted by an Open post. */
export const OPENING_TYPE_MARKER = '::opening::Opening<';
/** The escrow `Job` object minted by a hire or an Open claim. */
export const ESCROW_JOB_TYPE_MARKER = '::escrow::Job<';

/**
 * Pull the id of an object a transaction created/touched whose type contains
 * `marker`. Waits for the tx (default 15s, the CLI's long-standing budget)
 * and scans `objectTypes`. Returns `undefined` on timeout or absence —
 * never throws.
 */
export async function resolveCreatedObjectId(
  client: SuiGrpcClient,
  digest: string,
  marker: string,
  opts: { timeoutMs?: number } = {},
): Promise<string | undefined> {
  try {
    const result = await client.core.waitForTransaction({
      digest,
      include: { objectTypes: true },
      timeout: opts.timeoutMs ?? 15_000,
    });
    const txn =
      result.$kind === 'Transaction' ? result.Transaction : result.FailedTransaction;
    const types = txn.objectTypes ?? {};
    return Object.keys(types).find((id) => types[id]?.includes(marker));
  } catch {
    return undefined; // the digest alone is still a receipt
  }
}
