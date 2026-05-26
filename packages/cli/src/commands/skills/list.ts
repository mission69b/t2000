// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 5 — 2026-05-26]
// `t2 skills list` — print the skills inventory from the t2000.ai
// manifest. Pairs with `t2 skills install` for local SKILL.md install
// (the MCP path is preferred — `t2 mcp install` exposes them as
// `/skill-<name>` slash commands).

import type { Command } from 'commander';
import { fetchManifest } from './lib.js';
import {
  printBlank,
  printInfo,
  printJson,
  isJsonMode,
  handleError,
} from '../../output.js';

export function registerSkillsList(parent: Command) {
  parent
    .command('list')
    .description('List skills available from t2000.ai (core t2000 + MPP recipes)')
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
        printInfo('Install all: t2 skills install');
        printInfo('Install one: t2 skills install <name>');
        printBlank();
      } catch (err) {
        handleError(err);
      }
    });
}
