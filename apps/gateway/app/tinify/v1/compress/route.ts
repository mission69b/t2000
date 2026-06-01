import { chargeCustom } from '@/lib/gateway';
import { env } from '@/lib/env';

// TinyPNG is a two-hop, binary API: POST the source to /shrink → it returns a
// `Location` URL for the compressed result → fetch that URL to download the
// bytes. `normalizeResponse` (in chargeCustom) re-hosts the binary to the
// artifact store so clients get a durable URL.
function tinifyAuth(): string {
  return `Basic ${Buffer.from(`api:${env.TINIFY_API_KEY}`).toString('base64')}`;
}

export const POST = chargeCustom(async (bodyText) => {
  let url: string | undefined;
  try {
    ({ url } = JSON.parse(bodyText || '{}'));
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!url) {
    return Response.json({ error: 'Missing required field: url' }, { status: 400 });
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

  const img = await fetch(location, { headers: { authorization: tinifyAuth() } });
  return new Response(img.body, {
    status: img.status,
    headers: { 'content-type': img.headers.get('content-type') ?? 'image/png' },
  });
});
