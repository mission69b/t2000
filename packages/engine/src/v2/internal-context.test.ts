// ---------------------------------------------------------------------------
// v2/internal-context.test.ts — buildInternalContext helper
// ---------------------------------------------------------------------------
//
// SPEC v0.7c Phase 2 Day 2e (2026-05-19). Covers the host-side
// composition helper that lets audric `web-v2` construct an
// `experimental_context` envelope for `new Experimental_Agent({...})`
// without going through the engine class. See `internal-context.ts`
// JSDoc for the full rationale.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { DEFAULT_GUARD_CONFIG } from '../guards.js';
import type { ToolContext } from '../types.js';
import {
  buildInternalContext,
  asInternalContext,
  tryGetInternalContext,
} from './internal-context.js';

function makeToolContext(): ToolContext {
  return {
    walletAddress: '0xabc',
    suiRpcUrl: 'https://fullnode.mainnet.sui.io',
    signal: new AbortController().signal,
    portfolioCache: new Map(),
    retryStats: { attemptCount: 1 },
  };
}

describe('buildInternalContext', () => {
  it('produces a wrapper-compatible envelope with sensible defaults', () => {
    const toolContext = makeToolContext();
    const ic = buildInternalContext({ toolContext });

    expect(ic.toolContext).toBe(toolContext);
    expect(ic.guardState).toBeDefined();
    expect(ic.guardConfig).toBeUndefined();
    expect(ic.contacts).toEqual([]);
    expect(ic.walletAddress).toBeUndefined();
    expect(ic.config).toEqual({
      onAutoExecuted: undefined,
      onGuardFired: undefined,
      postWriteRefresh: undefined,
      permissionConfig: undefined,
      priceCache: undefined,
    });
    expect(ic.getMessages()).toEqual([]);
  });

  it('threads walletAddress + contacts through', () => {
    const toolContext = makeToolContext();
    const contacts = [{ name: 'alice', address: '0xdef' }];
    const ic = buildInternalContext({
      toolContext,
      walletAddress: '0xabc',
      contacts,
    });

    expect(ic.walletAddress).toBe('0xabc');
    expect(ic.contacts).toBe(contacts);
  });

  it('threads guardConfig + step-finish callbacks through', () => {
    const toolContext = makeToolContext();
    const onAutoExecuted = () => {
      // noop
    };
    const onGuardFired = () => {
      // noop
    };
    const ic = buildInternalContext({
      toolContext,
      guards: DEFAULT_GUARD_CONFIG,
      onAutoExecuted,
      onGuardFired,
    });

    expect(ic.guardConfig).toBe(DEFAULT_GUARD_CONFIG);
    expect(ic.config.onAutoExecuted).toBe(onAutoExecuted);
    expect(ic.config.onGuardFired).toBe(onGuardFired);
  });

  it('reuses caller-supplied guardState when provided (multi-turn host)', () => {
    const toolContext = makeToolContext();
    const first = buildInternalContext({ toolContext });
    const reused = buildInternalContext({
      toolContext,
      guardState: first.guardState,
    });

    expect(reused.guardState).toBe(first.guardState);
  });

  it('accepts a getMessages closure for guard conversation-context scans', () => {
    const toolContext = makeToolContext();
    const messages = [{ role: 'user', content: 'hi' }];
    const ic = buildInternalContext({
      toolContext,
      getMessages: () => messages,
    });

    expect(ic.getMessages()).toBe(messages);
  });

  it('passes asInternalContext type guard (round-trip via experimental_context)', () => {
    const ic = buildInternalContext({ toolContext: makeToolContext() });
    expect(() => asInternalContext(ic as unknown)).not.toThrow();
    expect(tryGetInternalContext(ic as unknown)).toBe(ic);
  });
});
