/**
 * SPEC 7 P2.3 Layer 2 — Quote-Refresh ReviewCard freshness budgets.
 */
import { describe, it, expect } from 'vitest';
import {
  TOOL_TTL_MS,
  DEFAULT_TOOL_TTL_MS,
  bundleShortestTtl,
  REGENERATABLE_READ_TOOLS,
} from '../tool-ttls.js';

describe('tool-ttls', () => {
  it('returns DEFAULT_TOOL_TTL_MS for empty input', () => {
    expect(bundleShortestTtl([], {})).toBe(DEFAULT_TOOL_TTL_MS);
  });

  it('returns the swap_quote TTL when only swap_quote contributes', () => {
    expect(bundleShortestTtl(['id-1'], { 'id-1': 'swap_quote' })).toBe(
      TOOL_TTL_MS.swap_quote,
    );
  });

  it('returns the SHORTEST TTL across multiple contributing reads', () => {
    // swap_quote (30s) + rates_info (90s) → 30s
    const result = bundleShortestTtl(
      ['id-1', 'id-2'],
      { 'id-1': 'rates_info', 'id-2': 'swap_quote' },
    );
    expect(result).toBe(TOOL_TTL_MS.swap_quote);
  });

  it('falls back to DEFAULT_TOOL_TTL_MS for unknown tool names', () => {
    expect(bundleShortestTtl(['id-1'], { 'id-1': 'unknown_tool' })).toBe(
      DEFAULT_TOOL_TTL_MS,
    );
  });

  it('REGENERATABLE_READ_TOOLS includes the canonical regeneratable set', () => {
    expect(REGENERATABLE_READ_TOOLS.has('swap_quote')).toBe(true);
    expect(REGENERATABLE_READ_TOOLS.has('rates_info')).toBe(true);
    expect(REGENERATABLE_READ_TOOLS.has('balance_check')).toBe(true);
    expect(REGENERATABLE_READ_TOOLS.has('portfolio_analysis')).toBe(true);
    expect(REGENERATABLE_READ_TOOLS.has('savings_info')).toBe(true);
    expect(REGENERATABLE_READ_TOOLS.has('health_check')).toBe(true);
  });

  it('REGENERATABLE_READ_TOOLS excludes write tools', () => {
    expect(REGENERATABLE_READ_TOOLS.has('send_transfer')).toBe(false);
    expect(REGENERATABLE_READ_TOOLS.has('save_deposit')).toBe(false);
    expect(REGENERATABLE_READ_TOOLS.has('swap_execute')).toBe(false);
  });
});
