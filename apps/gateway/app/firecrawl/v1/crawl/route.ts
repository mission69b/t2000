import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.05', 'https://api.firecrawl.dev/v1/crawl', {
  authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
});
