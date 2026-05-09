import { describe, expect, it } from 'vitest';
import type { SerializedCetusRoute } from '@t2000/sdk';
import { buildCanonicalRouteText } from '../engine.js';
import type { PendingAction, PermissionResponse } from '../types.js';

/**
 * [SPEC 20.2 / D-4 (b) follow-on, 2026-05-10] Per-step tx-success gate
 * regression tests.
 *
 * The bug: the engine was injecting a `<canonical_route>` text block on
 * every approved resume, regardless of whether the underlying tx
 * actually executed. When the bundle reverted at the Enoki sponsor
 * stage (production smoke 2026-05-09, session
 * s_1778362657811_c0ed9009a5fb), the LLM saw a strong "the user just
 * approved a swap; the canonical route taken on-chain is X" directive
 * AND the failed tool_results in the same user message. The directive
 * overrode the failure context and the LLM narrated "executed
 * atomically" for a tx that never reached chain — a money-trust
 * failure.
 *
 * These tests pin the gate so the regression cannot recur silently.
 */

const FAKE_CETUS_ROUTE: SerializedCetusRoute = {
  routerData: {
    quoteID: 'q-test-1',
    amountIn: '500000',
    amountOut: '466388',
    byAmountIn: true,
    paths: [
      {
        id: 'p1',
        direction: true,
        provider: 'CETUS',
        from: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
        target: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
        feeRate: 0.0001,
        amountIn: '500000',
        amountOut: '466388',
      },
    ],
    insufficientLiquidity: false,
    deviationRatio: 0,
  },
  amountIn: '500000',
  amountOut: '466388',
  byAmountIn: true,
  priceImpact: 0.001,
  insufficientLiquidity: false,
  discoveredAt: Date.now(),
  fromCoinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
  toCoinType: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
};

function singleSwapAction(): PendingAction {
  return {
    toolUseId: 'sw1',
    toolName: 'swap_execute',
    input: { from: 'USDC', to: 'SUI', amount: 0.5 },
    permissionLevel: 'confirm',
    cetusRoute: FAKE_CETUS_ROUTE,
    attemptId: '00000000-0000-4000-8000-000000000001',
  } as unknown as PendingAction;
}

function bundleAction(): PendingAction {
  return {
    toolUseId: 'bundle1',
    toolName: 'prepare_bundle',
    input: {},
    permissionLevel: 'confirm',
    attemptId: '00000000-0000-4000-8000-000000000002',
    steps: [
      {
        toolUseId: 'sw_step',
        toolName: 'swap_execute',
        input: { from: 'USDC', to: 'SUI', amount: 0.5 },
        cetusRoute: FAKE_CETUS_ROUTE,
        attemptId: '00000000-0000-4000-8000-000000000003',
      },
      {
        toolUseId: 'save_step',
        toolName: 'save_deposit',
        input: { amount: 19.609066, asset: 'USDC' },
        attemptId: '00000000-0000-4000-8000-000000000004',
      },
    ],
  } as unknown as PendingAction;
}

