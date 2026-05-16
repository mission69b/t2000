// ---------------------------------------------------------------------------
// v2/guard-runner.test.ts — unit tests for the v2 guard runner wrapper
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 3 (2026-05-15).
//
// Verifies the v2 guard runner correctly wraps the legacy `runGuards`
// pipeline:
//   - undefined guardConfig → no guards run, call allowed
//   - block verdict → returns { allowed: false, blockReason, blockGate }
//   - pass verdict with injections → returns { allowed: true, injections }
//   - needsInput verdict → returns { allowed: false, needsStructuredInput: true }
//
// Integration with the wrapper (i.e., guards actually blocking a tool
// call inside execute()) is covered by tool-wrapper.test.ts.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineTool } from './define-tool.js';
import type { Tool as LegacyTool } from '../types.js';
import { createGuardRunnerState, DEFAULT_GUARD_CONFIG } from '../guards.js';
import { runGuardsForTool, GuardBlockedError } from './guard-runner.js';
import type { InternalContext } from './internal-context.js';

function makeReadTool(): LegacyTool {
  return defineTool({
    name: 'read_test',
    description: 'A read tool.',
    inputSchema: z.object({ x: z.string() }),
    flags: {},
    permissionLevel: 'auto',
    isReadOnly: true,
    isConcurrencySafe: true,
    call: async () => ({ data: null }),
  });
}

function makeWriteTool(name = 'write_test'): LegacyTool {
  return defineTool({
    name,
    description: 'A write tool.',
    inputSchema: z.object({ amount: z.number() }),
    flags: { mutating: true },
    permissionLevel: 'confirm',
    isReadOnly: false,
    isConcurrencySafe: false,
    call: async () => ({ data: null }),
  });
}

function makeInternal(overrides: Partial<InternalContext> = {}): InternalContext {
  return {
    toolContext: {
      walletAddress: '0xtest',
      retryStats: { attemptCount: 1 },
    },
    guardState: createGuardRunnerState(),
    guardConfig: undefined,
    contacts: [],
    walletAddress: '0xtest',
    config: {
      onAutoExecuted: undefined,
      onGuardFired: undefined,
      postWriteRefresh: undefined,
      permissionConfig: undefined,
      priceCache: undefined,
    },
    getMessages: () => [],
    ...overrides,
  };
}

describe('runGuardsForTool', () => {
  it('returns { allowed: true, injections: [] } when guardConfig is undefined', () => {
    const tool = makeReadTool();
    const internal = makeInternal({ guardConfig: undefined });

    const out = runGuardsForTool(tool, { id: 'c1', name: tool.name, input: { x: 'a' } }, internal);

    expect(out.allowed).toBe(true);
    expect(out.injections).toEqual([]);
    expect(out.needsStructuredInput).toBe(false);
  });

  it('runs DEFAULT_GUARD_CONFIG without blocking a read tool with valid input', () => {
    const tool = makeReadTool();
    const internal = makeInternal({ guardConfig: DEFAULT_GUARD_CONFIG });

    const out = runGuardsForTool(tool, { id: 'c2', name: tool.name, input: { x: 'a' } }, internal);

    expect(out.allowed).toBe(true);
  });

  it('blocks when tool.preflight returns invalid', () => {
    const tool: LegacyTool = {
      ...makeWriteTool(),
      preflight: () => ({ valid: false, error: 'amount must be positive' }),
    };
    const internal = makeInternal({ guardConfig: DEFAULT_GUARD_CONFIG });

    const out = runGuardsForTool(
      tool,
      { id: 'c3', name: tool.name, input: { amount: -1 } },
      internal,
    );

    expect(out.allowed).toBe(false);
    expect(out.blockGate).toBe('input_validation');
    expect(out.blockReason).toContain('amount must be positive');
  });

  it('returns needsStructuredInput when preflight returns needsInput', () => {
    const tool: LegacyTool = {
      ...makeWriteTool(),
      preflight: () =>
        ({
          valid: false,
          needsInput: { schema: { fields: [] }, description: 'need a name' },
        }) as ReturnType<NonNullable<LegacyTool['preflight']>>,
    };
    const internal = makeInternal({ guardConfig: DEFAULT_GUARD_CONFIG });

    const out = runGuardsForTool(tool, { id: 'c4', name: tool.name, input: {} }, internal);

    expect(out.allowed).toBe(false);
    expect(out.needsStructuredInput).toBe(true);
    expect(out.blockGate).toBe('pending_input');
  });
});

describe('GuardBlockedError', () => {
  it('carries the gate id alongside the message', () => {
    const err = new GuardBlockedError('health_factor', 'HF too low');
    expect(err).toBeInstanceOf(Error);
    expect(err.gate).toBe('health_factor');
    expect(err.message).toBe('HF too low');
    expect(err.name).toBe('GuardBlockedError');
  });
});
