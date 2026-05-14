import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.01', 'https://api.firecrawl.dev/v1/scrape', {
  authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
}, { settleOnSuccess: true });
