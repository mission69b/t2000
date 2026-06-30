import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';

// Agent Deploy (Option A — config-proxy "wrap any API"). A seller declares an
// upstream URL + (optional) auth headers + price; t2000 hosts the proxy. The
// commerce delivery, when a seller has a deployed config, forwards the buyer's
// call to the upstream (injecting the seller's encrypted headers) instead of to
// a self-hosted mcpEndpoint — so the seller needs no infra and their key never
// leaves the server.
//
// Storage: Upstash (KV-shaped config; no Prisma migration). Header values are
// encrypted at rest (AES-256-GCM, key derived from INTERNAL_API_KEY — no new
// env var). The key never appears in the public directory or any response.

const PREFIX = 'deploy:cfg:';

export interface DeployedService {
  upstreamUrl: string;
  method: 'GET' | 'POST';
  /** Decrypted on read; injected into the upstream request. */
  headers: Record<string, string>;
}

interface StoredService {
  upstreamUrl: string;
  method: 'GET' | 'POST';
  headersEnc: string;
}

/** True when config-proxy deploys are available (Upstash configured). */
export function isDeployConfigured(): boolean {
  return Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN);
}

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

// Domain-separated AES key from the always-present INTERNAL_API_KEY.
function encKey(): Buffer {
  return createHash('sha256')
    .update(`${env.INTERNAL_API_KEY}:deploy-enc-v1`)
    .digest();
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

function decrypt(blob: string): string {
  const raw = Buffer.from(blob, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export async function storeDeployedService(
  agent: string,
  svc: DeployedService,
): Promise<void> {
  const stored: StoredService = {
    upstreamUrl: svc.upstreamUrl,
    method: svc.method,
    headersEnc: encrypt(JSON.stringify(svc.headers ?? {})),
  };
  await getRedis().set(`${PREFIX}${agent}`, JSON.stringify(stored));
}

export async function getDeployedService(
  agent: string,
): Promise<DeployedService | null> {
  try {
    const raw = await getRedis().get<string | StoredService>(`${PREFIX}${agent}`);
    if (!raw) {
      return null;
    }
    const stored: StoredService =
      typeof raw === 'string' ? JSON.parse(raw) : raw;
    let headers: Record<string, string> = {};
    try {
      headers = JSON.parse(decrypt(stored.headersEnc)) as Record<string, string>;
    } catch {
      headers = {};
    }
    return { upstreamUrl: stored.upstreamUrl, method: stored.method, headers };
  } catch {
    return null;
  }
}

export async function removeDeployedService(agent: string): Promise<void> {
  await getRedis().del(`${PREFIX}${agent}`);
}

// SSRF guard — only proxy to public https hosts (the upstream is seller-supplied
// data; never let it point the gateway at an internal/private host). Shared by
// the config-store route + the commerce delivery proxy.
export function isSafeUpstreamUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') {
    return false;
  }
  const host = u.hostname.toLowerCase();
  return !(
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    // Our own rail/gateway hosts — never proxy to ourselves (a delivery target
    // of /commerce/pay or /deploy would recurse). api.t2000.ai (inference) is
    // intentionally allowed — an agent may legitimately wrap the Private API.
    host === 'mpp.t2000.ai' ||
    host === 'x402.t2000.ai' ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}
