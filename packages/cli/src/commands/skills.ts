// [SPEC_AGENTIC_STACK P3 followup / S.325 — 2026-05-26]
// [P4 / S.326 — 2026-05-26 — added mpp-* prefix for the 4 MPP recipes]
// `t2000 skills install` — local-file alternative to the canonical MCP install.
//
// The recommended path is still `t2000 mcp install`, which exposes all 21
// t2000 + mpp-* skills as `/skill-<name>` slash commands in the AI client
// (no local files needed). Use THIS command when you specifically want the
// SKILL.md files on disk — e.g. checking them into a shared team repo as
// cursor rules, or running an AI client that reads skills from a directory
// rather than via MCP.
//
// Source of truth: `https://t2000.ai/.well-known/agent-skills/index.json`
// (always-fresh; matches what the `@t2000/mcp` bundle bakes in). Network
// is required at install time — if you need offline install, `git clone`
// the t2000 repo and copy `t2000-skills/skills/<slug>/SKILL.md` directly.
import type { Command } from 'commander';
import { writeFile, mkdir, readdir, unlink, rmdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { printSuccess, printBlank, printInfo, printJson, isJsonMode, handleError } from '../output.js';

const MANIFEST_URL = 'https://t2000.ai/.well-known/agent-skills/index.json';

// Prefixes used by skills shipped from this repo. Extend when adding a new
// namespace (e.g., a future `audric-*` skill set). `uninstall` uses this
// list to decide which entries in the target dir to remove without needing
// to round-trip to the manifest (which may be offline at uninstall time).
const SKILL_PREFIXES = ['t2000-', 'mpp-'] as const;
export function isManagedSkillName(name: string): boolean {
  return SKILL_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export type SkillTarget = 'agents' | 'cursor' | 'claude-code';
export const SKILL_TARGETS: readonly SkillTarget[] = ['agents', 'cursor', 'claude-code'] as const;

export interface SkillIndexEntry {
  name: string;
  description: string;
  url: string;
  version: string;
  license: string;
}

interface SkillsManifest {
  version: string;
  name: string;
  description: string;
  homepage: string;
  generated: string;
  skills: SkillIndexEntry[];
}

// Resolve where skill files land for a given target + scope. Pure function — no I/O.
export function resolveTargetDir(target: SkillTarget, useGlobal: boolean, cwd: string = process.cwd()): string {
  const root = useGlobal ? homedir() : cwd;
  switch (target) {
    case 'agents':
      return join(root, '.agents', 'skills');
    case 'cursor':
      return join(root, '.cursor', 'rules');
    case 'claude-code':
      return join(root, '.claude', 'skills');
  }
}

// Return the relative filename under the target directory for a given skill slug.
// Cursor uses a flat `.mdc` file per skill (no per-skill subdirectory); other
// targets follow the agentskills.io standard `<slug>/SKILL.md` layout.
export function filenameForTarget(slug: string, target: SkillTarget): string {
  switch (target) {
    case 'agents':
    case 'claude-code':
      return join(slug, 'SKILL.md');
    case 'cursor':
      return `${slug}.mdc`;
  }
}

// Transform raw SKILL.md content for the target client.
// - `agents` + `claude-code`: pass through (agentskills.io standard).
// - `cursor`: convert to `.mdc` format — replace the agentskills frontmatter
//   with Cursor's expected `description: "..."\nalwaysApply: false` header
//   so the rule appears as an agent-requested rule in Cursor's rule picker.
export function transformForTarget(content: string, target: SkillTarget, description: string): string {
  if (target !== 'cursor') return content;
  const stripped = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, '');
  const safeDescription = JSON.stringify(description);
  return `---\ndescription: ${safeDescription}\nalwaysApply: false\n---\n${stripped}`;
}

// Validate a `--target` flag value. Throws with a clear list of accepted
// values when given anything outside `SKILL_TARGETS`.
export function resolveSkillTarget(input: string | undefined): SkillTarget {
  const value = input ?? 'agents';
  const match = SKILL_TARGETS.find((t) => t === value);
  if (!match) {
    throw new Error(`--target must be one of: ${SKILL_TARGETS.join(', ')}. Got: "${value}"`);
  }
  return match;
}

async function fetchManifest(): Promise<SkillsManifest> {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch skills manifest from ${MANIFEST_URL} (${res.status} ${res.statusText}). ` +
        'Check your network or fall back to `git clone https://github.com/mission69b/t2000` for offline install.',
    );
  }
  return (await res.json()) as SkillsManifest;
}

