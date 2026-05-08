/**
 * [Track B / 2026-05-08] Tests for the engine `harvest_rewards` tool.
 *
 * The tool itself is intentionally thin — it doesn't call any SDK
 * methods directly. The actual on-chain orchestration (claim → swap →
 * save in one PTB) lives in `@t2000/sdk`'s `addHarvestToTx`, dispatched
 * by the audric host's composeTx registry. The engine tool's job is:
 *   1. Validate input via Zod.
 *   2. Stay `permissionLevel: 'confirm'` — the engine harness's
 *      permission gate intercepts the tool_use and yields it as a
 *      `pending_action` to the host.
 *   3. Surface a HarvestRewardsResult shape so the LLM can narrate the
 *      OUTCOME after the host writes back the executed plan.
 *   4. Provide the `narrateHarvestResult` helper for post-execution
 *      narration.
 */

import { describe, it, expect } from 'vitest';
import type { PendingReward } from '@t2000/sdk';
import { harvestRewardsTool, narrateHarvestResult } from './harvest-rewards.js';

interface HarvestRewardsResultShape {
  success: boolean;
  tx: string | null;
  claimed: PendingReward[];
  swaps: Array<{
    fromSymbol: string;
    fromCoinType: string;
    toSymbol: 'USDC';
    inputAmount: number;
    expectedOutputUsdc: number;
  }>;
  skipped: Array<{
    symbol: string;
    coinType: string;
    amount: number;
    reason: 'untradeable' | 'dust' | 'no-route';
  }>;
  expectedUsdcDeposited: number;
  totalClaimedValueUsd: number;
  gasCost: number;
  degraded: boolean;
  degradationReason: string | null;
}

