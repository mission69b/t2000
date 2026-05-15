/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// scripts/memwal-smoke.ts
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 0 deliverable 6 (2026-05-15). MemWal Path C smoke test
// — the Phase 7 commitment gate.
//
// Purpose
// -------
// Phase 7 of v0.7a migrates Silent Profile + AdviceLog + ChainFact from
// Postgres-backed daily-snapshot architecture to MemWal vector retrieval
// (managed mode, Mysten-operated relayer). The MemWal API is BETA. Per
// the v0.7a plan, we run a real smoke test BEFORE committing — if
// stability concerns surface, the documented fallback is Letta self-hosted
// (decision-doc §5.1).
//
// The contract this harness enforces
// ----------------------------------
//   1. Ingest 10 small text records via `rememberAndWait` (each call
//      includes embedding + SEAL encrypt + Walrus upload + index, server-
//      side. We measure the wall-clock end-to-end time.)
//   2. Retrieve top-K (K = 5) for a query 10× via `recall` (each call
//      verifies delegate-key signature server-side, embeds the query,
//      vector-searches the namespace, downloads + decrypts hits, returns
//      plaintext).
//   3. Measure end-to-end latency per call.
//   4. Assert p95 RETRIEVAL latency < 200ms (per v0.7a plan §Phase 0).
//   5. Output structured JSON for CI consumption + Phase 0 acceptance gate.
//   6. Use a unique per-run namespace so we don't pollute the user's main
//      memory space (`smoke-test-<timestamp>`). Memories persist after the
//      run — currently no `forget` API surfaced in v0.0.4 of the SDK.
//
// Status decisions
// ----------------
//   - MEMWAL_PRIVATE_KEY missing       → exit 0, status `skipped`
//   - All retrievals succeed + p95 < 200ms
//                                      → exit 0, status `passed`
//   - All retrievals succeed + p95 >= 200ms
//                                      → exit 2, status `passed-but-slow`
//                                        (triggers Letta fallback decision)
//   - Some calls fail (non-zero error count)
//                                      → exit 3, status `api-unstable`
//                                        (triggers Letta fallback decision)
//
// Usage
// -----
//   # Source env from audric/apps/web/.env.local (where the founder put it):
//   set -a && source /Users/funkii/dev/audric/apps/web/.env.local && set +a
//   pnpm --filter @t2000/engine exec tsx scripts/memwal-smoke.ts
//
//   # Or pipe to a JSON artifact:
//   pnpm --filter @t2000/engine exec tsx scripts/memwal-smoke.ts > memwal-smoke.json
//
// Output shape
// ------------
//   {
//     "version": "<engine version>",
//     "status": "skipped" | "passed" | "passed-but-slow" | "api-unstable",
//     "memwal": {
//       "namespace": "smoke-test-<timestamp>",
//       "ingest": {
//         "count": 10,
//         "p50Ms": ..., "p95Ms": ..., "p99Ms": ...,
//         "errors": []
//       },
//       "retrieve": {
//         "count": 10,
//         "p50Ms": ..., "p95Ms": ..., "p99Ms": ...,
//         "errors": [],
//         "topHitText": "<first hit's plaintext>",
//         "topHitDistance": <similarity score>
//       }
//     },
//     "thresholds": { "p95RetrieveMaxMs": 200 },
//     "timestamp": "<ISO 8601>"
//   }
// ---------------------------------------------------------------------------

import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MemWal } from '@mysten-incubation/memwal';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const P95_RETRIEVE_MAX_MS = 200;
const INGEST_COUNT = 10;
const RETRIEVE_COUNT = 10;
const RETRIEVE_TOP_K = 5;

type SmokeStatus = 'skipped' | 'passed' | 'passed-but-slow' | 'api-unstable';

interface PhaseStats {
  count: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errors: string[];
}

interface SmokeResult {
  version: string;
  status: SmokeStatus;
  reason?: string;
  memwal?: {
    namespace: string;
    ingest: PhaseStats;
    retrieve: PhaseStats & {
      topHitText?: string;
      topHitDistance?: number;
    };
  };
  thresholds: { p95RetrieveMaxMs: number };
  timestamp: string;
}

// 10 fixture records representative of audric memory payloads (Silent
// Profile / AdviceLog / ChainFact shape). Mix of factual + advice + chain
// activity so the retrieval query has meaningful semantic targets.
const FIXTURE_RECORDS = [
  'User saved 100 USDC into NAVI on 2026-01-15. Earning 4.6% APY.',
  'User borrowed 50 USDC against USDsui collateral on 2026-02-03. Health factor 2.1.',
  'User asked about yield optimization for stables on 2026-02-10.',
  'Recommendation: health factor dropped to 1.4 — add collateral or repay debt.',
  'User repaid 25 USDC on the borrow position on 2026-02-18.',
  'User swapped 10 SUI for USDC at price $4.21 on 2026-03-02.',
  'User claimed 12 USDC in NAVI rewards on 2026-03-15.',
  'User asked "what is my net worth?" on 2026-03-20 — portfolio analysis ran.',
  'Advice: recommended diversifying out of single-asset stables on 2026-04-01.',
  'Chain pattern: recurring deposit detected — 100 USDC on 1st of each month.',
];

const RETRIEVE_QUERY = 'What did I do with my NAVI savings recently?';

