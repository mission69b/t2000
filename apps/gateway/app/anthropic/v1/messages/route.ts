import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.01', 'https://api.anthropic.com/v1/messages', {
  'x-api-key': process.env.ANTHROPIC_API_KEY!,
  'anthropic-version': '2023-06-01',
});
