import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { T2000Error } from './errors.js';
import type { InvestmentTrade } from './types.js';

interface StoredPosition {
  totalAmount: number;
  costBasis: number;
  avgPrice: number;
  trades: InvestmentTrade[];
}

interface PortfolioData {
  positions: Record<string, StoredPosition>;
  realizedPnL: number;
}

function emptyData(): PortfolioData {
  return { positions: {}, realizedPnL: 0 };
}

export class PortfolioManager {
  private data: PortfolioData = emptyData();
  private readonly filePath: string;
  private readonly dir: string;

  constructor(configDir?: string) {
    this.dir = configDir ?? join(homedir(), '.t2000');
    this.filePath = join(this.dir, 'portfolio.json');
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(this.filePath)) {
        this.data = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      }
    } catch {
      this.data = emptyData();
    }
  }

  private save(): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  recordBuy(trade: InvestmentTrade): void {
    this.load();
    const pos = this.data.positions[trade.asset] ?? { totalAmount: 0, costBasis: 0, avgPrice: 0, trades: [] };

    pos.totalAmount += trade.amount;
    pos.costBasis += trade.usdValue;
    pos.avgPrice = pos.costBasis / pos.totalAmount;
    pos.trades.push(trade);

    this.data.positions[trade.asset] = pos;
    this.save();
  }

  recordSell(trade: InvestmentTrade): number {
    this.load();
    const pos = this.data.positions[trade.asset];
    if (!pos || pos.totalAmount <= 0) {
      throw new T2000Error('INSUFFICIENT_INVESTMENT', `No ${trade.asset} position to sell`);
    }

    const sellAmount = Math.min(trade.amount, pos.totalAmount);
    const costOfSold = pos.avgPrice * sellAmount;
    const realizedPnL = trade.usdValue - costOfSold;

    pos.totalAmount -= sellAmount;
    pos.costBasis -= costOfSold;
    if (pos.totalAmount < 0.000001) {
      pos.totalAmount = 0;
      pos.costBasis = 0;
      pos.avgPrice = 0;
    }

    pos.trades.push(trade);
    this.data.realizedPnL += realizedPnL;

    this.data.positions[trade.asset] = pos;
    this.save();
    return realizedPnL;
  }

  getPosition(asset: string): StoredPosition | undefined {
    this.load();
    return this.data.positions[asset];
  }

  getPositions(): Array<{ asset: string } & StoredPosition> {
    this.load();
    return Object.entries(this.data.positions)
      .filter(([, pos]) => pos.totalAmount > 0)
      .map(([asset, pos]) => ({ asset, ...pos }));
  }

  getRealizedPnL(): number {
    this.load();
    return this.data.realizedPnL;
  }
}
