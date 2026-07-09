// `t2 agent serve <init|dev|deploy|status|logs|undeploy>` — R1 hosted
// handlers (SPEC_AGENT_RUNTIME §2, S.694). Write a handler function, deploy
// it to t2000-run (Cloudflare Workers for Platforms), and it IS your service
// endpoint: the gateway invokes it only for paid, escrowed deliveries and
// auto-lists the SKU in your catalog. No server, no wrap — code in, buy URL
// out. The agent pays its own way: earnings settle to its wallet on-chain.
//
// v1 contract: `handler.mjs` is ONE self-contained ES module (no imports —
// `fetch`, `crypto`, `URL` etc. are available as Workers globals) exporting
// `export default async function handle(input, ctx) { … }`.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Command } from 'commander';
import { withAgent } from '../../lib/with-agent.js';
import {
  handleError,
  isJsonMode,
  printBlank,
  printInfo,
  printJson,
  printKeyValue,
  printLine,
  printSuccess,
} from '../../output.js';
import {
  type AgentServiceEntry,
  getCatalog,
  putCatalog,
} from './services.js';

const DEFAULT_API_BASE = process.env.T2000_API_URL ?? 'https://api.t2000.ai/v1';
const DEFAULT_GATEWAY = process.env.T2000_GATEWAY_URL ?? 'https://mpp.t2000.ai';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const MANIFEST = 't2serve.json';
const HANDLER = 'handler.mjs';

interface ServeManifest {
  slug: string;
  title: string;
  description: string;
  price: string;
  input?: string;
}

const HANDLER_TEMPLATE = `// t2000 hosted handler (R1). Deploys with: t2 agent serve deploy
//
// Contract: one self-contained ES module (no imports — fetch/crypto/URL are
// available as Workers globals). The gateway calls this ONLY for paid,
// escrowed deliveries; on a 2xx your wallet is paid, on failure the buyer is
// auto-refunded. Keep it fast (15s delivery timeout, 5s CPU cap).
//
//   input — the buyer's request body (parsed JSON, or a raw string)
//   ctx   — { agent, slug, buyer }
export default async function handle(input, ctx) {
  // Example: compose public data and return a result.
  // const res = await fetch('https://api.example.com/data');
  // const data = await res.json();
  return {
    echo: input,
    from: ctx.slug,
    note: 'Replace this with your service logic.',
  };
}
`;

function readManifest(dir: string): ServeManifest {
  const p = join(dir, MANIFEST);
  if (!existsSync(p)) {
    throw new Error(
      `No ${MANIFEST} here — run \`t2 agent serve init\` first (or --dir <path>).`,
    );
  }
  const m = JSON.parse(readFileSync(p, 'utf8')) as ServeManifest;
  const slug = String(m.slug ?? '').trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new Error(`${MANIFEST}: slug must match [a-z0-9-], 2-40 chars.`);
  }
  if (!m.title?.trim() || !m.description?.trim()) {
    throw new Error(`${MANIFEST}: title and description are required.`);
  }
  const price = Number(m.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`${MANIFEST}: price must be a positive USDC amount.`);
  }
  return { ...m, slug };
}

function readHandler(dir: string): string {
  const p = join(dir, HANDLER);
  if (!existsSync(p)) {
    throw new Error(`No ${HANDLER} here — run \`t2 agent serve init\` first.`);
  }
  const src = readFileSync(p, 'utf8');
  if (!src.trim()) {
    throw new Error(`${HANDLER} is empty.`);
  }
  if (/^\s*import\s.+from\s/m.test(src)) {
    throw new Error(
      `${HANDLER} must be self-contained (no imports) — fetch, crypto, and URL are available as globals.`,
    );
  }
  return src;
}

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

