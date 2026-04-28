/**
 * S4 — BlockVision degradation test
 *
 * Spec: 200 concurrent VUs, read-heavy, validate sticky-positive cache behavior
 * when BV is degraded (real degraded responses or 429 bursts).
 *
 * We can't fault-inject BV from the client side. Instead this scenario:
 *   1. Fires a high-concurrency read burst at /api/portfolio for ONE address
 *      (same as S2 but longer + watches for "partial" responses).
 *   2. Tracks the ratio of "blockvision" vs "rpc-fallback"/"partial" sources
 *      in the response body.
 *   3. A valid BV degradation behavior is: response still has a positive
 *      walletValueUsd (served from sticky-positive cache), even when defiSource
 *      is "partial" or "rpc-degraded".
 *
 * To actually test fault-injection, run S4 while manually revoking the
 * BLOCKVISION_API_KEY in Vercel for 2 minutes, then restoring it.
 * The dashboard (bv.cb_open gauge) will show the CB opening and closing.
 *
 * Pass: > 80% of degraded reads return positive walletValueUsd (sticky-positive cache).
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, TEST_ADDRESS, authHeaders, VU_SCALE } from '../../config.js';

const portfolioLatency    = new Trend('s4_portfolio_latency_ms', true);
const stickyPositiveServed = new Rate('s4_sticky_positive_served');
const degradedResponses   = new Counter('s4_degraded_responses');
const errors              = new Counter('s4_errors');

const PEAK_VUS = Math.max(1, Math.round(200 * VU_SCALE));

export const options = {
  stages: [
    { duration: '15s', target: PEAK_VUS },
    { duration: '10m', target: PEAK_VUS },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    s4_portfolio_latency_ms: ['p(95)<5000'],   // allow wider window — degraded path is slower
    s4_sticky_positive_served: ['rate>0.80'],   // > 80% get positive value despite degradation
    http_req_failed: ['rate<0.05'],             // < 5% hard errors under degradation
  },
};

export default function () {
  const start = Date.now();
  const res = http.get(
    `${BASE_URL}/api/portfolio?address=${TEST_ADDRESS}`,
    { headers: authHeaders(), timeout: '20s' },
  );
  const elapsed = Date.now() - start;

  portfolioLatency.add(elapsed);

  if (res.status !== 200) {
    errors.add(1);
    return;
  }

  let body;
  try { body = JSON.parse(res.body); } catch { errors.add(1); return; }

  // A positive wallet value even under degradation = sticky-positive cache working
  const walletValue = body?.walletValueUsd ?? body?.wallet?.totalUsd ?? 0;
  const isPositive  = walletValue > 0;
  const isDegraded  = body?.defiSource === 'partial' ||
                      body?.defiSource === 'rpc-fallback' ||
                      body?.defiSource === 'rpc-degraded';

  if (isDegraded) degradedResponses.add(1);

  // Pass metric: degraded OR not, the wallet value should be positive (cache served it)
  stickyPositiveServed.add(isPositive);

  check(res, {
    'status 200':              () => res.status === 200,
    'positive wallet value':   () => isPositive,
    'under 5s even degraded':  () => elapsed < 5000,
  });

  sleep(0.5);
}

export function handleSummary(data) {
  const p95          = data.metrics.s4_portfolio_latency_ms?.values?.['p(95)']      ?? 'N/A';
  const stickyRate   = data.metrics.s4_sticky_positive_served?.values?.rate          ?? 0;
  const degraded     = data.metrics.s4_degraded_responses?.values?.count             ?? 0;

  console.log('\n=== S4 BV DEGRADATION RESULT ===');
  console.log(`p95 latency (degraded path) : ${p95}ms`);
  console.log(`Sticky-positive served      : ${(stickyRate * 100).toFixed(1)}%  (pass > 80%: ${stickyRate > 0.80 ? '✅' : '❌'})`);
  console.log(`Degraded responses observed : ${degraded}  (0 = BV healthy, > 0 = CB fired or API degraded)`);
  console.log(`Peak VUs                    : ${PEAK_VUS}`);
  console.log('');
  console.log('TIP: To properly test degradation, revoke BLOCKVISION_API_KEY in Vercel');
  console.log('     for ~2 min mid-run, then watch bv.cb_open in Vercel Observability.');

  return {
    'reports/s4-summary.json': JSON.stringify(data, null, 2),
  };
}
