import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Logger } from './logger.js';

describe('Logger', () => {
  let logDir: string;

  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), 't2000-log-test-'));
  });

  afterEach(() => {
    rmSync(logDir, { recursive: true, force: true });
  });

  it('creates a logger with default info level', () => {
    const logger = new Logger({ logDir });
    expect(logger.getLogDir()).toBe(logDir);
  });

  it('getLogPath returns a path ending in gateway.log', () => {
    const logger = new Logger({ logDir });
    expect(logger.getLogPath()).toMatch(/gateway\.log$/);
  });

  it('writes info level messages', () => {
    const logger = new Logger({ level: 'info', logDir });
    logger.info('test message');
    const content = readFileSync(logger.getLogPath(), 'utf-8');
    const entry = JSON.parse(content.trim().split('\n').pop()!);
    expect(entry.level).toBe('info');
    expect(entry.msg).toBe('test message');
    expect(entry.ts).toBeTruthy();
  });

  it('includes data in log entries', () => {
    const logger = new Logger({ level: 'info', logDir });
    logger.info('with data', { port: 2000, channel: 'webchat' });
    const content = readFileSync(logger.getLogPath(), 'utf-8');
    const entry = JSON.parse(content.trim().split('\n').pop()!);
    expect(entry.data.port).toBe(2000);
    expect(entry.data.channel).toBe('webchat');
  });

  it('filters messages below configured level', () => {
    const logger = new Logger({ level: 'warn', logDir });
    logger.debug('should be filtered');
    logger.info('should be filtered too');
    expect(existsSync(logger.getLogPath())).toBe(false);
  });

  it('writes warn and error at warn level', () => {
    const logger = new Logger({ level: 'warn', logDir });
    logger.warn('warning message');
    logger.error('error message');
    const content = readFileSync(logger.getLogPath(), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).level).toBe('warn');
    expect(JSON.parse(lines[1]).level).toBe('error');
  });
});
