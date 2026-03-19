import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.005', 'https://api.resend.com/emails', {
  authorization: `Bearer ${process.env.RESEND_API_KEY}`,
});
