import { describe, it, expect } from 'vitest';

const RATE_DECIMALS = 27;
const MIN_HEALTH_FACTOR = 1.5;

function rateToApy(rawRate: string): number {
  if (!rawRate || rawRate === '0') return 0;
  return Number(BigInt(rawRate)) / 10 ** RATE_DECIMALS * 100;
}

describe('navi', () => {
  describe('rateToApy', () => {
    it('converts raw rate to APY percentage', () => {
      const rawRate5Percent = (BigInt(5) * BigInt(10 ** RATE_DECIMALS) / 100n).toString();
      expect(rateToApy(rawRate5Percent)).toBeCloseTo(5.0, 1);
    });

    it('returns 0 for zero rate', () => {
      expect(rateToApy('0')).toBe(0);
    });

    it('returns 0 for empty rate', () => {
      expect(rateToApy('')).toBe(0);
    });

    it('handles small fractional rates', () => {
      const rawRate = (BigInt(25) * BigInt(10 ** (RATE_DECIMALS - 1)) / 100n).toString();
      expect(rateToApy(rawRate)).toBeCloseTo(2.5, 1);
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

  describe('maxWithdraw calculation', () => {
    function computeMaxWithdraw(supplied: number, borrowed: number, ltv = 0.75) {
      let maxAmount: number;
      if (borrowed === 0) {
        maxAmount = supplied;
      } else {
        maxAmount = Math.max(0, supplied - (borrowed * MIN_HEALTH_FACTOR / ltv));
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
      expect(r.healthFactorAfter).toBe(2);
      expect(r.currentHF).toBeCloseTo(3.33, 1);
    });

    it('returns 0 when fully borrowed', () => {
      const r = computeMaxWithdraw(100, 60);
      expect(r.maxAmount).toBe(0);
      expect(r.currentHF).toBeCloseTo(1.67, 1);
    });

    it('handles custom ltv', () => {
      const r = computeMaxWithdraw(100, 20, 0.8);
      expect(r.maxAmount).toBeCloseTo(62.5, 1);
    });
  });

  describe('maxBorrow calculation', () => {
    function computeMaxBorrow(supplied: number, borrowed: number, ltv = 0.75) {
      const maxAmount = Math.max(0, supplied * ltv / MIN_HEALTH_FACTOR - borrowed);
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

    it('handles custom ltv', () => {
      const r = computeMaxBorrow(100, 0, 0.8);
      expect(r.maxAmount).toBeCloseTo(53.33, 1);
    });
  });

  describe('position filtering', () => {
    it('identifies USDC positions by symbol', () => {
      const pools = [
        { symbol: 'USDC', coinType: '0x...::usdc::USDC' },
        { symbol: 'SUI', coinType: '0x2::sui::SUI' },
      ];
      const usdc = pools.find(p => p.symbol === 'USDC');
      expect(usdc).toBeDefined();
      expect(usdc?.coinType).toContain('usdc');
    });

    it('identifies USDC positions by coinType fallback', () => {
      const pools = [
        { symbol: 'USD Coin', coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC' },
      ];
      const usdc = pools.find(p => p.symbol === 'USDC' || p.coinType.toLowerCase().includes('usdc'));
      expect(usdc).toBeDefined();
    });
  });

  describe('amount conversions', () => {
    it('converts USDC raw to human with 6 decimals', () => {
      const raw = 5_000_000;
      const human = raw / 10 ** 6;
      expect(human).toBe(5.0);
    });

    it('converts SUI raw to human with 9 decimals', () => {
      const raw = 1_500_000_000;
      const human = raw / 10 ** 9;
      expect(human).toBe(1.5);
    });

    it('filters out dust positions', () => {
      const positions = [
        { amount: 5.23, type: 'save' },
        { amount: 0.00001, type: 'save' },
        { amount: 0, type: 'borrow' },
      ];
      const active = positions.filter(p => p.amount > 0.0001);
      expect(active).toHaveLength(1);
      expect(active[0].amount).toBe(5.23);
    });
  });

  describe('gas cost extraction', () => {
    function extractGasCost(effects: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } } | null): number {
      if (!effects?.gasUsed) return 0;
      return Math.abs(
        (Number(effects.gasUsed.computationCost) +
          Number(effects.gasUsed.storageCost) -
          Number(effects.gasUsed.storageRebate)) /
        1e9
      );
    }

    it('calculates gas cost from effects', () => {
      const effects = {
        gasUsed: {
          computationCost: '1000000',
          storageCost: '2000000',
          storageRebate: '500000',
        },
      };
      expect(extractGasCost(effects)).toBeCloseTo(0.0025, 4);
    });

    it('returns positive value when rebate exceeds cost', () => {
      const effects = {
        gasUsed: {
          computationCost: '500000',
          storageCost: '200000',
          storageRebate: '1500000',
        },
      };
      expect(extractGasCost(effects)).toBeCloseTo(0.0008, 4);
      expect(extractGasCost(effects)).toBeGreaterThan(0);
    });

    it('returns 0 for null effects', () => {
      expect(extractGasCost(null)).toBe(0);
    });

    it('returns 0 for missing gasUsed', () => {
      expect(extractGasCost({} as never)).toBe(0);
    });
  });

  describe('NAVI balance decimals', () => {
    const NAVI_BALANCE_DECIMALS = 9;

    it('parses USDC supply balance with 9 decimals', () => {
      const supplyBalance = 2_000_000_289;
      const usdc = supplyBalance / 10 ** NAVI_BALANCE_DECIMALS;
      expect(usdc).toBeCloseTo(2.0, 1);
    });

    it('parses USDC borrow balance with 9 decimals', () => {
      const borrowBalance = 500_000_000;
      const usdc = borrowBalance / 10 ** NAVI_BALANCE_DECIMALS;
      expect(usdc).toBeCloseTo(0.5, 1);
    });

    it('treats near-zero NAVI balance as dust', () => {
      const dustBalance = 1155;
      const usdc = dustBalance / 10 ** NAVI_BALANCE_DECIMALS;
      expect(usdc).toBeLessThan(0.0001);
    });
  });
});
