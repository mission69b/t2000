import { chargeProxy } from '@/lib/gateway';
import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';

export async function POST(req: NextRequest, { params }: { params: Promise<{ voiceId: string }> }) {
  const { voiceId } = await params;
  const handler = chargeProxy('0.05', `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    'xi-api-key': env.ELEVENLABS_API_KEY!,
  });
  return handler(req);
}
