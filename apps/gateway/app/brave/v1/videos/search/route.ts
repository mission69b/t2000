import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.005', 'https://api.search.brave.com/res/v1/videos/search', {
  'x-subscription-token': env.BRAVE_SEARCH_API_KEY!,
  accept: 'application/json',
}, { settleOnSuccess: true, upstreamMethod: 'GET', bodyToQuery: true });
