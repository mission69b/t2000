// `t2 offering` — the seller catalog (t2 ACP Phase 1, SPEC_ACP_SUI §4.1).
//
// An offering is a structured, fixed-price unit of deliverable work attached
// to your Agent ID: name, price (USDC), delivery SLA, what the buyer must
// provide, what they get back. Buyers browse offerings (`t2 browse`) and fund
// an on-chain escrow Job against one (`t2 job create --agent … --offering …`)
// — no server, no endpoint, no 402 required to sell.
//
//   create   list (or update) an offering under your Agent ID
//   list     your offerings (or any agent's)
//   retire   soft-delete — existing funded jobs keep settling on-chain
//
// Mutations are signed: challenge nonce + personal-message signature bound to
// sha256 of the exact payload (same construction as the services catalog).

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import pc from 'picocolors';
import { truncateAddress, validateAddress } from '@t2000/sdk';
import { fetchJson, type OfferingListing } from '../lib/offerings.js';
import { withAgent } from '../lib/with-agent.js';
import {
  handleError,
  isJsonMode,
  printBlank,
  printInfo,
  printJson,
  printKeyValue,
  printLine,
  printSuccess,
} from '../output.js';
import { parseDuration } from './job.js';

const DEFAULT_API_BASE = process.env.T2000_API_URL ?? 'https://api.t2000.ai/v1';

/** Signed offering mutation: challenge → sign nonce+payload-hash → POST. */
async function signedOfferingAction(opts: {
  base: string;
  keyPath?: string;
  action: 'upsert' | 'retire';
  payload: Record<string, unknown>;
}): Promise<{ address: string; response: Record<string, unknown> }> {
  const agent = await withAgent({ keyPath: opts.keyPath });
  const address = agent.address();
  const challenge = await fetchJson(`${opts.base}/agent/challenge`, {
    method: 'POST',
    body: { address },
  });
  const nonce = challenge.nonce as string | undefined;
  if (!nonce) {
    throw new Error('Failed to get a challenge nonce.');
  }
  const payloadHash = createHash('sha256')
    .update(JSON.stringify(opts.payload), 'utf8')
    .digest('hex');
  const message = new TextEncoder().encode(
    `t2000-agent-offering:${nonce}:${payloadHash}`,
  );
  const { signature } = await agent.keypair.signPersonalMessage(message);
  const response = await fetchJson(`${opts.base}/agent/offering`, {
    method: 'POST',
    body: {
      address,
      nonce,
      signature,
      action: opts.action,
      payload: opts.payload,
    },
  });
  return { address, response };
}

/** `--requirements` input: a readable file path, inline JSON, or free text. */
async function resolveRequirements(input: string): Promise<unknown> {
  let text = input;
  try {
    text = await readFile(input, 'utf8');
  } catch {
    // not a file — treat the literal argument as the content
  }
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // not JSON — free text
  }
  return text.trim();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 48);
}

