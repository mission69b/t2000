import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { T2000Error } from './errors.js';
import { DEFAULT_STRATEGIES, INVESTMENT_ASSETS } from './constants.js';
import type { StrategyDefinition } from './types.js';

interface StrategyData {
  strategies: Record<string, StrategyDefinition>;
}

function emptyData(): StrategyData {
  return { strategies: {} };
}

export class StrategyManager {
  private data: StrategyData = emptyData();
  private readonly filePath: string;
  private readonly dir: string;
  private seeded = false;

  constructor(configDir?: string) {
    this.dir = configDir ?? join(homedir(), '.t2000');
    this.filePath = join(this.dir, 'strategies.json');
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
    if (!this.seeded) {
      this.seedDefaults();
    }
  }

  private save(): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  private seedDefaults(): void {
    this.seeded = true;
    let changed = false;
    for (const [key, def] of Object.entries(DEFAULT_STRATEGIES)) {
      if (!this.data.strategies[key]) {
        this.data.strategies[key] = { ...def, allocations: { ...def.allocations } };
        changed = true;
      }
    }
    if (changed) this.save();
  }

  getAll(): Record<string, StrategyDefinition> {
    this.load();
    return { ...this.data.strategies };
  }

  get(name: string): StrategyDefinition {
    this.load();
    const strategy = this.data.strategies[name];
    if (!strategy) {
      throw new T2000Error('STRATEGY_NOT_FOUND', `Strategy '${name}' not found`);
    }
    return strategy;
  }

  create(params: { name: string; allocations: Record<string, number>; description?: string }): StrategyDefinition {
    this.load();
    const key = params.name.toLowerCase().replace(/\s+/g, '-');

    if (this.data.strategies[key]) {
      throw new T2000Error('STRATEGY_INVALID_ALLOCATIONS', `Strategy '${key}' already exists`);
    }

    this.validateAllocations(params.allocations);

    const definition: StrategyDefinition = {
      name: params.name,
      allocations: { ...params.allocations },
      description: params.description ?? `Custom strategy: ${params.name}`,
      custom: true,
    };

    this.data.strategies[key] = definition;
    this.save();
    return definition;
  }

  delete(name: string): void {
    this.load();
    const strategy = this.data.strategies[name];
    if (!strategy) {
      throw new T2000Error('STRATEGY_NOT_FOUND', `Strategy '${name}' not found`);
    }
    if (!strategy.custom) {
      throw new T2000Error('STRATEGY_BUILTIN', `Cannot delete built-in strategy '${name}'`);
    }
    delete this.data.strategies[name];
    this.save();
  }

  validateAllocations(allocations: Record<string, number>): void {
    const total = Object.values(allocations).reduce((sum, pct) => sum + pct, 0);
    if (Math.abs(total - 100) > 0.01) {
      throw new T2000Error('STRATEGY_INVALID_ALLOCATIONS', `Allocations must sum to 100 (got ${total})`);
    }

    for (const asset of Object.keys(allocations)) {
      if (!(asset in INVESTMENT_ASSETS)) {
        throw new T2000Error('STRATEGY_INVALID_ALLOCATIONS', `${asset} is not an investment asset`);
      }
      if (allocations[asset] <= 0) {
        throw new T2000Error('STRATEGY_INVALID_ALLOCATIONS', `Allocation for ${asset} must be > 0`);
      }
    }
  }

  validateMinAmount(allocations: Record<string, number>, totalUsd: number): void {
    const smallestPct = Math.min(...Object.values(allocations));
    const minRequired = Math.ceil(100 / smallestPct);
    if (totalUsd < minRequired) {
      const smallestAsset = Object.entries(allocations).find(([, p]) => p === smallestPct)?.[0] ?? '?';
      throw new T2000Error(
        'STRATEGY_MIN_AMOUNT',
        `Minimum $${minRequired} for this strategy (${smallestAsset} at ${smallestPct}% needs at least $1)`,
      );
    }
  }
}
