// `t2 service` — the seller catalog (t2 ACP Phase 1, SPEC_ACP_SUI §4.1).
//
// A service is a structured, fixed-price unit of deliverable work attached
// to your Agent ID: name, price (USDC), delivery SLA, what the buyer must
// provide, what they get back. Buyers find them (`t2 services`) and fund
// an on-chain escrow Job against one (`t2 job hire --agent … --service …`)
// — no server, no endpoint, no 402 required to sell.
//
//   create   list (or update) a service under your Agent ID
//   list     your services (or any agent's)
//   retire   soft-delete — existing funded jobs keep settling on-chain
//
// Mutations are signed: challenge nonce + personal-message signature bound to
// sha256 of the exact payload (same construction as the services catalog).

import {
  sellerReceivesLine,
  SERVICES_SETTLE_FEE_BPS,
  SETTLE_FEE_NOTE,
  settlementSplit,
} from '../lib/settle-fee.js';
import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  MAX_JOB_USDC,
  MIN_JOB_USDC,
  type ServiceUpsertInput,
  slugify,
  truncateAddress,
  validateAddress,
  MIN_JOB_SLA_MINUTES,
} from '@t2000/sdk';
import {
  AGENT_CATEGORIES,
  ensureSellerCategory,
  parseCategory,
} from '../lib/agent-category.js';
import { looksLikeAgentRefValue, resolveAgentRef } from '../lib/agent-ref.js';
import { commerceFor } from '../lib/commerce-client.js';
import { mergeServiceUpsert } from '../lib/service-upsert.js';
import {
  type ApiRouteListing,
  fetchJson,
  listServices,
  type ServiceListing,
  type ServicesRow,
} from '../lib/services.js';
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

/** Signed service mutation — the SDK commerce SSOT (S.1158): challenge →
 *  sign nonce + payload-hash → POST. */
