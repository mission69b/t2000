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

export default function () {
  const prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];

  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/engine/chat`,
    JSON.stringify({
      message: prompt,
      address: TEST_ADDRESS,
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

  if (!ok || res.status !== 200) {
    chatErrors.add(1);
  } else {
    chatSuccesses.add(1);
  }

  sleep(Math.random() * 2 + 1); // 1–3s think time between turns
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
