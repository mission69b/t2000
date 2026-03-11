import { describe, it, expect } from 'vitest';
import { mapError, errorResult } from './errors.js';
import { T2000Error, SafeguardError } from '@t2000/sdk';

describe('mapError', () => {
  it('should map SafeguardError to SAFEGUARD_BLOCKED', () => {
    const err = new SafeguardError('maxPerTx', { attempted: 200, limit: 100 });
    const mapped = mapError(err);
    expect(mapped.code).toBe('SAFEGUARD_BLOCKED');
    expect(mapped.retryable).toBe(false);
    expect(mapped.details?.rule).toBe('maxPerTx');
    expect(mapped.details?.attempted).toBe(200);
    expect(mapped.details?.limit).toBe(100);
  });

  it('should map T2000Error preserving code and retryable', () => {
    const err = new T2000Error('INSUFFICIENT_BALANCE', 'Not enough', undefined, false);
    const mapped = mapError(err);
    expect(mapped.code).toBe('INSUFFICIENT_BALANCE');
    expect(mapped.message).toBe('Not enough');
    expect(mapped.retryable).toBe(false);
  });

  it('should map retryable T2000Error', () => {
    const err = new T2000Error('RPC_ERROR', 'Timeout', undefined, true);
    const mapped = mapError(err);
    expect(mapped.retryable).toBe(true);
  });

  it('should map unknown Error to UNKNOWN', () => {
    const err = new Error('something broke');
    const mapped = mapError(err);
    expect(mapped.code).toBe('UNKNOWN');
    expect(mapped.message).toBe('something broke');
    expect(mapped.retryable).toBe(false);
  });

  it('should map non-Error to UNKNOWN with string conversion', () => {
    const mapped = mapError('string error');
    expect(mapped.code).toBe('UNKNOWN');
    expect(mapped.message).toBe('string error');
  });
});

describe('errorResult', () => {
  it('should return MCP error format with isError: true', () => {
    const err = new T2000Error('WALLET_LOCKED', 'Locked');
    const result = errorResult(err);
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toBe('WALLET_LOCKED');
  });
});
