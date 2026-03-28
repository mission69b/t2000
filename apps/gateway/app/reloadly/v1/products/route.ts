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
  const cc = encodeURIComponent(countryCode);

  type Product = { productName: string; [k: string]: unknown };

  const all: Product[] = [];
  let page = 1;
  const size = 200;

  while (true) {
    const res = await fetchWithRetry(
      `${RELOADLY_BASE}/products?countryCode=${cc}&size=${size}&page=${page}&includeRange=true&includeFixed=true`,
      { method: 'GET', headers },
    );

    if (!res.ok) break;

    const json = await res.json();
    const batch: Product[] = Array.isArray(json) ? json : (json as { content?: Product[] }).content ?? [];
    all.push(...batch);

    if (batch.length < size) break;
    page++;
    if (page > 10) break;
  }

  console.log(`[reloadly/products] country=${countryCode} fetched=${all.length} pages=${page}`);

  const cleaned = all.filter((p) => !isJunk(p.productName));

  return new Response(JSON.stringify(cleaned), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
