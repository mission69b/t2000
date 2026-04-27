import { describe, it, expect, vi, beforeEach } from 'vitest';
import { healthCheckTool } from '../tools/health.js';
import type { ServerPositionData } from '../types.js';

/**
 * [v0.49] Regression suite for address-scoped health_check.
 *
 * Pre-v0.49 the tool only ever queried `context.walletAddress`, so a
 * question like "How is funkii's account health?" silently returned
 * the signed-in user's HF. v0.49 adds an optional `address` input and
 * stamps `address` + `isSelfQuery` on the result.
 */

const USER_ADDR = `0x${'a'.repeat(64)}`;
const FUNKII_ADDR = `0x${'b'.repeat(64)}`;

const positionFetcher = vi.fn(async (_address: string): Promise<ServerPositionData> => ({
  savings: 1000,
  borrows: 500,
  pendingRewards: 0,
  healthFactor: 2.0,
  maxBorrow: 100,
  supplies: [],
  borrows_detail: [],
  savingsRate: 0.045,
}));

function ctx(opts: { wallet?: string } = {}) {
  return {
    walletAddress: opts.wallet === undefined ? USER_ADDR : opts.wallet,
    positionFetcher,
  } as Parameters<typeof healthCheckTool.call>[1];
}

interface HealthResult {
  data: { address: string; isSelfQuery: boolean; healthFactor: number | null; status: string };
  displayText: string;
}

describe('[v0.49] health_check address scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to context.walletAddress when input.address is omitted', async () => {
    const res = (await healthCheckTool.call({}, ctx())) as HealthResult;
    expect(res.data.address).toBe(USER_ADDR);
    expect(res.data.isSelfQuery).toBe(true);
    expect(positionFetcher).toHaveBeenCalledWith(USER_ADDR);
  });

  it('honors explicit input.address (the fix)', async () => {
    const res = (await healthCheckTool.call({ address: FUNKII_ADDR }, ctx())) as HealthResult;
    expect(res.data.address).toBe(FUNKII_ADDR);
    expect(res.data.isSelfQuery).toBe(false);
    expect(positionFetcher).toHaveBeenCalledWith(FUNKII_ADDR);
    expect(positionFetcher).not.toHaveBeenCalledWith(USER_ADDR);
  });

  it('case-insensitive equality decides isSelfQuery', async () => {
    const res = (await healthCheckTool.call(
      { address: USER_ADDR.toUpperCase() },
      ctx(),
    )) as HealthResult;
    expect(res.data.isSelfQuery).toBe(true);
  });

  it('prefixes the displayText with a truncated-address subject for non-self queries', async () => {
    const res = (await healthCheckTool.call(
      { address: FUNKII_ADDR },
      ctx(),
    )) as HealthResult;
    expect(res.displayText).toContain(FUNKII_ADDR.slice(0, 6));
    expect(res.displayText).toContain(FUNKII_ADDR.slice(-4));
  });

  it('keeps the self subject clean (no truncated address) for self queries', async () => {
    const res = (await healthCheckTool.call({}, ctx())) as HealthResult;
    expect(res.displayText.startsWith('Health Factor:')).toBe(true);
    expect(res.displayText).not.toContain(USER_ADDR.slice(0, 6));
  });

});
