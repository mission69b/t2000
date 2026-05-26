// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 4 — 2026-05-26]
// `t2 services` command group. Discovery + inspection of MPP services
// hosted at `mpp.t2000.ai` (the gateway in `apps/gateway`).

import type { Command } from 'commander';
import { registerServicesSearch } from './search.js';
import { registerServicesInspect } from './inspect.js';

export function registerServices(program: Command) {
  const group = program
    .command('services')
    .description('Discover MPP services payable via `t2 pay`')
    .addHelpText(
      'after',
      `
Subcommands:
  $ t2 services search "<query>"     Find services by name / category
  $ t2 services inspect <url>        Show pricing + endpoints

The catalog lives at https://mpp.t2000.ai/api/services. Override with
T2000_GATEWAY_URL or --gateway <url> for local development.
`,
    );

  registerServicesSearch(group);
  registerServicesInspect(group);
}
