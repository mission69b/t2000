// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 5 — 2026-05-26]
// Shared helpers for the `t2 skills` group. Migrated from the pre-pivot
// single-file `commands/skills.ts` (deleted). Pure functions only —
// the I/O side (manifest fetch, file read/write) is `fetchManifest` +
// `fetchSkill` + `dirExists`, which are also exported here for the
// command files.
//
// `t2000` + `mpp-` skill prefixes stay as the canonical slug namespace
// (changing them invalidates every manifest URL). Brand verbs change
// (`t2000 → t2`) but skill *slugs* stay `t2000-<verb>`.

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const MANIFEST_URL = 'https://t2000.ai/.well-known/agent-skills/index.json';

/**
 * Prefixes used by skills shipped from this repo. Extend when adding a
 * new namespace (e.g., a future `audric-*` skill set). `uninstall` uses
 * this list to decide which entries in the target dir to remove without
 * needing to round-trip to the manifest (which may be offline at
 * uninstall time).
 */
export const SKILL_PREFIXES = ['t2000-', 'mpp-'] as const;

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

export interface SkillsManifest {
  version: string;
  name: string;
  description: string;
  homepage: string;
  generated: string;
  skills: SkillIndexEntry[];
}

/** Resolve where skill files land for a given target + scope. */
export function resolveTargetDir(
  target: SkillTarget,
  useGlobal: boolean,
  cwd: string = process.cwd(),
): string {
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

/**
 * Return the relative filename under the target directory for a given
 * skill slug. Cursor uses a flat `.mdc` file per skill; other targets
 * follow the agentskills.io standard `<slug>/SKILL.md` layout.
 */
export function filenameForTarget(slug: string, target: SkillTarget): string {
  switch (target) {
    case 'agents':
    case 'claude-code':
      return join(slug, 'SKILL.md');
    case 'cursor':
      return `${slug}.mdc`;
  }
}

/**
 * Transform raw SKILL.md content for the target client. `cursor` rewrites
 * the frontmatter to Cursor's expected `description` + `alwaysApply`
 * shape; the other two targets pass through.
 */
export function transformForTarget(
  content: string,
  target: SkillTarget,
  description: string,
): string {
  if (target !== 'cursor') return content;
  const stripped = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, '');
  const safeDescription = JSON.stringify(description);
  return `---\ndescription: ${safeDescription}\nalwaysApply: false\n---\n${stripped}`;
}

/**
 * Validate a `--target` flag value. Throws with a clear list of
 * accepted values when given anything outside `SKILL_TARGETS`.
 */
export function resolveSkillTarget(input: string | undefined): SkillTarget {
  const value = input ?? 'agents';
  const match = SKILL_TARGETS.find((t) => t === value);
  if (!match) {
    throw new Error(`--target must be one of: ${SKILL_TARGETS.join(', ')}. Got: "${value}"`);
  }
  return match;
}

export async function fetchManifest(): Promise<SkillsManifest> {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch skills manifest from ${MANIFEST_URL} (${res.status} ${res.statusText}). ` +
        'Check your network or fall back to `git clone https://github.com/mission69b/t2000` for offline install.',
    );
  }
  return (await res.json()) as SkillsManifest;
}

export async function fetchSkill(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch skill ${url} (${res.status} ${res.statusText})`);
  }
  return await res.text();
}

export async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
