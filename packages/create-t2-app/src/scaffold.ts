import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const PRIVACY_MODES = ['private', 'full', 'confidential'] as const;
export type PrivacyMode = (typeof PRIVACY_MODES)[number];

export interface TemplateMeta {
  id: string;
  label: string;
  hint: string;
}

// The catalog. Every entry MUST be router-wired: first run bills the router
// (model t2000/auto) — a starter with no agent workflow earns no slot here.
export const TEMPLATES: TemplateMeta[] = [
  {
    id: 'agent-worker',
    label: 'Agent worker',
    hint: 'headless TypeScript worker on t2000/auto — the smallest useful agent',
  },
  {
    id: 'chat',
    label: 'AI chat app',
    hint: 'Next.js streaming chat on t2000/auto — dependency-light, no framework magic',
  },
  {
    id: 'sui-dapp',
    label: 'Sui dApp',
    hint: 'wallet connect + gRPC reads + an AI copilot that knows your holdings',
  },
];

export interface ScaffoldOptions {
  appName: string;
  templateId: string;
  privacy: PrivacyMode;
  targetDir: string;
  templatesDir: string;
  git?: boolean;
}

export function validateAppName(name: string): string | undefined {
  if (!name) return 'Project name is required';
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    return 'Use lowercase letters, numbers, dots, dashes (npm package name rules)';
  }
  if (name.length > 214) return 'Name too long';
  return undefined;
}

export function scaffold(opts: ScaffoldOptions): void {
  const templateDir = path.join(opts.templatesDir, opts.templateId);
  if (!existsSync(templateDir)) {
    throw new Error(`Unknown template '${opts.templateId}'`);
  }
  if (existsSync(opts.targetDir) && readdirSync(opts.targetDir).length > 0) {
    throw new Error(`Directory ${opts.targetDir} already exists and is not empty`);
  }

  mkdirSync(opts.targetDir, { recursive: true });
  cpSync(templateDir, opts.targetDir, { recursive: true });

  // npm strips .gitignore (and can strip .env*) from published packages —
  // templates ship them underscore-prefixed and we restore the real names
  // here (the create-next-app trick).
  for (const [from, to] of [
    ['_gitignore', '.gitignore'],
    ['_env.example', '.env.example'],
  ] as const) {
    const src = path.join(opts.targetDir, from);
    if (existsSync(src)) {
      renameSync(src, path.join(opts.targetDir, to));
    }
  }

  const pkgPath = path.join(opts.targetDir, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
    pkg.name = opts.appName;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }

  // The per-repo privacy pin — same contract as `t2code init`: the pin
  // overrides every contributor's global setting.
  const pinDir = path.join(opts.targetDir, '.t2000');
  mkdirSync(pinDir, { recursive: true });
  writeFileSync(
    path.join(pinDir, 'config.json'),
    JSON.stringify({ privacyMode: opts.privacy }, null, 2) + '\n',
  );

  if (opts.git !== false) {
    const init = spawnSync('git', ['init', '--quiet'], {
      cwd: opts.targetDir,
      stdio: 'ignore',
    });
    if (init.status === 0) {
      spawnSync('git', ['add', '-A'], { cwd: opts.targetDir, stdio: 'ignore' });
    }
    // git missing or failing is non-fatal — the scaffold is still complete.
  }
}
