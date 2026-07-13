import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerReadTools } from './tools/read.js';
import { registerWriteTools } from './tools/write.js';
import { registerLimitTool } from './tools/limit.js';
import { registerChatTools } from './tools/chat.js';
import { loadSkillsFromDisk } from './test-load-skills.js';
import { toPromptName } from './skills-prompts.js';

// [S.642 docs-consistency guard — 2026-07-06] Three name classes the docs
// keep drifting on, all machine-checkable against source:
//   1. `t2000_*` MCP tool mentions → must be a registered tool
//   2. `t2000.ai/skills/<slug>` links → the skill dir must exist
//      (the 2026-07-06 sweep found 4 dead `mpp-*` skill links in the
//      gateway README and a phantom `t2000_services_search` on /docs)
//   3. `skill-<name>` prompt mentions → must map to a real skill
// The registered-tool truth set is built by REGISTERING the real modules,
// so the test tracks code — there is no hardcoded list to go stale.

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

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
    if (statSync(join(skillsDir, slug)).isDirectory()) {
      files.push(join(skillsDir, slug, 'SKILL.md'));
    }
  }
  return files;
}

/** Register every production tool module against a capture server and return
 *  the real tool-name set. Mock agent satisfies the constructor reads only —
 *  no handler is ever invoked. */
function registeredToolNames(): Set<string> {
  const names = new Set<string>();
  const server = new McpServer({ name: 'truth', version: '0.0.0' });
  const orig = server.tool.bind(server) as (...args: unknown[]) => unknown;
  server.tool = ((...args: unknown[]) => {
    names.add(args[0] as string);
    return orig(...args);
  }) as typeof server.tool;

  const agent = { address: vi.fn().mockReturnValue('0xtruth') } as never;
  registerReadTools(server, agent);
  registerWriteTools(server, agent);
  registerLimitTool(server);
  registerChatTools(server);
  return names;
}

interface Violation {
  file: string;
  line: number;
  mention: string;
}

function scanPattern(pattern: RegExp, isValid: (capture: string) => boolean): Violation[] {
  const violations: Violation[] = [];
  for (const path of docPaths()) {
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((text, i) => {
      for (const m of text.matchAll(pattern)) {
        if (!isValid(m[1])) {
          violations.push({ file: relative(REPO_ROOT, path), line: i + 1, mention: m[0] });
        }
      }
    });
  }
  return violations;
}

function report(violations: Violation[]): string {
  return violations.map((v) => `  ${v.file}:${v.line} — ${v.mention}`).join('\n');
}

describe('docs consistency — MCP tool names, skill links, prompt names', () => {
  const tools = registeredToolNames();
  const skillNames = new Set(loadSkillsFromDisk().map((s) => s.name));
  const promptNames = new Set([...skillNames].map((n) => toPromptName(n)));

  it('sanity: the truth sets are populated (guard against a broken loader)', () => {
    expect(tools.size).toBeGreaterThanOrEqual(13);
    expect(tools.has('t2000_pay')).toBe(true);
    expect(skillNames.has('t2000-pay')).toBe(true);
    expect(promptNames.has('skill-pay')).toBe(true);
  });

  it('every `t2000_*` tool mentioned in docs is a registered tool', () => {
    const violations = scanPattern(/\b(t2000_[a-z_]+)\b/g, (name) => tools.has(name));
    expect(violations, `phantom MCP tools in docs:\n${report(violations)}`).toEqual([]);
  });

  it('every t2000.ai/skills/<slug> link points at an existing skill', () => {
    // Reserved non-skill paths under /skills/: the shelf feed (feed.json) and
    // the brand-mark assets (brand/<file>) — S.705 shelf infrastructure.
    const reserved = new Set(['feed', 'brand']);
    const violations = scanPattern(
      /t2000\.ai\/skills\/([a-z0-9-]+)/g,
      (slug) =>
        reserved.has(slug) ||
        existsSync(join(REPO_ROOT, 't2000-skills/skills', slug, 'SKILL.md')),
    );
    expect(violations, `dead skill links in docs:\n${report(violations)}`).toEqual([]);
  });

  it('every `skill-<name>` prompt mentioned in docs maps to a real skill', () => {
    const violations = scanPattern(/\b(skill-[a-z][a-z-]*)\b/g, (name) => promptNames.has(name));
    expect(violations, `phantom prompt names in docs:\n${report(violations)}`).toEqual([]);
  });
});
