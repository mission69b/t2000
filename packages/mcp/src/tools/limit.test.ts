import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerLimitTool, readLimits } from './limit.js';

describe('readLimits (v4)', () => {
  let tempDir: string;
  let cfgPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 't2000-mcp-limit-'));
    cfgPath = join(tempDir, 'config.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns { configured: false } when the file does not exist', async () => {
    const view = await readLimits(cfgPath);
    expect(view.configured).toBe(false);
    expect(view.perTxUsd).toBeUndefined();
    expect(view.dailySendUsd).toBeUndefined();
    expect(view.configPath).toBe(cfgPath);
  });

  it('reads both perTxUsd + dailySendUsd from config.json', async () => {
    await writeFile(cfgPath, JSON.stringify({ limits: { perTxUsd: 50, dailySendUsd: 200 } }));
    const view = await readLimits(cfgPath);
    expect(view.configured).toBe(true);
    expect(view.perTxUsd).toBe(50);
    expect(view.dailySendUsd).toBe(200);
  });

  it('reads perTxUsd alone', async () => {
    await writeFile(cfgPath, JSON.stringify({ limits: { perTxUsd: 25 } }));
    const view = await readLimits(cfgPath);
    expect(view.configured).toBe(true);
    expect(view.perTxUsd).toBe(25);
    expect(view.dailySendUsd).toBeUndefined();
  });

  it('returns { configured: false } when limits is empty', async () => {
    await writeFile(cfgPath, JSON.stringify({ limits: {} }));
    const view = await readLimits(cfgPath);
    expect(view.configured).toBe(false);
  });

  it('returns { configured: false } when limits values are zero', async () => {
    await writeFile(cfgPath, JSON.stringify({ limits: { perTxUsd: 0, dailySendUsd: 0 } }));
    const view = await readLimits(cfgPath);
    expect(view.configured).toBe(false);
  });

  it('returns { configured: false } when config.json is malformed', async () => {
    await writeFile(cfgPath, '{ this is not JSON');
    const view = await readLimits(cfgPath);
    expect(view.configured).toBe(false);
  });

  it('returns { configured: false } when config.json is not an object', async () => {
    await writeFile(cfgPath, JSON.stringify('a-string'));
    const view = await readLimits(cfgPath);
    expect(view.configured).toBe(false);
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
