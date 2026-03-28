import { chargeCustom, fetchWithRetry } from '@/lib/gateway';
import { getReloadlyToken, RELOADLY_BASE, reloadlyHeaders } from '@/lib/reloadly';

// Verified against Reloadly production catalog (audited March 2026)
const POPULAR_BRANDS: Record<string, string[]> = {
  _global: [
    'amazon', 'uber', 'uber eats', 'google play', 'app store', 'itunes',
    'netflix', 'playstation', 'xbox', 'nintendo', 'roblox',
    'visa', 'mastercard', 'prepaid',
  ],
  US: [
    'starbucks', 'dunkin', 'doordash', 'grubhub', 'walmart', 'target',
    'spotify', 'ebay', 'sephora', 'adidas', 'nike', 'h&m',
    'lyft', 'chipotle', 'california pizza',
  ],
  GB: [
    'asda', 'tesco', 'matalan', 'swarovski',
  ],
  AU: [
    'coles', 'doordash', 'myer', 'the good guys', 'bcf', 'rebel',
    'supercheap auto', 'priceline', 'catch', 'hotels.com',
  ],
  CA: [
    'tim horton', 'uber eats', 'boston pizza', 'indigo', 'canadian tire',
    'hudson', 'golf town', 'home hardware', 'sportchek',
  ],
  DE: [
    'ikea', 'nike', 'sephora', 'zalando', 'otto', 'douglas',
    'decathlon', 'steam',
  ],
  FR: [
    'ikea', 'decathlon', 'steam',
  ],
  AE: [
    'deliveroo', 'talabat', 'shein', 'huawei', 'steam',
  ],
  SG: [
    'steam',
  ],
};

function isPopularBrand(name: string, country: string): boolean {
  const lower = name.toLowerCase();
  const globalList = POPULAR_BRANDS._global;
  const countryList = POPULAR_BRANDS[country] ?? [];
  return [...globalList, ...countryList].some((brand) => lower.includes(brand));
}

export const POST = chargeCustom('0.005', async (bodyText) => {
  const { countryCode = 'US', popular = true } = JSON.parse(bodyText) as {
    countryCode?: string;
    popular?: boolean;
  };
  const token = await getReloadlyToken();

  const res = await fetchWithRetry(
    `${RELOADLY_BASE}/countries/${encodeURIComponent(countryCode)}/products`,
    { method: 'GET', headers: reloadlyHeaders(token) },
  );

  if (!popular) return res;

  const all = (await res.json()) as { productName: string; [k: string]: unknown }[];
  const filtered = all.filter((p) => isPopularBrand(p.productName, countryCode));

  // If curated list is too thin for this region, return all products
  // so the agent still has options
  const MIN_RESULTS = 5;
  const results = filtered.length >= MIN_RESULTS ? filtered : all;

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