describe('buildCanonicalRouteText — per-step tx-success gate (D-4 b)', () => {
  describe('bundle case', () => {
    it('returns null when EVERY step has isError=true (the production-bug repro)', () => {
      // Reproduces the 2026-05-09 production failure: Enoki sponsor
      // returned err_amount_out_slippage_check_failed → audric sent
      // both stepResults with `_bundleReverted: true` + `isError: true`.
      // Pre-fix the engine still emitted the canonical_route block.
      const action = bundleAction();
      const response: PermissionResponse = {
        approved: true,
        stepResults: [
          {
            toolUseId: 'sw_step',
            attemptId: '00000000-0000-4000-8000-000000000003',
            result: { error: 'Bundle execution failed', _bundleReverted: true },
            isError: true,
          },
          {
            toolUseId: 'save_step',
            attemptId: '00000000-0000-4000-8000-000000000004',
            result: { error: 'Bundle execution failed', _bundleReverted: true },
            isError: true,
          },
        ],
      };

      expect(buildCanonicalRouteText(action, response)).toBeNull();
    });

    it('returns null when the swap step has isError=true even if other steps would succeed', () => {
      const action = bundleAction();
      const response: PermissionResponse = {
        approved: true,
        stepResults: [
          {
            toolUseId: 'sw_step',
            attemptId: '00000000-0000-4000-8000-000000000003',
            result: { error: 'slippage', _bundleReverted: true },
            isError: true,
          },
          {
            toolUseId: 'save_step',
            attemptId: '00000000-0000-4000-8000-000000000004',
            result: { tx: '0xabc' },
            isError: false,
          },
        ],
      };

      expect(buildCanonicalRouteText(action, response)).toBeNull();
    });

    it('emits the canonical_route block for a fully-succeeded bundle', () => {
      const action = bundleAction();
      const response: PermissionResponse = {
        approved: true,
        stepResults: [
          {
            toolUseId: 'sw_step',
            attemptId: '00000000-0000-4000-8000-000000000003',
            result: { tx: '0xabc', amountOut: '466388' },
            isError: false,
          },
          {
            toolUseId: 'save_step',
            attemptId: '00000000-0000-4000-8000-000000000004',
            result: { tx: '0xabc' },
            isError: false,
          },
        ],
      };

      const text = buildCanonicalRouteText(action, response);
      expect(text).not.toBeNull();
      expect(text).toContain('<canonical_route>');
      expect(text).toContain('Pair: USDC → SUI');
      expect(text).toContain('Path: CETUS');
    });

    it('treats a missing stepResult as failure (atomic-semantics safety)', () => {
      // The engine's runtime path already flags missing stepResults as
      // errors via the `_hostBugMissingStepResult` branch. The
      // canonical_route gate must mirror that fail-closed behavior so
      // the LLM never sees a "route taken on-chain" claim about a step
      // whose actual outcome is unknown.
      const action = bundleAction();
      const response: PermissionResponse = {
        approved: true,
        stepResults: [
          // sw_step missing
          {
            toolUseId: 'save_step',
            attemptId: '00000000-0000-4000-8000-000000000004',
            result: { tx: '0xabc' },
            isError: false,
          },
        ],
      };

      expect(buildCanonicalRouteText(action, response)).toBeNull();
    });

    it('returns null when stepResults is omitted entirely', () => {
      const action = bundleAction();
      const response: PermissionResponse = { approved: true };

      expect(buildCanonicalRouteText(action, response)).toBeNull();
    });
  });

  describe('single-write case', () => {
    it('returns null when executionResult signals failure via `success: false`', () => {
      const action = singleSwapAction();
      const response: PermissionResponse = {
        approved: true,
        executionResult: { success: false, data: { error: 'swap reverted' } },
      };

      expect(buildCanonicalRouteText(action, response)).toBeNull();
    });

    it('returns null when executionResult carries `_bundleReverted` sentinel', () => {
      const action = singleSwapAction();
      const response: PermissionResponse = {
        approved: true,
        executionResult: { error: 'reverted', _bundleReverted: true },
      };

      expect(buildCanonicalRouteText(action, response)).toBeNull();
    });

    it('returns null when executionResult carries `_sessionExpired` sentinel', () => {
      const action = singleSwapAction();
      const response: PermissionResponse = {
        approved: true,
        executionResult: { error: 'session expired', _sessionExpired: true },
      };

      expect(buildCanonicalRouteText(action, response)).toBeNull();
    });

    it('returns null when executionResult.error is a non-empty string', () => {
      const action = singleSwapAction();
      const response: PermissionResponse = {
        approved: true,
        executionResult: { error: 'something broke' },
      };

      expect(buildCanonicalRouteText(action, response)).toBeNull();
    });

    it('emits the canonical_route block for a successful single-swap', () => {
      const action = singleSwapAction();
      const response: PermissionResponse = {
        approved: true,
        executionResult: { tx: '0xabc', amountOut: '466388' },
      };

      const text = buildCanonicalRouteText(action, response);
      expect(text).not.toBeNull();
      expect(text).toContain('<canonical_route>');
      expect(text).toContain('Pair: USDC → SUI');
    });

    it('emits the canonical_route block when executionResult is omitted (defaults to success per legacy contract)', () => {
      // Legacy hosts that don't populate executionResult (some test
      // harnesses, older clients) shouldn't suddenly stop seeing the
      // route block. The "is this a failure?" predicate is conservative
      // — undefined → not a failure → emit the block.
      const action = singleSwapAction();
      const response: PermissionResponse = { approved: true };

      const text = buildCanonicalRouteText(action, response);
      expect(text).not.toBeNull();
      expect(text).toContain('<canonical_route>');
    });
  });
});
