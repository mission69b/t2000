import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.02', async (bodyText) => {
  const { to, body: messageBody } = JSON.parse(bodyText);
  if (!to || !messageBody) {
    return Response.json({ error: 'Missing required fields: to, body' }, { status: 400 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER!;

  const params = new URLSearchParams({
    To: to,
    From: fromNumber,
    Body: messageBody,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    },
  );

  const result = await res.json();
  return Response.json(result, { status: res.status });
});
