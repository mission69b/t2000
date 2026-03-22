import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.01', async (body) => {
  const { image_url, size, type } = JSON.parse(body) as {
    image_url: string;
    size?: string;
    type?: string;
  };

  if (!image_url) {
    return Response.json(
      { error: 'Missing required field: image_url' },
      { status: 400 },
    );
  }

  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.REMOVEBG_API_KEY!,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      image_url,
      size: size ?? 'auto',
      type: type ?? 'auto',
      format: 'png',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    return Response.json(
      { error: 'Background removal failed', detail: err },
      { status: res.status },
    );
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'content-disposition': 'inline; filename="no-bg.png"',
    },
  });
});
