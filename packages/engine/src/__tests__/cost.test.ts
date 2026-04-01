import { describe, it, expect } from 'vitest';
import { CostTracker } from '../cost.js';

describe('CostTracker', () => {
  it('tracks cumulative token usage', () => {
    const tracker = new CostTracker();
    tracker.track(1000, 500);
    tracker.track(2000, 300);

    const snap = tracker.getSnapshot();
    expect(snap.inputTokens).toBe(3000);
    expect(snap.outputTokens).toBe(800);
    expect(snap.totalTokens).toBe(3800);
  });

  it('estimates cost in USD', () => {
    const tracker = new CostTracker();
    tracker.track(1_000_000, 100_000);

    const snap = tracker.getSnapshot();
    // $3/MTok input + $15/MTok output = $3 + $1.50 = $4.50
    expect(snap.estimatedCostUsd).toBeCloseTo(4.5, 2);
  });

  it('enforces budget limits', () => {
    const tracker = new CostTracker({ budgetLimitUsd: 0.01 });
    expect(tracker.isOverBudget()).toBe(false);

    tracker.track(1_000_000, 100_000); // ~$4.50
    expect(tracker.isOverBudget()).toBe(true);
  });

  it('returns remaining budget', () => {
    const tracker = new CostTracker({ budgetLimitUsd: 10.0 });
    tracker.track(1_000_000, 100_000); // ~$4.50

    const remaining = tracker.getRemainingBudgetUsd();
    expect(remaining).not.toBeNull();
    expect(remaining!).toBeCloseTo(5.5, 1);
  });

  it('returns null remaining when no budget set', () => {
    const tracker = new CostTracker();
    expect(tracker.getRemainingBudgetUsd()).toBeNull();
  });

  it('resets counters', () => {
    const tracker = new CostTracker();
    tracker.track(5000, 2000);
    tracker.reset();

    const snap = tracker.getSnapshot();
    expect(snap.inputTokens).toBe(0);
    expect(snap.outputTokens).toBe(0);
    expect(snap.estimatedCostUsd).toBe(0);
  });

  it('accepts custom pricing', () => {
    const tracker = new CostTracker({
      inputCostPerToken: 1 / 1_000_000, // $1/MTok
      outputCostPerToken: 5 / 1_000_000, // $5/MTok
    });
    tracker.track(1_000_000, 1_000_000);

    const snap = tracker.getSnapshot();
    expect(snap.estimatedCostUsd).toBeCloseTo(6.0, 2);
  });

  it('tracks cache tokens separately', () => {
    const tracker = new CostTracker();
    tracker.track(1000, 500, 200, 100);

    const snap = tracker.getSnapshot();
    expect(snap.cacheReadTokens).toBe(200);
    expect(snap.cacheWriteTokens).toBe(100);
    expect(snap.totalTokens).toBe(1800); // 1000 + 500 + 200 + 100
  });

  it('factors cache tokens into cost estimate', () => {
    const tracker = new CostTracker();
    // Cache write at 1.25x input, cache read at 0.1x input
    tracker.track(0, 0, 1_000_000, 1_000_000);

    const snap = tracker.getSnapshot();
    // cache_read: 1M * $3/MTok * 0.1 = $0.30
    // cache_write: 1M * $3/MTok * 1.25 = $3.75
    expect(snap.estimatedCostUsd).toBeCloseTo(4.05, 2);
  });
});
