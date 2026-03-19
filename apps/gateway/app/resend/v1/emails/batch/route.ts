import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.01', 'https://api.resend.com/emails/batch', {
  authorization: `Bearer ${process.env.RESEND_API_KEY}`,
});
