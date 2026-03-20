import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.005', async (bodyText) => {
  const { url } = JSON.parse(bodyText);
  if (!url) {
    return Response.json({ error: 'Missing required field: url' }, { status: 400 });
  }

  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      authorization: `Bearer ${process.env.JINA_API_KEY}`,
      accept: 'application/json',
    },
  });

  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
});
