import { describe, it, expect } from 'vitest';
import { decodeJwt, isValidSuiAddress, validateAmount } from './auth';

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fake-signature`;
}

describe('decodeJwt', () => {
  it('decodes a valid JWT payload', () => {
    const jwt = fakeJwt({ sub: '123', email: 'a@b.com' });
    const payload = decodeJwt(jwt);
    expect(payload).toEqual({ sub: '123', email: 'a@b.com' });
  });

  it('returns null for malformed JWT', () => {
    expect(decodeJwt('not-a-jwt')).toBeNull();
    expect(decodeJwt('one.two')).toBeNull();
    expect(decodeJwt('')).toBeNull();
  });

  it('returns null for invalid base64 payload', () => {
    expect(decodeJwt('a.!!!.c')).toBeNull();
  });
});

describe('isValidSuiAddress', () => {
  const valid = '0x' + 'a'.repeat(64);

  it('accepts a valid 66-char hex address', () => {
    expect(isValidSuiAddress(valid)).toBe(true);
  });

  it('accepts mixed-case hex', () => {
    expect(isValidSuiAddress('0x' + 'aAbBcC11'.repeat(8))).toBe(true);
  });

  it('rejects addresses without 0x prefix', () => {
    expect(isValidSuiAddress('a'.repeat(64))).toBe(false);
  });

  it('rejects too-short addresses', () => {
    expect(isValidSuiAddress('0x1234')).toBe(false);
  });

  it('rejects too-long addresses', () => {
    expect(isValidSuiAddress('0x' + 'a'.repeat(65))).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isValidSuiAddress('0x' + 'g'.repeat(64))).toBe(false);
  });
});

describe('validateAmount', () => {
  it('accepts valid amounts within caps', () => {
    expect(validateAmount('save', 500)).toEqual({ valid: true });
    expect(validateAmount('send', 100)).toEqual({ valid: true });
    expect(validateAmount('swap', 50_000)).toEqual({ valid: true });
  });

  it('rejects amounts exceeding per-flow caps', () => {
    const result = validateAmount('save', 200_000);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('exceeds maximum');
    }
  });

  it('rejects negative amounts', () => {
    const result = validateAmount('save', -10);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('positive');
    }
  });

  it('rejects NaN', () => {
    const result = validateAmount('save', NaN);
    expect(result.valid).toBe(false);
  });

  it('rejects Infinity', () => {
    const result = validateAmount('send', Infinity);
    expect(result.valid).toBe(false);
  });

  it('allows zero (no minimum enforced here)', () => {
    expect(validateAmount('save', 0)).toEqual({ valid: true });
  });

  it('allows unknown flows with any amount', () => {
    expect(validateAmount('unknown-flow', 999_999)).toEqual({ valid: true });
  });
});