export function registerAgentServe(agentGroup: Command) {
  const group = agentGroup
    .command('serve')
    .description(
      'Hosted handlers — deploy a function to t2000 compute and sell it per call. No server, no wrap. [R1]',
    );

  group
    .command('init')
    .description(`Scaffold ${HANDLER} + ${MANIFEST} in the current directory.`)
    .option('--slug <slug>', 'Service slug (in the buy URL)', 'my-service')
    .option('--dir <path>', 'Target directory (default: cwd)')
    .action((opts: { slug: string; dir?: string }) => {
      try {
        const dir = resolve(opts.dir ?? '.');
        mkdirSync(dir, { recursive: true });
        const slug = opts.slug.trim().toLowerCase();
        if (!SLUG_RE.test(slug)) {
          throw new Error('--slug must match [a-z0-9-], 2-40 chars.');
        }
        const manifestPath = join(dir, MANIFEST);
        const handlerPath = join(dir, HANDLER);
        if (existsSync(manifestPath) || existsSync(handlerPath)) {
          throw new Error(`${MANIFEST} or ${HANDLER} already exists here.`);
        }
        writeFileSync(
          manifestPath,
          `${JSON.stringify(
            {
              slug,
              title: 'My service',
              description:
                'What the buyer gets, in one or two sentences. Provide: 1. …',
              price: '0.02',
              input: 'JSON body with your parameters',
            },
            null,
            2,
          )}\n`,
        );
        writeFileSync(handlerPath, HANDLER_TEMPLATE);
        if (isJsonMode()) {
          printJson({ dir, files: [MANIFEST, HANDLER] });
          return;
        }
        printBlank();
        printSuccess('Scaffolded a hosted handler');
        printKeyValue('Handler', handlerPath);
        printKeyValue('Manifest', manifestPath);
        printBlank();
        printLine('Next:');
        printLine('  t2 agent serve dev       # try it locally');
        printLine('  t2 agent serve deploy    # deploy + list it for sale');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('dev')
    .description(
      'Run the handler locally against the delivery contract (POST {input} to :8787).',
    )
    .option('--dir <path>', 'Handler directory (default: cwd)')
    .option('--port <port>', 'Port (default 8787)', '8787')
    .option('--input <json>', 'One-shot: invoke once with this input and exit')
    .action(async (opts: { dir?: string; port: string; input?: string }) => {
      try {
        const dir = resolve(opts.dir ?? '.');
        const manifest = readManifest(dir);
        readHandler(dir); // validates self-contained before import
        const mod = (await import(
          pathToFileURL(join(dir, HANDLER)).href
        )) as {
          default?: (input: unknown, ctx: unknown) => Promise<unknown>;
        };
        const fn = mod.default;
        if (typeof fn !== 'function') {
          throw new Error(`${HANDLER} must default-export a function.`);
        }
        const ctx = {
          agent: '0xLOCAL',
          slug: manifest.slug,
          buyer: '0xBUYER',
        };

        if (opts.input !== undefined) {
          let input: unknown = opts.input;
          try {
            input = JSON.parse(opts.input);
          } catch {
            /* raw string input */
          }
          const out = await fn(input, ctx);
          printJson({ ok: true, output: out });
          return;
        }

        const port = Number(opts.port) || 8787;
        const server = createServer(async (req, res) => {
          const chunks: Buffer[] = [];
          for await (const c of req) {
            chunks.push(c as Buffer);
          }
          const raw = Buffer.concat(chunks).toString('utf8');
          let input: unknown = raw;
          try {
            input = raw ? JSON.parse(raw) : {};
          } catch {
            /* raw string input */
          }
          try {
            const out = await fn(input, ctx);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(out));
          } catch (e) {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(
              JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
            );
          }
        });
        server.listen(port, () => {
          printBlank();
          printSuccess(`Local handler running — slug "${manifest.slug}"`);
          printLine(`  curl -X POST http://localhost:${port} -d '{"hello":"world"}'`);
          printLine('  Ctrl-C to stop.');
          printBlank();
        });
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('deploy')
    .description(
      'Deploy the handler to t2000 compute + list the SKU in your catalog. Sponsored listing, per-call earnings to your wallet.',
    )
    .option('--dir <path>', 'Handler directory (default: cwd)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .option('--gateway <url>', `Gateway URL (default ${DEFAULT_GATEWAY})`)
    .action(
      async (opts: {
        dir?: string;
        key?: string;
        api?: string;
        gateway?: string;
      }) => {
        try {
          const dir = resolve(opts.dir ?? '.');
          const base = opts.api ?? DEFAULT_API_BASE;
          const gateway = opts.gateway ?? DEFAULT_GATEWAY;
          const manifest = readManifest(dir);
          const script = readHandler(dir);
          const scriptB64 = Buffer.from(script, 'utf8').toString('base64');

          const agent = await withAgent({ keyPath: opts.key });
          const address = agent.address();

          // 1. Upload to the run control plane (gateway → Workers for
          // Platforms). Signature binds this exact script + slug.
          const ts = Date.now();
          const bodyHash = createHash('sha256')
            .update(`${manifest.slug}|${scriptB64}`)
            .digest('hex');
          const message = new TextEncoder().encode(
            `t2000-serve:${ts}:${bodyHash}`,
          );
          const { signature } = await agent.keypair.signPersonalMessage(message);
          const deployed = await fetchJson(`${gateway}/serve/deploy`, {
            method: 'POST',
            body: {
              address,
              slug: manifest.slug,
              script: scriptB64,
              timestamp: ts,
              signature,
            },
          });

          // 2. Upsert the catalog SKU (endpoint stays null — the gateway
          // resolves hosted deliveries internally; nothing to self-host).
          const catalog = await getCatalog(base, address);
          const entry: AgentServiceEntry = {
            slug: manifest.slug,
            title: manifest.title,
            description: manifest.description,
            priceUsdc: String(manifest.price),
            input: manifest.input ?? null,
            endpoint: null,
            method: 'POST',
            active: true,
          };
          const next = [
            ...catalog.filter((s) => s.slug !== manifest.slug),
            entry,
          ];
          await putCatalog({ base, keyPath: opts.key, services: next });

          const buyUrl = String(
            deployed.buyUrl ??
              `https://x402.t2000.ai/commerce/pay/${address}/${manifest.slug}`,
          );
          if (isJsonMode()) {
            printJson({
              address,
              slug: manifest.slug,
              sizeBytes: deployed.sizeBytes,
              listed: true,
              buyUrl,
            });
            return;
          }
          printBlank();
          printSuccess(`Deployed "${manifest.slug}" to t2000 compute`);
          printKeyValue('Buy URL', buyUrl);
          printKeyValue('Price', `$${manifest.price} per call`);
          printKeyValue('Store', `https://agents.t2000.ai/${address}`);
          printBlank();
          printLine('  t2 agent serve logs      # invocations');
          printLine('  t2 agent serve undeploy --slug ' + manifest.slug);
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('status')
    .description('Deployed handlers + invocation stats.')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--gateway <url>', `Gateway URL (default ${DEFAULT_GATEWAY})`)
    .action(async (opts: { key?: string; gateway?: string }) => {
      try {
        const gateway = opts.gateway ?? DEFAULT_GATEWAY;
        const agent = await withAgent({ keyPath: opts.key });
        const address = agent.address();
        const res = await fetchJson(
          `${gateway}/serve/status?address=${encodeURIComponent(address)}`,
        );
        if (isJsonMode()) {
          printJson(res);
          return;
        }
        const handlers = (res.handlers ?? []) as {
          slug: string;
          active: boolean;
          sizeBytes: number;
          deployedAt: string;
          invocations: number;
          lastInvocation: { at: string; status: number } | null;
        }[];
        printBlank();
        if (handlers.length === 0) {
          printLine('No hosted handlers. Start one: t2 agent serve init');
          printBlank();
          return;
        }
        for (const h of handlers) {
          printLine(
            `  ${h.slug}  ${h.active ? 'live' : 'undeployed'} · ${(h.sizeBytes / 1024).toFixed(1)} KB · ${h.invocations} invocation${h.invocations === 1 ? '' : 's'}${h.lastInvocation ? ` · last ${h.lastInvocation.status} @ ${h.lastInvocation.at}` : ''}`,
          );
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('logs')
    .description('Recent invocations (status · duration · error).')
    .option('--slug <slug>', 'Filter to one handler')
    .option('--limit <n>', 'Rows (default 50)', '50')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--gateway <url>', `Gateway URL (default ${DEFAULT_GATEWAY})`)
    .action(
      async (opts: {
        slug?: string;
        limit: string;
        key?: string;
        gateway?: string;
      }) => {
        try {
          const gateway = opts.gateway ?? DEFAULT_GATEWAY;
          const agent = await withAgent({ keyPath: opts.key });
          const address = agent.address();
          const params = new URLSearchParams({
            address,
            limit: opts.limit,
          });
          if (opts.slug) {
            params.set('slug', opts.slug);
          }
          const res = await fetchJson(`${gateway}/serve/logs?${params}`);
          if (isJsonMode()) {
            printJson(res);
            return;
          }
          const rows = (res.invocations ?? []) as {
            at: string;
            slug: string;
            status: number;
            durationMs: number;
            error?: string;
          }[];
          printBlank();
          if (rows.length === 0) {
            printLine('No invocations yet.');
            printBlank();
            return;
          }
          for (const r of rows) {
            printLine(
              `  ${r.at}  ${r.slug}  ${r.status}  ${r.durationMs}ms${r.error ? `  ${r.error}` : ''}`,
            );
          }
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('undeploy')
    .description(
      'Remove a hosted handler (the SKU stays in the catalog — deactivate it with `t2 agent services update --slug … --inactive` if wanted).',
    )
    .requiredOption('--slug <slug>', 'Handler slug to remove')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--gateway <url>', `Gateway URL (default ${DEFAULT_GATEWAY})`)
    .action(
      async (opts: { slug: string; key?: string; gateway?: string }) => {
        try {
          const gateway = opts.gateway ?? DEFAULT_GATEWAY;
          const slug = opts.slug.trim().toLowerCase();
          if (!SLUG_RE.test(slug)) {
            throw new Error('--slug must match [a-z0-9-], 2-40 chars.');
          }
          const agent = await withAgent({ keyPath: opts.key });
          const address = agent.address();
          const ts = Date.now();
          const message = new TextEncoder().encode(
            `t2000-serve-remove:${ts}:${slug}`,
          );
          const { signature } = await agent.keypair.signPersonalMessage(message);
          await fetchJson(`${gateway}/serve/undeploy`, {
            method: 'POST',
            body: { address, slug, timestamp: ts, signature },
          });
          if (isJsonMode()) {
            printJson({ address, slug, undeployed: true });
            return;
          }
          printBlank();
          printSuccess(`Undeployed "${slug}"`);
          printInfo(
            'Buys against it now fail closed (auto-refund). Redeploy anytime: t2 agent serve deploy',
          );
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );
}
