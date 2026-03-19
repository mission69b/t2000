import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.05', 'https://api.openai.com/v1/images/generations', {
  authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
});
