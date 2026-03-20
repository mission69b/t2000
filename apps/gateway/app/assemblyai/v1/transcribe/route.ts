import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.02', async (bodyText) => {
  const body = JSON.parse(bodyText);
  if (!body.audio_url) {
    return Response.json({ error: 'Missing required field: audio_url' }, { status: 400 });
  }

  const payload = {
    audio_url: body.audio_url,
    speech_model: body.speech_model ?? 'universal-2',
    ...body,
  };

  const res = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      authorization: process.env.ASSEMBLYAI_API_KEY!,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
});
