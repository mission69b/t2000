import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.005', async (bodyText) => {
  const { id, category } = JSON.parse(bodyText || '{}');

  const url = id
    ? `https://api.printful.com/products/${id}`
    : `https://api.printful.com/products${category ? `?category_id=${category}` : ''}`;

  const res = await fetch(url, {
    headers: { authorization: `Bearer ${process.env.PRINTFUL_API_KEY}` },
  });

  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
});
