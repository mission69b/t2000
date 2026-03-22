import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.005', async (body) => {
  const { url, domain, title } = JSON.parse(body) as {
    url: string;
    domain?: string;
    title?: string;
  };

  if (!url) {
    return Response.json(
      { error: 'Missing required field: url' },
      { status: 400 },
    );
  }

  const res = await fetch('https://api.short.io/links/public', {
    method: 'POST',
    headers: {
      authorization: process.env.SHORTIO_API_KEY!,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      originalURL: url,
      domain: domain ?? process.env.SHORTIO_DOMAIN ?? 'short.icu',
      ...(title && { title }),
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return Response.json(
      { error: 'URL shortening failed', detail: data },
      { status: res.status },
    );
  }

  return Response.json({
    short_url: data.shortURL,
    original_url: data.originalURL,
    id: data.idString,
  });
});
