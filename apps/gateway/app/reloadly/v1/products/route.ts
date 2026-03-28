import { chargeCustom, fetchWithRetry } from '@/lib/gateway';
import { getReloadlyToken, RELOADLY_BASE, reloadlyHeaders } from '@/lib/reloadly';

const POPULAR_BRANDS: Record<string, string[]> = {
  _global: [
    'amazon', 'uber', 'uber eats', 'netflix', 'spotify', 'google play',
    'apple', 'itunes', 'playstation', 'xbox', 'steam', 'nintendo',
    'visa', 'mastercard', 'prepaid',
  ],
  US: [
    'starbucks', 'doordash', 'grubhub', 'walmart', 'target', 'costco',
    'best buy', 'home depot', 'nike', 'sephora', 'chipotle',
    'dunkin', 'dominos', 'hulu', 'disney',
  ],
  GB: [
    'costa', 'deliveroo', 'just eat', 'tesco', 'sainsbury', 'asda',
    'marks & spencer', 'primark', 'john lewis', 'argos', 'currys',
    'nando', 'greggs',
  ],
  AU: [
    'uber eats', 'menulog', 'doordash', 'coles', 'woolworths', 'kmart',
    'jb hi-fi', 'the good guys', 'bunnings', 'myer', 'cotton on',
  ],
  CA: [
    'tim hortons', 'skip the dishes', 'uber eats', 'canadian tire',
    'loblaws', 'shoppers drug mart', 'best buy', 'indigo',
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
