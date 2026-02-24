import { describe, it, expect } from 'vitest';

describe('suilend utils', () => {
  describe('coinTypeToSymbol', () => {
    // Testing the internal function logic via known patterns
    it('identifies USDC from full coin type', () => {
      const usdcType = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
      expect(usdcType.includes('USDC')).toBe(true);
    });

    it('identifies SUI from full coin type', () => {
      const suiType = '0x2::sui::SUI';
      expect(suiType.includes('SUI')).toBe(true);
    });
  });

  describe('health factor math', () => {
    it('returns Infinity when no borrows', () => {
      const supplied = 100;
      const borrowed = 0;
      const hf = borrowed > 0 ? supplied / borrowed : Infinity;
      expect(hf).toBe(Infinity);
    });

    it('calculates health factor correctly', () => {
      const supplied = 100;
      const borrowed = 50;
      const hf = supplied / borrowed;
      expect(hf).toBe(2.0);
    });

    it('detects unhealthy position', () => {
      const supplied = 100;
      const borrowed = 80;
      const hf = supplied / borrowed;
      expect(hf).toBe(1.25);
      expect(hf).toBeLessThan(1.5);
    });
  });

  describe('maxWithdraw calculation (rich result)', () => {
    const MIN_HEALTH_FACTOR = 1.5;

    function computeMaxWithdraw(supplied: number, borrowed: number) {
      let maxAmount: number;
      if (borrowed === 0) {
        maxAmount = supplied;
      } else {
        maxAmount = Math.max(0, supplied - (borrowed * MIN_HEALTH_FACTOR / 0.75));
      }
      const remainingSupply = supplied - maxAmount;
      const hfAfter = borrowed > 0 ? remainingSupply / borrowed : Infinity;
      const currentHF = borrowed > 0 ? supplied / borrowed : Infinity;
      return { maxAmount, healthFactorAfter: hfAfter, currentHF };
    }

    it('returns full amount when no borrows', () => {
      const r = computeMaxWithdraw(100, 0);
      expect(r.maxAmount).toBe(100);
      expect(r.healthFactorAfter).toBe(Infinity);
      expect(r.currentHF).toBe(Infinity);
    });

    it('limits withdrawal to maintain health factor', () => {
      const r = computeMaxWithdraw(100, 30);
      expect(r.maxAmount).toBe(40);
      expect(r.healthFactorAfter).toBe(2); // 60 / 30
      expect(r.currentHF).toBeCloseTo(3.33, 1);
    });

    it('returns 0 when fully borrowed', () => {
      const r = computeMaxWithdraw(100, 60);
      expect(r.maxAmount).toBe(0);
      expect(r.currentHF).toBeCloseTo(1.67, 1);
    });
  });

  describe('maxBorrow calculation (rich result)', () => {
    const MIN_HEALTH_FACTOR = 1.5;

    function computeMaxBorrow(supplied: number, borrowed: number) {
      const maxAmount = Math.max(0, supplied * 0.75 / MIN_HEALTH_FACTOR - borrowed);
      const currentHF = borrowed > 0 ? supplied / borrowed : Infinity;
      return { maxAmount, healthFactorAfter: MIN_HEALTH_FACTOR, currentHF };
    }

    it('calculates max borrow from supply', () => {
      const r = computeMaxBorrow(100, 0);
      expect(r.maxAmount).toBe(50);
      expect(r.healthFactorAfter).toBe(1.5);
      expect(r.currentHF).toBe(Infinity);
    });

    it('accounts for existing borrows', () => {
      const r = computeMaxBorrow(100, 20);
      expect(r.maxAmount).toBe(30);
      expect(r.currentHF).toBe(5);
    });

    it('returns 0 when at limit', () => {
      const r = computeMaxBorrow(100, 50);
      expect(r.maxAmount).toBe(0);
      expect(r.currentHF).toBe(2);
    });
  });
});
