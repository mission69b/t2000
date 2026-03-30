import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('@t2000/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t2000/sdk')>();
  return {
    ...actual,
    T2000: {
      create: vi.fn(),
    },
  };
});

vi.mock('../prompts.js', () => ({
  resolvePin: vi.fn().mockResolvedValue('1234'),
  askConfirm: vi.fn().mockResolvedValue(true),
}));

vi.mock('../output.js', () => ({
  printSuccess: vi.fn(),
  printBlank: vi.fn(),
  printInfo: vi.fn(),
  printJson: vi.fn(),
  printError: vi.fn(),
  isJsonMode: vi.fn().mockReturnValue(false),
  handleError: vi.fn(),
}));

import { SafeguardEnforcer } from '@t2000/sdk';
import { printError } from '../output.js';

describe('export command — lock guard', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 't2000-export-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('blocks export when agent is locked', () => {
    const enforcer = new SafeguardEnforcer(dir);
    enforcer.load();
    enforcer.lock();

    const reloaded = new SafeguardEnforcer(dir);
    reloaded.load();
    expect(reloaded.getConfig().locked).toBe(true);
  });

  it('allows export when agent is unlocked', () => {
    const enforcer = new SafeguardEnforcer(dir);
    enforcer.load();
    expect(enforcer.getConfig().locked).toBe(false);
  });

  it('allows export after lock then unlock', () => {
    const enforcer = new SafeguardEnforcer(dir);
    enforcer.load();
    enforcer.lock();
    enforcer.unlock();

    const reloaded = new SafeguardEnforcer(dir);
    reloaded.load();
    expect(reloaded.getConfig().locked).toBe(false);
  });

  it('persists lock state across enforcer instances', () => {
    const e1 = new SafeguardEnforcer(dir);
    e1.load();
    e1.lock();

    const e2 = new SafeguardEnforcer(dir);
    e2.load();
    expect(e2.getConfig().locked).toBe(true);
  });
});
