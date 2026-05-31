import { chargeCustom, fetchWithRetry } from '@/lib/gateway';
import { env } from '@/lib/env';

function lobAuth(): string {
  return `Basic ${Buffer.from((env.LOB_API_KEY ?? '') + ':').toString('base64')}`;
}

export const POST = chargeCustom(async (bodyText) => {
  return fetchWithRetry('https://api.lob.com/v1/postcards', {
    method: 'POST',
    headers: {
      authorization: lobAuth(),
      'content-type': 'application/json',
    },
    body: bodyText,
  });
});
