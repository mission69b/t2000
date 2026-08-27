import { describe, it, expect } from 'vitest';
import {
  checkPositiveAmount,
  checkSuiAddress,
  PREFLIGHT_MAX_AMOUNT,
  PREFLIGHT_OK,
} from './preflight.js';
import { detectWrongChainAddressShape } from './utils/suins.js';
import { preflightSend } from './wallet/send.js';
import { preflightPay } from './wallet/pay.js';
import { preflightSwap } from './protocols/cetus-swap.js';

const VALID_ADDRESS = '0x' + 'a'.repeat(64);

describe('checkPositiveAmount', () => {
  it('accepts a normal positive amount', () => {
    expect(checkPositiveAmount(1)).toEqual(PREFLIGHT_OK);
  });

  it('rejects zero', () => {
    const r = checkPositiveAmount(0);
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.code).toBe('INVALID_AMOUNT');
      expect(r.error).toMatch(/greater than zero/);
    }
  });

  it('rejects negatives', () => {
    expect(checkPositiveAmount(-5).valid).toBe(false);
  });

  it('rejects NaN and Infinity', () => {
    expect(checkPositiveAmount(Number.NaN).valid).toBe(false);
    expect(checkPositiveAmount(Number.POSITIVE_INFINITY).valid).toBe(false);
  });

  it('rejects absurd amounts over the ceiling', () => {
    const r = checkPositiveAmount(PREFLIGHT_MAX_AMOUNT + 1);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/sane maximum/);
  });

  it('accepts the ceiling exactly', () => {
    expect(checkPositiveAmount(PREFLIGHT_MAX_AMOUNT).valid).toBe(true);
  });

  it('uses the provided label in the message', () => {
    const r = checkPositiveAmount(0, 'maxPrice');
    if (!r.valid) expect(r.error).toMatch(/^maxPrice/);
  });
});

describe('detectWrongChainAddressShape + checkSuiAddress (S.1214 — refuse before sign)', () => {
  // Well-known EVM-only shape (0x + 40 hex) — must never reach a tx build.
  const EVM = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7';
  const TRON = 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE';

  it('detects EVM and Tron shapes; null for Sui / names / garbage', () => {
    expect(detectWrongChainAddressShape(EVM)).toBe('evm');
    expect(detectWrongChainAddressShape(` ${EVM} `)).toBe('evm');
    expect(detectWrongChainAddressShape(TRON)).toBe('tron');
    expect(detectWrongChainAddressShape(VALID_ADDRESS)).toBe(null);
    expect(detectWrongChainAddressShape('alex.sui')).toBe(null);
    expect(detectWrongChainAddressShape('not-an-address')).toBe(null);
    // T + wrong length / bad alphabet (0, l) is not the Tron shape.
    expect(detectWrongChainAddressShape('T0lhEsLJW1ChVWFMSMeRDow5KcbLSEQn9')).toBe(null);
  });

  it('EVM recipient refuses in English naming Ethereum — never pads to Sui', () => {
    const r = checkSuiAddress(EVM);
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.code).toBe('INVALID_ADDRESS');
      expect(r.error).toMatch(/Ethereum/);
      expect(r.error).toMatch(/Sui/);
      expect(r.error).toMatch(/Nothing was sent/);
    }
  });

  it('Tron recipient refuses naming Tron', () => {
    const r = checkSuiAddress(TRON);
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.code).toBe('INVALID_ADDRESS');
      expect(r.error).toMatch(/Tron/);
    }
  });

  it('raw hex that is not the full 66-char form refuses with the length', () => {
    const r = checkSuiAddress('0xabc123');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/66 characters/);
  });
});

describe('checkSuiAddress', () => {
  it('accepts a valid 64-hex address', () => {
    expect(checkSuiAddress(VALID_ADDRESS)).toEqual(PREFLIGHT_OK);
  });

  it('rejects a malformed address', () => {
    const r = checkSuiAddress('not-an-address');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.code).toBe('INVALID_ADDRESS');
  });

  it('rejects empty / non-string input', () => {
    expect(checkSuiAddress('').valid).toBe(false);
    expect(checkSuiAddress(undefined as unknown as string).valid).toBe(false);
  });
});

