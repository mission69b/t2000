import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('https://api.firecrawl.dev/v1/scrape', {
  authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
});
