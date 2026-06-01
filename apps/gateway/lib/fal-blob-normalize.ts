import { getArtifactStore } from './artifact-store';

/**
 * fal endpoints return JSON that references the generated asset by URL on fal's
 * own CDN (e.g. `https://v3b.fal.media/files/.../out.wav`), NOT raw bytes — so
 * the binary-body path in `normalizeBinaryResponse` never touches them and the
 * ephemeral fal URL leaks all the way to the client. Fine for a quick play,
 * wrong for anything we want to keep (Audric Store / Walrus permanence: the
 * artifact must live under our control, not fal's transient CDN).
 *
 * After fal responds, fetch each fal-hosted asset server-side (the gateway CAN
 * reach fal.media; sandboxed clients often can't) and re-host it through the
 * artifact store — Vercel Blob today, Walrus + Seal for Store later — rewriting
 * the URL in place. The JSON shape is preserved, so clients reading
 * `.images[].url` / `.audio_file.url` keep working; they just get our durable
 * URL instead of fal's.
 *
 * Generic by design: it walks the whole JSON and re-hosts ANY fal-CDN URL, so
 * it covers every current + future fal endpoint without per-shape handling.
 * Whisper (text-only) is a no-op. Degrades to the original fal URLs when no
 * blob backend is configured (dev) rather than failing an already-paid request.
 *
 * Mirrors the `transformOpenAiImageGenerationsResponse` pattern (JSON-embedded
 * asset → hosted artifact URL); see `openai-image-blob-normalize.ts`.
 */

// fal serves model outputs on `*.fal.media` and `fal.run/files/`.
const FAL_MEDIA_URL = /^https?:\/\/(?:[a-z0-9-]+\.)*fal\.media\/|^https?:\/\/fal\.run\/files\//i;

function isFalMediaUrl(value: unknown): value is string {
  return typeof value === 'string' && FAL_MEDIA_URL.test(value);
}

function jsonResponse(text: string, status: number): Response {
  return new Response(text, { status, headers: { 'content-type': 'application/json' } });
}

export async function rehostFalMediaResponse(res: Response): Promise<Response> {
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return jsonResponse(text, res.status);
  }

  const store = getArtifactStore();
  // No blob backend wired (dev) — leave fal's URLs untouched (valid, ephemeral)
  // rather than failing a request the caller already paid for.
  if (!store) return jsonResponse(text, res.status);

  // Re-host each distinct fal URL once; replace every occurrence in place.
  const rehosted = new Map<string, Promise<string>>();
  const rehost = (url: string): Promise<string> => {
    let pending = rehosted.get(url);
    if (!pending) {
      pending = (async () => {
        try {
          const upstream = await fetch(url);
          if (!upstream.ok) return url; // leave original on fetch failure
          const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
          const bytes = new Uint8Array(await upstream.arrayBuffer());
          const artifact = await store.put(bytes, contentType);
          return artifact.url;
        } catch {
          return url; // never break a paid response over a re-host failure
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
        if (isFalMediaUrl(value)) {
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
        if (isFalMediaUrl(value)) {
          jobs.push(rehost(value).then((url) => void (obj[key] = url)));
        } else if (value && typeof value === 'object') {
          walk(value);
        }
      }
    }
  };

  walk(parsed);
  if (jobs.length === 0) return jsonResponse(text, res.status);

  await Promise.all(jobs);
  return Response.json(parsed, { status: res.status });
}
