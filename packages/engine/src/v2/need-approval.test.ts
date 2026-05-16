// ---------------------------------------------------------------------------
// v2/need-approval.test.ts — needsApproval gate behavioural tests
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 13.2 (2026-05-16).
//
// Pinpoint regression coverage for the needsApproval USD-aware resolver.
// Day 13 production smoke uncovered that sub-threshold writes (e.g. 0.05 USDC
// save) were routed to inline `auto` execute in audric (where there is NO
// `agent` on the ToolContext — audric client-signs via sponsored tx). The
// legacy QueryEngine has had an explicit guard for this since v0.46.x:
//
//   if (!context.agent && !tool.isReadOnly) return true;  // engine.ts:1657
//
// This test enforces the same rule on the AISDKEngine path so the two
// engines remain behaviourally identical for Audric's HITL flow.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { buildNeedsApproval } from './need-approval.js';
import type { InternalContext } from './internal-context.js';
import type { ToolContext } from '../types.js';
import { createGuardRunnerState } from '../guards.js';

const baseToolContext = (overrides: Partial<ToolContext> = {}): ToolContext => ({
  signal: new AbortController().signal,
  ...overrides,
});

const baseInternal = (toolContext: ToolContext): InternalContext => ({
  toolContext,
  guardConfig: undefined,
  contacts: [],
  walletAddress: undefined,
  config: {
    onAutoExecuted: undefined,
    onGuardFired: undefined,
    postWriteRefresh: undefined,
    permissionConfig: undefined,
    priceCache: undefined,
  },
  guardState: createGuardRunnerState(),
  getMessages: () => [],
});

const callOptions = (experimental_context: unknown) => ({
  toolCallId: 'test_call_id',
  messages: [],
  experimental_context,
});

describe('buildNeedsApproval — agent-absent guard (Day 13.2 regression)', () => {
  it('forces approval for confirm-tier writes when ctx.agent is undefined (audric pattern)', async () => {
    const needsApproval = buildNeedsApproval('save_deposit');

    // Match audric's wiring: agent is undefined (client-signed sponsored tx),
    // permissionConfig + priceCache are populated, USD value is sub-threshold
    // (0.05 USDC = $0.05 < $50 autoBelow → would resolve to 'auto' if the
    // agent guard didn't fire).
    const ctx = baseToolContext({
      agent: undefined,
      permissionConfig: {
        globalAutoBelow: 10,
        autonomousDailyLimit: 200,
        rules: [{ operation: 'save', autoBelow: 50, confirmBetween: 1000 }],
      },
      priceCache: new Map([['USDC', 1]]),
      sessionSpendUsd: 0,
    });

    const result = await needsApproval(
      { amount: 0.05, asset: 'USDC' },
      callOptions(baseInternal(ctx)),
    );
    expect(result).toBe(true);
  });

  it('falls through to USD-aware resolver when ctx.agent IS set (CLI / non-audric pattern)', async () => {
    const needsApproval = buildNeedsApproval('save_deposit');

    const ctx = baseToolContext({
      agent: { signTx: () => Promise.resolve('0xfake') },
      permissionConfig: {
        globalAutoBelow: 10,
        autonomousDailyLimit: 200,
        rules: [{ operation: 'save', autoBelow: 50, confirmBetween: 1000 }],
      },
      priceCache: new Map([['USDC', 1]]),
      sessionSpendUsd: 0,
    });

    // 0.05 USDC < $50 autoBelow → resolver returns 'auto' → no approval needed.
    const result = await needsApproval(
      { amount: 0.05, asset: 'USDC' },
      callOptions(baseInternal(ctx)),
    );
    expect(result).toBe(false);
  });

  it('still forces approval for over-threshold writes when ctx.agent IS set', async () => {
    const needsApproval = buildNeedsApproval('save_deposit');

    const ctx = baseToolContext({
      agent: { signTx: () => Promise.resolve('0xfake') },
      permissionConfig: {
        globalAutoBelow: 10,
        autonomousDailyLimit: 200,
        rules: [{ operation: 'save', autoBelow: 50, confirmBetween: 1000 }],
      },
      priceCache: new Map([['USDC', 1]]),
      sessionSpendUsd: 0,
    });

    // 100 USDC > $50 autoBelow but ≤ $1000 confirmBetween → 'confirm' tier.
    const result = await needsApproval(
      { amount: 100, asset: 'USDC' },
      callOptions(baseInternal(ctx)),
    );
    expect(result).toBe(true);
  });

  it('returns true (fail-closed) when InternalContext is missing entirely', async () => {
    const needsApproval = buildNeedsApproval('save_deposit');

    const result = await needsApproval(
      { amount: 0.05, asset: 'USDC' },
      callOptions(undefined),
    );
    expect(result).toBe(true);
  });

  it('returns true (fail-closed) for confirm-tier tools when permissionConfig is missing', async () => {
    const needsApproval = buildNeedsApproval('save_deposit');

    // agent is set so the audric guard doesn't fire, but no permissionConfig
    // means the resolver can't decide → fail closed.
    const ctx = baseToolContext({
      agent: { signTx: () => Promise.resolve('0xfake') },
      permissionConfig: undefined,
      priceCache: undefined,
    });

    const result = await needsApproval(
      { amount: 0.05, asset: 'USDC' },
      callOptions(baseInternal(ctx)),
    );
    expect(result).toBe(true);
  });

  it('always returns false for auto-policy tools (read tools) regardless of agent presence', async () => {
    const needsApproval = buildNeedsApproval('balance_check');

    const ctx = baseToolContext({ agent: undefined });
    const result = await needsApproval({}, callOptions(baseInternal(ctx)));
    expect(result).toBe(false);
  });
});
