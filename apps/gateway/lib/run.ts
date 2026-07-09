import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { Redis } from '@upstash/redis';
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

// ── The per-agent secrets vault (S.695) ─────────────────────────────────────
// What makes hosted handlers able to call KEYED upstreams — the deploy-wrap
// encryption pattern generalized. Secrets are stored AES-256-GCM-encrypted in
// Redis (never in Cloudflare, never in the script) and injected into the
// delivery payload as `ctx.secrets` per request — so a handler reads
// `ctx.secrets.MY_KEY` and the value only ever transits gateway→dispatcher
// →worker over TLS for the duration of one paid delivery. Vault is
// AGENT-scoped (one vault, all the agent's handlers).

const SECRETS_PREFIX = 'run:sec:';
const MAX_SECRETS = 16;
const MAX_SECRET_LEN = 2048;
const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

let _redis: Redis | undefined;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: env.KV_REST_API_URL as string,
      token: env.KV_REST_API_TOKEN as string,
    });
  }
  return _redis;
}

// Domain-separated from the deploy-wrap key (`:deploy-enc-v1`).
function secretsKey(): Buffer {
  return createHash('sha256')
    .update(`${env.INTERNAL_API_KEY}:run-secrets-v1`)
    .digest();
}

function encryptSecrets(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretsKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

function decryptSecrets(blob: string): string {
  const raw = Buffer.from(blob, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', secretsKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    'utf8',
  );
}

export function validSecretName(name: string): boolean {
  return SECRET_NAME_RE.test(name);
}

export async function getRunSecrets(
  agent: string,
): Promise<Record<string, string>> {
  try {
    const raw = await getRedis().get<string>(
      `${SECRETS_PREFIX}${agent.toLowerCase()}`,
    );
    if (!raw) {
      return {};
    }
    return JSON.parse(decryptSecrets(String(raw))) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Merge-set semantics: provided keys overwrite; empty-string value deletes
 *  the key. Returns the resulting secret NAMES (values never leave). */
export async function setRunSecrets(
  agent: string,
  updates: Record<string, string>,
): Promise<{ names: string[] } | { error: string }> {
  const current = await getRunSecrets(agent);
  for (const [k, v] of Object.entries(updates)) {
    if (!validSecretName(k)) {
      return { error: `Invalid secret name "${k}" — A-Z, 0-9, _ (start with a letter).` };
    }
    if (v.length > MAX_SECRET_LEN) {
      return { error: `Secret "${k}" too long (max ${MAX_SECRET_LEN} chars).` };
    }
    if (v === '') {
      delete current[k];
    } else {
      current[k] = v;
    }
  }
  const names = Object.keys(current).sort();
  if (names.length > MAX_SECRETS) {
    return { error: `Too many secrets (max ${MAX_SECRETS}).` };
  }
  const redisKey = `${SECRETS_PREFIX}${agent.toLowerCase()}`;
  if (names.length === 0) {
    await getRedis().del(redisKey);
  } else {
    await getRedis().set(redisKey, encryptSecrets(JSON.stringify(current)));
  }
  return { names };
}
