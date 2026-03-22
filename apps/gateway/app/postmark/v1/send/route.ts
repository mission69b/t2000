import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.005', async (body) => {
  const { from, to, subject, text, html } = JSON.parse(body) as {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
  };

  if (!from || !to || !subject || (!text && !html)) {
    return Response.json(
      { error: 'Missing required fields: from, to, subject, and text or html' },
      { status: 400 },
    );
  }

  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'x-postmark-server-token': process.env.POSTMARK_API_KEY!,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      From: from,
      To: to,
      Subject: subject,
      ...(text && { TextBody: text }),
      ...(html && { HtmlBody: html }),
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return Response.json(
      { error: 'Email delivery failed', detail: data },
      { status: res.status },
    );
  }

  return Response.json({
    messageId: data.MessageID,
    to: data.To,
    status: data.Message,
  });
});