describe('harvest_rewards tool registration', () => {
  it('is registered as a confirm-level write (never auto-executes)', () => {
    expect(harvestRewardsTool.isReadOnly).toBe(false);
    expect(harvestRewardsTool.permissionLevel).toBe('confirm');
    expect(harvestRewardsTool.flags?.mutating).toBe(true);
  });

  it('has no required inputs (the chip can call with literal `{}`)', () => {
    // Empty object should pass validation.
    const parsed = harvestRewardsTool.inputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('accepts optional slippage in the [0.001, 0.05] range', () => {
    expect(harvestRewardsTool.inputSchema.safeParse({ slippage: 0.005 }).success).toBe(true);
    expect(harvestRewardsTool.inputSchema.safeParse({ slippage: 0.05 }).success).toBe(true);
    expect(harvestRewardsTool.inputSchema.safeParse({ slippage: 0.0009 }).success).toBe(false);
    expect(harvestRewardsTool.inputSchema.safeParse({ slippage: 0.06 }).success).toBe(false);
  });

  it('accepts optional minRewardUsd >= 0 (0 disables the dust floor)', () => {
    expect(harvestRewardsTool.inputSchema.safeParse({ minRewardUsd: 0 }).success).toBe(true);
    expect(harvestRewardsTool.inputSchema.safeParse({ minRewardUsd: 0.05 }).success).toBe(true);
    expect(harvestRewardsTool.inputSchema.safeParse({ minRewardUsd: -1 }).success).toBe(false);
  });

  it('returns a pre-confirm narration shell (post-confirm narration is built in narrateHarvestResult)', async () => {
    const result = await harvestRewardsTool.call({}, {});
    expect(result.displayText).toContain('harvest');
    expect(result.displayText).toMatch(/claim|swap|deposit/i);
    const data = result.data as { success: boolean; degraded: boolean; expectedUsdcDeposited: number };
    expect(data.success).toBe(false);
    expect(data.degraded).toBe(false);
    expect(data.expectedUsdcDeposited).toBe(0);
  });
});

describe('narrateHarvestResult', () => {
  function baseResult(): HarvestRewardsResultShape {
    return {
      success: true,
      tx: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      claimed: [],
      swaps: [],
      skipped: [],
      expectedUsdcDeposited: 0,
      totalClaimedValueUsd: 0,
      gasCost: 0,
      degraded: false,
      degradationReason: null,
    };
  }

  it('happy path: narrates per-symbol claim + USDC deposit + tx hash', () => {
    const r = baseResult();
    r.claimed = [
      { protocol: 'navi', asset: '5', coinType: '0xabc::cert::CERT', symbol: 'vSUI', amount: 0.0165, estimatedValueUsd: 0 },
      { protocol: 'navi', asset: '7', coinType: '0xdef::navx::NAVX', symbol: 'NAVX', amount: 12.4, estimatedValueUsd: 0 },
    ];
    r.swaps = [
      { fromSymbol: 'vSUI', fromCoinType: '0xabc::cert::CERT', toSymbol: 'USDC', inputAmount: 0.0165, expectedOutputUsdc: 0.0162 },
      { fromSymbol: 'NAVX', fromCoinType: '0xdef::navx::NAVX', toSymbol: 'USDC', inputAmount: 12.4, expectedOutputUsdc: 1.18 },
    ];
    r.expectedUsdcDeposited = 0.0162 + 1.18;
    const out = narrateHarvestResult(r);
    expect(out).toContain('vSUI');
    expect(out).toContain('NAVX');
    expect(out).toContain('USDC deposited');
    expect(out).toContain('0xabcdef'); // tx-short prefix
  });

  it('USDC-only path: no swap mention, deposits directly', () => {
    const r = baseResult();
    r.claimed = [
      { protocol: 'navi', asset: '0', coinType: '0xusdc::usdc::USDC', symbol: 'USDC', amount: 0.5, estimatedValueUsd: 0.5 },
    ];
    r.expectedUsdcDeposited = 0.5;
    const out = narrateHarvestResult(r);
    expect(out).toContain('0.5 USDC');
    expect(out).toContain('USDC deposited');
  });

  it('all-skipped path: claimed something but nothing was tradeable', () => {
    const r = baseResult();
    r.claimed = [
      { protocol: 'navi', asset: '99', coinType: '0xweird::weird::WEIRD', symbol: 'WEIRD', amount: 5, estimatedValueUsd: 0 },
    ];
    r.skipped = [
      { symbol: 'WEIRD', coinType: '0xweird::weird::WEIRD', amount: 5, reason: 'untradeable' },
    ];
    r.expectedUsdcDeposited = 0;
    const out = narrateHarvestResult(r);
    expect(out).toContain('5 WEIRD');
    expect(out).toContain('wallet');
    expect(out).not.toContain('USDC deposited');
  });

  it('partial-skip path: surfaces the count of skipped legs alongside the deposit', () => {
    const r = baseResult();
    r.claimed = [
      { protocol: 'navi', asset: '5', coinType: '0xabc::cert::CERT', symbol: 'vSUI', amount: 0.0165, estimatedValueUsd: 0 },
      { protocol: 'navi', asset: '99', coinType: '0xweird::weird::WEIRD', symbol: 'WEIRD', amount: 0.0001, estimatedValueUsd: 0 },
    ];
    r.swaps = [
      { fromSymbol: 'vSUI', fromCoinType: '0xabc::cert::CERT', toSymbol: 'USDC', inputAmount: 0.0165, expectedOutputUsdc: 0.0162 },
    ];
    r.skipped = [
      { symbol: 'WEIRD', coinType: '0xweird::weird::WEIRD', amount: 0.0001, reason: 'dust' },
    ];
    r.expectedUsdcDeposited = 0.0162;
    const out = narrateHarvestResult(r);
    expect(out).toContain('USDC deposited');
    expect(out).toContain('1 reward sent to wallet');
  });

  it('degraded path: surfaces NAVI degradation truthfully', () => {
    const r = baseResult();
    r.success = false;
    r.degraded = true;
    r.degradationReason = 'PROTOCOL_UNAVAILABLE';
    const out = narrateHarvestResult(r);
    expect(out).toContain('NAVI is degraded');
  });

  it('degraded path with unknown reason: generic protocol error', () => {
    const r = baseResult();
    r.success = false;
    r.degraded = true;
    r.degradationReason = 'WTF_UNEXPECTED';
    const out = narrateHarvestResult(r);
    expect(out).toContain('protocol error');
    expect(out).not.toContain('NAVI is degraded');
  });

  it('empty-claimed path: nothing to harvest', () => {
    const r = baseResult();
    const out = narrateHarvestResult(r);
    expect(out).toContain('Nothing to harvest');
  });
});
