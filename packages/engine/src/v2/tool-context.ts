// ---------------------------------------------------------------------------
// v2/tool-context.ts — build ToolContext from AISDKEngineConfig
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 2 (2026-05-15).
//
// Builds a `ToolContext` from the engine config + per-request bits.
// Threaded into AI SDK `tool.execute()` via `experimental_context`.
//
// Why a builder vs constructing inline at every streamText call:
//   - Centralises per-request state derivation (priceCache, retryStats,
//     portfolioCache) in one place.
//   - Tests can swap the builder to inject mocks.
//   - Day 3+ adds onAutoExecuted / onGuardFired threading; the builder
//     absorbs that without touching engine.ts.
//
// What's explicitly NOT here yet (Day 2 scope):
//   - Per-request retry counter wiring (Day 3 — needs to plumb through
//     onStepFinish to read retryStats.attemptCount back).
//   - Daily session-spend lookup (Day 3 — comes from audric callback).
// ---------------------------------------------------------------------------

import type { ToolContext } from '../types.js';
import type { AISDKEngineConfig } from './engine.js';

/**
 * Build a fresh ToolContext for one streamText call.
 *
 * The returned context is shared across every tool dispatched in that
 * turn (AI SDK calls each tool's execute() with the same
 * `experimental_context` reference). Treat the context as immutable
 * inside tools — mutation across parallel tool calls is undefined
 * behaviour per AI SDK docs.
 *
 * The lone exception is `retryStats`: it's a ref-shaped mutable counter
 * because retry wrappers deep in the call stack need to bump it without
 * rebuilding the context. Same pattern as legacy engine (see
 * `types.ts:retryStats` JSDoc).
 */
export function buildToolContext(
  config: AISDKEngineConfig,
  perTurn: {
    /**
     * Fresh AbortSignal for this turn. Forwarded to tools that respect
     * it (e.g., long-running BlockVision calls bail when user hits ✕).
     */
    signal: AbortSignal;
    /**
     * Fresh portfolio cache for this turn. AI SDK turn-scoped Map.
     * Multiple read tools in the same turn share BlockVision results
     * (avoids 200-500ms RTT amplification per `agent-harness-spec.mdc`).
     */
    portfolioCache?: Map<string, import('../blockvision-prices.js').AddressPortfolio>;
  },
): ToolContext {
  return {
    agent: config.agent,
    mcpManager: undefined,
    walletAddress: config.walletAddress,
    suiRpcUrl: config.suiRpcUrl,
    serverPositions: config.serverPositions,
    positionFetcher: config.positionFetcher,
    env: config.env,
    signal: perTurn.signal,
    priceCache: config.priceCache,
    permissionConfig: config.permissionConfig,
    sessionSpendUsd: config.sessionSpendUsd,
    blockvisionApiKey: config.blockvisionApiKey,
    portfolioCache: perTurn.portfolioCache ?? config.portfolioCache ?? new Map(),
    retryStats: { attemptCount: 1 },
  };
}

/**
 * Type guard: is this object a ToolContext (vs the spike's
 * SpikeToolContext or a misconfigured experimental_context payload).
 *
 * Lets tools' execute() bodies fail fast with a useful error rather
 * than the cryptic "Cannot read property 'walletAddress' of undefined"
 * when the engine forgot to thread context.
 */
export function isToolContext(value: unknown): value is ToolContext {
  if (typeof value !== 'object' || value === null) return false;
  // Minimal shape check — walletAddress is optional but if present must
  // be a string. The retryStats object IS load-bearing (every tool
  // assumes it exists).
  const v = value as Record<string, unknown>;
  if ('walletAddress' in v && v.walletAddress !== undefined && typeof v.walletAddress !== 'string') {
    return false;
  }
  return true;
}
