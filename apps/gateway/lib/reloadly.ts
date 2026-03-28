const SANDBOX = process.env.RELOADLY_SANDBOX === 'true';

export const RELOADLY_BASE = SANDBOX
  ? 'https://giftcards-sandbox.reloadly.com'
  : 'https://giftcards.reloadly.com';

const AUDIENCE = RELOADLY_BASE;

let cached: { token: string; expiresAt: number } | null = null;

export async function getReloadlyToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const res = await fetch('https://auth.reloadly.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.RELOADLY_CLIENT_ID,
      client_secret: process.env.RELOADLY_CLIENT_SECRET,
      grant_type: 'client_credentials',
      audience: AUDIENCE,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reloadly auth failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };

  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 120) * 1000,
  };

  return cached.token;
}

export function reloadlyHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    accept: 'application/com.reloadly.giftcards-v2+json',
  };
}

export const SERVICE_FEE_RATE = 0.05;
