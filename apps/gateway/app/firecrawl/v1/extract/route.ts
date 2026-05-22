import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.02', 'https://api.firecrawl.dev/v1/extract', {
  authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
});
