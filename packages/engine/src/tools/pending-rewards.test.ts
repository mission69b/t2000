import { describe, it, expect } from 'vitest';
import { pendingRewardsTool } from './pending-rewards.js';
import type { ToolContext } from '../types.js';

/**
 * [S18-F20] Tests for the new `pending_rewards` read-only tool.
 *
 * The tool's contract:
 *   1. Returns per-asset rewards array + USD total (read-only, no claim)
 *   2. Enriches USD via `priceCache` when adapter returned 0
 *   3. Surfaces NAVI degradation truthfully (NOT silent empty)
 *   4. Stays as `isReadOnly: true` so it never opens a confirm card
 */

function makeAgent(rewards: unknown) {
  return {
    getPendingRewards: async () => rewards,
  } as unknown as ToolContext['agent'];
}

function makeFailingAgent(code: string | undefined, message: string) {
  return {
    getPendingRewards: async () => {
      const err = new Error(message) as Error & { code?: string; retryable?: boolean };
      if (code) err.code = code;
      throw err;
    },
  } as unknown as ToolContext['agent'];
}

describe('pending_rewards tool', () => {
  it('is registered as a read-only inspector (never opens a confirm card)', () => {
    expect(pendingRewardsTool.isReadOnly).toBe(true);
    expect(pendingRewardsTool.cacheable).toBe(false); // rewards accrue continuously
  });

  it('narrates per-asset breakdown with priced enrichment', async () => {
    const agent = makeAgent([
      { protocol: 'navi', asset: '5', coinType: '0xabc::cert::CERT', symbol: 'vSUI', amount: 0.0165, estimatedValueUsd: 0 },
      { protocol: 'navi', asset: '7', coinType: '0xdef::navx::NAVX', symbol: 'NAVX', amount: 12.4, estimatedValueUsd: 0 },
    ]);
    const priceCache = new Map<string, number>([['VSUI', 0.95], ['NAVX', 0.10]]);

    const result = await pendingRewardsTool.call({}, { agent, priceCache });
    const data = result.data as { rewards: Array<{ symbol: string; estimatedValueUsd: number }>; totalValueUsd: number; degraded: boolean };

    expect(data.degraded).toBe(false);
    expect(data.rewards).toHaveLength(2);
    expect(data.totalValueUsd).toBeCloseTo(0.0165 * 0.95 + 12.4 * 0.10, 4);
    expect(result.displayText).toContain('vSUI');
    expect(result.displayText).toContain('NAVX');
    expect(result.displayText).toContain('total');
  });

  it('handles empty list explicitly without claiming', async () => {
    const agent = makeAgent([]);
    const result = await pendingRewardsTool.call({}, { agent });
    expect(result.displayText).toBe('No pending rewards.');
    const data = result.data as { rewards: unknown[]; totalValueUsd: number; degraded: boolean };
    expect(data.rewards).toHaveLength(0);
    expect(data.totalValueUsd).toBe(0);
    expect(data.degraded).toBe(false);
  });

  it('surfaces NAVI degradation truthfully (the whole point of S18-F20)', async () => {
    const agent = makeFailingAgent('PROTOCOL_UNAVAILABLE', 'NAVI rewards lookup failed: 503 Service Unavailable');

    const result = await pendingRewardsTool.call({}, { agent });
    const data = result.data as { degraded: boolean; degradationReason: string; rewards: unknown[]; totalValueUsd: number };

    expect(result.displayText).toContain('NAVI');
    expect(result.displayText).toContain('degraded');
    expect(result.displayText).not.toContain('No pending rewards');
    expect(data.degraded).toBe(true);
    expect(data.degradationReason).toBe('PROTOCOL_UNAVAILABLE');
    expect(data.rewards).toHaveLength(0);
    expect(data.totalValueUsd).toBe(0);
  });

  it('surfaces unknown errors as a protocol error (not silently empty)', async () => {
    const agent = makeFailingAgent(undefined, 'Some completely unexpected RPC failure');

    const result = await pendingRewardsTool.call({}, { agent });
    const data = result.data as { degraded: boolean; degradationReason: string };

    expect(result.displayText).toContain('protocol error');
    expect(data.degraded).toBe(true);
    expect(data.degradationReason).toBe('UNKNOWN');
  });

  it('respects adapter-provided estimatedValueUsd when present (no priceCache override)', async () => {
    const agent = makeAgent([
      { protocol: 'navi', asset: '5', coinType: '0xabc::cert::CERT', symbol: 'vSUI', amount: 0.1, estimatedValueUsd: 5.55 },
    ]);
    const priceCache = new Map<string, number>([['VSUI', 999]]); // would override if recompute

    const result = await pendingRewardsTool.call({}, { agent, priceCache });
    const data = result.data as { totalValueUsd: number };
    expect(data.totalValueUsd).toBeCloseTo(5.55, 2);
  });

  it('falls back to amount-only narration when no price is available', async () => {
    const agent = makeAgent([
      { protocol: 'navi', asset: '5', coinType: '0xabc::weird::WEIRD', symbol: 'WEIRD', amount: 1.5, estimatedValueUsd: 0 },
    ]);

    const result = await pendingRewardsTool.call({}, { agent });
    expect(result.displayText).toContain('1.5 WEIRD');
    expect(result.displayText).not.toContain('total');
    const data = result.data as { totalValueUsd: number };
    expect(data.totalValueUsd).toBe(0);
  });
});
