/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// scripts/benchmark-cold-start.ts
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 0 deliverable 7 (2026-05-15). Minimal cold-start
// benchmark — measures the wall-clock time for `import('@t2000/engine')`
// + `QueryEngine` construction with default tools and a stubbed provider.
//
// Why this exists
// ---------------
// The v0.7a engine drain refactors hot paths (provider, tool registry,
// streaming, MCP client, microcompact, etc.) across 8 phases. Cold-start
// time is a load-bearing metric for the npm package's developer experience
// (the time from `import` to "ready to chat"). Without a baseline, a
// regression in any phase could land silently and only surface as
// "feels slower in CLI tests" 4 weeks later.
//
// What it measures
// ----------------
// Two numbers, both in milliseconds:
//   • `importMs` — `await import('@t2000/engine')` round-trip.
//   • `constructMs` — `new QueryEngine({...})` with default tools and
//     a stub provider that never actually fires.
//
// Output shape (printed as JSON to stdout for CI consumption):
//   {
//     "version": "<engine package version>",
//     "node": "<node major.minor>",
//     "platform": "<process.platform>",
//     "importMs": 137.4,
//     "constructMs": 8.2,
//     "totalMs": 145.6,
//     "samples": 1,
//     "timestamp": "<ISO 8601>"
//   }
//
// Phase 0 lands the skeleton + 1 baseline measurement (this run).
// Phase 7 adds MemWal retrieval p95 measurement.
// Phase 8 expands into a full perf regression suite (turn time p50/p95,
// first-token latency, tool dispatch latency) as the v0.7a acceptance gate.
//
// Usage
// -----
//   pnpm --filter @t2000/engine exec tsx scripts/benchmark-cold-start.ts
//
// Or piped to a JSON artifact for CI:
//   pnpm --filter @t2000/engine exec tsx scripts/benchmark-cold-start.ts > benchmark-cold-start.json
//
// Failure modes
// -------------
// • If `QueryEngine` constructor signature changes, this script breaks
//   loudly (TypeScript error or runtime throw). That's the point — a
//   constructor signature change is a v0.7a hot-path event worth surfacing.
// • If the package becomes ESM-only (it already is) and the runner can't
//   resolve, exit code 1 + stderr message. CI must use `tsx` or `node
//   --experimental-loader`.
// ---------------------------------------------------------------------------

import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BenchmarkResult {
  version: string;
  node: string;
  platform: string;
  importMs: number;
  constructMs: number;
  totalMs: number;
  samples: number;
  timestamp: string;
}

async function main(): Promise<BenchmarkResult> {
  const pkgPath = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };

  const importStart = performance.now();
  const engineMod = await import('@t2000/engine');
  const importMs = performance.now() - importStart;

  // Construct a QueryEngine with default tools and a stub provider that
  // implements the minimum LLMProvider surface (a single `chat()` async
  // generator). We're measuring the constructor cost, not a round-trip —
  // the network never opens because we never call `submitMessage`.
  const constructStart = performance.now();
  const stubProvider: import('@t2000/engine').LLMProvider = {
    // eslint-disable-next-line require-yield
    async *chat() {
      // Never invoked — benchmark only constructs, never calls submitMessage.
      throw new Error('benchmark stub provider should never be invoked');
    },
  };

  // QueryEngine config requires `provider`, accepts optional `tools`. We
  // pull defaults from the engine exports so the benchmark stays in sync
  // with the production tool registry.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _engine = new engineMod.QueryEngine({
    provider: stubProvider,
    tools: engineMod.getDefaultTools(),
  });
  const constructMs = performance.now() - constructStart;

  const result: BenchmarkResult = {
    version: pkg.version,
    node: process.versions.node,
    platform: process.platform,
    importMs: Number(importMs.toFixed(2)),
    constructMs: Number(constructMs.toFixed(2)),
    totalMs: Number((importMs + constructMs).toFixed(2)),
    samples: 1,
    timestamp: new Date().toISOString(),
  };
  return result;
}

main()
  .then((result) => {
    // JSON to stdout — CI captures this, grep-able from logs.
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error('benchmark-cold-start failed:', err);
    process.exit(1);
  });
