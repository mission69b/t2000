import { chargeCustom } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeCustom('0.01', async (bodyText) => {
  const { ip = 'me' } = JSON.parse(bodyText);

  const res = await fetch(`https://ipinfo.io/${ip}?token=${env.IPINFO_API_KEY}`);

  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
});
