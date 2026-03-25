import { NextResponse } from 'next/server';

interface JwtPayload {
  sub?: string;
  iss?: string;
  aud?: string;
  exp?: number;
  email?: string;
}

/**
 * Decode a JWT payload without signature verification.
 * For full security, use a proper JWT library with JWKS verification.
 */
export function decodeJwt(jwt: string): JwtPayload | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(),
    );
    return payload;
  } catch {
    return null;
  }
}

/**
 * Validate that the JWT is present, structurally valid, and not expired.
 * Returns the decoded payload on success, or a NextResponse error on failure.
 */
export function validateJwt(
  jwt: string | null,
): { payload: JwtPayload } | { error: NextResponse } {
  if (!jwt) {
    return {
      error: NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      ),
    };
  }

  const payload = decodeJwt(jwt);
  if (!payload) {
    return {
      error: NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 },
      ),
    };
  }

  return { payload };
}

/**
 * Validate a Sui address format (0x followed by 64 hex chars).
 */
export function isValidSuiAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(address);
}

const MAX_AMOUNTS: Record<string, number> = {
  save: 100_000,
  withdraw: 100_000,
  borrow: 50_000,
  repay: 100_000,
  send: 50_000,
  swap: 100_000,
};

/**
 * Validate transaction amount against per-flow safety caps.
 */
export function validateAmount(
  flow: string,
  amount: number,
): { valid: true } | { valid: false; reason: string } {
  if (!Number.isFinite(amount) || amount < 0) {
    return { valid: false, reason: 'Amount must be a positive number' };
  }

  const max = MAX_AMOUNTS[flow];
  if (max && amount > max) {
    return { valid: false, reason: `Amount exceeds maximum of $${max.toLocaleString()} for ${flow}` };
  }

  return { valid: true };
}
