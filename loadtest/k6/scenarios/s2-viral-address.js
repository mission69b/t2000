/**
 * S2 — Burst at viral/whale address
 *
 * Spec: 200 concurrent VUs all requesting portfolio for the SAME address.
 * Pass: cross-instance lock holds — BV calls < 50/min for that address.
 *
 * What we're validating: with the Upstash `SET NX EX 10` fetch lock (PR 2),
 * only one Vercel instance fans out to BlockVision per address per 10s.
 * Without it, 200 concurrent → 200 × 9 DeFi calls = 1,800 BV calls/min.
 * With it: ~6 BV calls per 10s window × 6 windows = ~36/min. Well under 50.
 *
 * Default (VU_SCALE=0.1): 20 VUs — good enough to see coalescing work.
 * Full (VU_SCALE=1.0): 200 VUs.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, TEST_ADDRESS, authHeaders, THRESHOLDS, VU_SCALE } from '../../config.js';

const portfolioLatency  = new Trend('portfolio_latency_ms', true);
const cacheHitRate      = new Rate('portfolio_cache_hit');
const portfolioErrors   = new Counter('portfolio_errors');

const PEAK_VUS = Math.max(1, Math.round(200 * VU_SCALE));

export const options = {
  stages: [
    { duration: '15s', target: PEAK_VUS },
    { duration: '2m',  target: PEAK_VUS },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    portfolio_latency_ms: ['p(95)<3000'],
    http_req_failed:      ['rate<0.01'],
  },
};

export default function () {
  const start = Date.now();

  // All VUs hit /api/portfolio for the EXACT same address — worst case for BV burst
  const res = http.get(
    `${BASE_URL}/api/portfolio?address=${TEST_ADDRESS}`,
    { headers: authHeaders(), timeout: '15s' },
  );
  const elapsed = Date.now() - start;

  portfolioLatency.add(elapsed);

  // Heuristic: fast responses (< 300ms) very likely came from Upstash cache
  const likelyCacheHit = elapsed < 300;
  cacheHitRate.add(likelyCacheHit);

  const ok = check(res, {
    'status 200':             (r) => r.status === 200,
    'has walletValueUsd':     (r) => r.body && r.body.includes('walletValueUsd'),
    'latency under 3s':       () => elapsed < 3000,
  });

  if (!ok || res.status !== 200) {
    portfolioErrors.add(1);
  }

  sleep(0.1); // tight loop — simulates concurrent whale-watchers
}

export function handleSummary(data) {
  const p95       = data.metrics.portfolio_latency_ms?.values?.['p(95)'] ?? 'N/A';
  const cacheRate = data.metrics.portfolio_cache_hit?.values?.rate ?? 0;
  const reqs      = data.metrics.http_reqs?.values?.count ?? 0;
  const duration  = data.state?.testRunDurationMs ?? 135_000;
  const bvCallEstimate = reqs * (1 - cacheRate); // uncached calls → each hits BV

  console.log('\n=== S2 VIRAL ADDRESS RESULT ===');
  console.log(`p95 portfolio latency : ${p95}ms`);
  console.log(`Cache hit rate        : ${(cacheRate * 100).toFixed(1)}%  (higher = lock working)`);
  console.log(`Est. BV calls/min     : ${(bvCallEstimate / (duration / 60_000)).toFixed(0)}  (pass < ${THRESHOLDS.bvCallsPerMin}: ${(bvCallEstimate / (duration / 60_000)) < THRESHOLDS.bvCallsPerMin ? '✅' : '❌'})`);
  console.log(`Peak VUs              : ${PEAK_VUS}`);

  return {
    'reports/s2-summary.json': JSON.stringify(data, null, 2),
  };
}
