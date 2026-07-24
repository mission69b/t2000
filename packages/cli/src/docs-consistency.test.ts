import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProgram } from './program.js';

// [S.642 docs-consistency guard — 2026-07-06] Every `t2 <verb>` (and
// `t2 <verb> <sub>`) mentioned in the durable doc surfaces must exist in the
// registered commander surface. Born from the 2026-07-06 staleness sweep:
// the one-prompt setup skill told LLMs to run `t2 services list` (never
// existed) and the marketing /docs page sold a `t2000_services_search`.
// Names are machine-checkable; this test makes that class of drift fail CI.
//
// Deliberately NOT checked (would be a false-positive machine): counts in
// prose, prices, behavior descriptions, changelog history.

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

/** Durable doc surfaces that teach commands. Marketing components and the
 *  changelog (historical by design) are deliberately excluded. */
const DOC_FILES: string[] = [
  'README.md',
  'packages/cli/README.md',
  'packages/mcp/README.md',
  'packages/sdk/README.md',
  'apps/gateway/README.md',
  'apps/gateway/app/llms.txt/route.ts',
  'apps/web/public/install.sh',
  't2000-skills/README.md',
  't2000-skills/AGENTS.md',
];

function collectMdx(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectMdx(full, out);
    } else if (entry.endsWith('.mdx') && entry !== 'changelog.mdx') {
      out.push(full);
    }
  }
}

function docPaths(): string[] {
  const files = DOC_FILES.map((f) => join(REPO_ROOT, f));
  collectMdx(join(REPO_ROOT, 'apps/docs'), files);
  const skillsDir = join(REPO_ROOT, 't2000-skills/skills');
  for (const slug of readdirSync(skillsDir)) {
    const skillFile = join(skillsDir, slug, 'SKILL.md');
    if (statSync(join(skillsDir, slug)).isDirectory()) files.push(skillFile);
  }
  return files;
}

interface CommandSurface {
  /** top-level verb (incl. aliases) → set of subcommand names (empty = leaf) */
  verbs: Map<string, Set<string>>;
}

function buildSurface(): CommandSurface {
  const program = createProgram();
  const verbs = new Map<string, Set<string>>();
  for (const cmd of program.commands) {
    const subs = new Set<string>();
    for (const sub of cmd.commands) {
      subs.add(sub.name());
      for (const alias of sub.aliases()) subs.add(alias);
    }
    verbs.set(cmd.name(), subs);
    for (const alias of cmd.aliases()) verbs.set(alias, subs);
  }
  return { verbs };
}

interface Violation {
  file: string;
  line: number;
  mention: string;
  reason: string;
}

/** `t2 <verb>` or `t2 <verb> <sub>` — second token only validated when the
 *  verb actually has subcommands (otherwise it's an argument like an amount,
 *  URL, or receipt id). Tokens starting with non-letters (flags, <args>,
 *  numbers, quotes) never match. */
const MENTION = /\bt2 ([a-z][a-z0-9-]*)(?: ([a-z][a-z0-9-]*))?/g;

/** English continuations after a prose "t2" ("the t2 command", "t2 is
 *  ready", "use t2 services to …"). NOT candidate subcommand names —
 *  deliberately excludes plausible drift like `list`, `sell`, `earnings`. */
const PROSE_STOPWORDS = new Set([
  'command', 'commands', 'is', 'can', 'cannot', 'does', 'will', 'and', 'or',
  'to', 'for', 'the', 'a', 'an', 'in', 'on', 'with', 'via', 'ready', 'verb',
  'verbs', 'binary', 'bins', 'alias', 'aliases', 'wallet',
]);

function scan(surface: CommandSurface): Violation[] {
  const violations: Violation[] = [];
  for (const path of docPaths()) {
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((text, i) => {
      for (const m of text.matchAll(MENTION)) {
        const [, verb, sub] = m;
        if (PROSE_STOPWORDS.has(verb)) continue;
        const subs = surface.verbs.get(verb);
        const file = relative(REPO_ROOT, path);
        if (!subs) {
          violations.push({ file, line: i + 1, mention: `t2 ${verb}`, reason: 'unknown command' });
          continue;
        }
        if (sub && subs.size > 0 && !subs.has(sub) && !PROSE_STOPWORDS.has(sub)) {
          violations.push({
            file,
            line: i + 1,
            mention: `t2 ${verb} ${sub}`,
            reason: `'${sub}' is not a subcommand of 't2 ${verb}' (has: ${[...subs].join(', ')})`,
          });
        }
      }
    });
  }
  return violations;
}

describe('docs consistency — CLI command mentions', () => {
  it('every `t2 <verb> [<sub>]` mentioned in docs exists in the registered surface', () => {
    const violations = scan(buildSurface());
    const report = violations
      .map((v) => `  ${v.file}:${v.line} — \`${v.mention}\` (${v.reason})`)
      .join('\n');
    expect(violations, `stale CLI mentions in docs:\n${report}`).toEqual([]);
  });

  it('sanity: the surface includes the core verbs (guard against a broken walker)', () => {
    const { verbs } = buildSurface();
    for (const v of ['init', 'send', 'swap', 'pay', 'agent', 'agents', 'services', 'verify']) {
      expect(verbs.has(v), `missing core verb '${v}'`).toBe(true);
    }
    expect(verbs.get('services')!.has('search')).toBe(true);
  });
});
