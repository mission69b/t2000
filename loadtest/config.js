/**
 * Audric load test configuration.
 *
 * Copy .env.loadtest.example → .env.loadtest and fill in before running.
 * All values can also be overridden via k6 --env flags:
 *   k6 run --env BASE_URL=https://audric.ai s1-steady-read.js
 */

export const BASE_URL      = __ENV.BASE_URL      || 'https://audric.ai';
export const TEST_JWT      = __ENV.TEST_JWT       || '';   // Required: Audric session JWT for a test user
export const TEST_ADDRESS  = __ENV.TEST_ADDRESS   || '';   // Required: Sui address of the test user
export const INTERNAL_KEY  = __ENV.INTERNAL_KEY   || '';   // Required for S5: T2000_INTERNAL_KEY value

// VU multiplier — set to 0.1 for local smoke runs (10% of spec VUs, much faster)
// Set to 1.0 for full spec runs (k6 Cloud recommended at 1.0)
export const VU_SCALE = parseFloat(__ENV.VU_SCALE || '0.1');

export function authHeaders() {
  return {
    'x-zklogin-jwt': TEST_JWT,
    'Content-Type': 'application/json',
  };
}

export function internalHeaders() {
  return {
    'x-internal-key': INTERNAL_KEY,
    'Content-Type': 'application/json',
  };
}

// Pass criteria from spec (used in check() assertions)
export const THRESHOLDS = {
  chatP95Ms:     4_000,  // p95 chat-turn < 4s
  bvCallsPerMin: 50,     // BV calls < 50/min for a hot address (S2)
  shardMaxMs:    60_000, // All cron shards finish < 60s (S5)
};
