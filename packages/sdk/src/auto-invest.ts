import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { T2000Error } from './errors.js';
import type { AutoInvestSchedule, AutoInvestStatus } from './types.js';

interface AutoInvestData {
  schedules: AutoInvestSchedule[];
}

function emptyData(): AutoInvestData {
  return { schedules: [] };
}

function computeNextRun(
  frequency: 'daily' | 'weekly' | 'monthly',
  dayOfWeek?: number,
  dayOfMonth?: number,
  from?: Date,
): string {
  const base = from ?? new Date();
  const next = new Date(base);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      break;
    case 'weekly': {
      const dow = dayOfWeek ?? 1; // Monday default
      next.setDate(next.getDate() + ((7 - next.getDay() + dow) % 7 || 7));
      next.setHours(0, 0, 0, 0);
      break;
    }
    case 'monthly': {
      const dom = dayOfMonth ?? 1;
      next.setMonth(next.getMonth() + 1, dom);
      next.setHours(0, 0, 0, 0);
      break;
    }
  }

  return next.toISOString();
}

export class AutoInvestManager {
  private data: AutoInvestData = emptyData();
  private readonly filePath: string;
  private readonly dir: string;

  constructor(configDir?: string) {
    this.dir = configDir ?? join(homedir(), '.t2000');
    this.filePath = join(this.dir, 'auto-invest.json');
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
    if (!this.data.schedules) {
      this.data.schedules = [];
    }
  }

  private save(): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  setup(params: {
    amount: number;
    frequency: 'daily' | 'weekly' | 'monthly';
    strategy?: string;
    asset?: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
  }): AutoInvestSchedule {
    this.load();

    if (!params.strategy && !params.asset) {
      throw new T2000Error('AUTO_INVEST_NOT_FOUND', 'Either strategy or asset must be specified');
    }
    if (params.amount < 1) {
      throw new T2000Error('AUTO_INVEST_INSUFFICIENT', 'Auto-invest amount must be at least $1');
    }

    const schedule: AutoInvestSchedule = {
      id: randomUUID().slice(0, 8),
      strategy: params.strategy,
      asset: params.asset,
      amount: params.amount,
      frequency: params.frequency,
      dayOfWeek: params.dayOfWeek,
      dayOfMonth: params.dayOfMonth,
      nextRun: computeNextRun(params.frequency, params.dayOfWeek, params.dayOfMonth),
      enabled: true,
      totalInvested: 0,
      runCount: 0,
    };

    this.data.schedules.push(schedule);
    this.save();
    return schedule;
  }

  getStatus(): AutoInvestStatus {
    this.load();
    const now = new Date();
    const pending = this.data.schedules.filter(
      (s) => s.enabled && new Date(s.nextRun) <= now,
    );
    return {
      schedules: [...this.data.schedules],
      pendingRuns: pending,
    };
  }

  getSchedule(id: string): AutoInvestSchedule {
    this.load();
    const schedule = this.data.schedules.find((s) => s.id === id);
    if (!schedule) {
      throw new T2000Error('AUTO_INVEST_NOT_FOUND', `Schedule '${id}' not found`);
    }
    return schedule;
  }

  recordRun(id: string, amountInvested: number): void {
    this.load();
    const schedule = this.data.schedules.find((s) => s.id === id);
    if (!schedule) return;

    schedule.lastRun = new Date().toISOString();
    schedule.nextRun = computeNextRun(schedule.frequency, schedule.dayOfWeek, schedule.dayOfMonth);
    schedule.totalInvested += amountInvested;
    schedule.runCount += 1;
    this.save();
  }

  stop(id: string): void {
    this.load();
    const schedule = this.data.schedules.find((s) => s.id === id);
    if (!schedule) {
      throw new T2000Error('AUTO_INVEST_NOT_FOUND', `Schedule '${id}' not found`);
    }
    schedule.enabled = false;
    this.save();
  }

  remove(id: string): void {
    this.load();
    const idx = this.data.schedules.findIndex((s) => s.id === id);
    if (idx === -1) {
      throw new T2000Error('AUTO_INVEST_NOT_FOUND', `Schedule '${id}' not found`);
    }
    this.data.schedules.splice(idx, 1);
    this.save();
  }
}
