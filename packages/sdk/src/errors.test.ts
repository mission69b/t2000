import { describe, it, expect } from 'vitest';
import { T2000Error, mapWalletError, mapMoveAbortCode } from './errors.js';

describe('T2000Error', () => {
  it('creates error with correct fields', () => {
    const err = new T2000Error('INSUFFICIENT_BALANCE', 'Not enough', { available: 5 });
    expect(err.code).toBe('INSUFFICIENT_BALANCE');
    expect(err.message).toBe('Not enough');
    expect(err.data?.available).toBe(5);
    expect(err.retryable).toBe(false);
    expect(err.name).toBe('T2000Error');
  });

  it('serializes to JSON', () => {
    const err = new T2000Error('RPC_ERROR', 'timeout', undefined, true);
    const json = err.toJSON();
    expect(json.error).toBe('RPC_ERROR');
    expect(json.retryable).toBe(true);
  });

  it('maps wallet rejection errors', () => {
    const err = mapWalletError(new Error('User rejected the request'));
    expect(err.code).toBe('TRANSACTION_FAILED');
  });

  it('maps insufficient balance errors', () => {
    const err = mapWalletError(new Error('Insufficient gas'));
    expect(err.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('maps unknown errors as retryable', () => {
    const err = mapWalletError(new Error('some random error'));
    expect(err.code).toBe('UNKNOWN');
    expect(err.retryable).toBe(true);
  });
});

describe('mapMoveAbortCode', () => {
  it('maps known abort codes', () => {
    expect(mapMoveAbortCode(1)).toContain('paused');
    expect(mapMoveAbortCode(6)).toContain('authorized');
  });

  it('handles unknown codes', () => {
    expect(mapMoveAbortCode(999)).toContain('999');
  });
});
