import { appendFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  data?: Record<string, unknown>;
}

const DEFAULT_LOG_DIR = join(homedir(), '.t2000', 'logs');
const LOG_FILE = 'gateway.log';
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_LOG_FILES = 5;

export class Logger {
  private logDir: string;
  private logPath: string;
  private level: LogLevel;
  private toConsole: boolean;

  private static readonly LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(opts?: { level?: LogLevel; verbose?: boolean; logDir?: string }) {
    this.logDir = opts?.logDir ?? DEFAULT_LOG_DIR;
    if (!existsSync(this.logDir)) mkdirSync(this.logDir, { recursive: true });
    this.logPath = join(this.logDir, LOG_FILE);
    this.level = opts?.level ?? 'info';
    this.toConsole = true;
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    this.write('debug', msg, data);
  }

  info(msg: string, data?: Record<string, unknown>): void {
    this.write('info', msg, data);
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    this.write('warn', msg, data);
  }

  error(msg: string, data?: Record<string, unknown>): void {
    this.write('error', msg, data);
  }

  private write(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    if (Logger.LEVELS[level] < Logger.LEVELS[this.level]) return;

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...(data ? { data } : {}),
    };

    const line = JSON.stringify(entry) + '\n';

    try {
      this.rotate();
      appendFileSync(this.logPath, line);
    } catch {
      // filesystem errors should never crash the gateway
    }

    if (this.toConsole) {
      const prefix = level === 'error' ? '✗' : level === 'warn' ? '⚠' : '·';
      console.log(`  [gateway] ${prefix} ${msg}`);
    }
  }

  private rotate(): void {
    try {
      if (!existsSync(this.logPath)) return;
      const stat = statSync(this.logPath);
      if (stat.size < MAX_LOG_SIZE) return;

      const files = readdirSync(this.logDir)
        .filter(f => f.startsWith('gateway') && f.endsWith('.log'))
        .sort();

      while (files.length >= MAX_LOG_FILES) {
        const oldest = files.shift()!;
        try { unlinkSync(join(this.logDir, oldest)); } catch { /* best effort */ }
      }

      const rotatedName = `gateway-${Date.now()}.log`;
      const { renameSync } = require('node:fs') as typeof import('node:fs');
      renameSync(this.logPath, join(this.logDir, rotatedName));
    } catch {
      // rotation failure is non-fatal
    }
  }

  getLogPath(): string {
    return this.logPath;
  }

  getLogDir(): string {
    return this.logDir;
  }
}
