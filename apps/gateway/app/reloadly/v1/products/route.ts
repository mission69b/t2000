import { chargeCustom, fetchWithRetry } from '@/lib/gateway';
import { getReloadlyToken, RELOADLY_BASE, reloadlyHeaders } from '@/lib/reloadly';

// Verified against Reloadly production catalog (audited March 2026)
// Only brands that actually exist in each region's catalog
const POPULAR_BRANDS: Record<string, string[]> = {
  _global: [
    'amazon', 'uber', 'uber eats', 'google play', 'app store', 'itunes',
    'netflix', 'playstation', 'xbox', 'nintendo', 'roblox', 'steam',
    'visa', 'mastercard', 'prepaid',
    'razer gold', 'free fire', 'mobile legends', 'riot access', 'pubg',
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
    'tim horton', 'boston pizza', 'indigo', 'canadian tire',
    'hudson', 'golf town', 'home hardware', 'sportchek', 'red lobster',
  ],
  DE: [
    'ikea', 'nike', 'sephora', 'zalando', 'otto', 'douglas',
    'decathlon', 'flixbus',
  ],
  FR: [
    'ikea', 'decathlon',
  ],
  AE: [
    'deliveroo', 'talabat', 'shein', 'huawei',
  ],
  IN: [
    'flipkart', 'ratnadeep',
  ],
  BR: [
    'mcdonald', 'carrefour', 'shopee', 'centauro', 'decathlon', 'nike',
    'spotify', 'havaianas', 'hering', 'netshoes', 'buser', 'flixbus',
  ],
  MX: [],
  TH: [],
  NG: [],
  KE: [],
  ZA: [],
  GH: [],
  PH: [],
  ID: [],
  VN: [],
  CN: [],
  HK: [],
  JP: [],
  TR: [],
  PK: [],
  EG: [],
  KR: [],
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
