import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.005', 'https://api.resend.com/emails', {
  authorization: `Bearer ${env.RESEND_API_KEY}`,
});
