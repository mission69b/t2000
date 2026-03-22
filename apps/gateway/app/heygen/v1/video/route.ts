import { chargeCustom, fetchWithRetry } from '@/lib/gateway';

export const POST = chargeCustom('0.10', async (body) => {
  const { script, avatar_id, voice_id, background } = JSON.parse(body) as {
    script: string;
    avatar_id?: string;
    voice_id?: string;
    background?: string;
  };

  if (!script) {
    return Response.json(
      { error: 'Missing required field: script' },
      { status: 400 },
    );
  }

  const apiKey = process.env.HEYGEN_API_KEY!;

  const genRes = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      video_inputs: [
        {
          character: {
            type: 'avatar',
            avatar_id: avatar_id ?? 'Angela-inblackskirt-20220820',
            avatar_style: 'normal',
          },
          voice: {
            type: 'text',
            input_text: script,
            voice_id: voice_id ?? '1bd001e7e50f421d891986aad5c1e6ea',
          },
          ...(background && {
            background: { type: 'color', value: background },
          }),
        },
      ],
      dimension: { width: 1280, height: 720 },
    }),
  });

  const genData = await genRes.json();

  if (!genRes.ok || genData.error) {
    return Response.json(
      { error: 'Video generation failed', detail: genData },
      { status: genRes.status },
    );
  }

  const videoId = genData.data?.video_id;
  if (!videoId) {
    return Response.json({ error: 'No video ID returned', detail: genData }, { status: 502 });
  }

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 10000));

    const statusRes = await fetchWithRetry(
      `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
      { headers: { 'x-api-key': apiKey } },
    );

    const statusData = await statusRes.json();
    const status = statusData.data?.status;

    if (status === 'completed') {
      return Response.json({
        video_id: videoId,
        video_url: statusData.data.video_url,
        thumbnail_url: statusData.data.thumbnail_url,
        duration: statusData.data.duration,
        status: 'completed',
      });
    }

    if (status === 'failed') {
      return Response.json(
        { error: 'Video generation failed', detail: statusData.data?.error },
        { status: 500 },
      );
    }
  }

  return Response.json({
    status: 'processing',
    video_id: videoId,
    message: 'Video is still processing. Check back in a few minutes.',
  });
});
