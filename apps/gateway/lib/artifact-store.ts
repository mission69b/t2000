import { randomBytes } from 'node:crypto';

import { put } from '@vercel/blob';
import { env } from '@/lib/env';

/**
 * Artifact store + response normalizer — the fix for binary/asset outputs
 * surfaced during the 2026-05-31 → 06-01 Claude Desktop dogfood.
 *
 * ## Why the gateway, not the client
 *
 * The gateway already holds the upstream result. If it streams provider bytes
 * (or leaks a provider's own CDN URL) raw, every downstream layer (SDK -> CLI /
 * MCP -> Claude / Cursor / Audric) has to cope, and the SDK's `response.text()`
 * shreds binary. So we normalize HERE: the client only ever sees JSON + a
 * durable URL on OUR store, which works the same on every surface (incl. a
 * remote MCP with no disk, and Audric which is a web app with no disk).
 *
 * ## One normalizer, three provider output shapes
 *
 * Providers return a generated asset in one of three shapes. `normalizeResponse`
 * is the single chokepoint (run at the outer layer of every `chargeProxy` /
 * `chargeCustom` route) that handles all of them:
 *
 *   1. Raw binary BODY (`audio/*`, `image/*`, `application/pdf`, …) — e.g.
 *      ElevenLabs / OpenAI TTS, PDFShift, Stability bytes. Detected by
 *      content-type; the bytes are stored and replaced with `{ url, ... }`.
 *   2. JSON referencing the provider's OWN CDN URL — e.g. fal (`*.fal.media`).
 *      Detected by host allow-list (`PROVIDER_ASSET_HOSTS`); the asset is
 *      fetched server-side and re-hosted, the URL rewritten in place.
 *   3. JSON with inline base64 — e.g. OpenAI `gpt-image-*` (`data[].b64_json`).
 *      This needs shape-specific knowledge to locate safely, so it stays a
 *      narrow per-route `transformUpstreamResponse`
 *      (`openai-image-blob-normalize.ts`) — the one documented exception.
 *
 * Adding a new media model is therefore a no-code change in the common cases:
 * if it returns bytes, shape #1 already covers it; if it returns a CDN URL, add
 * its host to `PROVIDER_ASSET_HOSTS`. We only ever re-host URLs on those known
 * provider hosts — NEVER an arbitrary URL in a response (a research tool's
 * citation links must pass through untouched).
 *
 * ## Backend
 *
 * `@vercel/blob` behind the one-method `ArtifactStore` interface so the backend
 * can be swapped later — notably to Walrus + Seal for Audric Store (permanent +
 * access-controlled artifacts). Because EVERY shape routes through `put()`, the
 * Store migration is a single-place backend swap, not a per-provider change.
 *
 * NOTE: Vercel Blob has no native TTL. These transient API outputs persist
 * until a cleanup pass removes them — tracked as a follow-up (a `mpp-artifacts/`
 * prefix sweep cron). The interface makes a TTL-capable backend a drop-in.
 */

export interface StoredArtifact {
  url: string;
  contentType: string;
  sizeBytes: number;
}

export interface ArtifactStore {
  put(bytes: Uint8Array, contentType: string): Promise<StoredArtifact>;
}

/**
 * Content-types that cannot survive UTF-8 text decoding and so must be hosted
 * as an artifact rather than streamed through the SDK/MCP JSON-or-text path.
 */
const BINARY_CONTENT_TYPE =
  /^(?:audio\/|image\/|video\/|application\/(?:pdf|octet-stream|zip|gzip|ogg|x-protobuf|wasm))/i;

export function isBinaryContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  return BINARY_CONTENT_TYPE.test(contentType.split(';')[0].trim());
}

/**
 * Output-CDN hosts where providers serve the asset THEY just generated. ONE
 * list drives both the cheap pre-scan and the URL match — add a provider's
 * output host here to cover it; no new code. Suffix-matched against the URL's
 * hostname, so `fal.media` covers `v3b.fal.media` etc. (and is spoof-safe:
 * `evil-fal.media.attacker.com` does NOT match `.fal.media`).
 */
const PROVIDER_ASSET_HOSTS = ['fal.media', 'fal.run'];

function isProviderAssetUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 8) return false;
  let host: string;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return false;
  }
  return PROVIDER_ASSET_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const EXT_BY_TYPE: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
};

function extFor(contentType: string): string {
  const base = contentType.split(';')[0].trim().toLowerCase();
  return EXT_BY_TYPE[base] ?? 'bin';
}

class VercelBlobArtifactStore implements ArtifactStore {
  constructor(private readonly token: string) {}

