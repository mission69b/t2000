import { charge, proxy } from '@/lib/gateway';

export const POST = charge('0.01',
  proxy('https://api.firecrawl.dev/v1/scrape', {
    authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
  })
);
