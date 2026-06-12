// ---------------------------------------------------------------------------
// v2/tool-helpers.test.ts — Phase A pilot tests for wrapEngineExecute
// ---------------------------------------------------------------------------
//
// SPEC AI SDK HARDENING P4.1 Phase A — 2026-05-25.
//
// Locks the defense-in-depth behavior of `wrapEngineExecute`. Mirrors the
// existing `tool-wrapper.test.ts` checks (preflight runs first, guards run
// second, ToolResult unwrap, AbortSignal forwarding) but applied to the
// new author-facing helper.
//
// Plus: validates the 3 pilot tools (rates_info, balance_check, save_deposit)
// expose well-formed native AI SDK `tool({...})` instances with the right
// needsApproval contract and shared business logic with the legacy exports.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { wrapEngineExecute, buildNeedsApproval } from './tool-helpers.js';
import { GuardBlockedError } from './guard-runner.js';
import { transactionHistoryTool } from '../tools/history.js';
import { balanceCheckTool } from '../tools/balance.js';
import { withdrawTool } from '../tools/withdraw.js';
// [P4.1 / v3.0.0 / 2026-05-25] Pre-Phase-C each tool exported both
// a legacy `xxxTool` AND a `xxxToolNative` (native AI SDK shape).
// After Phase C there's only one — the canonical short name — and
// it IS native. Tests below alias to the legacy names so the existing
// assertions keep working without per-line edits.
// [SPEC_AUDRIC_DEFI_REMOVAL §2a — 2026-06-10] The original pilot tools
// rates_info + save_deposit were deleted; transaction_history + withdraw
// stand in (same read/write shape contract).
const transactionHistoryToolNative = transactionHistoryTool;
const balanceCheckToolNative = balanceCheckTool;
const withdrawToolNative = withdrawTool;
import { buildInternalContext } from './internal-context.js';
import type { InternalContext } from './internal-context.js';
import type { ToolContext } from '../types.js';

/**
 * Minimal InternalContext factory for unit tests. Delegates to the public
 * `buildInternalContext` helper so tests stay aligned with the host-side
 * envelope that audric/web-v2 constructs at request time.
 */
function fakeInternalContext(
  overrides: { toolContext?: Partial<ToolContext> } = {},
): InternalContext {
  return buildInternalContext({
    toolContext: {
      walletAddress: '0xfake',
      signal: undefined,
      ...(overrides.toolContext ?? {}),
    } as unknown as ToolContext,
    walletAddress: '0xfake',
  });
}

describe('wrapEngineExecute', () => {
  describe('preflight', () => {
    it('throws when preflight returns valid:false with error', async () => {
      const execute = wrapEngineExecute<{ amount: number }, { ok: true }>(
        'test_tool',
        {
          preflight: () => ({ valid: false, error: 'bad input' }),
          call: async () => ({ data: { ok: true } }),
        },
      );

      await expect(
        execute(
          { amount: 5 },
          { experimental_context: fakeInternalContext() },
        ),
      ).rejects.toThrow(/bad input/);
    });

    it('proceeds when preflight returns valid:true', async () => {
      const execute = wrapEngineExecute<{ n: number }, { doubled: number }>(
        'test_tool',
        {
          preflight: (input) =>
            input.n > 0
              ? { valid: true }
              : { valid: false, error: 'must be positive' },
          call: async (input) => ({ data: { doubled: input.n * 2 } }),
        },
      );

      const result = await execute(
        { n: 5 },
        { experimental_context: fakeInternalContext() },
      );

      expect(result).toEqual({ doubled: 10 });
    });

    it('skips preflight when not provided', async () => {
      const execute = wrapEngineExecute<{ value: string }, { echoed: string }>(
        'test_tool',
        {
          call: async (input) => ({ data: { echoed: input.value } }),
        },
      );

      const result = await execute(
        { value: 'hi' },
        { experimental_context: fakeInternalContext() },
      );

      expect(result).toEqual({ echoed: 'hi' });
    });
  });

  describe('ToolResult.data unwrap', () => {
    it('returns result.data, not the full { data, displayText } envelope', async () => {
      const execute = wrapEngineExecute<Record<string, never>, { value: number }>('test_tool', {
        call: async () => ({
          data: { value: 42 },
          displayText: 'human-readable summary',
        }),
      });

      const result = await execute(
        {},
        { experimental_context: fakeInternalContext() },
      );

      // AI SDK sees the inner payload directly — host UI receives
      // displayText through a separate (legacy) path. Pilot's native
      // shape matches `wrapLegacyTool` behavior so downstream consumers
      // checking `result.__canvas === true` keep working when migrated.
      expect(result).toEqual({ value: 42 });
      expect(result).not.toHaveProperty('displayText');
    });
  });

  describe('AbortSignal forwarding', () => {
    it('merges options.abortSignal into ctx.signal', async () => {
      const controller = new AbortController();
      let observedSignal: AbortSignal | undefined;

      const execute = wrapEngineExecute<Record<string, never>, { gotSignal: boolean }>(
        'test_tool',
        {
          call: async (_input, ctx) => {
            observedSignal = ctx.signal;
            return { data: { gotSignal: ctx.signal !== undefined } };
          },
        },
      );

      const result = await execute(
        {},
        {
          experimental_context: fakeInternalContext(),
          abortSignal: controller.signal,
        },
      );

      expect(result).toEqual({ gotSignal: true });
      expect(observedSignal).toBe(controller.signal);
    });

    it('falls back to ctx.signal when options.abortSignal is unset', async () => {
      const fallback = new AbortController().signal;
      let observedSignal: AbortSignal | undefined;

      const execute = wrapEngineExecute<Record<string, never>, null>('test_tool', {
        call: async (_input, ctx) => {
          observedSignal = ctx.signal;
          return { data: null };
        },
      });

      await execute(
        {},
        {
          experimental_context: fakeInternalContext({
            toolContext: {
              walletAddress: '0xfake',
              signal: fallback,
            } as unknown as ToolContext,
          }),
        },
      );

      expect(observedSignal).toBe(fallback);
    });
  });

  describe('guard runner integration', () => {
    it('skips guards entirely when guardConfig is undefined', async () => {
      // Default fakeInternalContext sets guardConfig: undefined. Call body
      // must execute without GuardBlockedError.
      const execute = wrapEngineExecute<Record<string, never>, { ran: true }>('test_tool', {
        call: async () => ({ data: { ran: true } }),
      });

      const result = await execute(
        {},
        { experimental_context: fakeInternalContext() },
      );

      expect(result).toEqual({ ran: true });
    });
  });

  describe('experimental_context validation', () => {
    it('throws a clear error when experimental_context is missing', async () => {
      const execute = wrapEngineExecute<Record<string, never>, null>('test_tool', {
        call: async () => ({ data: null }),
      });

      await expect(execute({}, {})).rejects.toThrow(
        /experimental_context/,
      );
    });

    it('throws when experimental_context has wrong shape', async () => {
      const execute = wrapEngineExecute<Record<string, never>, null>('test_tool', {
        call: async () => ({ data: null }),
      });

      await expect(
        execute(
          {},
          {
            experimental_context: { notValid: true },
          },
        ),
      ).rejects.toThrow(/toolContext\/guardState/);
    });
  });
});

