import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.01',
  'https://api.anthropic.com/v1/messages',
  {
    'x-api-key': env.ANTHROPIC_API_KEY!,
    'anthropic-version': '2023-06-01',
  },
);
