import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.005', 'https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true', {
  'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
  'x-rapidapi-host': 'judge0-ce.p.rapidapi.com',
});
