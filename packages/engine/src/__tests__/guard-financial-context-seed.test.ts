import { describe, it, expect } from 'vitest';
import {
  runGuards,
  createGuardRunnerState,
  extractConversationText,
  DEFAULT_GUARD_CONFIG,
  BalanceTracker,
} from '../guards.js';
import { makeGuardView } from './_helpers/call-tool-body.js';
import type { PendingToolCall } from '../types.js';

/**
 * Balance/HF guard freshness regression tests.
 *
 * Failure mode being prevented: the engine's BalanceTracker starts
 * empty, so the FIRST-TURN write fires the "Balance has not been
 * checked this session" / "Health factor has not been checked this
 * session" hint. That's correct when the agent has genuinely not read
 * state — but a host (or an earlier-in-turn tool read) may already
 * hold authoritative balance/HF data, in which case the hint is pure
 * noise that nudges the model to waste a `balance_check` call.
 *
 * `BalanceTracker.recordReadAt(at)` is the seam that suppresses that
 * noise: seed the tracker with the timestamp at which balance was
 * known and the first-turn guards trust it. These tests pin the seam
 * (`recordReadAt`) plus the baseline guard behaviour (hints fire when
 * NOT seeded; stale-balance detection survives seeding).
 */

// [SPEC_AUDRIC_DEFI_REMOVAL §2a — 2026-06-10] save_deposit / borrow were
// deleted; repay_debt (requiresBalance) + withdraw (affectsHealth) carry
// the same flag shapes for these guard regressions.
const REPAY = makeGuardView('repay_debt');
const WITHDRAW = makeGuardView('withdraw');

function makeCall(name: string, input: Record<string, unknown>): PendingToolCall {
  return { id: 'tool_use_1', name, input };
}

function makeConvCtx() {
  return extractConversationText([
    { role: 'user', content: [{ type: 'text', text: 'do the thing' }] },
  ]);
}

describe('BalanceTracker.recordReadAt (F2 v1.11)', () => {
  it('makes hasEverRead() return true after seeding', () => {
    const tracker = new BalanceTracker();
    expect(tracker.hasEverRead()).toBe(false);
    tracker.recordReadAt(Date.now() - 60_000);
    expect(tracker.hasEverRead()).toBe(true);
  });

  it('does not regress timestamp when a newer read happens after seeding', () => {
    const tracker = new BalanceTracker();
    const oldSeed = Date.now() - 60_000;
    tracker.recordReadAt(oldSeed);
    tracker.recordRead();
    expect(tracker.hasEverRead()).toBe(true);
    expect(tracker.isStale()).toBe(false);
  });

  it('refuses to overwrite a fresher timestamp with a stale seed', () => {
    const tracker = new BalanceTracker();
    tracker.recordRead();
    const fresh = Date.now();
    const stale = fresh - 3_600_000;
    tracker.recordReadAt(stale);
    expect(tracker.hasEverRead()).toBe(true);
    expect(tracker.isStale()).toBe(false);
  });
});

function injectionMessages(result: {
  injections: Array<{ _hint?: string; _warning?: string }>;
}): string[] {
  return result.injections
    .flatMap((inj) => [inj._hint, inj._warning])
    .filter((m): m is string => typeof m === 'string');
}

describe('runGuards with seeded balanceTracker (F2 v1.11)', () => {
  it('does NOT fire the "Balance not checked this session" hint when balance was seeded', () => {
    const state = createGuardRunnerState();
    state.balanceTracker.recordReadAt(Date.now() - 30_000);

    const result = runGuards(
      REPAY,
      makeCall('repay_debt', { amount: 10, asset: 'USDC' }),
      state,
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(),
    );

    expect(
      injectionMessages(result).filter((m) => m.includes('Balance has not been checked')),
    ).toEqual([]);
  });

  it('STILL fires the hint when balance was NOT seeded (regression baseline)', () => {
    const state = createGuardRunnerState();

    const result = runGuards(
      REPAY,
      makeCall('repay_debt', { amount: 10, asset: 'USDC' }),
      state,
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(),
    );

    expect(
      injectionMessages(result).filter((m) => m.includes('Balance has not been checked')),
    ).not.toEqual([]);
  });

  it('does NOT fire the "Health factor not checked" hint when HF was seeded', () => {
    const state = createGuardRunnerState();
    state.balanceTracker.recordReadAt(Date.now() - 30_000);
    state.lastHealthFactor = 4.28;

    const result = runGuards(
      WITHDRAW,
      makeCall('withdraw', { amount: 5, asset: 'USDC' }),
      state,
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(),
    );

    expect(
      injectionMessages(result).filter((m) => m.includes('Debt status has not been checked')),
    ).toEqual([]);
  });

  it('STILL fires HF hint when HF was NOT seeded (regression baseline)', () => {
    const state = createGuardRunnerState();
    state.balanceTracker.recordReadAt(Date.now() - 30_000);

    const result = runGuards(
      WITHDRAW,
      makeCall('withdraw', { amount: 5, asset: 'USDC' }),
      state,
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(),
    );

    expect(
      injectionMessages(result).filter((m) => m.includes('Debt status has not been checked')),
    ).not.toEqual([]);
  });

  it('preserves stale-balance detection — a write after seeding still flips isStale=true on next write', () => {
    const state = createGuardRunnerState();
    state.balanceTracker.recordReadAt(Date.now() - 60_000);
    state.balanceTracker.recordWrite();

    const result = runGuards(
      REPAY,
      makeCall('repay_debt', { amount: 10, asset: 'USDC' }),
      state,
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(),
    );

    expect(
      injectionMessages(result).filter((m) => m.includes('Balance data is stale')),
    ).not.toEqual([]);
  });
});
