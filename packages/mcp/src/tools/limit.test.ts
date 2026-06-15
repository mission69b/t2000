import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerLimitTool, readLimits } from './limit.js';

describe('readLimits (v4 — via @t2000/sdk/limits)', () => {
  let dir: string;
  let cfgPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 't2000-mcp-limit-'));
    cfgPath = join(dir, 'config.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns { configured: false } when the file does not exist', () => {
    const view = readLimits(dir);
    expect(view.configured).toBe(false);
    expect(view.perTxUsd).toBeUndefined();
    expect(view.dailyUsd).toBeUndefined();
    expect(view.spentTodayUsd).toBe(0);
  });

  it('reads perTxUsd + dailyUsd, and migrates legacy dailySendUsd', async () => {
    await writeFile(cfgPath, JSON.stringify({ limits: { perTxUsd: 50, dailySendUsd: 200 } }));
    const view = readLimits(dir);
    expect(view.configured).toBe(true);
    expect(view.perTxUsd).toBe(50);
    expect(view.dailyUsd).toBe(200); // dailySendUsd → dailyUsd migration
  });

  it('reads perTxUsd alone', async () => {
    await writeFile(cfgPath, JSON.stringify({ limits: { perTxUsd: 25 } }));
    const view = readLimits(dir);
    expect(view.configured).toBe(true);
    expect(view.perTxUsd).toBe(25);
    expect(view.dailyUsd).toBeUndefined();
  });

  it('surfaces today\'s cumulative spend', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await writeFile(cfgPath, JSON.stringify({ limits: { dailyUsd: 100 }, dailySpend: { date: today, usd: 42 } }));
    expect(readLimits(dir).spentTodayUsd).toBe(42);
  });

  it('returns { configured: false } when limits is empty', async () => {
    await writeFile(cfgPath, JSON.stringify({ limits: {} }));
    expect(readLimits(dir).configured).toBe(false);
  });

  it('returns { configured: false } when limits values are zero', async () => {
    await writeFile(cfgPath, JSON.stringify({ limits: { perTxUsd: 0, dailyUsd: 0 } }));
    expect(readLimits(dir).configured).toBe(false);
  });

  it('returns { configured: false } when config.json is malformed', async () => {
    await writeFile(cfgPath, '{ this is not JSON');
    expect(readLimits(dir).configured).toBe(false);
  });
});

describe('registerLimitTool', () => {
  it('registers the t2000_limit tool name', () => {
    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const names: string[] = [];
    const origTool = server.tool.bind(server) as (...args: any[]) => any;
    server.tool = ((...args: any[]) => {
      names.push(args[0] as string);
      return origTool(...args);
    }) as any;

    registerLimitTool(server);

    expect(names).toContain('t2000_limit');
  });
});
