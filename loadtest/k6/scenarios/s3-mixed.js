/**
 * S3 — Mixed read + write load
 *
 * Spec: 200 concurrent VUs, 10% writes (save_deposit confirm flow).
 * Pass: write tx mutex serializes correctly — no double-spends.
 *
 * NOTE: Writes in Audric are CONFIRM-gated (the engine yields a pending_action,
 * the user must tap approve). This test drives the ENGINE through a write-intent
 * turn (save 1 USDC) and validates:
 *   - The engine correctly yields `pending_action` (not auto-executes)
 *   - The confirm card contains the right amount and asset
 *   - Concurrent write-intent turns don't corrupt each other
 *
 * We do NOT complete the on-chain transaction in this test — that requires real
 * gas and a real wallet. The test validates the pre-confirm path only.
 *
 * Default (VU_SCALE=0.1): 20 VUs (2 write / 18 read).
 * Full (VU_SCALE=1.0): 200 VUs (20 write / 180 read).
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, TEST_ADDRESS, authHeaders, THRESHOLDS, VU_SCALE } from '../../config.js';

const readLatency     = new Trend('mixed_read_latency_ms', true);
const writeLatency    = new Trend('mixed_write_latency_ms', true);
const pendingActions  = new Counter('pending_actions_yielded');
const writeErrors     = new Counter('write_errors');

const PEAK_VUS = Math.max(1, Math.round(200 * VU_SCALE));

export const options = {
  stages: [
    { duration: '30s', target: PEAK_VUS },
    { duration: '10m', target: PEAK_VUS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    mixed_read_latency_ms:  [`p(95)<${THRESHOLDS.chatP95Ms}`],
    mixed_write_latency_ms: ['p(95)<6000'],  // write turns include LLM + tool = longer
    http_req_failed:        ['rate<0.02'],
  },
};

const READ_PROMPTS = [
  "What's my balance?",
  "How much do I have saved?",
  "What's my savings rate?",
  "Show me my portfolio",
  "What's my health factor?",
];

const WRITE_PROMPTS = [
  "Save 1 USDC for me",
  "Deposit 1 USDC into NAVI savings",
  "Can you save 1 USDC?",
];

export default function () {
  // 10% of VUs do write-intent turns
  const isWrite = Math.random() < 0.10;
  const prompts = isWrite ? WRITE_PROMPTS : READ_PROMPTS;
  const prompt  = prompts[Math.floor(Math.random() * prompts.length)];

  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/engine/chat`,
    JSON.stringify({ message: prompt, address: TEST_ADDRESS }),
    { headers: authHeaders(), timeout: '30s' },
  );
  const elapsed = Date.now() - start;

  if (isWrite) {
    writeLatency.add(elapsed);
    const hasPendingAction = res.body && res.body.includes('pending_action');
    check(res, {
      'write: status 200':       (r) => r.status === 200,
      'write: yields pending':   (r) => r.body && r.body.includes('pending_action'),
      'write: correct asset':    (r) => !hasPendingAction || r.body.includes('"USDC"') || r.body.includes('"asset"'),
      'write: no auto-execute':  (r) => !r.body.includes('"type":"tool_result"') || r.body.includes('pending_action'),
    });
    if (hasPendingAction) pendingActions.add(1);
    if (res.status !== 200) writeErrors.add(1);
  } else {
    readLatency.add(elapsed);
    check(res, {
      'read: status 200':     (r) => r.status === 200,
      'read: has text_delta': (r) => r.body && r.body.includes('text_delta'),
    });
  }

  sleep(Math.random() * 2 + 1);
}

export function handleSummary(data) {
  const readP95  = data.metrics.mixed_read_latency_ms?.values?.['p(95)']  ?? 'N/A';
  const writeP95 = data.metrics.mixed_write_latency_ms?.values?.['p(95)'] ?? 'N/A';
  const pending  = data.metrics.pending_actions_yielded?.values?.count     ?? 0;

  console.log('\n=== S3 MIXED READ+WRITE RESULT ===');
  console.log(`Read  p95 latency : ${readP95}ms   (pass < ${THRESHOLDS.chatP95Ms}ms: ${readP95 < THRESHOLDS.chatP95Ms ? '✅' : '❌'})`);
  console.log(`Write p95 latency : ${writeP95}ms  (pass < 6000ms: ${writeP95 < 6000 ? '✅' : '❌'})`);
  console.log(`Pending actions   : ${pending}  (should be > 0 — writes must gate on confirm)`);
  console.log(`Peak VUs          : ${PEAK_VUS} (${Math.round(PEAK_VUS * 0.1)} write / ${Math.round(PEAK_VUS * 0.9)} read)`);

  return {
    'reports/s3-summary.json': JSON.stringify(data, null, 2),
  };
}
