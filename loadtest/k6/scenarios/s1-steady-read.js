/**
 * S1 — Steady read load
 *
 * Spec: 100 → 500 VU ramp over 5 min, hold 15 min.
 * Pass: p95 chat-turn < 4s, BV CB stays closed (no "cb_open" in logs).
 *
 * Default (VU_SCALE=0.1): 10 → 50 VU ramp — runs in ~3 min. Good for local.
 * Full (VU_SCALE=1.0):    100 → 500 VU — use k6 Cloud.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL, TEST_ADDRESS, authHeaders, THRESHOLDS, VU_SCALE } from '../../config.js';

const chatLatency    = new Trend('chat_latency_ms', true);
const chatErrors     = new Counter('chat_errors');
const chatSuccesses  = new Counter('chat_successes');

const RAMP_VUS    = Math.max(1, Math.round(100 * VU_SCALE));
const TARGET_VUS  = Math.max(1, Math.round(500 * VU_SCALE));
const RAMP_MINS   = VU_SCALE < 0.5 ? 1 : 5;
const HOLD_MINS   = VU_SCALE < 0.5 ? 2 : 15;

// [PR 6 — local-IP rate cap] Vercel WAF caps POST-to-chat requests
// from a single IP at ~10/sec. Beyond that, we get 4xx that look like
// app-level failures but are actually edge-tier rate limits. For
// laptop-driven tests, keep total req rate < 8/sec by capping VUs and
// inflating sleep think time when VU_SCALE is low. k6 Cloud (multi-IP)
// or a load generator behind a proxy pool would skip this constraint.

export const options = {
  stages: [
    { duration: `${RAMP_MINS}m`, target: RAMP_VUS },
    { duration: `1m`,            target: TARGET_VUS },
    { duration: `${HOLD_MINS}m`, target: TARGET_VUS },
    { duration: '30s',           target: 0 },
  ],
  thresholds: {
    chat_latency_ms: [`p(95)<${THRESHOLDS.chatP95Ms}`],
    http_req_failed: ['rate<0.02'],   // < 2% hard errors
  },
};

// Rotate prompts to avoid exact cache hits while keeping reads realistic
const PROMPTS = [
  "What's my balance?",
  "How much do I have saved?",
  "What's my health factor?",
  "Show me my savings rate",
  "What can I do with my USDC?",
  "How much is in my wallet?",
  "What's my current APY?",
  "Show me my portfolio",
];

// [PR 6 — load-test session sharing] Audric throttles new sessions per
// 24h window (5 unverified, 20 verified). Without a shared sessionId,
// every k6 iteration creates a new session and we 429 instantly. All
// VUs share one sessionId — measures latency + tool dispatch under
// concurrent load (read-only, no write contention) without burning
// the rate limiter.
const SHARED_SESSION_ID = __ENV.SHARED_SESSION_ID || `loadtest-s1-${Date.now()}`;

export default function () {
  const prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];

  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/engine/chat`,
    JSON.stringify({
      message: prompt,
      address: TEST_ADDRESS,
      sessionId: SHARED_SESSION_ID,
    }),
    { headers: authHeaders(), timeout: '30s' },
  );
  const elapsed = Date.now() - start;

  chatLatency.add(elapsed);

  const ok = check(res, {
    'status 200':        (r) => r.status === 200,
    'has text delta':    (r) => r.body && r.body.includes('text_delta'),
    'p95 under 4s':      () => elapsed < THRESHOLDS.chatP95Ms,
    'no CB open signal': (r) => r.body && !r.body.includes('"cb_open":1'),
  });

  if (res.status !== 200) {
    chatErrors.add(1);
  } else {
    chatSuccesses.add(1);
  }

  // [PR 6 — Audric per-IP throttle] /api/engine/chat is rate-limited
  // to 20 req/min per IP (lib/rate-limit.ts). 1 req every 4s (15/min)
  // stays under the cap from a single laptop. k6 Cloud (multi-IP) or
  // a proxy pool would let us crank this back to 1–3s.
  sleep(Math.random() * 2 + 4);
}

export function handleSummary(data) {
  const p95 = data.metrics.chat_latency_ms?.values?.['p(95)'] ?? 'N/A';
  const errRate = data.metrics.http_req_failed?.values?.rate ?? 0;

  console.log('\n=== S1 STEADY READ RESULT ===');
  console.log(`p95 chat latency : ${p95}ms  (pass < ${THRESHOLDS.chatP95Ms}ms: ${p95 < THRESHOLDS.chatP95Ms ? '✅' : '❌'})`);
  console.log(`Error rate       : ${(errRate * 100).toFixed(2)}%  (pass < 2%: ${errRate < 0.02 ? '✅' : '❌'})`);
  console.log(`VU scale         : ${VU_SCALE} (${TARGET_VUS} peak VUs)`);

  return {
    'reports/s1-summary.json': JSON.stringify(data, null, 2),
  };
}
