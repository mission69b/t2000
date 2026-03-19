import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.005', 'https://api.deepseek.com/chat/completions', {
  authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
});
