import { randomBytes } from 'node:crypto';

import { put } from '@vercel/blob';

function randomSuffix(): string {
  return randomBytes(8).toString('hex');
}

/**
 * OpenAI `gpt-image-*` models return `{ data: [{ b64_json }] }` — there is no
 * hosted `url` field (unlike legacy dall-e-3). Audric's `CardPreview` +
 * `compose_pdf` / `compose_image_grid` expect HTTPS URLs so downstream tools
 * stay small in LLM context.
 *
 * After the gateway has successfully fetched OpenAI, rewrite each `b64_json`
 * entry into Vercel Blob `url` (same outward JSON shape as dall-e-3).
 */
export async function transformOpenAiImageGenerationsResponse(res: Response): Promise<Response> {
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response(text, {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!parsed || typeof parsed !== 'object') {
    return Response.json(parsed, { status: res.status });
  }

  const obj = parsed as Record<string, unknown>;
  const data = obj.data;
  if (!Array.isArray(data)) {
    return Response.json(parsed, { status: res.status });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    return Response.json(
      {
        error:
          'Gateway misconfigured: BLOB_READ_WRITE_TOKEN is required to normalize gpt-image-* responses.',
      },
      { status: 503 },
    );
  }

  const newData: unknown[] = [];
  let mutated = false;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (!item || typeof item !== 'object') {
      newData.push(item);
      continue;
    }
    const row = item as Record<string, unknown>;
    if (typeof row.url === 'string' && row.url.length > 0) {
      newData.push(row);
      continue;
    }

    const b64 = row.b64_json;
    if (typeof b64 !== 'string' || b64.length === 0) {
      newData.push(row);
      continue;
    }

    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length === 0) {
      newData.push(row);
      continue;
    }

    const filename = `mpp-openai/${Date.now()}-${i}-${randomSuffix()}.png`;
    const blob = await put(filename, buffer, {
      access: 'public',
      token,
      contentType: 'image/png',
    });

    mutated = true;
    const next = { ...row };
    delete next.b64_json;
    next.url = blob.url;
    newData.push(next);
  }

  if (!mutated) {
    return Response.json(parsed, { status: res.status });
  }

  return Response.json({ ...obj, data: newData }, { status: res.status });
}
