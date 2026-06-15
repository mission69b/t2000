// Spending-limit error — thrown by the unified limits gate (`@t2000/sdk/limits`)
// when an outbound write exceeds an opted-in cap. Shared by CLI + MCP +
// programmatic callers (the gate lives in the SDK write paths). Carries a
// structured shape so the CLI can render `--json` output and the MCP can
// surface a typed failure.

export type LimitKind = 'perTxUsd' | 'dailyUsd';
export type LimitOperation = 'send' | 'swap' | 'pay';

export class LimitExceededError extends Error {
  readonly code = 'LIMIT_EXCEEDED';
  readonly operation: LimitOperation;
  readonly limitKind: LimitKind;
  readonly limit: number;
  readonly attempted: number;

  constructor(params: {
    operation: LimitOperation;
    limitKind: LimitKind;
    limit: number;
    attempted: number;
  }) {
    const label = params.limitKind === 'perTxUsd' ? 'per-transaction limit' : 'daily spend limit';
    super(
      `Exceeds ${label} ($${params.limit}). Attempted $${params.attempted.toFixed(2)}. Use --force / force:true to override.`,
    );
    this.name = 'LimitExceededError';
    this.operation = params.operation;
    this.limitKind = params.limitKind;
    this.limit = params.limit;
    this.attempted = params.attempted;
  }

  toJSON(): unknown {
    return {
      error: this.code,
      message: this.message,
      operation: this.operation,
      limitKind: this.limitKind,
      limit: this.limit,
      attempted: this.attempted,
    };
  }
}
