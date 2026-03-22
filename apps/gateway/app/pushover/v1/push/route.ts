import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.005', async (body) => {
  const { user, message, title, url, priority } = JSON.parse(body) as {
    user: string;
    message: string;
    title?: string;
    url?: string;
    priority?: number;
  };

  if (!user || !message) {
    return Response.json(
      { error: 'Missing required fields: user, message' },
      { status: 400 },
    );
  }

  const res = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: process.env.PUSHOVER_API_TOKEN!,
      user,
      message,
      ...(title && { title }),
      ...(url && { url }),
      ...(priority !== undefined && { priority }),
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return Response.json(
      { error: 'Push notification failed', detail: data },
      { status: res.status },
    );
  }

  return Response.json({
    status: data.status === 1 ? 'sent' : 'failed',
    request: data.request,
  });
});
