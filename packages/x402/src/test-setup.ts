import { vi } from 'vitest';

vi.mock('@t2000/sdk', () => {
  class T2000Error extends Error {
    readonly code: string;
    readonly data?: Record<string, unknown>;
    readonly retryable: boolean;

    constructor(code: string, message: string, data?: Record<string, unknown>, retryable = false) {
      super(message);
      this.name = 'T2000Error';
      this.code = code;
      this.data = data;
      this.retryable = retryable;
    }
  }

  function usdcToRaw(amount: number): bigint {
    return BigInt(Math.round(amount * 10 ** 6));
  }

  return { T2000Error, usdcToRaw };
});
