import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.005', async (bodyText) => {
  const res = await fetch('https://api.printful.com/orders/estimate-costs', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
      'content-type': 'application/json',
      'x-pf-store-id': process.env.PRINTFUL_STORE_ID ?? '',
    },
    body: bodyText,
  });

  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
});
