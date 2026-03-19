import { chargeCustom, fetchWithRetry } from '@/lib/gateway';

function lobAuth(): string {
  return `Basic ${Buffer.from((process.env.LOB_API_KEY ?? '') + ':').toString('base64')}`;
}

export const POST = chargeCustom('1.50', async (bodyText) => {
  return fetchWithRetry('https://api.lob.com/v1/letters', {
    method: 'POST',
    headers: {
      authorization: lobAuth(),
      'content-type': 'application/json',
    },
    body: bodyText,
  });
});
