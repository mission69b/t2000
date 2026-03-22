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
  const { city, checkIn, checkOut, adults, max } = JSON.parse(body) as {
    city: string;
    checkIn: string;
    checkOut: string;
    adults?: number;
    max?: number;
  };

  if (!city || !checkIn || !checkOut) {
    return Response.json(
      { error: 'Missing required fields: city (IATA city code), checkIn (YYYY-MM-DD), checkOut (YYYY-MM-DD)' },
      { status: 400 },
    );
  }

  const token = await getAmadeusToken();

  const params = new URLSearchParams({
    cityCode: city.toUpperCase(),
  });

  const listRes = await fetch(
    `https://api.amadeus.com/v1/reference-data/locations/hotels/by-city?${params}`,
    { headers: { authorization: `Bearer ${token}` } },
  );

  const listData = await listRes.json();

  if (!listRes.ok) {
    return Response.json(
      { error: 'Hotel search failed', detail: listData.errors },
      { status: listRes.status },
    );
  }

  const hotelIds = (listData.data ?? [])
    .slice(0, max ?? 5)
    .map((h: Record<string, unknown>) => h.hotelId)
    .filter(Boolean);

  if (hotelIds.length === 0) {
    return Response.json({ city: city.toUpperCase(), results: 0, offers: [] });
  }

  const offerParams = new URLSearchParams({
    hotelIds: hotelIds.join(','),
    checkInDate: checkIn,
    checkOutDate: checkOut,
    adults: String(adults ?? 1),
    currency: 'USD',
  });

  const offerRes = await fetch(
    `https://api.amadeus.com/v3/shopping/hotel-offers?${offerParams}`,
    { headers: { authorization: `Bearer ${token}` } },
  );

  const offerData = await offerRes.json();

  if (!offerRes.ok) {
    return Response.json(
      { error: 'Hotel offers failed', detail: offerData.errors },
      { status: offerRes.status },
    );
  }

  const offers = (offerData.data ?? []).map((h: Record<string, unknown>) => ({
    hotel: (h.hotel as Record<string, unknown>)?.name,
    hotelId: (h.hotel as Record<string, unknown>)?.hotelId,
    offers: ((h.offers as Record<string, unknown>[]) ?? []).slice(0, 2).map((o) => ({
      price: (o.price as Record<string, unknown>)?.total,
      currency: (o.price as Record<string, unknown>)?.currency,
      room: (o.room as Record<string, unknown>)?.description,
      checkIn: o.checkInDate,
      checkOut: o.checkOutDate,
    })),
  }));

  return Response.json({
    city: city.toUpperCase(),
    checkIn,
    checkOut,
    results: offers.length,
    offers,
  });
});
