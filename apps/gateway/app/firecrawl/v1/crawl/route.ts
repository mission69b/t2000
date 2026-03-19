import { charge, proxy } from '@/lib/gateway';

export const POST = charge('0.05',
  proxy('https://api.firecrawl.dev/v1/crawl', {
    authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
  })
);
