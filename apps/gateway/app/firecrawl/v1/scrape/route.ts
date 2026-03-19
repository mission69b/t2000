import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.01', 'https://api.firecrawl.dev/v1/scrape', {
  authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
});
