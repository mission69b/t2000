import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.01', 'https://api.search.brave.com/res/v1/images/search', {
  'x-subscription-token': env.BRAVE_SEARCH_API_KEY!,
  accept: 'application/json',
}, { upstreamMethod: 'GET', bodyToQuery: true });
