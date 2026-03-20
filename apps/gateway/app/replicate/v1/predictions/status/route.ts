import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.001', async (bodyText) => {
  const { id } = JSON.parse(bodyText);
  if (!id) {
    return Response.json({ error: 'Missing required field: id' }, { status: 400 });
  }

  const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: { authorization: `Bearer ${process.env.REPLICATE_API_KEY}` },
  });

  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
});