function formatSla(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function printOffering(o: OfferingListing) {
  const flag = o.retired ? pc.dim(' (retired)') : '';
  printLine(`${pc.bold(o.name)} ${pc.dim(`· ${o.slug}`)}${flag}`);
  printKeyValue('Price', `$${o.priceUsdc.toFixed(2)} USDC`);
  printKeyValue('Delivery', `within ${formatSla(o.slaMinutes)}`);
  printKeyValue(
    'Seller',
    `${o.agentName ?? 'unnamed'} ${pc.dim(truncateAddress(o.agent))}`,
  );
  printKeyValue('You get', o.deliverable);
  if (o.requirements != null) {
    printKeyValue(
      'You provide',
      typeof o.requirements === 'string'
        ? o.requirements
        : JSON.stringify(o.requirements),
    );
  }
  printKeyValue(
    'Buy',
    `t2 job create --agent ${o.agent} --offering ${o.slug}`,
  );
}

export function registerOffering(program: Command) {
  const group = program
    .command('offering')
    .description(
      'Sell deliverable work — list what you do, at what price, on what SLA (t2 ACP)',
    )
    .addHelpText(
      'after',
      `
An offering needs NO server and NO endpoint: buyers fund an on-chain escrow
Job against it, you deliver with \`t2 job deliver\`, the escrow settles. Your
catalog lives on your Agent ID and shows on agents.t2000.ai.

Examples:
  $ t2 offering create --name "Sui market report" --price 5 --sla 24h \\
      --description "Daily research report on any Sui token" \\
      --deliverable "PDF report, 2+ pages, sources cited" \\
      --requirements "Token symbol or coin type to analyze"
  $ t2 offering list
  $ t2 offering retire sui-market-report
`,
    );

  group
    .command('create')
    .description('List an offering under your Agent ID (re-run to update it)')
    .requiredOption('--name <name>', 'Offering name (max 80 chars)')
    .requiredOption('--price <usdc>', 'Fixed price in USDC (0.01–50)')
    .requiredOption('--sla <duration>', 'Delivery SLA — e.g. 30m, 24h, 7d')
    .requiredOption('--description <text>', 'What this offering is (max 2000 chars)')
    .requiredOption('--deliverable <text>', 'What the buyer receives (max 1000 chars)')
    .option('--slug <slug>', 'Machine name (default: derived from --name)')
    .option(
      '--requirements <file-or-json-or-text>',
      'What the buyer must provide — free text or a JSON schema (file path ok)',
    )
    .option('--review <duration>', "Buyer's accept/reject window after delivery", '24h')
    .option('--split <bps>', "Buyer's share in bps if they reject (0–10000)", '8000')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (opts: {
        name: string;
        price: string;
        sla: string;
        description: string;
        deliverable: string;
        slug?: string;
        requirements?: string;
        review: string;
        split: string;
        key?: string;
        api?: string;
      }) => {
        try {
          const priceUsdc = Number.parseFloat(opts.price);
          if (!Number.isFinite(priceUsdc) || priceUsdc <= 0) {
            throw new Error(`--price must be a positive number (got "${opts.price}").`);
          }
          const slaMinutes = Math.round(parseDuration(opts.sla) / 60_000);
          const reviewWindowMinutes = Math.round(parseDuration(opts.review) / 60_000);
          const rejectSplitBps = Number.parseInt(opts.split, 10);
          const slug = (opts.slug ?? slugify(opts.name)).trim().toLowerCase();
          const requirements = opts.requirements
            ? await resolveRequirements(opts.requirements)
            : null;

          const payload = {
            slug,
            name: opts.name.trim(),
            description: opts.description.trim(),
            priceUsdc,
            slaMinutes,
            reviewWindowMinutes,
            rejectSplitBps,
            requirements,
            deliverable: opts.deliverable.trim(),
          };
          const base = opts.api ?? DEFAULT_API_BASE;
          const { address } = await signedOfferingAction({
            base,
            keyPath: opts.key,
            action: 'upsert',
            payload,
          });

          if (isJsonMode()) {
            printJson({ address, ...payload });
            return;
          }
          printBlank();
          printSuccess(`"${payload.name}" is listed — $${priceUsdc.toFixed(2)} USDC, delivery within ${formatSla(slaMinutes)}`);
          printKeyValue('Slug', slug);
          printKeyValue('Storefront', `https://agents.t2000.ai/${address}`);
          printKeyValue('Buyers run', `t2 job create --agent ${address} --offering ${slug}`);
          printBlank();
          printInfo('Watch for incoming jobs with: t2 job watch <jobId>  (buyers hand you the job id)');
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('list')
    .argument('[agent]', "Agent address (default: this wallet's)")
    .description("An agent's offerings — yours by default, retired included")
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (agentArg: string | undefined, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = agentArg
          ? validateAddress(agentArg)
          : (await withAgent({ keyPath: opts.key })).address();
        const json = await fetchJson(
          `${base}/offerings?agent=${encodeURIComponent(agent)}`,
        );
        const rows = (json.offerings ?? []) as OfferingListing[];
        if (isJsonMode()) {
          printJson({ agent, offerings: rows });
          return;
        }
        printBlank();
        if (rows.length === 0) {
          printInfo(`No offerings for ${truncateAddress(agent)} — list one with: t2 offering create`);
          printBlank();
          return;
        }
        for (const o of rows) {
          printOffering(o);
          printBlank();
        }
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('retire')
    .argument('<slug>', 'The offering slug to retire')
    .description('Take an offering off the board (funded jobs still settle on-chain)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (slug: string, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const { address } = await signedOfferingAction({
          base,
          keyPath: opts.key,
          action: 'retire',
          payload: { slug: slug.trim().toLowerCase() },
        });
        if (isJsonMode()) {
          printJson({ address, retired: slug.trim().toLowerCase() });
          return;
        }
        printBlank();
        printSuccess(`Offering "${slug}" retired. Re-run t2 offering create with the same slug to relist.`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}

export function registerBrowse(program: Command) {
  program
    .command('browse')
    .argument('[query]', 'What you need — free-text search (empty = everything)')
    .description('Browse offerings across every agent — find work to buy (t2 ACP)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (query: string | undefined, opts: { api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const params = query ? `?q=${encodeURIComponent(query)}` : '';
        const json = await fetchJson(`${base}/offerings${params}`);
        const rows = (json.offerings ?? []) as OfferingListing[];
        if (isJsonMode()) {
          printJson({ query: query ?? null, total: json.total ?? rows.length, offerings: rows });
          return;
        }
        printBlank();
        if (rows.length === 0) {
          printInfo(query ? `No offerings match "${query}".` : 'No offerings listed yet.');
          printBlank();
          return;
        }
        for (const o of rows) {
          printOffering(o);
          printBlank();
        }
      } catch (error) {
        handleError(error);
      }
    });
}
