import { describe, expect, it } from 'vitest';
import { createServe, createServeFromEnv, DEFAULT_ACTIVITY_REPORT_URL } from './serve.js';

const PAY_TO = '0x' + 'ab'.repeat(32);

// B2 default-on (createServeFromEnv ONLY): new template/env sellers appear
// on the t2000.ai activity tape without a hidden env knack; explicit code
// construction stays silent unless opted in.
describe('createServeFromEnv — activity report URL resolution', () => {
  it('defaults to the t2000.ai report URL when the env key is missing', () => {
    const serve = createServeFromEnv({ T2000_PAY_TO: PAY_TO });
    expect(serve.activityReportUrl).toBe(DEFAULT_ACTIVITY_REPORT_URL);
    expect(DEFAULT_ACTIVITY_REPORT_URL).toBe('https://t2000.ai/api/activity/x402');
  });

  it('empty string (Vercel empty-env class) re-defaults, same as unset', () => {
    const serve = createServeFromEnv({
      T2000_PAY_TO: PAY_TO,
      T2000_ACTIVITY_REPORT_URL: '  ',
    });
    expect(serve.activityReportUrl).toBe(DEFAULT_ACTIVITY_REPORT_URL);
  });

  it.each(['false', 'off', '0', 'none', 'FALSE', 'Off'])(
    'opt-out token %s → no report',
    (token) => {
      const serve = createServeFromEnv({
        T2000_PAY_TO: PAY_TO,
        T2000_ACTIVITY_REPORT_URL: token,
      });
      expect(serve.activityReportUrl).toBeUndefined();
    },
  );

  it('a custom URL is used verbatim', () => {
    const serve = createServeFromEnv({
      T2000_PAY_TO: PAY_TO,
      T2000_ACTIVITY_REPORT_URL: 'https://example.test/report',
    });
    expect(serve.activityReportUrl).toBe('https://example.test/report');
  });

  it('code-constructed Serve without activityReportUrl stays silent', () => {
    const serve = createServe({ payTo: PAY_TO });
    expect(serve.activityReportUrl).toBeUndefined();
  });
});