describe('preflightSend', () => {
  it('passes a valid USDC send', () => {
    expect(preflightSend({ to: VALID_ADDRESS, amount: 1, asset: 'USDC' })).toEqual(PREFLIGHT_OK);
  });

  // S.1214 (dogfood #251): wrong-chain recipients refuse BEFORE any sign —
  // an EVM 40-hex would otherwise pad to a "valid" Sui address.
  it('refuses an EVM-shaped recipient naming Ethereum', () => {
    const r = preflightSend({
      to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7',
      amount: 1,
      asset: 'USDC',
    });
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.code).toBe('INVALID_ADDRESS');
      expect(r.error).toMatch(/Ethereum/);
    }
  });

  it('refuses a Tron-shaped recipient naming Tron', () => {
    const r = preflightSend({
      to: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
      amount: 1,
      asset: 'USDC',
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/Tron/);
  });

  // [S.957] USDT is sendable now (any resolvable coin type); the hard
  // failure is reserved for UNRESOLVABLE symbols, with the canonical message.
  it('accepts a registry alt (USDT) and rejects an unresolvable symbol', () => {
    expect(preflightSend({ to: VALID_ADDRESS, amount: 1, asset: 'USDT' })).toEqual(PREFLIGHT_OK);
    const r = preflightSend({ to: VALID_ADDRESS, amount: 1, asset: 'FOOBAR_NOT_A_TOKEN' });
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.code).toBe('INVALID_ASSET');
      expect(r.error).toMatch(/Unknown asset "FOOBAR_NOT_A_TOKEN"/);
      expect(r.error).toMatch(/registry symbol|full coin type/);
    }
  });

  it('rejects zero amount before checking the gasless floor', () => {
    const r = preflightSend({ to: VALID_ADDRESS, amount: 0, asset: 'USDC' });
    if (!r.valid) expect(r.error).toMatch(/greater than zero/);
  });

  it('rejects a sub-0.01 USDC amount (gasless floor)', () => {
    const r = preflightSend({ to: VALID_ADDRESS, amount: 0.005, asset: 'USDC' });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/Minimum gasless transfer is 0\.01/);
  });

  it('does not enforce the gasless floor for SUI', () => {
    expect(preflightSend({ to: VALID_ADDRESS, amount: 0.001, asset: 'SUI' })).toEqual(PREFLIGHT_OK);
  });

  it('rejects an invalid recipient', () => {
    const r = preflightSend({ to: 'nope', amount: 1, asset: 'USDC' });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.code).toBe('INVALID_ADDRESS');
  });
});

describe('preflightPay', () => {
  it('passes a valid https URL with no maxPrice', () => {
    expect(preflightPay({ url: 'https://x402.t2000.ai/openai/v1/chat/completions' })).toEqual(
      PREFLIGHT_OK,
    );
  });

  it('passes with a valid maxPrice', () => {
    expect(preflightPay({ url: 'https://x402.t2000.ai/foo', maxPrice: 0.5 })).toEqual(PREFLIGHT_OK);
  });

  it('rejects an empty URL', () => {
    expect(preflightPay({ url: '' }).valid).toBe(false);
  });

  it('rejects a non-URL string', () => {
    expect(preflightPay({ url: 'not a url' }).valid).toBe(false);
  });

  it('rejects a non-http(s) protocol', () => {
    const r = preflightPay({ url: 'ftp://x402.t2000.ai/foo' });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/http\(s\)/);
  });

  it('rejects a non-positive maxPrice', () => {
    const r = preflightPay({ url: 'https://x402.t2000.ai/foo', maxPrice: 0 });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/maxPrice/);
  });
});

describe('preflightSwap', () => {
  it('passes a valid swap', () => {
    expect(preflightSwap({ from: 'USDC', to: 'SUI', amount: 1 })).toEqual(PREFLIGHT_OK);
  });

  it('rejects an empty from token', () => {
    expect(preflightSwap({ from: '', to: 'SUI', amount: 1 }).valid).toBe(false);
  });

  it('rejects an empty to token', () => {
    expect(preflightSwap({ from: 'USDC', to: '', amount: 1 }).valid).toBe(false);
  });

  it('rejects a non-positive amount', () => {
    expect(preflightSwap({ from: 'USDC', to: 'SUI', amount: 0 }).valid).toBe(false);
  });

  it('allows a large token count (no fixed ceiling — memecoin units)', () => {
    expect(preflightSwap({ from: 'LOFI', to: 'USDC', amount: 50_000_000 })).toEqual(PREFLIGHT_OK);
  });

  it('still rejects NaN / Infinity amounts', () => {
    expect(preflightSwap({ from: 'USDC', to: 'SUI', amount: Number.NaN }).valid).toBe(false);
    expect(preflightSwap({ from: 'USDC', to: 'SUI', amount: Number.POSITIVE_INFINITY }).valid).toBe(
      false,
    );
  });

  it('rejects an identity swap (symbol vs symbol)', () => {
    const r = preflightSwap({ from: 'USDC', to: 'USDC', amount: 1 });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/itself/);
  });

  it('rejects an identity swap (symbol vs its coin type)', () => {
    const usdcType =
      '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
    expect(preflightSwap({ from: 'USDC', to: usdcType, amount: 1 }).valid).toBe(false);
  });
});
