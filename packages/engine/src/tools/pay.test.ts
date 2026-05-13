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

  it('pins the SPEC 26 D-8 retryable signal (free retry on 402 + paymentConfirmed: false)', () => {
    expect(payApiTool.description).toContain('"paymentConfirmed": false');
    expect(payApiTool.description).toContain('status is 402');
    expect(payApiTool.description).toContain('NOT charged');
    expect(payApiTool.description).toContain('Each retry-after-no-charge is free');
  });

  it('pins the D-8 transient-vs-correctable retry guidance', () => {
    expect(payApiTool.description).toContain('settleReason');
    expect(payApiTool.description).toContain('transient');
    expect(payApiTool.description).toContain('correction');
  });

  it('keeps the non-retryable + retryable paragraphs in the canonical order (non-retry first, retry second)', () => {
    const description = payApiTool.description;
    const nonRetryIndex = description.indexOf('NEVER call pay_api again');
    const retryIndex = description.indexOf('Each retry-after-no-charge is free');
    expect(nonRetryIndex).toBeGreaterThan(0);
    expect(retryIndex).toBeGreaterThan(nonRetryIndex);
  });
});
