/**
 * Audit Reloadly gift card catalog per region.
 *
 * Run from the gateway directory with env vars loaded:
 *   cd apps/gateway && npx tsx ../../scripts/audit-gift-cards.ts
 *
 * Or set env vars inline:
 *   RELOADLY_CLIENT_ID=xxx RELOADLY_CLIENT_SECRET=yyy npx tsx scripts/audit-gift-cards.ts
 *
 * Outputs a summary of available brands per country,
 * grouped by category, to help build the curated POPULAR_BRANDS list.
 */

const SANDBOX = process.env.RELOADLY_SANDBOX === 'true';
const BASE = SANDBOX
  ? 'https://giftcards-sandbox.reloadly.com'
  : 'https://giftcards.reloadly.com';

const COUNTRIES = ['US', 'GB', 'AU', 'CA', 'NZ', 'SG', 'AE', 'JP', 'DE', 'FR'];

const CATEGORIES = {
  coffee: ['starbucks', 'costa', 'dunkin', 'tim horton', 'greggs', 'gloria jean'],
  food: ['uber eats', 'doordash', 'deliveroo', 'just eat', 'menulog', 'grubhub', 'skip the dishes', 'chipotle', 'domino', 'mcdonald', 'kfc', 'nando', 'pizza'],
  groceries: ['walmart', 'target', 'coles', 'woolworths', 'tesco', 'sainsbury', 'asda', 'aldi', 'costco', 'loblaws', 'countdown'],
  entertainment: ['netflix', 'spotify', 'disney', 'hulu', 'apple', 'itunes', 'google play', 'youtube'],
  gaming: ['steam', 'playstation', 'xbox', 'nintendo', 'roblox', 'riot', 'epic games', 'ea play'],
  shopping: ['amazon', 'ebay', 'nike', 'adidas', 'sephora', 'h&m', 'zara', 'ikea', 'primark', 'john lewis', 'argos', 'currys', 'jb hi-fi', 'bunnings', 'kmart', 'myer', 'the good guys', 'cotton on', 'best buy', 'home depot'],
  rides: ['uber', 'lyft', 'bolt', 'grab', 'didi'],
  prepaid: ['visa', 'mastercard', 'prepaid', 'virtual card'],
};

async function getToken(): Promise<string> {
  const res = await fetch('https://auth.reloadly.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.RELOADLY_CLIENT_ID,
      client_secret: process.env.RELOADLY_CLIENT_SECRET,
      grant_type: 'client_credentials',
      audience: BASE,
    }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

interface Product {
  productId: number;
  productName: string;
  denominationType: string;
  fixedRecipientDenominations?: number[];
  minRecipientDenomination?: number;
  maxRecipientDenomination?: number;
  recipientCurrencyCode: string;
}

async function fetchProducts(token: string, country: string): Promise<Product[]> {
  const res = await fetch(`${BASE}/countries/${country}/products`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/com.reloadly.giftcards-v1+json',
    },
  });
  if (!res.ok) {
    console.error(`  Failed for ${country}: ${res.status}`);
    return [];
  }
  return res.json() as Promise<Product[]>;
}

function categorize(name: string): string {
  const lower = name.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return 'other';
}

function formatDenomination(p: Product): string {
  if (p.denominationType === 'FIXED' && p.fixedRecipientDenominations?.length) {
    const denoms = p.fixedRecipientDenominations.slice(0, 5).map((d) => d.toString());
    return `${p.recipientCurrencyCode} [${denoms.join(', ')}${p.fixedRecipientDenominations.length > 5 ? '...' : ''}]`;
  }
  if (p.minRecipientDenomination && p.maxRecipientDenomination) {
    return `${p.recipientCurrencyCode} ${p.minRecipientDenomination}-${p.maxRecipientDenomination}`;
  }
  return p.recipientCurrencyCode;
}

async function main() {
  console.log(`\n🔍 Reloadly Gift Card Audit (${SANDBOX ? 'SANDBOX' : 'PRODUCTION'})\n`);
  console.log('='.repeat(80));

  const token = await getToken();

  for (const country of COUNTRIES) {
    const products = await fetchProducts(token, country);
    console.log(`\n## ${country} — ${products.length} total products\n`);

    const grouped: Record<string, Product[]> = {};
    for (const p of products) {
      const cat = categorize(p.productName);
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    }

    for (const cat of [...Object.keys(CATEGORIES), 'other']) {
      const items = grouped[cat];
      if (!items?.length) continue;
      console.log(`  ### ${cat.toUpperCase()} (${items.length})`);
      for (const p of items.sort((a, b) => a.productName.localeCompare(b.productName))) {
        console.log(`    - ${p.productName} (id: ${p.productId}) — ${formatDenomination(p)}`);
      }
      console.log();
    }

    const knownCount = Object.values(grouped).reduce((sum, items) => sum + (items === grouped.other ? 0 : items.length), 0);
    const otherCount = grouped.other?.length ?? 0;
    console.log(`  📊 ${knownCount} popular brands, ${otherCount} other/niche\n`);
    console.log('-'.repeat(80));
  }

  console.log('\n✅ Audit complete. Use the output above to build POPULAR_BRANDS in');
  console.log('   apps/gateway/app/reloadly/v1/products/route.ts\n');
}

main().catch(console.error);
