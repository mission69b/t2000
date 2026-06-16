// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 4 — 2026-05-26]
// `t2 limit` command group. Opt-in spending caps (default = no limits).
// Schema lives in `~/.t2000/config.json` per `lib/config-store.ts`.

import type { Command } from 'commander';
import { registerLimitShow } from './show.js';
import { registerLimitSet } from './set.js';
import { registerLimitReset } from './reset.js';

export function registerLimit(program: Command) {
  const group = program
    .command('limit')
    .description('Manage spending limits (on by default: $25/tx, $100/day)')
    .addHelpText(
      'after',
      `
Subcommands:
  $ t2 limit show                    Show current limits
  $ t2 limit set --per-tx 50         Cap every write at $50
  $ t2 limit set --daily 100         Cap every send at $100
  $ t2 limit reset                   Clear all limits
`,
    );

  registerLimitShow(group);
  registerLimitSet(group);
  registerLimitReset(group);
}
