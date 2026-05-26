// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 5 — 2026-05-26]
// `t2 skills` command group. Replaces the pre-pivot single-file
// `commands/skills.ts` (deleted) with a folder structure that mirrors
// the rest of the v4 surface.

import type { Command } from 'commander';
import { registerSkillsList } from './list.js';
import { registerSkillsInstall } from './install.js';
import { registerSkillsUninstall } from './uninstall.js';

export function registerSkills(program: Command) {
  const group = program
    .command('skills')
    .description('Install t2000 skills as local SKILL.md files (alt to `t2 mcp install`)')
    .addHelpText(
      'after',
      `
Subcommands:
  $ t2 skills list                   List available skills
  $ t2 skills install                Install all skills (default target: agents)
  $ t2 skills install <slug>         Install one skill by name
  $ t2 skills install --target cursor   Install as Cursor .mdc rules
  $ t2 skills uninstall              Remove installed skills

For MCP-aware clients (Claude Desktop, Cursor, Windsurf), prefer
\`t2 mcp install\` — same skills, no local files.
`,
    );

  registerSkillsList(group);
  registerSkillsInstall(group);
  registerSkillsUninstall(group);
}
