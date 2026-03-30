import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('@t2000/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t2000/sdk')>();
  return {
    ...actual,
    T2000: { create: vi.fn() },
    keypairFromPrivateKey: vi.fn(),
    saveKey: vi.fn(),
  };
});

vi.mock('../prompts.js', () => ({
  resolvePin: vi.fn().mockResolvedValue('1234'),
}));

vi.mock('../output.js', () => ({
  printSuccess: vi.fn(),
  printBlank: vi.fn(),
  printKeyValue: vi.fn(),
  printJson: vi.fn(),
  printError: vi.fn(),
  isJsonMode: vi.fn().mockReturnValue(false),
  handleError: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({
  password: vi.fn().mockResolvedValue('0x' + 'ab'.repeat(32)),
}));

import { SafeguardEnforcer } from '@t2000/sdk';

describe('import command — lock guard', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 't2000-import-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('blocks import when agent is locked', () => {
    const enforcer = new SafeguardEnforcer(dir);
    enforcer.load();
    enforcer.lock();

    const reloaded = new SafeguardEnforcer(dir);
    reloaded.load();
    expect(reloaded.getConfig().locked).toBe(true);
  });

  it('allows import when agent is unlocked', () => {
    const enforcer = new SafeguardEnforcer(dir);
    enforcer.load();
    expect(enforcer.getConfig().locked).toBe(false);
  });
});
