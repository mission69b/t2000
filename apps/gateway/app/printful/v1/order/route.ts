import { chargeCustom, fetchWithRetry } from '@/lib/gateway';

export const POST = chargeCustom(
  async (bodyText) => {
    const body = JSON.parse(bodyText);
    const estimateRes = await fetch('https://api.printful.com/orders/estimate', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
        'content-type': 'application/json',
      },
      body: bodyText,
    });
    if (!estimateRes.ok) return '5.00';
    const estimate = await estimateRes.json() as { result?: { costs?: { total?: string } } };
    const total = parseFloat(estimate.result?.costs?.total ?? '5.00');
    return (total * 1.05).toFixed(2);
  },
  async (bodyText) => {
    return fetchWithRetry('https://api.printful.com/orders', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
        'content-type': 'application/json',
      },
      body: bodyText,
    });
  },
);
