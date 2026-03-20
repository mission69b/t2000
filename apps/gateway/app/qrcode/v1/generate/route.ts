import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.005', async (bodyText) => {
  const { data, size = '300x300', format = 'png' } = JSON.parse(bodyText);
  if (!data) {
    return Response.json({ error: 'Missing required field: data' }, { status: 400 });
  }

  const params = new URLSearchParams({ data, size, format });
  const res = await fetch(`https://api.qrserver.com/v1/create-qr-code/?${params}`);

  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? `image/${format}` },
  });
});
