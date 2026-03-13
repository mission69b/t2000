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
      const pnl = pm.recordSell(makeTrade({ type: 'sell', amount: 100, price: 1.0, usdValue: 100 }));
      expect(pnl).toBe(0);
      const pos = pm.getPosition('SUI')!;
      expect(pos.totalAmount).toBe(0);
    });

    it('scales usdValue proportionally when sell is capped', () => {
      pm.recordBuy(makeTrade({ amount: 50, price: 2.0, usdValue: 100 }));
      // Try to sell 200 units at $3 ($600) but only 50 available
      // effectiveUsdValue = $600 * (50/200) = $150
      // costOfSold = $2 * 50 = $100
      // realizedPnL = $150 - $100 = $50
      const pnl = pm.recordSell(makeTrade({ type: 'sell', amount: 200, price: 3.0, usdValue: 600 }));
      expect(pnl).toBeCloseTo(50, 5);
    });

    it('does not scale usdValue when sell fits within position', () => {
      pm.recordBuy(makeTrade({ amount: 100, price: 1.0, usdValue: 100 }));
      const pnl = pm.recordSell(makeTrade({ type: 'sell', amount: 50, price: 2.0, usdValue: 100 }));
      expect(pnl).toBe(50); // $100 - (50 * $1) = $50
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

  describe('recordStrategyBuy / recordStrategySell', () => {
    it('tracks strategy position separately', () => {
      pm.recordStrategyBuy('bluechip', makeTrade({ asset: 'ETH', amount: 0.5, price: 2000, usdValue: 1000 }));
      const positions = pm.getStrategyPositions('bluechip');
      expect(positions).toHaveLength(1);
      expect(positions[0].asset).toBe('ETH');
      expect(positions[0].totalAmount).toBe(0.5);
    });

    it('scales usdValue proportionally when strategy sell is capped', () => {
      pm.recordStrategyBuy('bluechip', makeTrade({ asset: 'ETH', amount: 0.5, price: 2000, usdValue: 1000 }));
      // Try to sell 1 ETH at $3000 ($3000) but only 0.5 available
      // effectiveUsdValue = $3000 * (0.5/1.0) = $1500
      // costOfSold = $2000 * 0.5 = $1000
      // realizedPnL = $1500 - $1000 = $500
      const pnl = pm.recordStrategySell('bluechip', makeTrade({
        type: 'sell', asset: 'ETH', amount: 1.0, price: 3000, usdValue: 3000,
      }));
      expect(pnl).toBeCloseTo(500, 5);
    });

    it('clears strategy when all positions reach zero', () => {
      pm.recordStrategyBuy('bluechip', makeTrade({ asset: 'ETH', amount: 0.5, price: 2000, usdValue: 1000 }));
      pm.recordStrategySell('bluechip', makeTrade({
        type: 'sell', asset: 'ETH', amount: 0.5, price: 2000, usdValue: 1000,
      }));
      expect(pm.getStrategyPositions('bluechip')).toHaveLength(0);
    });

    it('throws when selling from nonexistent strategy', () => {
      expect(() => pm.recordStrategySell('ghost', makeTrade({ type: 'sell', asset: 'ETH' }))).toThrow('No positions');
    });
  });

  describe('direct + strategy coexistence', () => {
    it('strategy sell should not affect direct positions', () => {
      // User buys 1 ETH direct, then buys 0.5 ETH via strategy
      pm.recordBuy(makeTrade({ asset: 'ETH', amount: 1, price: 2000, usdValue: 2000 }));
      pm.recordStrategyBuy('bluechip', makeTrade({ asset: 'ETH', amount: 0.5, price: 2000, usdValue: 1000 }));
      // Strategy buy also records to direct (as the real code does)
      pm.recordBuy(makeTrade({ asset: 'ETH', amount: 0.5, price: 2000, usdValue: 1000 }));

      // Direct: 1.5 ETH, Strategy: 0.5 ETH
      expect(pm.getPosition('ETH')!.totalAmount).toBe(1.5);
      expect(pm.getStrategyPositions('bluechip')[0].totalAmount).toBe(0.5);

      // Sell strategy amount from strategy tracking
      pm.recordStrategySell('bluechip', makeTrade({
        type: 'sell', asset: 'ETH', amount: 0.5, price: 2100, usdValue: 1050,
      }));
      // Also record from direct (as investSell does)
      pm.recordSell(makeTrade({
        type: 'sell', asset: 'ETH', amount: 0.5, price: 2100, usdValue: 1050,
      }));

      // Strategy should be empty
      expect(pm.getStrategyPositions('bluechip')).toHaveLength(0);
      // Direct should still have 1.0 ETH (original direct buy)
      expect(pm.getPosition('ETH')!.totalAmount).toBe(1.0);
    });

    it('clearStrategy should not affect direct positions', () => {
      pm.recordBuy(makeTrade({ asset: 'SUI', amount: 100, price: 1.0, usdValue: 100 }));
      pm.recordStrategyBuy('bluechip', makeTrade({ asset: 'SUI', amount: 50, price: 1.0, usdValue: 50 }));

      pm.clearStrategy('bluechip');

      expect(pm.getStrategyPositions('bluechip')).toHaveLength(0);
      expect(pm.getPosition('SUI')!.totalAmount).toBe(100);
    });

    it('multiple strategies on same asset track independently', () => {
      pm.recordStrategyBuy('bluechip', makeTrade({ asset: 'ETH', amount: 0.5, price: 2000, usdValue: 1000 }));
      pm.recordStrategyBuy('layer1', makeTrade({ asset: 'ETH', amount: 0.3, price: 2000, usdValue: 600 }));

      const bc = pm.getStrategyPositions('bluechip');
      const l1 = pm.getStrategyPositions('layer1');
      expect(bc).toHaveLength(1);
      expect(bc[0].totalAmount).toBe(0.5);
      expect(l1).toHaveLength(1);
      expect(l1[0].totalAmount).toBe(0.3);

      // Selling bluechip doesn't affect layer1
      pm.recordStrategySell('bluechip', makeTrade({
        type: 'sell', asset: 'ETH', amount: 0.5, price: 2000, usdValue: 1000,
      }));
      expect(pm.getStrategyPositions('bluechip')).toHaveLength(0);
      expect(pm.getStrategyPositions('layer1')[0].totalAmount).toBe(0.3);
    });

    it('strategy P&L is accurate when selling only strategy amount', () => {
      pm.recordStrategyBuy('bluechip', makeTrade({ asset: 'BTC', amount: 0.001, price: 50000, usdValue: 50 }));

      // Sell at higher price — only strategy amount
      const pnl = pm.recordStrategySell('bluechip', makeTrade({
        type: 'sell', asset: 'BTC', amount: 0.001, price: 55000, usdValue: 55,
      }));

      // P&L: $55 - (0.001 * $50000) = $55 - $50 = $5
      expect(pnl).toBeCloseTo(5, 2);
    });
  });

  describe('getAllStrategyKeys / hasStrategyPositions', () => {
    it('getAllStrategyKeys returns empty array initially', () => {
      expect(pm.getAllStrategyKeys()).toEqual([]);
    });

    it('getAllStrategyKeys tracks added strategies', () => {
      pm.recordStrategyBuy('bluechip', makeTrade({ asset: 'ETH', amount: 0.5, price: 2000, usdValue: 1000 }));
      pm.recordStrategyBuy('layer1', makeTrade({ asset: 'SUI', amount: 100, price: 1.0, usdValue: 100 }));
      const keys = pm.getAllStrategyKeys();
      expect(keys).toContain('bluechip');
      expect(keys).toContain('layer1');
      expect(keys).toHaveLength(2);
    });

    it('hasStrategyPositions returns false for unknown strategy', () => {
      expect(pm.hasStrategyPositions('ghost')).toBe(false);
    });

    it('hasStrategyPositions returns true when positions exist', () => {
      pm.recordStrategyBuy('bluechip', makeTrade({ asset: 'ETH', amount: 0.5, price: 2000, usdValue: 1000 }));
      expect(pm.hasStrategyPositions('bluechip')).toBe(true);
    });

    it('hasStrategyPositions returns false after all positions sold', () => {
      pm.recordStrategyBuy('bluechip', makeTrade({ asset: 'ETH', amount: 0.5, price: 2000, usdValue: 1000 }));
      pm.recordStrategySell('bluechip', makeTrade({
        type: 'sell', asset: 'ETH', amount: 0.5, price: 2000, usdValue: 1000,
      }));
      expect(pm.hasStrategyPositions('bluechip')).toBe(false);
    });
  });

  describe('closePosition / clearStrategy', () => {
    it('closePosition zeroes out a direct position', () => {
      pm.recordBuy(makeTrade({ amount: 100, price: 1.0, usdValue: 100 }));
      pm.closePosition('SUI');
      const pos = pm.getPosition('SUI')!;
      expect(pos.totalAmount).toBe(0);
      expect(pos.costBasis).toBe(0);
    });

    it('clearStrategy removes all strategy tracking data', () => {
      pm.recordStrategyBuy('bluechip', makeTrade({ asset: 'ETH', amount: 0.5, price: 2000, usdValue: 1000 }));
      pm.clearStrategy('bluechip');
      expect(pm.getStrategyPositions('bluechip')).toHaveLength(0);
    });

    it('clearStrategy is safe on nonexistent strategy', () => {
      expect(() => pm.clearStrategy('ghost')).not.toThrow();
    });
  });
});
