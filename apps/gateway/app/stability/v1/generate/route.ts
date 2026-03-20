import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.03', async (bodyText) => {
  const body = JSON.parse(bodyText);
  const formData = new FormData();
  for (const [key, value] of Object.entries(body)) {
    formData.append(key, String(value));
  }

  const res = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
      accept: 'image/*',
    },
    body: formData,
  });

  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'image/png' },
  });
});
