import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.02', async (body) => {
  const { to, message } = JSON.parse(body) as { to: string; message: string };

  if (!to || !message) {
    return Response.json(
      { error: 'Missing required fields: to, message' },
      { status: 400 },
    );
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_PHONE_NUMBER!;

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: message }),
    },
  );

  const data = await res.json();

  if (!res.ok) {
    return Response.json(
      { error: 'SMS delivery failed', detail: data },
      { status: res.status },
    );
  }

  return Response.json({
    sid: data.sid,
    to: data.to,
    status: data.status,
    message: 'SMS sent successfully',
  });
});