function quantile(sortedSamples: number[], q: number): number {
  if (sortedSamples.length === 0) return 0;
  const idx = Math.ceil(q * sortedSamples.length) - 1;
  const clamped = Math.max(0, Math.min(idx, sortedSamples.length - 1));
  return Number(sortedSamples[clamped].toFixed(2));
}

function computeStats(samples: number[], errors: string[]): PhaseStats {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: samples.length,
    p50Ms: quantile(sorted, 0.5),
    p95Ms: quantile(sorted, 0.95),
    p99Ms: quantile(sorted, 0.99),
    errors,
  };
}

async function main(): Promise<SmokeResult> {
  const pkgPath = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
  const timestamp = new Date().toISOString();
  const thresholds = { p95RetrieveMaxMs: P95_RETRIEVE_MAX_MS };

  const privateKey = process.env.MEMWAL_PRIVATE_KEY?.trim();
  const accountId = process.env.MEMWAL_ACCOUNT_ID?.trim();
  const serverUrl = process.env.MEMWAL_SERVER_URL?.trim() || 'https://relayer.memwal.ai';

  if (!privateKey || !accountId) {
    return {
      version: pkg.version,
      status: 'skipped',
      reason:
        'MEMWAL_PRIVATE_KEY and/or MEMWAL_ACCOUNT_ID not set. Source from audric/apps/web/.env.local: `set -a && source /Users/funkii/dev/audric/apps/web/.env.local && set +a`',
      thresholds,
      timestamp,
    };
  }

  // Unique namespace per run so we don't pollute the user's main memory
  // space. Phase 7 will use audric-controlled namespaces (e.g.
  // `silent-profile:<address>`, `advice:<address>`, `chain:<address>`).
  const namespace = `smoke-test-${Date.now()}`;

  const memwal = MemWal.create({ key: privateKey, accountId, serverUrl });

  const ingestSamples: number[] = [];
  const ingestErrors: string[] = [];
  const retrieveSamples: number[] = [];
  const retrieveErrors: string[] = [];
  let topHitText: string | undefined;
  let topHitDistance: number | undefined;

  try {
    // ---- INGEST PHASE ---------------------------------------------------
    // rememberAndWait is end-to-end: server embeds + SEAL-encrypts +
    // uploads to Walrus + writes onchain index, and we wait until the job
    // hits a terminal state. This is the right thing to measure for
    // "how long until the next turn can recall this fact?" — which is
    // the user-visible latency target.
    for (let i = 0; i < INGEST_COUNT; i++) {
      const text = FIXTURE_RECORDS[i];
      const start = performance.now();
      try {
        await memwal.rememberAndWait(text, namespace);
        ingestSamples.push(performance.now() - start);
      } catch (err) {
        ingestErrors.push(`ingest #${i}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ---- RETRIEVE PHASE -------------------------------------------------
    // recall is the hot path Phase 7 uses every turn: the engine queries
    // MemWal at turn-start to inject relevant memories into the system
    // prompt. The 200ms p95 threshold protects time-to-first-token.
    for (let i = 0; i < RETRIEVE_COUNT; i++) {
      const start = performance.now();
      try {
        const result = await memwal.recall(RETRIEVE_QUERY, RETRIEVE_TOP_K, namespace);
        retrieveSamples.push(performance.now() - start);
        if (i === 0 && result.results.length > 0) {
          topHitText = result.results[0].text;
          topHitDistance = result.results[0].distance;
        }
      } catch (err) {
        retrieveErrors.push(`retrieve #${i}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    // Wipe the delegate private key from heap memory.
    memwal.destroy();
  }

  const ingest = computeStats(ingestSamples, ingestErrors);
  const retrieve = {
    ...computeStats(retrieveSamples, retrieveErrors),
    ...(topHitText !== undefined ? { topHitText } : {}),
    ...(topHitDistance !== undefined ? { topHitDistance } : {}),
  };

  // ---- STATUS DECISION --------------------------------------------------
  const totalErrors = ingestErrors.length + retrieveErrors.length;
  let status: SmokeStatus;
  let reason: string | undefined;

  if (totalErrors > 0 && retrieveSamples.length === 0) {
    status = 'api-unstable';
    reason = `Every call failed. Trigger Letta fallback decision per decision-doc §5.1. First error: ${(ingestErrors[0] ?? retrieveErrors[0])}`;
  } else if (totalErrors > 0) {
    status = 'api-unstable';
    reason = `${totalErrors} of ${INGEST_COUNT + RETRIEVE_COUNT} calls failed. Investigate before Phase 7 commitment. First error: ${(ingestErrors[0] ?? retrieveErrors[0])}`;
  } else if (retrieve.p95Ms >= P95_RETRIEVE_MAX_MS) {
    status = 'passed-but-slow';
    reason = `Calls succeeded but p95 retrieval latency ${retrieve.p95Ms.toFixed(2)}ms >= ${P95_RETRIEVE_MAX_MS}ms threshold. Trigger Letta fallback decision per decision-doc §5.1.`;
  } else {
    status = 'passed';
  }

  return {
    version: pkg.version,
    status,
    ...(reason ? { reason } : {}),
    memwal: { namespace, ingest, retrieve },
    thresholds,
    timestamp,
  };
}

main()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    switch (result.status) {
      case 'skipped':
      case 'passed':
        process.exit(0);
      case 'passed-but-slow':
        process.exit(2);
      case 'api-unstable':
        process.exit(3);
    }
  })
  .catch((err) => {
    console.error('memwal-smoke harness internal error:', err);
    process.exit(99);
  });
