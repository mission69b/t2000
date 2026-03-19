import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.005', 'https://api.search.brave.com/res/v1/images/search', {
  'x-subscription-token': process.env.BRAVE_SEARCH_API_KEY!,
  accept: 'application/json',
}, { upstreamMethod: 'GET', bodyToQuery: true });
