import { describe, it, expect } from 'vitest';
import { clampThinkingForEffort, EFFORT_THINKING_BUDGET_CAPS } from '../thinking-budget.js';

describe('clampThinkingForEffort', () => {
  it('returns config unchanged when effort is undefined', () => {
    const config = { type: 'enabled' as const, budgetTokens: 64_000 };
    expect(clampThinkingForEffort(config, undefined)).toBe(config);
  });

  it('returns undefined when config is undefined', () => {
    expect(clampThinkingForEffort(undefined, 'medium')).toBeUndefined();
  });

  it('forces disabled for low effort regardless of input', () => {
    expect(clampThinkingForEffort({ type: 'enabled', budgetTokens: 8_000 }, 'low')).toEqual({ type: 'disabled' });
    expect(clampThinkingForEffort({ type: 'adaptive' }, 'low')).toEqual({ type: 'disabled' });
    expect(clampThinkingForEffort({ type: 'disabled' }, 'low')).toEqual({ type: 'disabled' });
  });

  it('clamps medium budget to 8k', () => {
    const result = clampThinkingForEffort({ type: 'enabled', budgetTokens: 32_000 }, 'medium');
    expect(result).toEqual({ type: 'enabled', budgetTokens: 8_000 });
  });

  it('clamps high budget to 16k', () => {
    const result = clampThinkingForEffort({ type: 'enabled', budgetTokens: 64_000 }, 'high');
    expect(result).toEqual({ type: 'enabled', budgetTokens: 16_000 });
  });

  it('clamps max budget to 32k', () => {
    const result = clampThinkingForEffort({ type: 'enabled', budgetTokens: 100_000 }, 'max');
    expect(result).toEqual({ type: 'enabled', budgetTokens: 32_000 });
  });

  it('does NOT inflate a smaller host budget', () => {
    const result = clampThinkingForEffort({ type: 'enabled', budgetTokens: 4_000 }, 'high');
    expect(result).toEqual({ type: 'enabled', budgetTokens: 4_000 });
  });

  it('preserves display option when clamping', () => {
    const result = clampThinkingForEffort(
      { type: 'enabled', budgetTokens: 64_000, display: 'summarized' },
      'high',
    );
    expect(result).toEqual({ type: 'enabled', budgetTokens: 16_000, display: 'summarized' });
  });

  it('leaves adaptive config unchanged for non-low effort', () => {
    const config = { type: 'adaptive' as const, display: 'omitted' as const };
    expect(clampThinkingForEffort(config, 'medium')).toBe(config);
    expect(clampThinkingForEffort(config, 'high')).toBe(config);
    expect(clampThinkingForEffort(config, 'max')).toBe(config);
  });

  it('cap map matches the spec values', () => {
    expect(EFFORT_THINKING_BUDGET_CAPS.low).toBeNull();
    expect(EFFORT_THINKING_BUDGET_CAPS.medium).toBe(8_000);
    expect(EFFORT_THINKING_BUDGET_CAPS.high).toBe(16_000);
    expect(EFFORT_THINKING_BUDGET_CAPS.max).toBe(32_000);
  });
});
