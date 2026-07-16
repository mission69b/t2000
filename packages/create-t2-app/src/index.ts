#!/usr/bin/env node
/**
 * create-t2-app — the zero-install interactive starter for the t2000 stack.
 *
 *   npm create t2-app            → prompts (name → template → privacy mode)
 *   npm create t2-app my-app -- --template chat --privacy private --yes
 *
 * Every template scaffolds ROUTER-WIRED: model t2000/auto against
 * api.t2000.ai/v1, plus the agent layer t2code init would add (AGENTS.md,
 * plans/, .t2000 privacy pin). One install story: nothing global required —
 * not @t2000/cli, not @t2000/code (we suggest t2code at the end, only).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as p from '@clack/prompts';
import pc from 'picocolors';

import {
  PRIVACY_MODES,
  TEMPLATES,
  scaffold,
  validateAppName,
  type PrivacyMode,
} from './scaffold';

interface ParsedArgs {
  appName?: string;
  template?: string;
  privacy?: string;
  yes: boolean;
  git: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { yes: false, git: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--template' || a === '-t') out.template = argv[++i];
    else if (a === '--privacy') out.privacy = argv[++i];
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--no-git') out.git = false;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (!a.startsWith('-') && !out.appName) out.appName = a;
  }
  return out;
}

function printHelp(): void {
  console.log(`
${pc.bold('create-t2-app')} — start a router-wired agent project

Usage:
  npm create t2-app [name] -- [options]

Options:
  -t, --template <id>   ${TEMPLATES.map((t) => t.id).join(' | ')}
      --privacy <mode>  ${PRIVACY_MODES.join(' | ')}  (default: private)
  -y, --yes             accept defaults for anything not provided
      --no-git          skip git init
  -h, --help            this help
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const interactive = !args.yes && process.stdout.isTTY;
  p.intro(pc.inverse(' create-t2-app '));

  // ---- name ----
  let appName = args.appName;
  if (!appName && interactive) {
    const answer = await p.text({
      message: 'What is your project named?',
      placeholder: 'my-agent-app',
      validate: (v) => validateAppName(v.trim()),
    });
    if (p.isCancel(answer)) return cancel();
    appName = answer.trim();
  }
  appName = appName || 'my-agent-app';
  const nameError = validateAppName(appName);
  if (nameError) {
    p.cancel(`Invalid project name: ${nameError}`);
    process.exitCode = 1;
    return;
  }

  // ---- template ----
  let templateId = args.template;
  if (templateId && !TEMPLATES.some((t) => t.id === templateId)) {
    p.cancel(
      `Unknown template '${templateId}'. Available: ${TEMPLATES.map((t) => t.id).join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }
  if (!templateId && interactive) {
    const answer = await p.select({
      message: 'Pick a template',
      options: TEMPLATES.map((t) => ({
        value: t.id,
        label: t.label,
        hint: t.hint,
      })),
    });
    if (p.isCancel(answer)) return cancel();
    templateId = answer;
  }
  templateId = templateId || TEMPLATES[0].id;

  // ---- privacy mode ----
  let privacy = args.privacy;
  if (privacy && !PRIVACY_MODES.includes(privacy as PrivacyMode)) {
    p.cancel(`Unknown privacy mode '${privacy}'. Use: ${PRIVACY_MODES.join(' | ')}`);
    process.exitCode = 1;
    return;
  }
  if (!privacy && interactive) {
    const answer = await p.select({
      message: 'Privacy mode for this repo (pinned in .t2000/config.json)',
      options: [
        {
          value: 'private',
          label: 'Private',
          hint: 'open models only, never a closed lab (default)',
        },
        {
          value: 'full',
          label: 'Full router',
          hint: 'best quality, may escalate to frontier labs',
        },
        {
          value: 'confidential',
          label: 'Confidential',
          hint: 'GPU-TEE only, attested + verifiable receipts',
        },
      ],
    });
    if (p.isCancel(answer)) return cancel();
    privacy = answer;
  }
  privacy = privacy || 'private';

  // ---- scaffold ----
  const targetDir = path.resolve(process.cwd(), appName);
  const templatesDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'templates',
  );

  const s = p.spinner();
  s.start(`Scaffolding ${templateId} into ${appName}/`);
  try {
    scaffold({
      appName,
      templateId,
      privacy: privacy as PrivacyMode,
      targetDir,
      templatesDir,
      git: args.git,
    });
  } catch (err) {
    s.stop('Scaffold failed');
    p.cancel(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  s.stop(`Scaffolded ${templateId} → ${appName}/ (privacy pinned: ${privacy})`);

  p.note(
    [
      `cd ${appName}`,
      'npm install',
      `export T2000_API_KEY=sk-...   ${pc.dim('# free key: agents.t2000.ai/manage')}`,
      templateId === 'chat' ? 'npm run dev' : 'npm start',
    ].join('\n'),
    'Next steps',
  );

  p.outro(
    `Code on it privately: ${pc.bold('npm i -g @t2000/code && t2code')} ${pc.dim('· docs: developers.t2000.ai/t2-code')}`,
  );
}

function cancel(): void {
  p.cancel('Cancelled.');
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
