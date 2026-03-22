import { chargeCustom } from '@/lib/gateway';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAmadeusToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const res = await fetch('https://api.amadeus.com/v1/security/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.AMADEUS_API_KEY!,
      client_secret: process.env.AMADEUS_API_SECRET!,
    }),
  });

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

export const POST = chargeCustom('0.01', async (body) => {
  const { origin, destination, date, returnDate, adults, max } = JSON.parse(body) as {
    origin: string;
    destination: string;
    date: string;
    returnDate?: string;
    adults?: number;
    max?: number;
  };

  if (!origin || !destination || !date) {
    return Response.json(
      { error: 'Missing required fields: origin (IATA), destination (IATA), date (YYYY-MM-DD)' },
      { status: 400 },
    );
  }

  const token = await getAmadeusToken();

  const params = new URLSearchParams({
    originLocationCode: origin.toUpperCase(),
    destinationLocationCode: destination.toUpperCase(),
    departureDate: date,
    adults: String(adults ?? 1),
    max: String(max ?? 5),
    currencyCode: 'USD',
  });

  if (returnDate) params.set('returnDate', returnDate);

  const res = await fetch(
    `https://api.amadeus.com/v2/shopping/flight-offers?${params}`,
    { headers: { authorization: `Bearer ${token}` } },
  );

  const data = await res.json();

  if (!res.ok) {
    return Response.json(
      { error: 'Flight search failed', detail: data.errors },
      { status: res.status },
    );
  }

  const offers = (data.data ?? []).map((offer: Record<string, unknown>) => ({
    price: (offer.price as Record<string, unknown>)?.grandTotal,
    currency: (offer.price as Record<string, unknown>)?.currency,
    itineraries: offer.itineraries,
    validatingAirline: offer.validatingAirlineCodes,
  }));

  return Response.json({
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    date,
    results: offers.length,
    offers,
  });
});
