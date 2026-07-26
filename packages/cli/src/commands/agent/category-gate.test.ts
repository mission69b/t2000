// The seller category gate (directory-drift guard, 2026-07-26) — wiring +
// offline validation smokes. Same dist harness as create.test.ts: a bad
// --category must exit non-zero BEFORE any wallet or network side effect.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI = fileURLToPath(new URL('../../../dist/index.js', import.meta.url));
const describeOrSkip = existsSync(CLI) ? describe : describe.skip;

// Hermetic HOME (no wallet): validation must fire BEFORE wallet load, so
// these behave identically on CI and on a dev machine with a real wallet.
let home = '';
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 't2-category-'));
});
afterAll(() => {
  if (home) rmSync(home, { recursive: true, force: true });
});

function runCli(args: string[]): { out: string; code: number } {
  const r = spawnSync('node', [CLI, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, HOME: home },
  });
  return { out: `${r.stdout}${r.stderr}`, code: r.status ?? 1 };
}

describeOrSkip('seller category gate — wiring', () => {
  it('agent sell --help documents --category with the enum', () => {
    const { out, code } = runCli(['agent', 'sell', '--help']);
    expect(code).toBe(0);
    expect(out).toContain('--category');
    expect(out).toContain('travel');
    expect(out).toContain('comms');
  });

  it('service create --help documents --category with the enum', () => {
    const { out, code } = runCli(['service', 'create', '--help']);
    expect(code).toBe(0);
    expect(out).toContain('--category');
    expect(out).toContain('travel');
  });

  it('agent profile --help documents --category', () => {
    const { out, code } = runCli(['agent', 'profile', '--help']);
    expect(code).toBe(0);
    expect(out).toContain('--category');
  });

  it('agent sell rejects a bogus --category before wallet load', () => {
    const { out, code } = runCli([
      'agent',
      'sell',
      'https://api.example.com/v1/x',
      '--category',
      'bogus',
    ]);
    expect(code).not.toBe(0);
    expect(out).toContain('must be one of');
    expect(out).not.toContain('No wallet');
  });

  it('service create rejects a bogus --category before wallet load', () => {
    const { out, code } = runCli([
      'service',
      'create',
      '--name',
      'Test service',
      '--price',
      '5',
      '--sla',
      '24h',
      '--description',
      'A test',
      '--deliverable',
      'A report',
      '--category',
      'bogus',
    ]);
    expect(code).not.toBe(0);
    expect(out).toContain('must be one of');
    expect(out).not.toContain('No wallet');
  });

  it('agent profile rejects a bogus --category before wallet load', () => {
    const { out, code } = runCli([
      'agent',
      'profile',
      '--category',
      'bogus',
    ]);
    expect(code).not.toBe(0);
    expect(out).toContain('must be one of');
    expect(out).not.toContain('No wallet');
  });
});
