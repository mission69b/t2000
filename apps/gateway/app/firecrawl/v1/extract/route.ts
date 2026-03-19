import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.02', 'https://api.firecrawl.dev/v1/extract', {
  authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
});
