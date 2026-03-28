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

  const res = await fetchWithRetry(
    `${RELOADLY_BASE}/countries/${encodeURIComponent(countryCode)}/products`,
    { method: 'GET', headers: reloadlyHeaders(token) },
  );

  const all = (await res.json()) as { productName: string; [k: string]: unknown }[];
  const cleaned = all.filter((p) => !isJunk(p.productName));

  return new Response(JSON.stringify(cleaned), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
