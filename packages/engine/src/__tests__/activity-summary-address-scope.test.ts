import { describe, it, expect, vi, beforeEach } from 'vitest';
import { activitySummaryTool } from '../tools/activity-summary.js';

/**
 * [v0.49] Regression suite for address-scoped activity_summary.
 *
 * Pre-v0.49 the tool only ever queried `context.walletAddress`. v0.49
 * relays an optional `input.address` to the audric API as the `address`
 * query param. The signed-in user's address is sent as the
 * `x-sui-address` header (auth caller), separate from the read target.
 */

const USER_ADDR = `0x${'a'.repeat(64)}`;
const FUNKII_ADDR = `0x${'b'.repeat(64)}`;
const API_URL = 'https://internal.example';

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function ctx(wallet: string | undefined = USER_ADDR) {
  return {
    walletAddress: wallet,
    env: { AUDRIC_INTERNAL_API_URL: API_URL },
    signal: undefined,
  } as Parameters<typeof activitySummaryTool.call>[1];
}

describe('[v0.49] activity_summary address scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(
      jsonResponse({
        period: 'month',
        totalTransactions: 5,
        byAction: [{ action: 'send', count: 3, totalAmountUsd: 100 }],
        totalMovedUsd: 100,
        netSavingsUsd: 0,
        yieldEarnedUsd: 0,
      }),
    );
  });

  it('defaults to context.walletAddress when input.address is omitted', async () => {
    const res = await activitySummaryTool.call({}, ctx());
    expect(res.data.address).toBe(USER_ADDR);
    expect(res.data.isSelfQuery).toBe(true);
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain(`address=${USER_ADDR}`);
  });

  it('honors explicit input.address (the fix)', async () => {
    const res = await activitySummaryTool.call({ address: FUNKII_ADDR }, ctx());
    expect(res.data.address).toBe(FUNKII_ADDR);
    expect(res.data.isSelfQuery).toBe(false);
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain(`address=${FUNKII_ADDR}`);
    expect(url).not.toContain(`address=${USER_ADDR}`);
  });

  it('sends the signed-in user as x-sui-address (auth caller) even for non-self queries', async () => {
    await activitySummaryTool.call({ address: FUNKII_ADDR }, ctx());
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-sui-address']).toBe(USER_ADDR);
  });

  it('case-insensitive equality decides isSelfQuery', async () => {
    const res = await activitySummaryTool.call(
      { address: USER_ADDR.toUpperCase() },
      ctx(),
    );
    expect(res.data.isSelfQuery).toBe(true);
  });

  it('prefixes the displayText with a truncated-address subject for non-self queries', async () => {
    const res = await activitySummaryTool.call({ address: FUNKII_ADDR }, ctx());
    expect(res.displayText).toContain(FUNKII_ADDR.slice(0, 6));
    expect(res.displayText).toContain(FUNKII_ADDR.slice(-4));
  });

  it('returns empty data without calling fetch when no address is available anywhere', async () => {
    const noWalletCtx = {
      env: { AUDRIC_INTERNAL_API_URL: API_URL },
      signal: undefined,
    } as Parameters<typeof activitySummaryTool.call>[1];
    const res = await activitySummaryTool.call({}, noWalletCtx);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.data.totalTransactions).toBe(0);
  });
});
