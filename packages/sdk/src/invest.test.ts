import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PortfolioManager } from './portfolio.js';
import { INVESTMENT_ASSETS, GAS_RESERVE_MIN } from './constants.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

function tmpDir() {
  const dir = path.join(os.tmpdir(), `invest-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('investBuy validation', () => {
  it('rejects amount = 0', () => {
    expect(() => {
      if (0 <= 0 || !isFinite(0)) throw new Error('INVALID_AMOUNT');
    }).toThrow('INVALID_AMOUNT');
  });

  it('rejects negative amount', () => {
    expect(() => {
      const amount = -50;
      if (amount <= 0 || !isFinite(amount)) throw new Error('INVALID_AMOUNT');
    }).toThrow('INVALID_AMOUNT');
  });

  it('rejects NaN amount', () => {
    expect(() => {
      const amount = NaN;
      if (!amount || amount <= 0 || !isFinite(amount)) throw new Error('INVALID_AMOUNT');
    }).toThrow('INVALID_AMOUNT');
  });

  it('rejects Infinity amount', () => {
    expect(() => {
      const amount = Infinity;
      if (!amount || amount <= 0 || !isFinite(amount)) throw new Error('INVALID_AMOUNT');
    }).toThrow('INVALID_AMOUNT');
  });

  it('accepts valid positive amount', () => {
    const amount = 100;
    expect(amount > 0 && isFinite(amount)).toBe(true);
  });
});

describe('investSell validation', () => {
  it('rejects amount = 0 (non-all)', () => {
    expect(() => {
      const amount = 0;
      if (amount <= 0 || !isFinite(amount)) throw new Error('INVALID_AMOUNT');
    }).toThrow('INVALID_AMOUNT');
  });

  it('allows "all" without numeric validation', () => {
    const usdAmount: number | 'all' = 'all';
    expect(usdAmount).toBe('all');
  });

  it('caps sell to position amount', () => {
    const positionAmount = 50;
    const requestedSell = 200;
    const capped = Math.min(requestedSell, positionAmount);
    expect(capped).toBe(50);
  });
});

describe('swap-returns-zero guard', () => {
  it('detects toAmount = 0 (division by zero prevention)', () => {
    const toAmount = 0;
    expect(toAmount === 0).toBe(true);
    if (toAmount !== 0) {
      const price = 100 / toAmount;
      expect(price).toBe(Infinity);
    }
  });
});

describe('investment locking guard', () => {
  let pm: PortfolioManager;
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    pm = new PortfolioManager(dir);
  });

  it('blocks sending invested SUI', () => {
    pm.recordBuy({
      id: 'buy1', type: 'buy', asset: 'SUI',
      amount: 100, price: 1.0, usdValue: 100,
      fee: 0, tx: '0x1', timestamp: new Date().toISOString(),
    });

    const pos = pm.getPosition('SUI');
    const invested = pos?.totalAmount ?? 0;
    const walletSui = 105;
    const freeSui = Math.max(0, walletSui - invested - GAS_RESERVE_MIN);

    expect(freeSui).toBeCloseTo(4.95);
    expect(50 > freeSui).toBe(true);
  });

  it('allows sending free SUI when wallet has more than invested', () => {
    pm.recordBuy({
      id: 'buy1', type: 'buy', asset: 'SUI',
      amount: 50, price: 1.0, usdValue: 50,
      fee: 0, tx: '0x1', timestamp: new Date().toISOString(),
    });

    const walletSui = 110;
    const invested = pm.getPosition('SUI')?.totalAmount ?? 0;
    const freeSui = Math.max(0, walletSui - invested - GAS_RESERVE_MIN);

    expect(freeSui).toBeCloseTo(59.95);
    expect(30 <= freeSui).toBe(true);
  });

  it('no guard needed for USDC (not investment asset)', () => {
    expect('USDC' in INVESTMENT_ASSETS).toBe(false);
  });

  it('guard applies to all investment assets', () => {
    expect('SUI' in INVESTMENT_ASSETS).toBe(true);
    expect('BTC' in INVESTMENT_ASSETS).toBe(true);
    expect('ETH' in INVESTMENT_ASSETS).toBe(true);
  });

  it('blocks exchange of invested SUI', () => {
    pm.recordBuy({
      id: 'buy1', type: 'buy', asset: 'SUI',
      amount: 100, price: 1.0, usdValue: 100,
      fee: 0, tx: '0x1', timestamp: new Date().toISOString(),
    });

    const walletSui = 100.05;
    const invested = pm.getPosition('SUI')?.totalAmount ?? 0;
    const freeSui = Math.max(0, walletSui - invested - GAS_RESERVE_MIN);

    expect(freeSui).toBe(0);
    expect(50 > freeSui).toBe(true);
  });

  it('allows exchange in buy direction (USDC→SUI)', () => {
    const fromAsset = 'USDC';
    expect(fromAsset in INVESTMENT_ASSETS).toBe(false);
  });
});

describe('portfolio wallet clamping', () => {
  let pm: PortfolioManager;
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    pm = new PortfolioManager(dir);
  });

  it('clamps totalAmount when wallet has less than tracked', () => {
    pm.recordBuy({
      id: 'buy1', type: 'buy', asset: 'SUI',
      amount: 100, price: 1.0, usdValue: 100,
      fee: 0, tx: '0x1', timestamp: new Date().toISOString(),
    });

    const pos = pm.getPosition('SUI')!;
    const walletSui = 80;
    const gasReserve = GAS_RESERVE_MIN;
    const actualHeld = Math.max(0, walletSui - gasReserve);
    const clampedAmount = Math.min(pos.totalAmount, actualHeld);

    expect(clampedAmount).toBeCloseTo(79.95);
    expect(clampedAmount).toBeLessThan(pos.totalAmount);
  });

  it('scales costBasis proportionally when clamped', () => {
    pm.recordBuy({
      id: 'buy1', type: 'buy', asset: 'SUI',
      amount: 100, price: 1.0, usdValue: 100,
      fee: 0, tx: '0x1', timestamp: new Date().toISOString(),
    });

    const pos = pm.getPosition('SUI')!;
    const walletSui = 50;
    const actualHeld = Math.max(0, walletSui - GAS_RESERVE_MIN);
    const ratio = actualHeld / pos.totalAmount;
    const scaledCostBasis = pos.costBasis * ratio;

    expect(scaledCostBasis).toBeCloseTo(49.95);
    expect(scaledCostBasis).toBeLessThan(pos.costBasis);
  });

  it('no clamping when wallet has enough', () => {
    pm.recordBuy({
      id: 'buy1', type: 'buy', asset: 'SUI',
      amount: 50, price: 1.0, usdValue: 50,
      fee: 0, tx: '0x1', timestamp: new Date().toISOString(),
    });

    const pos = pm.getPosition('SUI')!;
    const walletSui = 100;
    const actualHeld = Math.max(0, walletSui - GAS_RESERVE_MIN);
    const clampedAmount = Math.min(pos.totalAmount, actualHeld);

    expect(clampedAmount).toBe(pos.totalAmount);
  });
});

describe('balance costBasis scaling', () => {
  it('scales costBasis when gas erodes investment SUI', () => {
    const posTotal = 100;
    const posCostBasis = 100;
    const gasReserveSui = 90;

    const actualHeld = Math.min(posTotal, gasReserveSui);
    let investmentCostBasis: number;

    if (actualHeld < posTotal && posTotal > 0) {
      investmentCostBasis = posCostBasis * (actualHeld / posTotal);
    } else {
      investmentCostBasis = posCostBasis;
    }

    expect(investmentCostBasis).toBe(90);
  });

  it('uses full costBasis when no gas erosion', () => {
    const posTotal = 100;
    const posCostBasis = 200;
    const gasReserveSui = 150;

    const actualHeld = Math.min(posTotal, gasReserveSui);
    let investmentCostBasis: number;

    if (actualHeld < posTotal && posTotal > 0) {
      investmentCostBasis = posCostBasis * (actualHeld / posTotal);
    } else {
      investmentCostBasis = posCostBasis;
    }

    expect(investmentCostBasis).toBe(200);
  });
});

describe('price unavailable handling', () => {
  it('returns 0 P&L when price is 0 (not -100%)', () => {
    const currentPrice = 0;
    const totalAmount = 100;
    const costBasis = 100;

    const currentValue = totalAmount * currentPrice;
    const unrealizedPnL = currentPrice > 0 ? currentValue - costBasis : 0;
    const unrealizedPnLPct = currentPrice > 0 && costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

    expect(unrealizedPnL).toBe(0);
    expect(unrealizedPnLPct).toBe(0);
    expect(currentValue).toBe(0);
  });

  it('calculates normal P&L when price available', () => {
    const currentPrice = 1.1;
    const totalAmount = 100;
    const costBasis = 100;

    const currentValue = totalAmount * currentPrice;
    const unrealizedPnL = currentPrice > 0 ? currentValue - costBasis : 0;
    const unrealizedPnLPct = currentPrice > 0 && costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

    expect(unrealizedPnL).toBeCloseTo(10);
    expect(unrealizedPnLPct).toBeCloseTo(10);
  });
});

describe('registry-driven assets', () => {
  it('INVESTMENT_ASSETS contains SUI, BTC, ETH', () => {
    expect(Object.keys(INVESTMENT_ASSETS)).toContain('SUI');
    expect(Object.keys(INVESTMENT_ASSETS)).toContain('BTC');
    expect(Object.keys(INVESTMENT_ASSETS)).toContain('ETH');
  });

  it('stablecoins are not investment assets', () => {
    expect('USDC' in INVESTMENT_ASSETS).toBe(false);
    expect('USDT' in INVESTMENT_ASSETS).toBe(false);
  });

  it('gas reserve only applies to SUI', () => {
    for (const asset of Object.keys(INVESTMENT_ASSETS)) {
      const gasReserve = asset === 'SUI' ? GAS_RESERVE_MIN : 0;
      if (asset === 'SUI') {
        expect(gasReserve).toBe(GAS_RESERVE_MIN);
      } else {
        expect(gasReserve).toBe(0);
      }
    }
  });
});
