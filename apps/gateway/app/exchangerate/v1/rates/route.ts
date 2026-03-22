import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.005', async (body) => {
  const { base, symbols } = JSON.parse(body || '{}') as {
    base?: string;
    symbols?: string[];
  };

  const baseCurrency = (base ?? 'USD').toUpperCase();
  const apiKey = process.env.EXCHANGERATE_API_KEY!;

  const res = await fetch(
    `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${baseCurrency}`,
    { headers: { accept: 'application/json' } },
  );

  const data = await res.json();

  if (data.result !== 'success') {
    return Response.json(
      { error: 'Exchange rate lookup failed', detail: data['error-type'] },
      { status: 400 },
    );
  }

  let rates = data.conversion_rates as Record<string, number>;

  if (symbols?.length) {
    const filtered: Record<string, number> = {};
    for (const s of symbols) {
      const key = s.toUpperCase();
      if (rates[key] !== undefined) filtered[key] = rates[key];
    }
    rates = filtered;
  }

  return Response.json({
    base: baseCurrency,
    updated: data.time_last_update_utc,
    rates,
  });
});
