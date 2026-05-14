/**
 * pay.test.ts — drift-pin tests for the `pay_api` tool description.
 *
 * The description is load-bearing prompt text that teaches the LLM how
 * to interpret pay_api results across the locked failure-mode contract:
 *
 *   - "paymentConfirmed": true | "doNotRetry": true → ALREADY charged, never retry.
 *   - "paymentConfirmed": false + status 402         → SPEC 26 refundable verdict;
 *                                                       free retry allowed (D-8).
 *
 * Both signals are critical. A silent edit to either paragraph would
 * regress real user behavior (LLM either burns money on retries or
 * fails to retry when retry would have cost the user nothing). These
 * tests pin the canonical wording so the contract can't drift unnoticed.
 *
 * The D-8 wording is locked verbatim in
 * `spec/SPEC_26_MPP_SETTLE_ON_SUCCESS.md` (Status section, top of file)
 * AND in §3 D-8. The two MUST stay in sync — if either diverges from
 * this test's expected substrings, fix the spec or fix the tool, do
 * not silently update the test.
 */
import { describe, it, expect } from 'vitest';

import { payApiTool } from './pay';

describe('payApiTool description — locked failure-mode contract', () => {
  it('pins the SPEC 24 non-retryable rule (existing contract — guards against accidental removal)', () => {
    expect(payApiTool.description).toContain('"paymentConfirmed": true');
    expect(payApiTool.description).toContain('"doNotRetry": true');
    expect(payApiTool.description).toContain('NEVER call pay_api again');
    expect(payApiTool.description).toContain('ALREADY been charged');
  });

  it('pins the SPEC 26 D-8 retryable signal (free retry on 402 + paymentConfirmed: false + settleVerdict)', () => {
    expect(payApiTool.description).toContain('"paymentConfirmed": false');
    expect(payApiTool.description).toContain('"status": 402');
    expect(payApiTool.description).toContain('"settleVerdict"');
    expect(payApiTool.description).toContain('NOT charged');
    expect(payApiTool.description).toContain('Each retry-after-no-charge is free');
  });

  it('pins the D-8 transient-vs-correctable retry guidance with concrete examples', () => {
    expect(payApiTool.description).toContain('"settleReason"');
    expect(payApiTool.description).toContain('transient');
    expect(payApiTool.description).toContain('correctable');
    // Concrete reason strings the LLM is likely to see — pin so renaming
    // the gateway error labels can't silently break the matcher logic.
    expect(payApiTool.description).toContain('rate-limit');
    expect(payApiTool.description).toContain('invalid model');
  });

  it('pins the D-8 settleVerdict enumeration (refundable vs charge-failed)', () => {
    expect(payApiTool.description).toContain('"refundable"');
    expect(payApiTool.description).toContain('"charge-failed"');
  });

  it('keeps the non-retryable + retryable paragraphs in the canonical order (non-retry first, retry second)', () => {
    const description = payApiTool.description;
    const nonRetryIndex = description.indexOf('NEVER call pay_api again');
    const retryIndex = description.indexOf('Each retry-after-no-charge is free');
    expect(nonRetryIndex).toBeGreaterThan(0);
    expect(retryIndex).toBeGreaterThan(nonRetryIndex);
  });
});

// SPEC 30 Phase 1B.5 — 2026-05-14
// Regression tests for the host-validation bypass that CodeQL alert #24
// (`js/incomplete-url-substring-sanitization`) flagged. The previous check
// `input.url.startsWith(MPP_GATEWAY)` accepted attacker-crafted URLs like
// `https://mpp.t2000.ai.evil.com/...` which prefix-match but resolve to a
// non-MPP host. Real exploit vector for `pay_api` because it charges USDC
// against whatever host actually receives the request. These tests assert
// the bypass closes (and legitimate URLs still pass).
describe('payApiTool preflight — URL host validation (CodeQL #24 regression)', () => {
  it('accepts the canonical https://mpp.t2000.ai/{path} URL', () => {
    const result = payApiTool.preflight!({
      url: 'https://mpp.t2000.ai/openai/v1/images/generations',
    });
    expect(result).toEqual({ valid: true });
  });

  it('REJECTS the substring-bypass attack (mpp.t2000.ai.evil.com)', () => {
    const result = payApiTool.preflight!({
      url: 'https://mpp.t2000.ai.evil.com/openai/v1/images/generations',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/must be on https:\/\/mpp\.t2000\.ai/);
  });

  it('REJECTS userinfo@ injection (https://mpp.t2000.ai@evil.com)', () => {
    const result = payApiTool.preflight!({
      url: 'https://mpp.t2000.ai@evil.com/openai/v1/images/generations',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/must be on https:\/\/mpp\.t2000\.ai/);
  });

  it('REJECTS http:// (downgrade attack)', () => {
    const result = payApiTool.preflight!({
      url: 'http://mpp.t2000.ai/openai/v1/images/generations',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/must be on https:\/\/mpp\.t2000\.ai/);
  });

  it('REJECTS unparseable garbage', () => {
    const result = payApiTool.preflight!({
      url: 'not a url',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Invalid URL/);
  });

  it('REJECTS subdomain spoofing (api.mpp.t2000.ai)', () => {
    const result = payApiTool.preflight!({
      url: 'https://api.mpp.t2000.ai/openai/v1/images/generations',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/must be on https:\/\/mpp\.t2000\.ai/);
  });
});
