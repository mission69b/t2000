import { T2000Error, LimitExceededError } from '@t2000/sdk';

interface McpToolError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export function mapError(err: unknown): McpToolError {
  if (err instanceof LimitExceededError) {
    return {
      code: err.code, // 'LIMIT_EXCEEDED'
      message: err.message,
      retryable: false,
      details: {
        operation: err.operation,
        limitKind: err.limitKind,
        limit: err.limit,
        attempted: err.attempted,
      },
    };
  }

  if (err instanceof T2000Error) {
    return {
      code: err.code,
      message: err.message,
      retryable: err.retryable,
    };
  }

  return {
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : String(err),
    retryable: false,
  };
}

export function errorResult(err: unknown) {
  const mapped = mapError(err);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(mapped) }],
    isError: true,
  };
}
