// `t2 agent tokenize` — wiring + offline validation smokes (D-9). Same dist
// harness as create.test.ts: validation must exit non-zero BEFORE any wallet
// or network side effect.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CLI = fileURLToPath(new URL('../../../dist/index.js', import.meta.url));
const describeOrSkip = existsSync(CLI) ? describe : describe.skip;

function runCli(args: string[]): { out: string; code: number } {
  const r = spawnSync('node', [CLI, ...args], { encoding: 'utf-8' });
  return { out: `${r.stdout}${r.stderr}`, code: r.status ?? 1 };
}

describeOrSkip('t2 agent tokenize — wiring', () => {
  it('--help documents the locked mechanism', () => {
    const { out, code } = runCli(['agent', 'tokenize', '--help']);
    expect(code).toBe(0);
    expect(out).toContain('1B fixed supply');
    expect(out).toContain('locked 10y');
    expect(out).toContain('USDC');
    expect(out).toContain('--dry-run');
  });

  it('rejects a blocklisted ticker before touching wallet or chain', () => {
    const { out, code } = runCli([
      'agent', 'tokenize', '--symbol', 'USDC', '--name', 'x', '--usdc', '5', '--dry-run',
    ]);
    expect(code).not.toBe(0);
    expect(out).toContain('impersonates');
  });

  it('rejects a malformed ticker', () => {
    const { out, code } = runCli([
      'agent', 'tokenize', '--symbol', 'TOOLONGGG', '--name', 'x', '--usdc', '5', '--dry-run',
    ]);
    expect(code).not.toBe(0);
    expect(out).toMatch(/symbol must be/);
  });

  it('requires --symbol/--name/--usdc', () => {
    const { code } = runCli(['agent', 'tokenize']);
    expect(code).not.toBe(0);
  });
});
