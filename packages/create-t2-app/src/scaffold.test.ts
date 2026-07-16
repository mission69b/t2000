import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { TEMPLATES, scaffold, validateAppName } from './scaffold';

const templatesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'templates',
);

let dirs: string[] = [];
function tmpTarget(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'create-t2-app-'));
  dirs.push(d);
  return path.join(d, 'app');
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe('validateAppName', () => {
  it('accepts npm-style names', () => {
    expect(validateAppName('my-agent-app')).toBeUndefined();
    expect(validateAppName('app2.worker_x')).toBeUndefined();
  });
  it('rejects bad names', () => {
    expect(validateAppName('')).toBeDefined();
    expect(validateAppName('My App')).toBeDefined();
    expect(validateAppName('-lead')).toBeDefined();
  });
});

describe('scaffold', () => {
  it.each(TEMPLATES.map((t) => t.id))('scaffolds %s router-wired', (id) => {
    const target = tmpTarget();
    scaffold({
      appName: 'smoke-app',
      templateId: id,
      privacy: 'private',
      targetDir: target,
      templatesDir,
      git: false,
    });

    // Renames applied
    expect(existsSync(path.join(target, '.gitignore'))).toBe(true);
    expect(existsSync(path.join(target, '_gitignore'))).toBe(false);
    expect(existsSync(path.join(target, '.env.example'))).toBe(true);

    // Name replaced
    const pkg = JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('smoke-app');

    // Privacy pin written
    const pin = JSON.parse(
      readFileSync(path.join(target, '.t2000', 'config.json'), 'utf8'),
    );
    expect(pin.privacyMode).toBe('private');

    // The agent layer
    expect(existsSync(path.join(target, 'AGENTS.md'))).toBe(true);
    expect(existsSync(path.join(target, 'plans', 'README.md'))).toBe(true);

    // The hard rule: router-wired — t2000/auto against api.t2000.ai
    const entry =
      id === 'chat'
        ? readFileSync(path.join(target, 'app', 'api', 'chat', 'route.ts'), 'utf8')
        : readFileSync(path.join(target, 'src', 'worker.ts'), 'utf8');
    expect(entry).toContain('t2000/auto');
    expect(entry).toContain('api.t2000.ai/v1');
  });

  it('respects the privacy choice', () => {
    const target = tmpTarget();
    scaffold({
      appName: 'conf-app',
      templateId: 'agent-worker',
      privacy: 'confidential',
      targetDir: target,
      templatesDir,
      git: false,
    });
    const pin = JSON.parse(
      readFileSync(path.join(target, '.t2000', 'config.json'), 'utf8'),
    );
    expect(pin.privacyMode).toBe('confidential');
  });

  it('refuses a non-empty target dir', () => {
    const target = tmpTarget();
    scaffold({
      appName: 'a',
      templateId: 'agent-worker',
      privacy: 'private',
      targetDir: target,
      templatesDir,
      git: false,
    });
    expect(() =>
      scaffold({
        appName: 'a',
        templateId: 'agent-worker',
        privacy: 'private',
        targetDir: target,
        templatesDir,
        git: false,
      }),
    ).toThrow(/not empty/);
  });

  it('rejects unknown templates', () => {
    expect(() =>
      scaffold({
        appName: 'a',
        templateId: 'nope',
        privacy: 'private',
        targetDir: tmpTarget(),
        templatesDir,
        git: false,
      }),
    ).toThrow(/Unknown template/);
  });
});
