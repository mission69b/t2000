import { describe, expect, it } from 'vitest';
import { parseXPostUrl, syndicationToken } from './x-proof';

describe('parseXPostUrl', () => {
  it('accepts x.com and twitter.com status URLs', () => {
    expect(parseXPostUrl('https://x.com/jack/status/20')).toBe('20');
    expect(parseXPostUrl('https://twitter.com/jack/status/20')).toBe('20');
    expect(
      parseXPostUrl('https://x.com/some_user/status/1808001234567890123?s=20'),
    ).toBe('1808001234567890123');
    expect(parseXPostUrl('  https://x.com/a_b/statuses/12345678 ')).toBe(
      '12345678',
    );
  });

  it('rejects non-status URLs and junk', () => {
    expect(parseXPostUrl('https://x.com/jack')).toBeNull();
    expect(parseXPostUrl('https://example.com/x.com/jack/status/20')).toBeNull();
    expect(parseXPostUrl('https://fakex.com/jack/status/20')).toBeNull();
    expect(parseXPostUrl('rcpt-abc')).toBeNull();
    expect(parseXPostUrl('')).toBeNull();
  });
});

describe('syndicationToken', () => {
  it('matches the react-tweet derivation for a known id', () => {
    // Verified live against cdn.syndication.twimg.com for id 20 (the CDN is
    // currently lenient about the token, but we send the canonical value).
    expect(syndicationToken('20')).toBe('6dq1a2xwd93');
    expect(syndicationToken('1808001234567890123')).toMatch(/^[a-z0-9]+$/);
  });
});
