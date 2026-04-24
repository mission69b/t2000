import { describe, it, expect } from 'vitest';
import { claimRewardsTool } from '../tools/claim.js';
import type { ToolContext } from '../types.js';

/**
 * Build a minimal mock T2000-shaped agent that returns whatever
 * `claimRewards()` payload the test wants. We bypass the real SDK
 * entirely — the tool's job is to enrich + narrate, the SDK has its
 * own coverage in `packages/sdk/src/protocols/navi.test.ts`.
 */
function makeAgent(claimResult: unknown) {
  return { claimRewards: async () => claimResult } as unknown as ToolContext['agent'];
}

describe('claim_rewards tool', () => {
  it('narrates per-symbol amounts when totalValueUsd is unavailable', async () => {
    const agent = makeAgent({
      success: true,
      tx: 'CwTo4jy3aaaabbbbccccddddeeeeffffgggghhhhiiiijjjjkkkk',
      rewards: [
        {
          protocol: 'navi',
          asset: '5',
          coinType: '0xabc::cert::CERT',
          symbol: 'vSUI',
          amount: 0.0165,
          estimatedValueUsd: 0,
        },
      ],
      totalValueUsd: 0,
      gasCost: 0.001,
    });

    const result = await claimRewardsTool.call({}, { agent });

    expect(result.displayText).toContain('vSUI');
    expect(result.displayText).toContain('0.0165');
    expect(result.displayText).not.toBe('No pending rewards to claim.');
  });

  it('enriches USD value from priceCache when adapter returns 0', async () => {
    const agent = makeAgent({
      success: true,
      tx: 'tx_hash_12345678abcdef',
      rewards: [
        {
          protocol: 'navi',
          asset: '5',
          coinType: '0xabc::cert::CERT',
          symbol: 'vSUI',
          amount: 0.1,
          estimatedValueUsd: 0,
        },
      ],
      totalValueUsd: 0,
      gasCost: 0,
    });

    const priceCache = new Map<string, number>([['VSUI', 0.95]]);
    const result = await claimRewardsTool.call({}, { agent, priceCache });

    const data = result.data as { totalValueUsd: number; rewards: Array<{ estimatedValueUsd: number }> };
    expect(data.totalValueUsd).toBeCloseTo(0.095, 4);
    expect(data.rewards[0]?.estimatedValueUsd).toBeCloseTo(0.095, 4);
    expect(result.displayText).toContain('~$0.10');
  });

  it('falls back to zero USD without a price (and still narrates the amount)', async () => {
    const agent = makeAgent({
      success: true,
      tx: 'abc123',
      rewards: [
        {
          protocol: 'navi',
          asset: '5',
          coinType: '0xabc::cert::CERT',
          symbol: 'UNKNOWN_TOKEN',
          amount: 1.5,
          estimatedValueUsd: 0,
        },
      ],
      totalValueUsd: 0,
      gasCost: 0,
    });

    const result = await claimRewardsTool.call({}, { agent });

    expect(result.displayText).toContain('1.5 UNKNOWN_TOKEN');
    expect(result.displayText).not.toContain('$');
    const data = result.data as { totalValueUsd: number };
    expect(data.totalValueUsd).toBe(0);
  });

  it('uses adapter-provided estimatedValueUsd verbatim when present', async () => {
    const agent = makeAgent({
      success: true,
      tx: 'hash1234',
      rewards: [
        {
          protocol: 'navi',
          asset: '0',
          coinType: '0xabc::cert::CERT',
          symbol: 'vSUI',
          amount: 0.1,
          estimatedValueUsd: 1.23, // adapter already priced it
        },
      ],
      totalValueUsd: 1.23,
      gasCost: 0,
    });

    const priceCache = new Map<string, number>([['VSUI', 999]]); // would override if we mistakenly recompute
    const result = await claimRewardsTool.call({}, { agent, priceCache });

    const data = result.data as { totalValueUsd: number };
    expect(data.totalValueUsd).toBeCloseTo(1.23, 4);
  });

  it('handles empty rewards list explicitly', async () => {
    const agent = makeAgent({
      success: true,
      tx: '',
      rewards: [],
      totalValueUsd: 0,
      gasCost: 0,
    });

    const result = await claimRewardsTool.call({}, { agent });
    expect(result.displayText).toBe('No pending rewards to claim.');
    const data = result.data as { tx: string | null };
    expect(data.tx).toBeNull();
  });

  it('aggregates totalValueUsd across multiple rewards', async () => {
    const agent = makeAgent({
      success: true,
      tx: 'tx_hash',
      rewards: [
        { protocol: 'navi', asset: '0', coinType: '0x1::a::A', symbol: 'A', amount: 1, estimatedValueUsd: 0 },
        { protocol: 'navi', asset: '1', coinType: '0x2::b::B', symbol: 'B', amount: 2, estimatedValueUsd: 0 },
      ],
      totalValueUsd: 0,
      gasCost: 0,
    });

    const priceCache = new Map<string, number>([['A', 1.5], ['B', 2.5]]);
    const result = await claimRewardsTool.call({}, { agent, priceCache });
    const data = result.data as { totalValueUsd: number };
    expect(data.totalValueUsd).toBeCloseTo(1.5 + 5.0, 4);
  });

  it('keeps the tool marked as a confirm-level write with mutating flag', () => {
    expect(claimRewardsTool.isReadOnly).toBe(false);
    expect(claimRewardsTool.permissionLevel).toBe('confirm');
    expect(claimRewardsTool.flags?.mutating).toBe(true);
  });
});
