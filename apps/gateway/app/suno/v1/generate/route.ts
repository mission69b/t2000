import { chargeCustom, fetchWithRetry } from '@/lib/gateway';

export const POST = chargeCustom('0.05', async (body) => {
  const { prompt, style, instrumental, model } = JSON.parse(body) as {
    prompt: string;
    style?: string;
    instrumental?: boolean;
    model?: string;
  };

  if (!prompt) {
    return Response.json(
      { error: 'Missing required field: prompt' },
      { status: 400 },
    );
  }

  const apiKey = process.env.SUNO_API_KEY!;
  const baseUrl = 'https://api.sunoapi.org';

  const genRes = await fetch(`${baseUrl}/api/v1/generate`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      customMode: !!style,
      instrumental: instrumental ?? false,
      model: model ?? 'V4',
      ...(style
        ? { style, prompt }
        : { prompt }),
    }),
  });

  const genData = await genRes.json();

  if (!genRes.ok) {
    return Response.json(
      { error: 'Music generation failed', detail: genData },
      { status: genRes.status },
    );
  }

  const taskId = genData.data?.taskId;
  if (!taskId) {
    return Response.json({ error: 'No task ID returned', detail: genData }, { status: 502 });
  }

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const statusRes = await fetchWithRetry(
      `${baseUrl}/api/v1/generate/record?taskId=${taskId}`,
      { headers: { authorization: `Bearer ${apiKey}` } },
    );

    const statusData = await statusRes.json();
    const songs = statusData.data?.response?.sunoData;

    if (songs?.length && songs[0].audioUrl) {
      return Response.json({
        songs: songs.map((s: Record<string, unknown>) => ({
          title: s.title,
          audio_url: s.audioUrl,
          stream_url: s.streamAudioUrl,
          image_url: s.imageUrl,
          duration: s.duration,
          style: s.style,
        })),
      });
    }
  }

  return Response.json({
    status: 'processing',
    task_id: taskId,
    message: 'Generation in progress. Songs typically ready in 1-2 minutes.',
  });
});
