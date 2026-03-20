import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.005', async (bodyText) => {
  const { ip = 'me' } = JSON.parse(bodyText);

  const res = await fetch(`https://ipinfo.io/${ip}?token=${process.env.IPINFO_API_KEY}`);

  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
});
