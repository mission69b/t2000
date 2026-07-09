// `t2 agent create` — wiring + offline validation smokes (T1/A2,
// SPEC_COMPOSITION_MOMENT §4). Spawns the dist binary (same harness as
// program.integration.test.ts): validation failures must exit non-zero
// BEFORE any wallet or network side effect. Skips cleanly if dist isn't
// built (`pnpm --filter @t2000/cli build` first).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI = fileURLToPath(new URL('../../../dist/index.js', import.meta.url));
const describeOrSkip = existsSync(CLI) ? describe : describe.skip;

function runCli(
  args: string[],
  home: string,
): { stdout: string; stderr: string; code: number } {
  const result = spawnSync('node', [CLI, ...args], {
    env: { ...process.env, HOME: home },
    encoding: 'utf-8',
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    code: result.status ?? -1,
  };
}

describeOrSkip('t2 agent create — wiring + offline validation', () => {
  let home: string;

  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), 'cli-create-'));
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('is listed in the agent group help', () => {
    const r = runCli(['agent', '--help'], home);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('create');
  });

  it('documents the one-pass composition surface', () => {
    const r = runCli(['agent', 'create', '--help'], home);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('--name');
    expect(r.stdout).toContain('--description');
    expect(r.stdout).toContain('--category');
    expect(r.stdout).toContain('--owner');
    expect(r.stdout).toContain('--key');
  });

  it('requires --name', () => {
    const r = runCli(['agent', 'create'], home);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('--name');
  });

  it('rejects an empty --name before any side effect', () => {
    const r = runCli(['agent', 'create', '--name', '   '], home);
    expect(r.code).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain('--name must not be empty');
  });

  it('rejects an unknown --category before any side effect', () => {
    const r = runCli(
      ['agent', 'create', '--name', 'Smoke', '--category', 'bogus'],
      home,
    );
    expect(r.code).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain('--category must be one of');
  });

  it('rejects an invalid --owner address before any side effect', () => {
    const r = runCli(
      ['agent', 'create', '--name', 'Smoke', '--owner', 'not-an-address'],
      home,
    );
    expect(r.code).not.toBe(0);
  });
});