  async put(bytes: Uint8Array, contentType: string): Promise<StoredArtifact> {
    const buffer = Buffer.from(bytes);
    const filename = `mpp-artifacts/${Date.now()}-${randomBytes(8).toString('hex')}.${extFor(contentType)}`;
    const blob = await put(filename, buffer, {
      access: 'public',
      token: this.token,
      contentType,
    });
    return { url: blob.url, contentType, sizeBytes: buffer.length };
  }
}

let _store: ArtifactStore | undefined;

/**
 * Returns the configured artifact store, or `undefined` when no blob backend
 * is wired (so callers can degrade honestly instead of corrupting bytes).
 */
export function getArtifactStore(): ArtifactStore | undefined {
  const token = env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return undefined;
  if (!_store) _store = new VercelBlobArtifactStore(token);
  return _store;
}

/** Rebuild a JSON response with a (possibly rewritten) body, preserving headers. */
function jsonResponse(response: Response, body: string): Response {
  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json');
  headers.delete('content-length');
  return new Response(body, { status: response.status, headers });
}

/** Shape #1 — store a raw binary body, return JSON `{ url, contentType, sizeBytes }`. */
async function hostBinaryBody(
  response: Response,
  contentType: string | null,
): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json');
  headers.delete('content-length');

  const bytes = new Uint8Array(await response.arrayBuffer());
  const store = getArtifactStore();

  if (!store) {
    return new Response(
      JSON.stringify({
        error:
          'Gateway cannot return binary content: BLOB_READ_WRITE_TOKEN is not configured. ' +
          'Binary endpoints require artifact hosting.',
        contentType,
        sizeBytes: bytes.length,
      }),
      { status: 503, headers },
    );
  }

  const artifact = await store.put(bytes, contentType ?? 'application/octet-stream');
  return new Response(JSON.stringify(artifact), { status: response.status, headers });
}

/**
 * Shape #2 — JSON that references a provider's own CDN asset (`*.fal.media`,
 * …). Fetch each such asset server-side (the gateway can reach the CDN; a
 * sandboxed client often can't) and re-host it, rewriting the URL in place so
 * the JSON shape is preserved. Walks the whole body generically, so every
 * current + future provider on the allow-list is covered. Degrades to the
 * original URLs when no blob backend is configured, and never breaks an
 * already-paid response over a single re-host failure.
 */
async function rehostProviderAssets(response: Response): Promise<Response> {
  const store = getArtifactStore();
  if (!store) return response; // can't re-host; leave URLs (they still work)

  const text = await response.text();
  // Cheap pre-scan: skip the parse/walk unless an asset host actually appears.
  // (A false positive — the host string in prose — only costs a parse; the
  // per-value host check below still guards against re-hosting a non-asset URL.)
  if (!PROVIDER_ASSET_HOSTS.some((h) => text.includes(h))) {
    return jsonResponse(response, text);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return jsonResponse(response, text);
  }

  const rehosted = new Map<string, Promise<string>>();
  const rehost = (url: string): Promise<string> => {
    let pending = rehosted.get(url);
    if (!pending) {
      pending = (async () => {
        try {
          const upstream = await fetch(url);
          if (!upstream.ok) return url;
          const ct = upstream.headers.get('content-type') ?? 'application/octet-stream';
          const bytes = new Uint8Array(await upstream.arrayBuffer());
          const artifact = await store.put(bytes, ct);
          return artifact.url;
        } catch {
          return url;
        }
      })();
      rehosted.set(url, pending);
    }
    return pending;
  };

  const jobs: Promise<void>[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach((value, i) => {
        if (isProviderAssetUrl(value)) {
          jobs.push(rehost(value).then((url) => void (node[i] = url)));
        } else if (value && typeof value === 'object') {
          walk(value);
        }
      });
      return;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (isProviderAssetUrl(value)) {
          jobs.push(rehost(value).then((url) => void (obj[key] = url)));
        } else if (value && typeof value === 'object') {
          walk(value);
        }
      }
    }
  };

  walk(parsed);
  if (jobs.length === 0) return jsonResponse(response, text);

  await Promise.all(jobs);
  return jsonResponse(response, JSON.stringify(parsed));
}

/**
 * The single response normalizer applied at the outer layer of every charging
 * route. Routes a successful response by output shape (see file header):
 * binary body → host bytes; JSON with a provider-CDN asset URL → re-host +
 * rewrite; everything else (text, plain JSON) → untouched. Preserves all
 * headers (notably `Payment-Receipt`) and skips 402 challenges.
 */
export async function normalizeResponse(response: Response): Promise<Response> {
  if (response.status === 402) return response;

  const contentType = response.headers.get('content-type');
  if (isBinaryContentType(contentType)) {
    return hostBinaryBody(response, contentType);
  }
  if (contentType?.includes('application/json')) {
    return rehostProviderAssets(response);
  }
  return response;
}
