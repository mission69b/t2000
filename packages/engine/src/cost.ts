// Claude Sonnet 4 pricing (USD per token)
const DEFAULT_INPUT_COST = 3 / 1_000_000; // $3 per 1M input tokens
const DEFAULT_OUTPUT_COST = 15 / 1_000_000; // $15 per 1M output tokens
const CACHE_WRITE_MULTIPLIER = 1.25; // 1.25x input rate
const CACHE_READ_MULTIPLIER = 0.1; // 0.1x input rate

export interface CostSnapshot {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface CostTrackerConfig {
  budgetLimitUsd?: number;
  inputCostPerToken?: number;
  outputCostPerToken?: number;
}

export class CostTracker {
  private inputTokens = 0;
  private outputTokens = 0;
  private cacheReadTokens = 0;
  private cacheWriteTokens = 0;
  private readonly budgetLimitUsd: number | null;
  private readonly inputCost: number;
  private readonly outputCost: number;

  constructor(config: CostTrackerConfig = {}) {
    this.budgetLimitUsd = config.budgetLimitUsd ?? null;
    this.inputCost = config.inputCostPerToken ?? DEFAULT_INPUT_COST;
    this.outputCost = config.outputCostPerToken ?? DEFAULT_OUTPUT_COST;
  }

  track(
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens?: number,
    cacheWriteTokens?: number,
  ): void {
    this.inputTokens += inputTokens;
    this.outputTokens += outputTokens;
    this.cacheReadTokens += cacheReadTokens ?? 0;
    this.cacheWriteTokens += cacheWriteTokens ?? 0;
  }

  getSnapshot(): CostSnapshot {
    const totalTokens =
      this.inputTokens + this.outputTokens + this.cacheReadTokens + this.cacheWriteTokens;

    const estimatedCostUsd =
      this.inputTokens * this.inputCost +
      this.outputTokens * this.outputCost +
      this.cacheReadTokens * this.inputCost * CACHE_READ_MULTIPLIER +
      this.cacheWriteTokens * this.inputCost * CACHE_WRITE_MULTIPLIER;

    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      cacheReadTokens: this.cacheReadTokens,
      cacheWriteTokens: this.cacheWriteTokens,
      totalTokens,
      estimatedCostUsd,
    };
  }

  isOverBudget(): boolean {
    if (this.budgetLimitUsd === null) return false;
    return this.getSnapshot().estimatedCostUsd >= this.budgetLimitUsd;
  }

  getRemainingBudgetUsd(): number | null {
    if (this.budgetLimitUsd === null) return null;
    return Math.max(0, this.budgetLimitUsd - this.getSnapshot().estimatedCostUsd);
  }

  reset(): void {
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.cacheReadTokens = 0;
    this.cacheWriteTokens = 0;
  }
}
