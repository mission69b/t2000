import { chargeCustom, fetchWithRetry } from '@/lib/gateway';

export const POST = chargeCustom('0.05', async (body) => {
  const { prompt, image_url, duration, ratio } = JSON.parse(body) as {
    prompt?: string;
    image_url?: string;
    duration?: number;
    ratio?: string;
  };

  if (!prompt && !image_url) {
    return Response.json(
      { error: 'Provide prompt (text-to-video) or image_url (image-to-video), or both' },
      { status: 400 },
    );
  }

  const apiKey = process.env.RUNWAY_API_KEY!;
  const headers = {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
    'x-runway-version': '2024-11-06',
  };

  const genRes = await fetch('https://api.dev.runwayml.com/v1/image_to_video', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'gen4_turbo',
      ...(image_url && { promptImage: image_url }),
      ...(prompt && { promptText: prompt }),
      duration: duration ?? 5,
      ratio: ratio ?? '1280:768',
    }),
  });

  const genData = await genRes.json();

  if (!genRes.ok) {
    return Response.json(
      { error: 'Video generation failed', detail: genData },
      { status: genRes.status },
    );
  }

  const taskId = genData.id;
  if (!taskId) {
    return Response.json({ error: 'No task ID returned', detail: genData }, { status: 502 });
  }

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const statusRes = await fetchWithRetry(
      `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
      { headers },
    );

    const statusData = await statusRes.json();

    if (statusData.status === 'SUCCEEDED') {
      return Response.json({
        task_id: taskId,
        video_url: statusData.output?.[0],
        status: 'completed',
      });
    }

    if (statusData.status === 'FAILED') {
      return Response.json(
        { error: 'Video generation failed', detail: statusData.failure },
        { status: 500 },
      );
    }
  }

  return Response.json({
    status: 'processing',
    task_id: taskId,
    message: 'Video is still processing. Typical generation time: 1-3 minutes.',
  });
});
