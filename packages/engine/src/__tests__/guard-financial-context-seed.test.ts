import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  runGuards,
  createGuardRunnerState,
  extractConversationText,
  DEFAULT_GUARD_CONFIG,
  BalanceTracker,
} from '../guards.js';
import { buildTool } from '../tool.js';
import type { PendingToolCall } from '../orchestration.js';

/**
 * F2 / v1.11 — Financial-context seed regression tests.
 *
 * Failure mode being prevented: the host (audric) embeds a daily
 * `<financial_context>` snapshot in the system prompt with fresh
 * balances + HF, but the engine's BalanceTracker starts empty so
 * EVERY first-turn write fires the redundant "Balance has not been
 * checked this session" / "Health factor has not been checked this
 * session" hint. Pure noise — the LLM has the data, the user sees
 * the data on the PermissionCard's guard-injection rows, and the
 * model is incentivized to waste a tool call (`balance_check`) just
 * to silence the guard.
 *
 * Fix: `EngineConfig.financialContextSeed` lets the host pre-seed
 * the guard state to "balance read at T, HF = N" so the first-turn
 * guards trust the snapshot.
 */

const SAVE = buildTool({
  name: 'save_deposit',
  description: 'save',
  inputSchema: z.object({
    amount: z.number(),
    asset: z.string().optional(),
  }),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: false,
  flags: { mutating: true, requiresBalance: true },
  call: async () => ({ data: {} }),
});

const BORROW = buildTool({
  name: 'borrow',
  description: 'borrow',
  inputSchema: z.object({
    amount: z.number(),
    asset: z.string().optional(),
  }),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: false,
  flags: { mutating: true, requiresBalance: true, affectsHealth: true },
  call: async () => ({ data: {} }),
});

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

function injectionMessages(result: { injections: Array<{ _hint?: string; _warning?: string }> }): string[] {
  return result.injections
    .flatMap((inj) => [inj._hint, inj._warning])
    .filter((m): m is string => typeof m === 'string');
}

describe('runGuards with seeded balanceTracker (F2 v1.11)', () => {
  it('does NOT fire the "Balance not checked this session" hint when balance was seeded', () => {
    const state = createGuardRunnerState();
    state.balanceTracker.recordReadAt(Date.now() - 30_000);

    const result = runGuards(
      SAVE,
      makeCall('save_deposit', { amount: 10, asset: 'USDC' }),
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
      SAVE,
      makeCall('save_deposit', { amount: 10, asset: 'USDC' }),
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
      BORROW,
      makeCall('borrow', { amount: 5, asset: 'USDC' }),
      state,
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(),
    );

    expect(
      injectionMessages(result).filter((m) => m.includes('Health factor has not been checked')),
    ).toEqual([]);
  });

  it('STILL fires HF hint when HF was NOT seeded (regression baseline)', () => {
    const state = createGuardRunnerState();
    state.balanceTracker.recordReadAt(Date.now() - 30_000);

    const result = runGuards(
      BORROW,
      makeCall('borrow', { amount: 5, asset: 'USDC' }),
      state,
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(),
    );

    expect(
      injectionMessages(result).filter((m) => m.includes('Health factor has not been checked')),
    ).not.toEqual([]);
  });

  it('preserves stale-balance detection — a write after seeding still flips isStale=true on next write', () => {
    const state = createGuardRunnerState();
    state.balanceTracker.recordReadAt(Date.now() - 60_000);
    state.balanceTracker.recordWrite();

    const result = runGuards(
      SAVE,
      makeCall('save_deposit', { amount: 10, asset: 'USDC' }),
      state,
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(),
    );

    expect(
      injectionMessages(result).filter((m) => m.includes('Balance data is stale')),
    ).not.toEqual([]);
  });
});
