import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PortfolioManager } from './portfolio.js';
import type { InvestmentTrade } from './types.js';

function makeTrade(overrides: Partial<InvestmentTrade> = {}): InvestmentTrade {
  return {
    id: `inv_${Date.now()}`,
    type: 'buy',
    asset: 'SUI',
    amount: 100,
    price: 1.0,
    usdValue: 100,
    fee: 0,
    tx: '0xabc',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('PortfolioManager', () => {
  let dir: string;
  let pm: PortfolioManager;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'portfolio-test-'));
    pm = new PortfolioManager(dir);
  });

  describe('recordBuy', () => {
    it('creates a new position', () => {
      pm.recordBuy(makeTrade({ amount: 100, price: 1.0, usdValue: 100 }));
      const pos = pm.getPosition('SUI');
      expect(pos).toBeDefined();
      expect(pos!.totalAmount).toBe(100);
      expect(pos!.costBasis).toBe(100);
      expect(pos!.avgPrice).toBe(1.0);
    });

    it('accumulates multiple buys', () => {
      pm.recordBuy(makeTrade({ amount: 100, price: 1.0, usdValue: 100 }));
      pm.recordBuy(makeTrade({ amount: 50, price: 2.0, usdValue: 100 }));
      const pos = pm.getPosition('SUI')!;
      expect(pos.totalAmount).toBe(150);
      expect(pos.costBasis).toBe(200);
      expect(pos.avgPrice).toBeCloseTo(200 / 150, 5);
    });

    it('tracks trades history', () => {
      pm.recordBuy(makeTrade({ id: 'trade1' }));
      pm.recordBuy(makeTrade({ id: 'trade2' }));
      const pos = pm.getPosition('SUI')!;
      expect(pos.trades).toHaveLength(2);
      expect(pos.trades[0].id).toBe('trade1');
    });

    it('persists to disk', () => {
      pm.recordBuy(makeTrade({ amount: 50, usdValue: 50 }));
      const filePath = join(dir, 'portfolio.json');
      expect(existsSync(filePath)).toBe(true);
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(data.positions.SUI.totalAmount).toBe(50);
    });
  });

  describe('recordSell', () => {
    it('reduces position and returns realized P&L', () => {
      pm.recordBuy(makeTrade({ amount: 100, price: 1.0, usdValue: 100 }));
      const pnl = pm.recordSell(makeTrade({ type: 'sell', amount: 50, price: 1.5, usdValue: 75 }));
      expect(pnl).toBe(25); // sold 50 units bought at $1 for $1.50 each
      const pos = pm.getPosition('SUI')!;
      expect(pos.totalAmount).toBe(50);
      expect(pos.costBasis).toBe(50);
    });

    it('handles sell all', () => {
      pm.recordBuy(makeTrade({ amount: 100, price: 1.0, usdValue: 100 }));
      pm.recordSell(makeTrade({ type: 'sell', amount: 100, price: 1.2, usdValue: 120 }));
      const pos = pm.getPosition('SUI')!;
      expect(pos.totalAmount).toBe(0);
      expect(pos.costBasis).toBe(0);
      expect(pos.avgPrice).toBe(0);
    });

    it('calculates negative P&L on loss', () => {
      pm.recordBuy(makeTrade({ amount: 100, price: 2.0, usdValue: 200 }));
      const pnl = pm.recordSell(makeTrade({ type: 'sell', amount: 50, price: 1.0, usdValue: 50 }));
      expect(pnl).toBe(-50); // bought at $2, sold at $1
    });

    it('throws when no position exists', () => {
      expect(() => pm.recordSell(makeTrade({ type: 'sell', asset: 'ETH' }))).toThrow('No ETH position');
    });

    it('caps sell amount to available', () => {
      pm.recordBuy(makeTrade({ amount: 50, price: 1.0, usdValue: 50 }));
      const pnl = pm.recordSell(makeTrade({ type: 'sell', amount: 100, price: 1.0, usdValue: 50 }));
      expect(pnl).toBe(0);
      const pos = pm.getPosition('SUI')!;
      expect(pos.totalAmount).toBe(0);
    });

    it('accumulates realized P&L across sells', () => {
      pm.recordBuy(makeTrade({ amount: 100, price: 1.0, usdValue: 100 }));
      pm.recordSell(makeTrade({ type: 'sell', amount: 30, price: 2.0, usdValue: 60 }));
      pm.recordSell(makeTrade({ type: 'sell', amount: 30, price: 1.5, usdValue: 45 }));
      expect(pm.getRealizedPnL()).toBeCloseTo(30 + 15, 5);
    });
  });

  describe('getPositions', () => {
    it('returns empty array when no positions', () => {
      expect(pm.getPositions()).toEqual([]);
    });

    it('returns only positions with amount > 0', () => {
      pm.recordBuy(makeTrade({ amount: 100, price: 1.0, usdValue: 100 }));
      pm.recordSell(makeTrade({ type: 'sell', amount: 100, price: 1.0, usdValue: 100 }));
      expect(pm.getPositions()).toEqual([]);
    });

    it('includes asset key in result', () => {
      pm.recordBuy(makeTrade({ amount: 50, price: 1.0, usdValue: 50 }));
      const positions = pm.getPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0].asset).toBe('SUI');
      expect(positions[0].totalAmount).toBe(50);
    });
  });

  describe('getRealizedPnL', () => {
    it('returns 0 when no sells', () => {
      pm.recordBuy(makeTrade());
      expect(pm.getRealizedPnL()).toBe(0);
    });
  });

  describe('persistence', () => {
    it('loads from existing file', () => {
      pm.recordBuy(makeTrade({ amount: 100, price: 1.0, usdValue: 100 }));
      const pm2 = new PortfolioManager(dir);
      const pos = pm2.getPosition('SUI')!;
      expect(pos.totalAmount).toBe(100);
    });

    it('handles corrupted file', () => {
      const { writeFileSync } = require('node:fs');
      writeFileSync(join(dir, 'portfolio.json'), 'not json');
      const pm2 = new PortfolioManager(dir);
      expect(pm2.getPositions()).toEqual([]);
    });

    it('handles missing file', () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'portfolio-empty-'));
      const pm2 = new PortfolioManager(emptyDir);
      expect(pm2.getPositions()).toEqual([]);
    });
  });

  describe('average cost basis', () => {
    it('calculates correctly across multiple prices', () => {
      pm.recordBuy(makeTrade({ amount: 100, price: 1.0, usdValue: 100 }));
      pm.recordBuy(makeTrade({ amount: 100, price: 3.0, usdValue: 300 }));
      const pos = pm.getPosition('SUI')!;
      expect(pos.avgPrice).toBe(2.0); // $400 / 200 units
      expect(pos.costBasis).toBe(400);
    });

    it('preserves avg price after partial sell', () => {
      pm.recordBuy(makeTrade({ amount: 100, price: 2.0, usdValue: 200 }));
      pm.recordSell(makeTrade({ type: 'sell', amount: 50, price: 3.0, usdValue: 150 }));
      const pos = pm.getPosition('SUI')!;
      expect(pos.avgPrice).toBe(2.0); // avg price doesn't change on sell
      expect(pos.costBasis).toBe(100); // 50 remaining * $2 avg
    });
  });
});
