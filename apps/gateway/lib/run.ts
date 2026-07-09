import { createHmac } from 'node:crypto';
import { env } from '@/lib/env';

// R1 hosted handlers (SPEC_AGENT_RUNTIME §2, S.694) — the gateway side of
// the Workers-for-Platforms control plane. Sellers upload a bundled handler
// script (via /serve/deploy); we PUT it into the `t2000-run` dispatch
// namespace; the dispatcher Worker (infra/run-dispatcher) routes paid
// deliveries to it. Handlers hold NO keys — the delivery payload carries the
// buyer input + the agent's decrypted vault secrets (per-request, TLS).

const CF_BASE = 'https://api.cloudflare.com/client/v4';
export const RUN_NAMESPACE = 't2000-run';
/** 1 MB bundled script cap (CF free-plan gross limit; plenty for handlers). */
export const MAX_SCRIPT_BYTES = 1_000_000;

export function isRunConfigured(): boolean {
  return Boolean(
    env.CF_ACCOUNT_ID &&
      env.CF_API_TOKEN &&
      env.RUN_DELIVERY_SECRET &&
      env.RUN_DISPATCH_URL,
  );
}

/** Script name in the dispatch namespace — MUST stay in sync with the
 *  dispatcher's copy (infra/run-dispatcher/src/index.ts). */
export function scriptNameFor(agent: string, slug: string): string {
  return `h-${agent.toLowerCase().slice(2, 18)}-${slug.toLowerCase()}`;
}

/** The x-t2000-run delivery header: `{ts}.{hmac(ts|agent|slug)}` — proves to
 *  the dispatcher that this invocation is a paid, gateway-mediated delivery. */
export function signRunDelivery(
  agent: string,
  slug: string,
  now = Date.now(),
): string {
  const mac = createHmac('sha256', env.RUN_DELIVERY_SECRET ?? '')
    .update(`${now}|${agent.toLowerCase()}|${slug.toLowerCase()}`)
    .digest('hex');
  return `${now}.${mac}`;
}

/** The public invoke URL for a handler (the dispatcher route). */
export function runEndpointFor(agent: string, slug: string): string {
  return `${(env.RUN_DISPATCH_URL ?? '').replace(/\/$/, '')}/h/${agent.toLowerCase()}/${slug.toLowerCase()}`;
}

async function cfFetch(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; errors?: unknown }> {
  const res = await fetch(
    `${CF_BASE}/accounts/${env.CF_ACCOUNT_ID}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        ...(init.headers ?? {}),
      },
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    errors?: unknown;
  };
  return { ok: res.ok && json.success !== false, status: res.status, errors: json.errors };
}

/** The GATEWAY-owned runtime shim: unwraps the delivery payload
 *  `{ input, ctx }` and calls the seller's default-exported
 *  `handle(input, ctx)`. Owning it server-side keeps the runtime contract
 *  centrally upgradable — sellers upload ONLY their handler module. */
const RUN_SHIM = `import handler from './handler.mjs';
export default {
  async fetch(req) {
    let payload = {};
    try { payload = await req.json(); } catch {}
    const input = payload && payload.input !== undefined ? payload.input : {};
    const ctx = (payload && payload.ctx) || {};
    const json = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    try {
      const fn = typeof handler === 'function' ? handler : handler && handler.handle;
      if (typeof fn !== 'function') {
        return json(500, { error: 'handler.js must export a default function (input, ctx) => output' });
      }
      const out = await fn(input, ctx);
      if (out instanceof Response) return out;
      return json(200, typeof out === 'object' && out !== null ? out : { result: out });
    } catch (e) {
      return json(500, { error: String((e && e.message) || e) });
    }
  }
};
`;

/** Upload (create or replace) a user Worker in the dispatch namespace as a
 *  two-module script: our shim (main) + the seller's handler module. The
 *  handler must be a self-contained ES module with a default export —
 *  imports other than './handler.mjs'-internal code are not resolvable. */
export async function uploadRunScript(
  agent: string,
  slug: string,
  handlerJs: string,
): Promise<{ ok: boolean; error?: string }> {
  const name = scriptNameFor(agent, slug);
  const form = new FormData();
  const metadata = {
    main_module: 'shim.mjs',
    compatibility_date: '2026-07-01',
    tags: [`agent:${agent.toLowerCase()}`, `slug:${slug.toLowerCase()}`],
  };
  form.set('metadata', JSON.stringify(metadata));
  form.set(
    'shim.mjs',
    new Blob([RUN_SHIM], { type: 'application/javascript+module' }),
    'shim.mjs',
  );
  form.set(
    'handler.mjs',
    new Blob([handlerJs], { type: 'application/javascript+module' }),
    'handler.mjs',
  );
  const res = await cfFetch(
    `/workers/dispatch/namespaces/${RUN_NAMESPACE}/scripts/${name}`,
    { method: 'PUT', body: form },
  );
  if (!res.ok) {
    console.error('[run] script upload failed', res.status, JSON.stringify(res.errors)?.slice(0, 400));
    return {
      ok: false,
      error: `Upload failed (${res.status}) — the handler must be a self-contained ES module with a default export.`,
    };
  }
  return { ok: true };
}

/** Delete a user Worker script from the dispatch namespace. */
export async function deleteRunScript(
  agent: string,
  slug: string,
): Promise<{ ok: boolean }> {
  const name = scriptNameFor(agent, slug);
  const res = await cfFetch(
    `/workers/dispatch/namespaces/${RUN_NAMESPACE}/scripts/${name}?force=true`,
    { method: 'DELETE' },
  );
  // 404 = already gone — idempotent.
  return { ok: res.ok || res.status === 404 };
}
