// `t2 agents [address]` — look up the agent directory (agents.t2000.ai)
// from the terminal. No address = list registered agents; an address = one
// agent's identity profile. Read-only — no wallet needed. [Agent ID]

import type { Command } from 'commander';
import { truncateAddress } from '@t2000/sdk';
import {
  handleError,
  isJsonMode,
  printBlank,
  printHeader,
  printInfo,
  printJson,
  printKeyValue,
  printLine,
} from '../output.js';

const DEFAULT_API_BASE = process.env.T2000_API_URL ?? 'https://api.t2000.ai/v1';

type DirectoryAgent = {
  address: string;
  numericId?: number | null;
  name?: string | null;
  active?: boolean;
  category?: string | null;
  description?: string | null;
};

type AgentProfile = DirectoryAgent & {
  owner?: string | null;
  createdAt?: string;
  links?: { website?: string; twitter?: string; github?: string };
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Directory request failed (${res.status}).`);
  }
  return (await res.json()) as T;
}

function firstLine(text: string | null | undefined, max = 76): string {
  const line = (text ?? '').split('\n')[0]?.trim() ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function registerAgents(program: Command) {
  program
    .command('agents')
    .argument('[address]', 'Show one agent’s identity profile')
    .description(
      'Look up the agent directory (agents.t2000.ai): registered on-chain Agent IDs. Read-only. [Agent ID]',
    )
    .option('--category <category>', 'Filter the list by category')
    .option('--limit <n>', 'Max rows (default: all)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (
        address: string | undefined,
        opts: { category?: string; limit?: string; api?: string },
      ) => {
        try {
          const base = opts.api ?? DEFAULT_API_BASE;

          if (address) {
            const profile = await getJson<AgentProfile>(`${base}/agents/${address}`);
            if (isJsonMode()) {
              printJson(profile);
              return;
            }
            printBlank();
            printHeader(profile.name ?? truncateAddress(profile.address));
            printKeyValue('Address', profile.address);
            if (profile.numericId != null) {
              printKeyValue('Agent ID', `#${profile.numericId}`);
            }
            if (profile.description) {
              printKeyValue('About', firstLine(profile.description, 90));
            }
            if (profile.owner) {
              printKeyValue('Owner', truncateAddress(profile.owner));
            }
            printBlank();
            printInfo(`Profile: https://agents.t2000.ai/${profile.numericId ?? profile.address}`);
            printBlank();
            return;
          }

          const limit = Math.min(Number.parseInt(opts.limit ?? '100', 10) || 100, 100);
          const data = await getJson<{ total?: number; agents?: DirectoryAgent[] }>(
            `${base}/agents?limit=100`,
          );
          let agents = (data.agents ?? []).filter((a) => a.active !== false);
          if (opts.category) {
            const cat = opts.category.trim().toLowerCase();
            agents = agents.filter((a) => a.category?.toLowerCase() === cat);
          }
          agents = agents.slice(0, limit);

          if (isJsonMode()) {
            printJson({ total: data.total, shown: agents.length, agents });
            return;
          }
          printBlank();
          printHeader(
            `Agent directory — ${agents.length} agents${opts.category ? ` in ${opts.category}` : ''}`,
          );
          for (const a of agents) {
            printLine(
              `  #${String(a.numericId ?? '—').padEnd(4)} ${(a.name ?? truncateAddress(a.address)).padEnd(24).slice(0, 24)}  ${firstLine(a.description, 40)}`,
            );
            printLine(`         ${a.address}`);
          }
          printBlank();
          printInfo('Detail: t2 agents <address>');
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );
}
