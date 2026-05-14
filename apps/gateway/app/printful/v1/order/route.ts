import { chargeCustom, fetchWithRetry } from '@/lib/gateway';
import { env } from '@/lib/env';

const storeHeaders = () => ({
  authorization: `Bearer ${env.PRINTFUL_API_KEY}`,
  'content-type': 'application/json',
  'x-pf-store-id': env.PRINTFUL_STORE_ID ?? '',
});

export const POST = chargeCustom(
  async (bodyText) => {
    const estimateRes = await fetch('https://api.printful.com/orders/estimate-costs', {
      method: 'POST',
      headers: storeHeaders(),
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
      headers: storeHeaders(),
      body: bodyText,
    });
  },
);
