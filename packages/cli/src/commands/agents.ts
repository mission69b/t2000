// `t2 agents [address]` — browse the agent store directory (agents.t2000.ai)
// from the terminal. No address = list priced services (filterable); an
// address = the full listing (profile + receipt-backed reputation). Read-only
// — no wallet needed. Buy with `t2 agent pay <address>`. [Agent Commerce]

import type { Command } from 'commander';
import { formatUsd, truncateAddress } from '@t2000/sdk';
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
  service?: string | null;
  priceUsdc?: string | null;
  category?: string | null;
  description?: string | null;
};

type AgentProfile = DirectoryAgent & {
  mcpEndpoint?: string | null;
  owner?: string | null;
  createdAt?: string;
  reputation?: {
    sales?: number;
    volumeUsd?: number;
    buyers?: number;
    refunds?: number;
    deliveredRate?: number | null;
    recent?: { at: string; buyer: string; amountUsd: number; delivered: boolean; tx: string }[];
  };
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
    .argument('[address]', 'Show one agent’s full listing (profile + reputation)')
    .description(
      'Browse the agent store (agents.t2000.ai): priced services from the live directory, or one agent’s full listing. Buy with `t2 agent pay <address>`. [Agent Commerce]',
    )
    .option('--category <category>', 'Filter the list by store category')
    .option('--all', 'Include agents without a priced service')
    .option('--limit <n>', 'Max rows (default: all)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (
        address: string | undefined,
        opts: { category?: string; all?: boolean; limit?: string; api?: string },
      ) => {
        try {
          const base = opts.api ?? DEFAULT_API_BASE;

          if (address) {
            const profile = await getJson<AgentProfile>(`${base}/agents/${address}`);
            if (isJsonMode()) {
              printJson(profile);
              return;
            }
            const rep = profile.reputation;
            printBlank();
            printHeader(profile.name ?? truncateAddress(profile.address));
            printKeyValue('Address', profile.address);
            if (profile.priceUsdc) {
              printKeyValue(
                'Price',
                `${formatUsd(Number.parseFloat(profile.priceUsdc))} / call${profile.category ? `  ·  ${profile.category}` : ''}`,
              );
            }
            if (profile.description) {
              printKeyValue('About', firstLine(profile.description, 90));
            }
            if (rep) {
              printKeyValue(
                'Verified on the rail',
                `${rep.sales ?? 0} sold · ${rep.buyers ?? 0} buyer${(rep.buyers ?? 0) === 1 ? '' : 's'} · ${formatUsd(rep.volumeUsd ?? 0)} settled${typeof rep.deliveredRate === 'number' ? ` · ${Math.round(rep.deliveredRate * 100)}% delivered` : ''}`,
              );
            }
            printBlank();
            if (profile.priceUsdc) {
              printInfo(`Buy it: t2 agent pay ${profile.address}`);
            }
            printInfo(`Listing: https://agents.t2000.ai/${profile.address}`);
            printBlank();
            return;
          }

          const limit = Math.min(Number.parseInt(opts.limit ?? '100', 10) || 100, 100);
          const data = await getJson<{ total?: number; agents?: DirectoryAgent[] }>(
            `${base}/agents?limit=100`,
          );
          let agents = (data.agents ?? []).filter((a) => a.active !== false);
          if (!opts.all) {
            agents = agents.filter((a) => a.service && a.priceUsdc);
          }
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
            `Agent store — ${agents.length} ${opts.all ? 'agents' : 'priced services'}${opts.category ? ` in ${opts.category}` : ''}`,
          );
          for (const a of agents) {
            const price = a.priceUsdc
              ? formatUsd(Number.parseFloat(a.priceUsdc)).padStart(6)
              : '     —';
            // Full address on its own line — it IS the payment handle
            // (`t2 agent pay <address>`); a truncated one can't be paid.
            printLine(
              `  ${price}  ${(a.name ?? truncateAddress(a.address)).padEnd(24).slice(0, 24)}  ${a.category ?? ''}`,
            );
            printLine(`          ${a.address}`);
          }
          printBlank();
          printInfo('Detail: t2 agents <address>   ·   Buy: t2 agent pay <address> (addresses above are complete)');
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );
}
