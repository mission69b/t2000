import { T2000Error, SafeguardError } from '@t2000/sdk';

interface McpToolError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export function mapError(err: unknown): McpToolError {
  if (err instanceof SafeguardError) {
    return {
      code: 'SAFEGUARD_BLOCKED',
      message: err.message,
      retryable: false,
      details: { rule: err.rule, ...err.details },
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
