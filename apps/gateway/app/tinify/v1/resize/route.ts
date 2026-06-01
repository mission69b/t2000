import { chargeCustom } from '@/lib/gateway';
import { env } from '@/lib/env';

// Resize = TinyPNG shrink (compress) + a resize operation POSTed to the
// returned `Location`. Tinify counts this as a single compression. The
// resized binary is re-hosted by `normalizeResponse` (in chargeCustom).
const RESIZE_METHODS = new Set(['scale', 'fit', 'cover', 'thumb']);

function tinifyAuth(): string {
  return `Basic ${Buffer.from(`api:${env.TINIFY_API_KEY}`).toString('base64')}`;
}

export const POST = chargeCustom(async (bodyText) => {
  let body: { url?: string; method?: string; width?: number; height?: number };
  try {
    body = JSON.parse(bodyText || '{}');
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url, method = 'fit', width, height } = body;
  if (!url) {
    return Response.json({ error: 'Missing required field: url' }, { status: 400 });
  }
  if (!RESIZE_METHODS.has(method)) {
    return Response.json(
      { error: `Invalid resize method '${method}'. Use one of: scale, fit, cover, thumb.` },
      { status: 400 },
    );
  }
  if (width === undefined && height === undefined) {
    return Response.json({ error: 'resize requires width and/or height' }, { status: 400 });
  }

  const shrink = await fetch('https://api.tinify.com/shrink', {
    method: 'POST',
    headers: { authorization: tinifyAuth(), 'content-type': 'application/json' },
    body: JSON.stringify({ source: { url } }),
  });
  if (!shrink.ok) {
    const detail = await shrink.text();
    return Response.json({ error: 'Tinify compression failed', detail }, { status: shrink.status });
  }

  const location = shrink.headers.get('location');
  if (!location) {
    return Response.json({ error: 'Tinify did not return a result URL' }, { status: 502 });
  }

  const resize: Record<string, unknown> = { method };
  if (width !== undefined) resize.width = width;
  if (height !== undefined) resize.height = height;

  const resized = await fetch(location, {
    method: 'POST',
    headers: { authorization: tinifyAuth(), 'content-type': 'application/json' },
    body: JSON.stringify({ resize }),
  });
  return new Response(resized.body, {
    status: resized.status,
    headers: { 'content-type': resized.headers.get('content-type') ?? 'image/png' },
  });
});
