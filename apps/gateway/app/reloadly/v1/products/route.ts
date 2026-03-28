import { chargeCustom, fetchWithRetry } from '@/lib/gateway';
import { getReloadlyToken, RELOADLY_BASE, reloadlyHeaders } from '@/lib/reloadly';

// Blacklist junk products that appear in every country's catalog.
// These are obscure games, crypto vouchers, and low-quality products
// that clutter results and confuse the agent.
// Approach: remove the noise, keep everything else. No per-country
// maintenance needed — Reloadly catalog changes are handled automatically.
const JUNK_PATTERNS = [
  'free fire',
  'molek-syntez',
  'jawaker',
  'netdragon',
  'cryptovoucher',
  'crypto giftcard',
  'binance',
  'pubg new state',
  'mobile legends',
  'exapunks',
  'pc final fantasy',
  'ea apex',
  'mortal kombat',
  'ea 12 month',
];

function isJunk(name: string): boolean {
  const lower = name.toLowerCase();
  return JUNK_PATTERNS.some((pattern) => lower.includes(pattern));
}

export const POST = chargeCustom('0.005', async (bodyText) => {
  const { countryCode = 'US' } = JSON.parse(bodyText) as {
    countryCode?: string;
  };
  const token = await getReloadlyToken();
  const headers = reloadlyHeaders(token);
  const base = `${RELOADLY_BASE}/countries/${encodeURIComponent(countryCode)}/products`;

  const all: { productName: string; [k: string]: unknown }[] = [];
  let page = 1;
  const size = 200;

  while (true) {
    const res = await fetchWithRetry(
      `${base}?size=${size}&page=${page}&includeRange=true&includeFixed=true`,
      { method: 'GET', headers },
    );

    if (!res.ok) break;

    const batch = (await res.json()) as { productName: string; [k: string]: unknown }[];
    all.push(...batch);

    if (batch.length < size) break;
    page++;
    if (page > 10) break;
  }

  const cleaned = all.filter((p) => !isJunk(p.productName));

  return new Response(JSON.stringify(cleaned), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
