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

// ───────────────────────────────────────────────────────────────────────────
// Day 14b — per-asset arrays via positionFetcher
//
// Maps ServerPositionData's `supplies` / `borrows_detail` (engine's host-
// shape) onto the engine-shape HealthPositionAsset arrays expected by
// HealthCardV2. The mapping is a re-key (asset→symbol, amountUsd→valueUsd)
// so the audric consumer sees one consistent shape regardless of whether
// the data came from positionFetcher OR the NAVI MCP path.
// ───────────────────────────────────────────────────────────────────────────

describe('health_check tool — Day 14b per-asset arrays (positionFetcher)', () => {
  it('emits suppliedAssets + borrowedAssets re-keyed from ServerPositionData', async () => {
    const result = await healthCheckTool.call(
      {},
      ctxFor({
        savings: 22.67,
        borrows: 5.01,
        healthFactor: 3.72,
        supplies: [
          { asset: 'USDsui', amount: 9.18, amountUsd: 9.18, apy: 0.083, protocol: 'navi' },
          { asset: 'USDC', amount: 13.49, amountUsd: 13.49, apy: 0.044, protocol: 'navi' },
        ],
        borrows_detail: [
          { asset: 'USDC', amount: 5.01, amountUsd: 5.01, apy: 0.068, protocol: 'navi' },
        ],
      }),
    );
    const data = result.data as {
      suppliedAssets: Array<{ symbol: string; amount: number; valueUsd: number }>;
      borrowedAssets: Array<{ symbol: string; amount: number; valueUsd: number }>;
    };
    expect(data.suppliedAssets).toEqual([
      { symbol: 'USDsui', amount: 9.18, valueUsd: 9.18 },
      { symbol: 'USDC', amount: 13.49, valueUsd: 13.49 },
    ]);
    expect(data.borrowedAssets).toEqual([
      { symbol: 'USDC', amount: 5.01, valueUsd: 5.01 },
    ]);
  });

  it('emits empty arrays when ServerPositionData supplies/borrows_detail are empty', async () => {
    const result = await healthCheckTool.call({}, ctxFor({ savings: 0, borrows: 0 }));
    const data = result.data as {
      suppliedAssets: unknown[];
      borrowedAssets: unknown[];
    };
    expect(data.suppliedAssets).toEqual([]);
    expect(data.borrowedAssets).toEqual([]);
  });

  it('drops sub-cent dust positions from suppliedAssets / borrowedAssets', async () => {
    // [Day 14b polish] NAVI leaves dust after partial repays. Without
    // the dust filter, audric would render rows like "USDe $0.00" /
    // "USDsui $0.00" that the aggregate already collapses to "$0.00".
    const result = await healthCheckTool.call(
      {},
      ctxFor({
        savings: 5000.001, // ~5000 + dust
        borrows: 0.001, // pure dust
        healthFactor: null,
        supplies: [
          { asset: 'USDC', amount: 5000, amountUsd: 5000, apy: 0.044, protocol: 'navi' },
          { asset: 'USDe', amount: 0.001, amountUsd: 0.001, apy: 0.04, protocol: 'navi' },
          { asset: 'SUI', amount: 0.0001, amountUsd: 0.0005, apy: 0.032, protocol: 'navi' },
        ],
        borrows_detail: [
          { asset: 'USDsui', amount: 0.001, amountUsd: 0.001, apy: 0.068, protocol: 'navi' },
          { asset: 'USDC', amount: 0.001, amountUsd: 0.001, apy: 0.068, protocol: 'navi' },
        ],
      }),
    );
    const data = result.data as {
      suppliedAssets: Array<{ symbol: string; valueUsd: number }>;
      borrowedAssets: Array<{ symbol: string; valueUsd: number }>;
    };
    // Only USDC ($5000) survives — USDe + SUI are sub-cent.
    expect(data.suppliedAssets).toEqual([
      { symbol: 'USDC', amount: 5000, valueUsd: 5000 },
    ]);
    // All borrows were dust.
    expect(data.borrowedAssets).toEqual([]);
  });

  it('preserves the aggregated totals alongside the per-asset arrays (backward-compat)', async () => {
    const result = await healthCheckTool.call(
      {},
      ctxFor({
        savings: 22.67,
        borrows: 5.01,
        healthFactor: 3.72,
        maxBorrow: 12.34,
        supplies: [
          { asset: 'USDsui', amount: 9.18, amountUsd: 9.18, apy: 0.083, protocol: 'navi' },
          { asset: 'USDC', amount: 13.49, amountUsd: 13.49, apy: 0.044, protocol: 'navi' },
        ],
        borrows_detail: [
          { asset: 'USDC', amount: 5.01, amountUsd: 5.01, apy: 0.068, protocol: 'navi' },
        ],
      }),
    );
    const data = result.data as {
      healthFactor: number | null;
      supplied: number;
      borrowed: number;
      maxBorrow: number;
      suppliedAssets: unknown[];
      borrowedAssets: unknown[];
    };
    expect(data.healthFactor).toBe(3.72);
    expect(data.supplied).toBe(22.67);
    expect(data.borrowed).toBe(5.01);
    expect(data.maxBorrow).toBe(12.34);
    expect(data.suppliedAssets).toHaveLength(2);
    expect(data.borrowedAssets).toHaveLength(1);
  });
});
