// `t2 agent serve` — wiring + offline validation smokes (R1, S.694).
// Spawns the dist binary (same harness as create.test.ts). Everything here
// is offline: scaffold, local dev one-shot invocation, manifest/handler
// validation failures. Deploy/logs/status hit the network and are covered
// by the mainnet e2e instead.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI = fileURLToPath(new URL('../../../dist/index.js', import.meta.url));
const describeOrSkip = existsSync(CLI) ? describe : describe.skip;

function runCli(
  args: string[],
  home: string,
  cwd?: string,
): { stdout: string; stderr: string; code: number } {
  const result = spawnSync('node', [CLI, ...args], {
    env: { ...process.env, HOME: home },
    encoding: 'utf-8',
    cwd,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    code: result.status ?? -1,
  };
}

describeOrSkip('t2 agent serve — wiring + offline validation', () => {
  let home: string;
  let dir: string;

  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), 'cli-serve-'));
    dir = mkdtempSync(join(tmpdir(), 'cli-serve-dir-'));
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  });

  it('is listed in the agent group help', () => {
    const r = runCli(['agent', '--help'], home);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('serve');
  });

  it('documents the full verb set', () => {
    const r = runCli(['agent', 'serve', '--help'], home);
    expect(r.code).toBe(0);
    for (const verb of ['init', 'dev', 'deploy', 'status', 'logs', 'undeploy']) {
      expect(r.stdout).toContain(verb);
    }
  });

  it('init scaffolds handler.mjs + t2serve.json', () => {
    const r = runCli(
      ['agent', 'serve', 'init', '--slug', 'test-svc', '--dir', dir, '--json'],
      home,
    );
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, 'handler.mjs'))).toBe(true);
    expect(existsSync(join(dir, 't2serve.json'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(dir, 't2serve.json'), 'utf8'));
    expect(manifest.slug).toBe('test-svc');
  });

  it('init refuses to overwrite an existing scaffold', () => {
    const r = runCli(['agent', 'serve', 'init', '--dir', dir], home);
    expect(r.code).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain('already exists');
  });

  it('dev --input runs the scaffolded handler one-shot', () => {
    const r = runCli(
      ['agent', 'serve', 'dev', '--dir', dir, '--input', '{"hello":"r1"}'],
      home,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('"hello": "r1"');
    expect(r.stdout).toContain('"from": "test-svc"');
  });

  it('rejects a handler with imports before any network call', () => {
    const importDir = mkdtempSync(join(tmpdir(), 'cli-serve-imp-'));
    try {
      runCli(
        ['agent', 'serve', 'init', '--slug', 'imp', '--dir', importDir],
        home,
      );
      writeFileSync(
        join(importDir, 'handler.mjs'),
        `import fs from 'node:fs';\nexport default async function handle() { return {}; }\n`,
      );
      const r = runCli(
        ['agent', 'serve', 'dev', '--dir', importDir, '--input', '{}'],
        home,
      );
      expect(r.code).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toContain('self-contained');
    } finally {
      rmSync(importDir, { recursive: true, force: true });
    }
  });

  it('init --template proxy scaffolds the resell-a-keyed-API handler', () => {
    const proxyDir = mkdtempSync(join(tmpdir(), 'cli-serve-proxy-'));
    try {
      const r = runCli(
        ['agent', 'serve', 'init', '--slug', 'px', '--template', 'proxy', '--dir', proxyDir],
        home,
      );
      expect(r.code).toBe(0);
      const handler = readFileSync(join(proxyDir, 'handler.mjs'), 'utf8');
      expect(handler).toContain('UPSTREAM');
      expect(handler).toContain('ctx.secrets');
    } finally {
      rmSync(proxyDir, { recursive: true, force: true });
    }
  });

  it('init rejects an unknown template', () => {
    const r = runCli(
      ['agent', 'serve', 'init', '--slug', 'x2', '--template', 'bogus', '--dir', mkdtempSync(join(tmpdir(), 'cli-serve-b-'))],
      home,
    );
    expect(r.code).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain('Unknown --template');
  });

  it('secrets verbs are wired with write-only semantics documented', () => {
    const r = runCli(['agent', 'serve', 'secrets', '--help'], home);
    expect(r.code).toBe(0);
    for (const verb of ['set', 'unset', 'list']) {
      expect(r.stdout).toContain(verb);
    }
  });

  it('deploy validates the slug/manifest before touching the wallet or network', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'cli-serve-empty-'));
    try {
      const r = runCli(['agent', 'serve', 'deploy', '--dir', emptyDir], home);
      expect(r.code).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toContain('t2serve.json');
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