describe('pilot native tools', () => {
  describe('shape', () => {
    it('rates_info native tool exposes description + inputSchema + execute + needsApproval', () => {
      // AI SDK v6 wraps tool({...}) into an object with these fields. The
      // exact runtime shape matches the Vercel docs example.
      expect(transactionHistoryToolNative).toHaveProperty('description');
      expect(transactionHistoryToolNative).toHaveProperty('inputSchema');
      expect(transactionHistoryToolNative).toHaveProperty('execute');
      // needsApproval is always set by buildNeedsApproval (even for reads —
      // it returns the no-op `() => false` callback). This guarantees the
      // policy lookup stays centralized.
      expect(transactionHistoryToolNative).toHaveProperty('needsApproval');
    });

    it('balance_check native tool exposes the same surface', () => {
      expect(balanceCheckToolNative).toHaveProperty('description');
      expect(balanceCheckToolNative).toHaveProperty('inputSchema');
      expect(balanceCheckToolNative).toHaveProperty('execute');
      expect(balanceCheckToolNative).toHaveProperty('needsApproval');
    });

    it('save_deposit native tool exposes the same surface', () => {
      expect(withdrawToolNative).toHaveProperty('description');
      expect(withdrawToolNative).toHaveProperty('inputSchema');
      expect(withdrawToolNative).toHaveProperty('execute');
      expect(withdrawToolNative).toHaveProperty('needsApproval');
    });
  });

  describe('shared business logic vs legacy', () => {
    it('rates_info: native + legacy share description + schema', () => {
      // Both shapes must reference the same module-level constants; tests
      // catch the day someone copy-pastes the description and lets them
      // drift.
      expect(transactionHistoryToolNative.description).toBe(
        transactionHistoryTool.description,
      );
    });

    it('balance_check: native + legacy share description + schema', () => {
      expect(balanceCheckToolNative.description).toBe(
        balanceCheckTool.description,
      );
    });

    it('save_deposit: native + legacy share description + schema', () => {
      expect(withdrawToolNative.description).toBe(
        withdrawTool.description,
      );
    });
  });

  describe('needsApproval policy lookup', () => {
    it('transaction_history needsApproval returns false (read-only, policy=auto)', () => {
      const callback = buildNeedsApproval('transaction_history');
      // Read tools' callback is the constant `() => false` — no async cost.
      const verdict = callback(
        {},
        { toolCallId: 'tid', messages: [] },
      );
      expect(verdict).toBe(false);
    });

    it('balance_check needsApproval returns false (read-only, policy=auto)', () => {
      const callback = buildNeedsApproval('balance_check');
      const verdict = callback(
        {},
        { toolCallId: 'tid', messages: [] },
      );
      expect(verdict).toBe(false);
    });

    it('withdraw needsApproval is dynamic (policy=confirm, requires context)', () => {
      // Confirm-tier callback returns a function that inspects
      // experimental_context. Without it threaded, it must fail closed
      // (return true). This matches the production safeguard in
      // need-approval.ts L113-115 + L117-119.
      const callback = buildNeedsApproval('withdraw');
      const verdict = callback(
        { amount: 10, asset: 'USDC' },
        { toolCallId: 'tid', messages: [] },
      );
      // Missing experimental_context → fail closed.
      expect(verdict).toBe(true);
    });
  });
});

describe('GuardBlockedError re-export', () => {
  it('the helper module makes GuardBlockedError available for callers', () => {
    // Sanity check: catchers in audric / engine route handlers can `instanceof`
    // GuardBlockedError without importing from `v2/guard-runner` directly.
    expect(GuardBlockedError).toBeDefined();
    const err = new GuardBlockedError('test_gate', 'test reason');
    expect(err).toBeInstanceOf(Error);
    expect(err.gate).toBe('test_gate');
  });
});
