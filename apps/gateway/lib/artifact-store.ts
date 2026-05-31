import { randomBytes } from 'node:crypto';

import { put } from '@vercel/blob';
import { env } from '@/lib/env';

/**
 * Artifact store — the fix for the binary-body-corruption bug surfaced during
 * the 2026-05-31 Claude Desktop dogfood (ElevenLabs / OpenAI TTS MP3s came
 * back UTF-8-decoded and unrecoverable).
 *
 * ## Why the gateway, not the client
 *
 * The gateway already holds the upstream bytes. If it streams them raw, every
 * downstream layer (SDK -> CLI / MCP -> Claude / Cursor / Audric) has to decide
 * how to encode binary, and the SDK's `response.text()` shreds it. fal.ai was
 * the ONLY media service that worked in the dogfood — because it returns a URL,
 * not bytes. So we normalize binary HERE: store the bytes, return small JSON
 * `{ url, contentType, sizeBytes }`. Clients only ever see JSON + a URL, which
 * works the same on every surface (incl. a future remote MCP that has no local
 * disk, and Audric which is a web app with no disk at all).
 *
 * ## Backend
 *
 * `@vercel/blob` (already a dep; same pattern as `openai-image-blob-normalize.ts`).
 * Behind the one-method `ArtifactStore` interface so the backend can be swapped
 * later — notably to Walrus + Seal for Audric Store (selling AI content), where
 * artifacts are permanent + access-controlled rather than transient.
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

/**
 * If `response` carries a binary body, store it and return JSON
 * `{ url, contentType, sizeBytes }`; otherwise pass the response through
 * untouched. Preserves all headers (notably `Payment-Receipt`) so the MPP
 * receipt survives. Skips 402 challenges (those are JSON already).
 *
 * Applied at the outer layer of both `chargeProxy` and `chargeCustom` so EVERY
 * route is covered uniformly — fixed-price proxies (ElevenLabs/OpenAI TTS) and
 * custom binary handlers (qrcode, stability image) alike.
 */
export async function normalizeBinaryResponse(response: Response): Promise<Response> {
  if (response.status === 402) return response;
  const contentType = response.headers.get('content-type');
  if (!isBinaryContentType(contentType)) return response;

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
