// `t2 skills check` — skill freshness (S.674). Agents that copied skills to
// disk (or into AGENTS.md workflows) drift silently when the served skills
// update; this verb compares every installed managed skill against what
// t2000.ai serves TODAY and answers `{ upToDate, action }` — the contract
// agents can run at session start. Read-only: never writes or fetches more
// than the manifest + changed skills.

import type { Command } from 'commander';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  SKILL_TARGETS,
  type SkillTarget,
  type SkillsManifest,
  dirExists,
  fetchManifest,
  fetchSkill,
  filenameForTarget,
  isManagedSkillName,
  resolveTargetDir,
  transformForTarget,
} from './lib.js';
import {
  handleError,
  isJsonMode,
  printBlank,
  printInfo,
  printJson,
  printSuccess,
} from '../../output.js';

export type SkillCheckStatus = 'up-to-date' | 'drifted' | 'retired';

export interface SkillCheckRow {
  name: string;
  target: SkillTarget;
  scope: 'local' | 'global';
  path: string;
  status: SkillCheckStatus;
}

/** Slug for an installed entry (dir name, or `<slug>.mdc` for cursor). */
export function slugFromEntry(entry: string, target: SkillTarget): string {
  return target === 'cursor' ? entry.replace(/\.mdc$/, '') : entry;
}

/** List installed managed skill slugs under one target dir. */
async function installedSlugs(
  dir: string,
  target: SkillTarget,
): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries
      .map((e) => slugFromEntry(e, target))
      .filter((slug) => isManagedSkillName(slug));
  } catch {
    return [];
  }
}

/** Compare one installed skill file against the served (transformed) content. */
export function classifyContent(
  installed: string,
  served: string | null,
): SkillCheckStatus {
  if (served === null) {
    return 'retired';
  }
  return installed.trim() === served.trim() ? 'up-to-date' : 'drifted';
}

async function checkTargetScope(
  manifest: SkillsManifest,
  servedCache: Map<string, string>,
  target: SkillTarget,
  scope: 'local' | 'global',
): Promise<SkillCheckRow[]> {
  const dir = resolveTargetDir(target, scope === 'global');
  if (!(await dirExists(dir))) {
    return [];
  }
  const slugs = await installedSlugs(dir, target);
  const rows: SkillCheckRow[] = [];
  for (const slug of slugs) {
    const path = join(dir, filenameForTarget(slug, target));
    let installed: string;
    try {
      installed = await readFile(path, 'utf-8');
    } catch {
      continue; // dir without SKILL.md — not an install
    }
    const entry = manifest.skills.find((s) => s.name === slug);
    let served: string | null = null;
    if (entry) {
      const cacheKey = `${target}:${slug}`;
      const cached = servedCache.get(cacheKey);
      if (cached !== undefined) {
        served = cached;
      } else {
        const raw = await fetchSkill(entry.url);
        served = transformForTarget(raw, target, entry.description);
        servedCache.set(cacheKey, served);
      }
    }
    rows.push({
      name: slug,
      target,
      scope,
      path,
      status: classifyContent(installed, served),
    });
  }
  return rows;
}

export function registerSkillsCheck(parent: Command) {
  parent
    .command('check')
    .description(
      'Compare installed skills against what t2000.ai serves — { upToDate, action } for agents',
    )
    .option(
      '--target <name>',
      'Only check one target layout: agents, cursor, claude-code (default: all)',
    )
    .action(async (opts: { target?: string }) => {
      try {
        const targets: readonly SkillTarget[] = opts.target
          ? [
              (() => {
                const match = SKILL_TARGETS.find((t) => t === opts.target);
                if (!match) {
                  throw new Error(
                    `--target must be one of: ${SKILL_TARGETS.join(', ')}. Got: "${opts.target}"`,
                  );
                }
                return match;
              })(),
            ]
          : SKILL_TARGETS;

        const manifest = await fetchManifest();
        const servedCache = new Map<string, string>();
        const rows: SkillCheckRow[] = [];
        for (const target of targets) {
          rows.push(
            ...(await checkTargetScope(manifest, servedCache, target, 'local')),
            ...(await checkTargetScope(manifest, servedCache, target, 'global')),
          );
        }

        const stale = rows.filter((r) => r.status !== 'up-to-date');
        const upToDate = rows.length > 0 && stale.length === 0;

        if (isJsonMode()) {
          printJson({
            upToDate: rows.length === 0 ? true : upToDate,
            installed: rows.length,
            manifestVersion: manifest.version,
            skills: rows,
            action: stale.length > 0 ? 't2 skills install' : undefined,
          });
          return;
        }

        printBlank();
        if (rows.length === 0) {
          printInfo(
            'No installed skills found (checked ./ and ~/ for .agents/skills, .cursor/rules, .claude/skills).',
          );
          printInfo('Install: t2 skills install   ·   MCP clients: t2 mcp install (no files, always fresh)');
          printBlank();
          return;
        }
        for (const r of rows) {
          const mark =
            r.status === 'up-to-date' ? '✓' : r.status === 'drifted' ? '↻' : '✗';
          console.log(`  ${mark} ${r.name}  [${r.target} · ${r.scope}]  ${r.status}`);
        }
        printBlank();
        if (upToDate) {
          printSuccess(`All ${rows.length} installed skills match what t2000.ai serves.`);
        } else {
          printInfo(
            `${stale.length} of ${rows.length} installed skills are stale — refresh with: t2 skills install`,
          );
          if (stale.some((r) => r.status === 'retired')) {
            printInfo('(✗ retired = no longer in the manifest — remove with: t2 skills uninstall)');
          }
        }
        printBlank();
      } catch (err) {
        handleError(err);
      }
    });
}