async function fetchSkill(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch skill ${url} (${res.status} ${res.statusText})`);
  }
  return await res.text();
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

interface InstallOpts {
  target?: string;
  global?: boolean;
}

interface UninstallOpts {
  target?: string;
  global?: boolean;
}

export function registerSkills(program: Command) {
  const skills = program
    .command('skills')
    .description('Install t2000 skills as local SKILL.md files (alternative to `t2000 mcp install`)');

  skills
    .command('list')
    .description('List the skills available from t2000.ai (core t2000 + MPP recipes)')
    .action(async () => {
      try {
        const manifest = await fetchManifest();
        if (isJsonMode()) {
          printJson({ skills: manifest.skills });
          return;
        }
        printBlank();
        printInfo(`${manifest.skills.length} skills available:`);
        printBlank();
        for (const s of manifest.skills) {
          console.log(`  ${s.name.padEnd(28)} v${s.version}`);
        }
        printBlank();
        printInfo(`Install all: t2000 skills install`);
        printInfo(`Install one: t2000 skills install <name>`);
        printBlank();
      } catch (err) {
        handleError(err);
      }
    });

  skills
    .command('install [slug]')
    .description('Install all skills (or one named slug) into a local directory')
    .option('--target <name>', 'Target client layout: agents (default), cursor, claude-code', 'agents')
    .option('--global', 'Install to ~/.<target>/ instead of <cwd>/.<target>/')
    .action(async (slug: string | undefined, opts: InstallOpts) => {
      try {
        const target = resolveSkillTarget(opts.target);
        const useGlobal = opts.global === true;

        const manifest = await fetchManifest();
        const toInstall = slug
          ? manifest.skills.filter((s) => s.name === slug)
          : manifest.skills;

        if (toInstall.length === 0) {
          const available = manifest.skills.map((s) => s.name).join(', ');
          throw new Error(
            slug
              ? `Unknown skill: "${slug}". Available: ${available}`
              : 'No skills found in manifest',
          );
        }

        const targetDir = resolveTargetDir(target, useGlobal);
        await mkdir(targetDir, { recursive: true });

        const installed: Array<{ name: string; path: string }> = [];
        for (const s of toInstall) {
          const raw = await fetchSkill(s.url);
          const transformed = transformForTarget(raw, target, s.description);
          const relPath = filenameForTarget(s.name, target);
          const fullPath = join(targetDir, relPath);
          await mkdir(join(fullPath, '..'), { recursive: true });
          await writeFile(fullPath, transformed, 'utf-8');
          installed.push({ name: s.name, path: fullPath });
        }

        if (isJsonMode()) {
          printJson({ target, global: useGlobal, targetDir, installed });
          return;
        }

        printBlank();
        printSuccess(`Installed ${installed.length} skill${installed.length === 1 ? '' : 's'} into ${targetDir}`);
        for (const r of installed) {
          console.log(`  ${r.name}`);
        }
        printBlank();
        printInfo('Reload your AI client to pick up the new skill files.');
        if (target !== 'cursor') {
          printInfo('(For an MCP-aware client, prefer `t2000 mcp install` — same skills, zero local files.)');
        }
        printBlank();
      } catch (err) {
        handleError(err);
      }
    });

  skills
    .command('uninstall')
    .description('Remove installed t2000 + MPP skills from the target directory')
    .option('--target <name>', 'Target client layout: agents (default), cursor, claude-code', 'agents')
    .option('--global', 'Uninstall from ~/.<target>/ instead of <cwd>/.<target>/')
    .action(async (opts: UninstallOpts) => {
      try {
        const target = resolveSkillTarget(opts.target);
        const useGlobal = opts.global === true;
        const targetDir = resolveTargetDir(target, useGlobal);

        if (!(await dirExists(targetDir))) {
          if (isJsonMode()) {
            printJson({ target, targetDir, removed: [] });
            return;
          }
          printInfo(`No skills installed at ${targetDir}`);
          return;
        }

        const entries = await readdir(targetDir);
        const removed: string[] = [];
        for (const entry of entries) {
          const full = join(targetDir, entry);
          if (target === 'cursor') {
            // entries look like `<slug>.mdc` — strip the suffix to match the prefix.
            const slug = entry.endsWith('.mdc') ? entry.slice(0, -'.mdc'.length) : entry;
            if (entry.endsWith('.mdc') && isManagedSkillName(slug)) {
              await unlink(full);
              removed.push(entry);
            }
          } else {
            if (isManagedSkillName(entry)) {
              const skillFile = join(full, 'SKILL.md');
              try {
                await unlink(skillFile);
              } catch {
                // file may already be gone — keep going
              }
              try {
                await rmdir(full);
              } catch {
                // dir may have other contents — leave them
              }
              removed.push(entry);
            }
          }
        }

        if (isJsonMode()) {
          printJson({ target, targetDir, removed });
          return;
        }

        printBlank();
        if (removed.length === 0) {
          printInfo(`No managed skills found in ${targetDir}`);
        } else {
          printSuccess(`Removed ${removed.length} skill${removed.length === 1 ? '' : 's'} from ${targetDir}`);
        }
        printBlank();
      } catch (err) {
        handleError(err);
      }
    });
}
