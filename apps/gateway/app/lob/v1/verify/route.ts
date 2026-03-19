import { chargeCustom, fetchWithRetry } from '@/lib/gateway';

function lobAuth(): string {
  return `Basic ${Buffer.from((process.env.LOB_API_KEY ?? '') + ':').toString('base64')}`;
}

export const POST = chargeCustom('0.01', async (bodyText) => {
  return fetchWithRetry('https://api.lob.com/v1/us_verifications', {
    method: 'POST',
    headers: {
      authorization: lobAuth(),
      'content-type': 'application/json',
    },
    body: bodyText,
  });
});
