// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 5 — 2026-05-26]
// `t2 skills install [slug]` — download SKILL.md files into the local
// target directory (`.agents/skills/`, `.cursor/rules/`, or
// `.claude/skills/`). For MCP-aware clients prefer `t2 mcp install`
// which exposes skills as `/skill-<name>` slash commands without
// writing files to disk.

import type { Command } from 'commander';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  fetchManifest,
  fetchSkill,
  filenameForTarget,
  resolveSkillTarget,
  resolveTargetDir,
  transformForTarget,
} from './lib.js';
import {
  printBlank,
  printInfo,
  printJson,
  printSuccess,
  isJsonMode,
  handleError,
} from '../../output.js';

export interface SkillsInstallOptions {
  target?: string;
  global?: boolean;
}

export function registerSkillsInstall(parent: Command) {
  parent
    .command('install [slug]')
    .description('Install all skills (or one named slug) into a local directory')
    .option('--target <name>', 'Target client layout: agents (default), cursor, claude-code', 'agents')
    .option('--global', 'Install to ~/.<target>/ instead of <cwd>/.<target>/')
    .action(async (slug: string | undefined, opts: SkillsInstallOptions) => {
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
        printSuccess(
          `Installed ${installed.length} skill${installed.length === 1 ? '' : 's'} into ${targetDir}`,
        );
        for (const r of installed) {
          console.log(`  ${r.name}`);
        }
        printBlank();
        printInfo('Reload your AI client to pick up the new skill files.');
        if (target !== 'cursor') {
          printInfo('(For an MCP-aware client, prefer `t2 mcp install` — same skills, zero local files.)');
        }
        printBlank();
      } catch (err) {
        handleError(err);
      }
    });
}
