import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.005', async (body) => {
  const { from, to, amount } = JSON.parse(body) as {
    from: string;
    to: string;
    amount: number;
  };

  if (!from || !to || !amount) {
    return Response.json(
      { error: 'Missing required fields: from, to, amount' },
      { status: 400 },
    );
  }

  const apiKey = process.env.EXCHANGERATE_API_KEY!;
  const res = await fetch(
    `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${from.toUpperCase()}/${to.toUpperCase()}/${amount}`,
    { headers: { accept: 'application/json' } },
  );

  const data = await res.json();

  if (data.result !== 'success') {
    return Response.json(
      { error: 'Conversion failed', detail: data['error-type'] },
      { status: 400 },
    );
  }

  return Response.json({
    from: from.toUpperCase(),
    to: to.toUpperCase(),
    amount,
    rate: data.conversion_rate,
    result: data.conversion_result,
    updated: data.time_last_update_utc,
  });
});
