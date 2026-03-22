import { chargeCustom } from '@/lib/gateway';

export const POST = chargeCustom('0.01', async (body) => {
  const { url: targetUrl, hash } = JSON.parse(body) as {
    url?: string;
    hash?: string;
  };

  if (!targetUrl && !hash) {
    return Response.json(
      { error: 'Provide either url or hash (SHA-256/MD5/SHA-1)' },
      { status: 400 },
    );
  }

  const apiKey = process.env.VIRUSTOTAL_API_KEY!;
  const headers = { 'x-apikey': apiKey };

  if (targetUrl) {
    const id = Buffer.from(targetUrl).toString('base64url').replace(/=+$/, '');
    const res = await fetch(
      `https://www.virustotal.com/api/v3/urls/${id}`,
      { headers },
    );

    if (res.status === 404) {
      const submitRes = await fetch('https://www.virustotal.com/api/v3/urls', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ url: targetUrl }),
      });
      const submitData = await submitRes.json();
      return Response.json({
        status: 'queued',
        analysis_id: submitData.data?.id,
        message: 'URL submitted for scanning. Query again in ~30s for results.',
      });
    }

    const data = await res.json();
    const stats = data.data?.attributes?.last_analysis_stats;
    return Response.json({
      url: targetUrl,
      stats,
      reputation: data.data?.attributes?.reputation,
      last_analysis_date: data.data?.attributes?.last_analysis_date,
    });
  }

  const res = await fetch(
    `https://www.virustotal.com/api/v3/files/${hash}`,
    { headers },
  );

  if (!res.ok) {
    return Response.json(
      { error: 'File not found or scan unavailable' },
      { status: res.status },
    );
  }

  const data = await res.json();
  const stats = data.data?.attributes?.last_analysis_stats;
  return Response.json({
    hash,
    stats,
    type_description: data.data?.attributes?.type_description,
    reputation: data.data?.attributes?.reputation,
    names: data.data?.attributes?.names?.slice(0, 5),
  });
});
