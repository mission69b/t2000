import { describe, it, expect } from 'vitest';
import { healthCheckTool } from '../tools/health.js';
import type { ToolContext, ServerPositionData } from '../types.js';

/**
 * Build a ToolContext that exercises the `positionFetcher` branch — we
 * don't want the test to depend on the SDK or NAVI MCP being wired up.
 */
function ctxFor(sp: Partial<ServerPositionData>): ToolContext {
  const fullSp: ServerPositionData = {
    savings: sp.savings ?? 0,
    borrows: sp.borrows ?? 0,
    savingsRate: sp.savingsRate ?? 0,
    healthFactor: sp.healthFactor ?? null,
    maxBorrow: sp.maxBorrow ?? 0,
    pendingRewards: sp.pendingRewards ?? 0,
    supplies: sp.supplies ?? [],
    borrows_detail: sp.borrows_detail ?? [],
  };

  return {
    walletAddress: '0xabc',
    positionFetcher: async () => fullSp,
  };
}

describe('health_check tool — zero-debt regression coverage', () => {
  // Bug we are guarding against: when the user has $0 borrows, the engine
  // used to send `healthFactor: Infinity`. JSON.stringify drops that to
  // `null`, the client coerces null to 0, and the HealthCard renders
  // "Critical 0.00". Fix: send `healthFactor: null` deliberately, mark
  // status as 'healthy', and have the UI / LLM branch on null.

  it('sends healthFactor=null when borrowed is 0', async () => {
    const result = await healthCheckTool.call({}, ctxFor({ savings: 10, borrows: 0 }));
    const data = result.data as { healthFactor: number | null; status: string };
    expect(data.healthFactor).toBeNull();
    expect(data.status).toBe('healthy');
  });

  it('treats sub-cent dust debt as no-debt (healthy + null HF)', async () => {
    const result = await healthCheckTool.call(
      {},
      ctxFor({ savings: 10, borrows: 0.000018, healthFactor: 0.0001 }),
    );
    const data = result.data as { healthFactor: number | null; status: string };
    expect(data.healthFactor).toBeNull();
    expect(data.status).toBe('healthy');
  });

  it('preserves real HF when there is real debt', async () => {
    const result = await healthCheckTool.call(
      {},
      ctxFor({ savings: 10, borrows: 1, healthFactor: 8.49 }),
    );
    const data = result.data as { healthFactor: number | null; status: string };
    expect(data.healthFactor).toBeCloseTo(8.49, 2);
    expect(data.status).toBe('healthy');
  });

  it('flags real critical HF (< 1.2) only when there is real debt', async () => {
    const result = await healthCheckTool.call(
      {},
      ctxFor({ savings: 10, borrows: 5, healthFactor: 1.05 }),
    );
    const data = result.data as { status: string };
    expect(data.status).toBe('critical');
  });

  it('display text says "no debt" instead of a misleading "0.00" when borrowed=0', async () => {
    const result = await healthCheckTool.call({}, ctxFor({ savings: 10, borrows: 0 }));
    expect(result.displayText).toContain('∞');
    expect(result.displayText?.toLowerCase()).toContain('no debt');
    expect(result.displayText).not.toContain('0.00');
  });

  it('never produces "Critical 0.00" for a no-debt account', async () => {
    const result = await healthCheckTool.call({}, ctxFor({ savings: 10, borrows: 0 }));
    expect(result.displayText).not.toMatch(/critical/i);
  });
});