async function signedServiceAction(opts: {
  base: string;
  keyPath?: string;
  action: 'upsert' | 'retire';
  payload: Record<string, unknown>;
}): Promise<{ address: string; response: Record<string, unknown> }> {
  const agent = await withAgent({ keyPath: opts.keyPath });
  const client = commerceFor(agent, opts.base);
  const result =
    opts.action === 'retire'
      ? await client.retireService(String(opts.payload.slug))
      : await client.upsertService(opts.payload as unknown as ServiceUpsertInput);
  return { address: result.address, response: result.response };
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

function formatSla(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

/** The principal line (S.1017): name + #numericId + address. Two sellers
 *  with near-identical names must never look like one principal — the #id
 *  and 0x are the marketplace's identity facts, the name is just brand. */
export function serviceSellerLabel(o: Pick<ServiceListing, 'agentName' | 'agentNumericId' | 'agent'>): string {
  const id = o.agentNumericId != null ? ` #${o.agentNumericId}` : '';
  return `${o.agentName ?? 'unnamed'}${id} ${truncateAddress(o.agent)}`;
}

/** A kind:"api" row (S.1084) — pay-per-call; paid with `t2 pay`, never a
 *  hire verb (no slug, no escrow fields). */
function printApiRoute(o: ApiRouteListing) {
  printLine(`${pc.bold(`${o.method} ${o.path}`)} ${pc.dim('· pay per call')}`);
  printKeyValue('Price', `$${o.priceUsdc.toFixed(2)} USDC / call`);
  {
    const id = o.agentNumericId != null ? ` #${o.agentNumericId}` : '';
    printKeyValue(
      'Seller',
      `${o.agentName ?? 'unnamed'}${pc.bold(id)} ${pc.dim(truncateAddress(o.agent))}`,
    );
  }
  if (o.summary) {
    printKeyValue('What', o.summary);
  }
  printKeyValue('URL', o.url);
  printKeyValue('Pay', `t2 pay ${o.url} --estimate`);
}

function printService(o: ServiceListing) {
  const flag = o.retired ? pc.dim(' (retired)') : '';
  printLine(`${pc.bold(o.name)} ${pc.dim(`· ${o.slug}`)}${flag}`);
  printKeyValue(
    'Price',
    `$${o.priceUsdc.toFixed(2)} USDC ${pc.dim(`· seller receives ${settlementSplit(o.priceUsdc).payout}`)}`,
  );
  printKeyValue('Delivery', `within ${formatSla(o.slaMinutes)}`);
  {
    const id = o.agentNumericId != null ? ` #${o.agentNumericId}` : '';
    printKeyValue(
      'Seller',
      `${o.agentName ?? 'unnamed'}${pc.bold(id)} ${pc.dim(truncateAddress(o.agent))}`,
    );
  }
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
    `t2 job hire --agent ${o.agent} --service ${o.slug}`,
  );
}

export function registerService(program: Command) {
  const group = program
    .command('service')
    .description(
      'Sell deliverable work — list what you do, at what price, on what SLA (t2 ACP)',
    )
    .addHelpText(
      'after',
      `
A service needs NO server and NO endpoint: buyers fund an on-chain escrow
Job against it, you deliver with \`t2 job deliver\`, the escrow settles. Your
catalog lives on your Agent ID and shows on t2000.ai.

Examples:
  $ t2 service create --name "Sui market report" --price 5 --sla 24h \\
      --description "Daily research report on any Sui token" \\
      --deliverable "PDF report, 2+ pages, sources cited" \\
      --requirements "Token symbol or coin type to analyze"
  $ t2 service list
  $ t2 service retire sui-market-report
`,
    );

  group
    .command('create')
    .description('List a service under your Agent ID (re-run to update it)')
    .requiredOption('--name <name>', 'Service name (max 80 chars)')
    .requiredOption(
      '--price <usdc>',
      `Fixed price in USDC (${MIN_JOB_USDC}\u2013${MAX_JOB_USDC})`,
    )
    .requiredOption('--sla <duration>', 'Delivery SLA — min 1h (e.g. 1h, 4h, 12h, 24h, 7d)')
    .requiredOption('--description <text>', 'What this service is (max 2000 chars)')
    .requiredOption('--deliverable <text>', 'What the buyer receives (max 1000 chars)')
    .option('--slug <slug>', 'Machine name (default: derived from --name)')
    .requiredOption(
      '--requirements <file-or-json-or-text>',
      'The questions buyers answer at hire (REQUIRED — the API rejects listings that ask nothing): free text, or a JSON object of field names → hints (keys enforced non-empty at hire; file path ok)',
    )
    .option('--review <duration>', "Buyer's accept/reject window after delivery", '24h')
    .option('--split <bps>', "Buyer's share in bps if they reject (0–10000)", '8000')
    .option(
      '--category <category>',
      `Directory category for your listing: ${AGENT_CATEGORIES.join(' | ')} (required unless already set on your profile)`,
    )
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
        category?: string;
        key?: string;
        api?: string;
      }, cmd?: { getOptionValueSource?: (key: string) => string | undefined }) => {
        try {
          // S.1083 (Connect S.1048 twin): Commander fills the defaults even
          // when the flags are omitted — sending them on a same-slug re-run
          // RESET a customized listing. Only treat a flag as set when it
          // actually came from the argv. (No source API → old always-send
          // behavior, never a silent omit.)
          const reviewExplicit =
            cmd?.getOptionValueSource?.('review') !== 'default';
          const splitExplicit =
            cmd?.getOptionValueSource?.('split') !== 'default';
          const priceUsdc = Number.parseFloat(opts.price);
          if (!Number.isFinite(priceUsdc) || priceUsdc <= 0) {
            throw new Error(`--price must be a positive number (got "${opts.price}").`);
          }
          // S.981: a listing priced under the escrow minimum could never be
          // hired — the create would abort on-chain. Refuse at list time.
          if (priceUsdc < MIN_JOB_USDC) {
            throw new Error(
              `--price must be at least ${MIN_JOB_USDC} USDC — escrow jobs start there (contract-enforced minimum).`,
            );
          }
          // S.1038b: the symmetric cap — a listing above the escrow job
          // ceiling could never be hired either. Refuse at list time.
          if (priceUsdc > MAX_JOB_USDC) {
            throw new Error(
              `--price must be at most ${MAX_JOB_USDC} USDC (v1 escrow listing cap).`,
            );
          }
          const slaMinutes = Math.round(parseDuration(opts.sla) / 60_000);
          if (slaMinutes < MIN_JOB_SLA_MINUTES) {
            throw new Error(
              `--sla must be at least 1h (${MIN_JOB_SLA_MINUTES} minutes) — fast jobs go 1h / 4h / 12h.`,
            );
          }
          const reviewWindowMinutes = Math.round(parseDuration(opts.review) / 60_000);
          const rejectSplitBps = Number.parseInt(opts.split, 10);
          const slug = (opts.slug ?? slugify(opts.name)).trim().toLowerCase();
          // Validate BEFORE wallet load (the S.816 CI lesson).
          const category =
            opts.category === undefined
              ? undefined
              : parseCategory(opts.category);
          const requirements = opts.requirements
            ? await resolveRequirements(opts.requirements)
            : null;

          const base = opts.api ?? DEFAULT_API_BASE;
          const agent = await withAgent({ keyPath: opts.key });

          // Listings become browsable cards — a category is part of listing
          // (the directory-drift guard; retire skips it).
          await ensureSellerCategory({
            base,
            agent,
            category,
          });

          // S.1083: the signed API is a FULL upsert — read this wallet's
          // live row first and merge, so omitted --review/--split keep the
          // live values. FAIL CLOSED on a read blip: writing create-defaults
          // over a listing we couldn't read is exactly the wipe this fixes.
          let live: ServiceListing | null = null;
          try {
            const { services: mine } = await listServices(base, {
              agent: agent.address(),
            });
            live =
              mine.find(
                (s): s is ServiceListing => s.kind !== 'api' && s.slug === slug,
              ) ?? null;
          } catch {
            throw new Error(
              "Couldn't read your current listings to merge safely — nothing was signed. Try again in a moment.",
            );
          }
          const { payload, created, changed } = mergeServiceUpsert(
            {
              slug,
              name: opts.name,
              description: opts.description,
              priceUsdc,
              slaMinutes,
              deliverable: opts.deliverable,
              requirements,
              reviewWindowMinutes: reviewExplicit
                ? reviewWindowMinutes
                : undefined,
              rejectSplitBps: splitExplicit ? rejectSplitBps : undefined,
            },
            live,
          );
          // Identical re-run: nothing to write, nothing to sign (Connect
          // honesty — S.1048).
          if (!created && changed.length === 0) {
            if (isJsonMode()) {
              printJson({ address: agent.address(), slug, noop: true });
              return;
            }
            printBlank();
            printInfo(
              `"${payload.name}" is already listed exactly like this — nothing changed, nothing signed.`,
            );
            printBlank();
            return;
          }
          const { address } = await signedServiceAction({
            base,
            keyPath: opts.key,
            action: 'upsert',
            payload,
          });

          if (isJsonMode()) {
            printJson({
              address,
              ...payload,
              feeBps: SERVICES_SETTLE_FEE_BPS,
              sellerReceiveUsdc: settlementSplit(priceUsdc).payoutMicro / 1_000_000,
            });
            return;
          }
          printBlank();
          printSuccess(`"${payload.name}" is listed — $${priceUsdc.toFixed(2)} USDC, delivery within ${formatSla(slaMinutes)}`);
          // Say the fee at listing time, not at settlement time (S.932).
          printKeyValue('You receive', sellerReceivesLine(priceUsdc));
          printKeyValue('Slug', slug);
          printKeyValue('Storefront', `https://t2000.ai/${address}`);
          printKeyValue('Buyers run', `t2 job hire --agent ${address} --service ${slug}`);
          printBlank();
          printInfo(SETTLE_FEE_NOTE);
          printInfo('Watch for incoming jobs with: t2 job watch --mine');
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('list')
    .argument('[agent]', "Agent address (default: this wallet's)")
    .description("An agent's services — yours by default, retired included")
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (agentArg: string | undefined, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = agentArg
          ? validateAddress(agentArg)
          : (await withAgent({ keyPath: opts.key })).address();
        const json = await fetchJson(
          `${base}/services?agent=${encodeURIComponent(agent)}`,
        );
        const rows = (json.services ?? []) as ServiceListing[];
        if (isJsonMode()) {
          printJson({ agent, services: rows });
          return;
        }
        printBlank();
        if (rows.length === 0) {
          printInfo(`No services for ${truncateAddress(agent)} — list one with: t2 service create`);
          printBlank();
          return;
        }
        for (const o of rows) {
          printService(o);
          printBlank();
        }
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('retire')
    .argument('<slug>', 'The service slug to retire')
    .description('Take a service off the board (funded jobs still settle on-chain)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (slug: string, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const { address } = await signedServiceAction({
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
        printSuccess(`Service "${slug}" retired. Re-run t2 service create with the same slug to relist.`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}

// Marketplace discovery — ONE catalog, the A2A marketplace. Registered twice:
// `t2 services` (the name) and `t2 browse` (deprecated alias).
//
// `t2 services` used to search the hosted mpp.t2000.ai proxy catalog
// (OpenAI/Brave/fal resale). That mall was purged 2026-08-01
// (SPEC_T2_CLEANUP_USDC_ONLY — A2A evolution): t2000 doesn't resell
// third-party APIs, so there is no second catalog and no `search` /
// `inspect` subcommand any more. Fulfillment is escrow (`t2 job hire`) or
// per-call x402 (`t2 pay <url>`) — same listing, two shapes.
export type ServicesScope =
  | { kind: 'all' }
  | { kind: 'search'; q: string }
  | { kind: 'agent'; agent: string; numericId?: number | null };

/** Route the discovery query onto the API that already answers it (S.1017,
 *  beta #93): a 0x address or agent ref (#N / @handle) is a PRINCIPAL scope
 *  and goes to `?agent=` — free-text `?q=` never matches hex, so the old
 *  path answered "No services match 0x…" for a seller with live listings.
 *  Anything else stays a text search. An optional directory `category`
 *  (S.1041) ANDs onto any scope. Pure except the one resolver hop for
 *  #N / @handle (the same endpoint the site uses). */
export async function resolveServicesQuery(
  base: string,
  query: string | undefined,
  category?: string,
  rail?: 'hire' | 'api' | 'all',
): Promise<{ url: string; scope: ServicesScope }> {
  const withCategory = (url: string): string => {
    const withCat = category
      ? `${url}${url.includes('?') ? '&' : '?'}category=${encodeURIComponent(category)}`
      : url;
    // S.1084: omitted rail stays hire-only (the compat default).
    return rail
      ? `${withCat}${withCat.includes('?') ? '&' : '?'}rail=${rail}`
      : withCat;
  };
  const q = query?.trim();
  if (!q) {
    return { url: withCategory(`${base}/services`), scope: { kind: 'all' } };
  }
  if (q.startsWith('0x')) {
    // One address check for the whole CLI — validateAddress; invalid hex
    // falls through to text search (where it will honestly match nothing).
    try {
      const agent = validateAddress(q);
      return {
        url: withCategory(`${base}/services?agent=${encodeURIComponent(agent)}`),
        scope: { kind: 'agent', agent },
      };
    } catch {
      // not a valid address — treat as text below
    }
  } else if (looksLikeAgentRefValue(q)) {
    const ref = await resolveAgentRef(base, q);
    return {
      url: withCategory(`${base}/services?agent=${encodeURIComponent(ref.address)}`),
      scope: { kind: 'agent', agent: ref.address, numericId: ref.numericId },
    };
  }
  return {
    url: withCategory(`${base}/services?q=${encodeURIComponent(q)}`),
    scope: { kind: 'search', q },
  };
}

function scopeLabel(scope: ServicesScope): string {
  if (scope.kind !== 'agent') {
    return '';
  }
  return scope.numericId != null
    ? `#${scope.numericId} (${truncateAddress(scope.agent)})`
    : truncateAddress(scope.agent);
}

function registerDiscovery(command: Command, opts?: { deprecated?: boolean }) {
  command
    .argument('[query]', 'What you need — free text, or a SELLER scope: 0x… address, #id, or @handle (empty = everything, ranked featured → most settled → newest)')
    .option('--category <category>', `Seller directory category (${AGENT_CATEGORIES.join(' | ')}) — ANDs with the query`)
    .option(
      '--rail <rail>',
      'hire = escrow services (default) · api = instant pay-per-call x402 routes · all = both',
    )
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (query: string | undefined, cmdOpts: { api?: string; category?: string; rail?: string }) => {
      try {
        const base = cmdOpts.api ?? DEFAULT_API_BASE;
        // Fail fast on an off-enum category (same local mirror the sell
        // gate uses) — the API would 400 with the same allow-list.
        const category = cmdOpts.category ? parseCategory(cmdOpts.category) : undefined;
        // S.1084: the x402 rail. Off-enum fails fast, same as the API would.
        const rail = cmdOpts.rail?.trim().toLowerCase();
        if (rail && !['hire', 'api', 'all'].includes(rail)) {
          throw new Error(
            `--rail must be hire, api, or all (got "${cmdOpts.rail}").`,
          );
        }
        const { url, scope } = await resolveServicesQuery(
          base,
          query,
          category,
          rail as 'hire' | 'api' | 'all' | undefined,
        );
        const json = await fetchJson(url);
        const all = (json.services ?? []) as ServicesRow[];
        // Buyer discovery is the ACTIVE board: `?agent=` serves the seller's
        // management view retired-included — hide retired here with an
        // honest note (`t2 service list` keeps the full management dump).
        // (kind:"api" rows are live-only and carry no retired flag.)
        const rows =
          scope.kind === 'agent'
            ? all.filter((o) => o.kind === 'api' || !o.retired)
            : all;
        const retiredHidden = all.length - rows.length;
        if (isJsonMode()) {
          printJson({
            query: query ?? null,
            scope,
            total: scope.kind === 'agent' ? rows.length : (json.total ?? rows.length),
            ...(retiredHidden > 0 ? { retiredHidden } : {}),
            services: rows,
          });
          return;
        }
        printBlank();
        if (opts?.deprecated) {
          printInfo('`t2 browse` is now `t2 services` — same results, one name.');
          printBlank();
        }
        if (rows.length === 0) {
          printInfo(
            scope.kind === 'agent'
              ? `No active services for ${scopeLabel(scope)}.`
              : scope.kind === 'search'
                ? `No services match "${scope.q}"${category ? ` in ${category}` : ''}.`
                : category
                  ? `No services in ${category} yet.`
                  : 'No services listed yet.',
          );
          printBlank();
          return;
        }
        for (const o of rows) {
          if (o.kind === 'api') {
            printApiRoute(o);
          } else {
            printService(o);
          }
          printBlank();
        }
        if (retiredHidden > 0) {
          printInfo(pc.dim(`${retiredHidden} retired omitted — t2 service list ${scope.kind === 'agent' ? scope.agent : ''}`));
          printBlank();
        }
        // Name collisions (S.1017): a text search spanning sellers must say
        // so — two near-identical names are two principals.
        if (scope.kind === 'search') {
          const sellers = new Set(rows.map((o) => o.agent)).size;
          if (sellers >= 2) {
            printInfo(pc.dim(`Results span ${sellers} sellers — scope to one with t2 services 0x… or #id.`));
            printBlank();
          }
        }
      } catch (error) {
        handleError(error);
      }
    });
}

export function registerServices(program: Command) {
  registerDiscovery(
    program
      .command('services')
      .description('Find agent Services to buy — the t2000 A2A marketplace (ranked featured → most settled → newest; --category for directory buckets)'),
  );
}

export function registerBrowse(program: Command) {
  registerDiscovery(
    program.command('browse').description('Deprecated alias for `t2 services`'),
    { deprecated: true },
  );
}
