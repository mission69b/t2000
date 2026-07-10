import { describe, expect, it } from 'vitest';
import { isSafeUpstreamUrl, uptoSettlement } from './commerce';

// $0.10 authorized max for the cases below.
const MAX = 100_000;

describe('uptoSettlement (sui-upto, Mechanism A)', () => {
  it('no report → exact: charge the full authorized max, no refund', () => {
    const s = uptoSettlement(MAX, null);
    expect(s.actualMicros).toBe(MAX);
    expect(s.refundMicros).toBe(0);
    expect(s.feeMicros).toBe(2500); // 2.5%
    expect(s.netMicros).toBe(97_500);
  });

  it('actual < max → charge actual, refund the excess, fee on actual', () => {
    const s = uptoSettlement(MAX, 50_000);
    expect(s.actualMicros).toBe(50_000);
    expect(s.refundMicros).toBe(50_000);
    expect(s.feeMicros).toBe(1250);
    expect(s.netMicros).toBe(48_750);
  });

  it('reported above max → clamped to the authorized max', () => {
    const s = uptoSettlement(MAX, 200_000);
    expect(s.actualMicros).toBe(MAX);
    expect(s.refundMicros).toBe(0);
  });

  it('reported below the min billable → floored so net clears the gasless min', () => {
    const s = uptoSettlement(MAX, 1000);
    expect(s.actualMicros).toBe(10_300);
    expect(s.netMicros).toBeGreaterThanOrEqual(10_000); // gasless floor
    expect(s.refundMicros).toBe(MAX - 10_300);
  });

  it('sub-dust savings → no refund tx, charge the full max (exact)', () => {
    const s = uptoSettlement(MAX, 98_000); // would refund only $0.002
    expect(s.refundMicros).toBe(0);
    expect(s.actualMicros).toBe(MAX);
  });

  it('refund + net + fee never exceed what was collected', () => {
    for (const report of [null, 1, 25_000, 60_000, 99_999, 250_000]) {
      const s = uptoSettlement(MAX, report);
      // Treasury collected MAX; pays out refund + net, keeps fee.
      expect(s.refundMicros + s.netMicros + s.feeMicros).toBe(MAX);
    }
  });
});

describe('isSafeUpstreamUrl (delivery-endpoint SSRF guard)', () => {
  it('accepts a normal https endpoint', () => {
    expect(isSafeUpstreamUrl('https://api.example.com/v1/data')).toBe(true);
  });

  it('rejects non-https and unparseable URLs', () => {
    expect(isSafeUpstreamUrl('http://api.example.com')).toBe(false);
    expect(isSafeUpstreamUrl('not a url')).toBe(false);
  });

  it('rejects loopback + private ranges', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '10.1.2.3',
      '192.168.0.9',
      '169.254.0.1',
      '172.16.0.1',
      'foo.local',
    ]) {
      expect(isSafeUpstreamUrl(`https://${host}/x`)).toBe(false);
    }
  });

  it('rejects our own rail/gateway hosts (settlement recursion)', () => {
    expect(isSafeUpstreamUrl('https://mpp.t2000.ai/commerce/pay/0xabc')).toBe(false);
    expect(isSafeUpstreamUrl('https://x402.t2000.ai/anything')).toBe(false);
  });
});
