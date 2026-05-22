import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.05', 'https://api.firecrawl.dev/v1/crawl', {
  authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
});
