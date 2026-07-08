// `t2 agent services <add|update|remove|list|sync>` — the service CATALOG
// (Store v2 Phase 1, SPEC_STORE_V2 §5). One agent, many slug-addressed SKUs:
// buy URLs are `commerce/pay/{agent}/{slug}`; the bare URL keeps serving the
// legacy default service (`t2 agent service`, singular — unchanged).
//
// Catalog writes are REPLACE semantics against /v1/agent/services: read the
// current catalog, apply the mutation, sign sha256(canonical JSON) bound to a
// single-use challenge nonce, POST the full list. `sync` submits a manifest
// file verbatim — the file IS the catalog (the operating mode for
// catalog-scale sellers like Funkii AI).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import {
  handleError,
  isJsonMode,
  printBlank,
  printJson,
  printKeyValue,
  printLine,
  printSuccess,
} from '../../output.js';
import { withAgent } from '../../lib/with-agent.js';

export interface AgentServiceEntry {
  slug: string;
  title: string;
  description: string;
  priceUsdc: string;
  input?: string | null;
  endpoint?: string | null;
  method?: 'GET' | 'POST';
  active: boolean;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

async function fetchJson(
  url: string,
  init?: { method: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error;
    const msg =
      typeof err === 'string'
        ? err
        : ((err as { message?: string })?.message ?? `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return json;
}

/** Key-sorted stable stringify — MUST match the server's canonicalization. */
function canonicalServicesJson(services: AgentServiceEntry[]): string {
  return JSON.stringify(
    services.map((s) =>
      Object.fromEntries(
        Object.entries(s).sort(([a], [b]) => a.localeCompare(b)),
      ),
    ),
  );
}

async function getCatalog(
  base: string,
  address: string,
): Promise<AgentServiceEntry[]> {
  const res = await fetchJson(
    `${base}/agent/services?address=${encodeURIComponent(address)}`,
  );
  return Array.isArray(res.services)
    ? (res.services as AgentServiceEntry[])
    : [];
}

/** Sign + submit the full catalog (replace semantics). */
async function putCatalog(opts: {
  base: string;
  keyPath?: string;
  services: AgentServiceEntry[];
}): Promise<{ address: string; count: number }> {
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
  const digest = createHash('sha256')
    .update(canonicalServicesJson(opts.services))
    .digest('hex');
  const message = new TextEncoder().encode(
    `t2000-agent-services:${nonce}:${digest}`,
  );
  const { signature } = await agent.keypair.signPersonalMessage(message);
  const res = await fetchJson(`${opts.base}/agent/services`, {
    method: 'POST',
    body: { address, nonce, signature, services: opts.services },
  });
  return { address, count: Number(res.count ?? opts.services.length) };
}

function entryFromFlags(opts: {
  slug?: string;
  title?: string;
  description?: string;
  price?: string;
  input?: string;
  endpoint?: string;
  method?: string;
}): Partial<AgentServiceEntry> & { slug: string } {
  const slug = String(opts.slug ?? '')
    .trim()
    .toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new Error('--slug is required: [a-z0-9-], 2-40 chars.');
  }
  const out: Partial<AgentServiceEntry> & { slug: string } = { slug };
  if (opts.title !== undefined) {
    out.title = opts.title;
  }
  if (opts.description !== undefined) {
    out.description = opts.description;
  }
  if (opts.price !== undefined) {
    out.priceUsdc = opts.price;
  }
  if (opts.input !== undefined) {
    out.input = opts.input || null;
  }
  if (opts.endpoint !== undefined) {
    out.endpoint = opts.endpoint || null;
  }
  if (opts.method !== undefined) {
    out.method = opts.method.toUpperCase() === 'GET' ? 'GET' : 'POST';
  }
  return out;
}

export function registerAgentServices(agentGroup: Command, defaults: {
  apiBase: string;
}) {
  const group = agentGroup
    .command('services')
    .description(
      'Manage this agent\'s service CATALOG (one agent, many services). Buy URLs: commerce/pay/<agent>/<slug>. [Store v2]',
    );

  group
    .command('list')
    .argument('[address]', 'Agent address (default: your wallet)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${defaults.apiBase})`)
    .description('List the catalog (public read).')
    .action(async (addressArg: string | undefined, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? defaults.apiBase;
        const address =
          addressArg ?? (await withAgent({ keyPath: opts.key })).address();
        const services = await getCatalog(base, address);
        if (isJsonMode()) {
          printJson({ address, services });
          return;
        }
        printBlank();
        if (services.length === 0) {
          printLine('No services in the catalog. Add one: t2 agent services add --slug <slug> --title … --description … --price …');
          printBlank();
          return;
        }
        for (const s of services) {
          printKeyValue(
            s.slug,
            `$${s.priceUsdc} — ${s.title}${s.active === false ? ' (inactive)' : ''}`,
          );
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('add')
    .description('Add one service to the catalog.')
    .requiredOption('--slug <slug>', 'Service slug ([a-z0-9-], 2-40 chars)')
    .requiredOption('--title <title>', 'Service title (≤80 chars)')
    .requiredOption('--description <text>', 'Listing copy (≤480 chars)')
    .requiredOption('--price <usdc>', 'Price per call in USDC (e.g. 0.02)')
    .option('--input <hint>', 'Input hint, e.g. "Provide: 1. address 2. chain"')
    .option('--endpoint <url>', 'Self-hosted https endpoint (omit for wrap/payment-only)')
    .option('--method <method>', 'Wrap delivery method: GET or POST')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${defaults.apiBase})`)
    .action(async (opts: Record<string, string | undefined>) => {
      try {
        const base = opts.api ?? defaults.apiBase;
        const agent = await withAgent({ keyPath: opts.key });
        const current = await getCatalog(base, agent.address());
        const entry = entryFromFlags(opts);
        if (current.some((s) => s.slug === entry.slug)) {
          throw new Error(
            `Slug "${entry.slug}" already exists — use: t2 agent services update --slug ${entry.slug}`,
          );
        }
        const next: AgentServiceEntry = {
          title: '',
          description: '',
          priceUsdc: '0',
          active: true,
          ...entry,
        } as AgentServiceEntry;
        const { count } = await putCatalog({
          base,
          keyPath: opts.key,
          services: [...current, next],
        });
        if (isJsonMode()) {
          printJson({ added: entry.slug, count });
          return;
        }
        printBlank();
        printSuccess(`Service "${entry.slug}" added — catalog now ${count} service${count === 1 ? '' : 's'}.`);
        printLine(`Buy URL: https://x402.t2000.ai/commerce/pay/${agent.address()}/${entry.slug}`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('update')
    .description('Update one service (only the provided fields change).')
    .requiredOption('--slug <slug>', 'Service slug to update')
    .option('--title <title>', 'Service title (≤80 chars)')
    .option('--description <text>', 'Listing copy (≤480 chars)')
    .option('--price <usdc>', 'Price per call in USDC')
    .option('--input <hint>', 'Input hint ("" to clear)')
    .option('--endpoint <url>', 'Self-hosted https endpoint ("" to clear → wrap mode)')
    .option('--method <method>', 'Wrap delivery method: GET or POST')
    .option('--active <bool>', 'true | false — per-service kill switch')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${defaults.apiBase})`)
    .action(async (opts: Record<string, string | undefined>) => {
      try {
        const base = opts.api ?? defaults.apiBase;
        const agent = await withAgent({ keyPath: opts.key });
        const current = await getCatalog(base, agent.address());
        const entry = entryFromFlags(opts);
        const idx = current.findIndex((s) => s.slug === entry.slug);
        if (idx === -1) {
          throw new Error(`No service "${entry.slug}" in the catalog.`);
        }
        const merged: AgentServiceEntry = { ...current[idx], ...entry };
        if (opts.active !== undefined) {
          merged.active = String(opts.active).toLowerCase() !== 'false';
        }
        const services = [...current];
        services[idx] = merged;
        const { count } = await putCatalog({ base, keyPath: opts.key, services });
        if (isJsonMode()) {
          printJson({ updated: entry.slug, count });
          return;
        }
        printBlank();
        printSuccess(`Service "${entry.slug}" updated.`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('remove')
    .description('Remove one service from the catalog.')
    .requiredOption('--slug <slug>', 'Service slug to remove')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${defaults.apiBase})`)
    .action(async (opts: { slug?: string; key?: string; api?: string }) => {
      try {
        const base = opts.api ?? defaults.apiBase;
        const agent = await withAgent({ keyPath: opts.key });
        const slug = String(opts.slug ?? '').trim().toLowerCase();
        const current = await getCatalog(base, agent.address());
        const services = current.filter((s) => s.slug !== slug);
        if (services.length === current.length) {
          throw new Error(`No service "${slug}" in the catalog.`);
        }
        const { count } = await putCatalog({ base, keyPath: opts.key, services });
        if (isJsonMode()) {
          printJson({ removed: slug, count });
          return;
        }
        printBlank();
        printSuccess(`Service "${slug}" removed — catalog now ${count} service${count === 1 ? '' : 's'}.`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('sync')
    .description(
      'Declarative catalog sync — the manifest file IS the catalog (adds/updates/removes to match). The catalog-scale path.',
    )
    .argument('<file>', 'Path to a JSON manifest: [{ slug, title, description, priceUsdc, input?, endpoint?, method?, active? }]')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${defaults.apiBase})`)
    .action(async (file: string, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? defaults.apiBase;
        const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
        const list = Array.isArray(raw)
          ? raw
          : ((raw as { services?: unknown[] })?.services ?? null);
        if (!Array.isArray(list)) {
          throw new Error(
            'Manifest must be a JSON array of services (or { "services": [...] }).',
          );
        }
        const services = list.map((s) => {
          const entry = s as AgentServiceEntry;
          return { ...entry, active: entry.active !== false };
        });
        const agent = await withAgent({ keyPath: opts.key });
        const before = await getCatalog(base, agent.address());
        const { count } = await putCatalog({ base, keyPath: opts.key, services });
        if (isJsonMode()) {
          printJson({ synced: count, before: before.length });
          return;
        }
        printBlank();
        printSuccess(`Catalog synced — ${before.length} → ${count} services.`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
