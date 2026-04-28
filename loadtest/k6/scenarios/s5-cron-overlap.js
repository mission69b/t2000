/**
 * S5 — Daily cron triggered during live load (S1 overlap)
 *
 * Spec: Trigger the financial-context-snapshot cron while S1 is running.
 * Pass: All shards finish < 60s; chat p95 unaffected (still < 4s).
 *
 * Run this scenario ALONGSIDE S1 in a second terminal:
 *   Terminal 1: k6 run s1-steady-read.js   (keeps load going)
 *   Terminal 2: k6 run s5-cron-overlap.js  (triggers cron + measures shard time)
 *
 * The scenario:
 *   1. POSTs to /api/internal/financial-context-snapshot with shard=0&total=1
 *      (single-shard run so we can time the full thing).
 *   2. Measures how long the shard takes to process.
 *   3. After the cron, re-measures chat latency to confirm it wasn't impacted.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import {
  BASE_URL, TEST_ADDRESS, authHeaders, internalHeaders, THRESHOLDS,
} from '../../config.js';

const shardDuration = new Trend('s5_shard_duration_ms', true);
const postCronChat  = new Trend('s5_post_cron_chat_ms', true);

export const options = {
  // Single VU — this is a control-plane action, not a load driver
  vus: 1,
  iterations: 1,
  thresholds: {
    s5_shard_duration_ms: [`max<${THRESHOLDS.shardMaxMs}`],  // all shards < 60s
    s5_post_cron_chat_ms: [`p(95)<${THRESHOLDS.chatP95Ms}`], // chat p95 unaffected
  },
};

export default function () {
  console.log('S5: Triggering financial-context-snapshot cron (single shard)…');

  // Trigger cron — process all users in shard 0 of 1 (= all users)
  const cronStart = Date.now();
  const cronRes = http.post(
    `${BASE_URL}/api/internal/financial-context-snapshot?shard=0&total=1`,
    '{}',
    { headers: internalHeaders(), timeout: '120s' },
  );
  const cronMs = Date.now() - cronStart;
  shardDuration.add(cronMs);

  const cronBody = (() => { try { return JSON.parse(cronRes.body); } catch { return {}; } })();

  check(cronRes, {
    'cron: status 200':          (r) => r.status === 200,
    'cron: finished < 60s':      () => cronMs < THRESHOLDS.shardMaxMs,
    'cron: users processed > 0': () => (cronBody.total ?? 0) > 0,
    'cron: no errors':           () => (cronBody.errors ?? 0) === 0,
  });

  console.log(`S5: Cron shard finished in ${cronMs}ms`);
  console.log(`    Users: ${cronBody.total ?? '?'}, Created: ${cronBody.created ?? '?'}, Errors: ${cronBody.errors ?? '?'}`);

  // Immediately fire 5 chat turns to check latency isn't impacted
  console.log('S5: Measuring post-cron chat latency (5 turns)…');
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/engine/chat`,
      JSON.stringify({ message: "What's my balance?", address: TEST_ADDRESS }),
      { headers: authHeaders(), timeout: '30s' },
    );
    const ms = Date.now() - start;
    postCronChat.add(ms);

    check(res, {
      'post-cron: chat OK':      (r) => r.status === 200,
      'post-cron: p95 under 4s': () => ms < THRESHOLDS.chatP95Ms,
    });
    sleep(0.5);
  }
}

export function handleSummary(data) {
  const shardMs = data.metrics.s5_shard_duration_ms?.values?.max   ?? 'N/A';
  const chatP95 = data.metrics.s5_post_cron_chat_ms?.values?.['p(95)'] ?? 'N/A';

  console.log('\n=== S5 CRON OVERLAP RESULT ===');
  console.log(`Cron shard duration  : ${shardMs}ms  (pass < ${THRESHOLDS.shardMaxMs}ms: ${shardMs < THRESHOLDS.shardMaxMs ? '✅' : '❌'})`);
  console.log(`Post-cron chat p95   : ${chatP95}ms   (pass < ${THRESHOLDS.chatP95Ms}ms: ${chatP95 < THRESHOLDS.chatP95Ms ? '✅' : '❌'})`);

  return {
    'reports/s5-summary.json': JSON.stringify(data, null, 2),
  };
}
