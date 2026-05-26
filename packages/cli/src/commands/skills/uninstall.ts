// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 5 — 2026-05-26]
// `t2 skills uninstall` — remove the skill files this CLI manages
// (anything matching `SKILL_PREFIXES`) from the target directory.

import type { Command } from 'commander';
import { readdir, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  dirExists,
  isManagedSkillName,
  resolveSkillTarget,
  resolveTargetDir,
} from './lib.js';
import {
  printBlank,
  printInfo,
  printJson,
  printSuccess,
  isJsonMode,
  handleError,
} from '../../output.js';

export interface SkillsUninstallOptions {
  target?: string;
  global?: boolean;
}

export function registerSkillsUninstall(parent: Command) {
  parent
    .command('uninstall')
    .description('Remove installed t2000 + MPP skills from the target directory')
    .option('--target <name>', 'Target client layout: agents (default), cursor, claude-code', 'agents')
    .option('--global', 'Uninstall from ~/.<target>/ instead of <cwd>/.<target>/')
    .action(async (opts: SkillsUninstallOptions) => {
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
