import { chargeCustom } from '@/lib/gateway';

const JUDGE0_URL = 'https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true&wait=true';
const JUDGE0_HEADERS = {
  'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
  'x-rapidapi-host': 'judge0-ce.p.rapidapi.com',
  'content-type': 'application/json',
};

function toBase64(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

function fromBase64(str: string | null | undefined): string {
  if (!str) return '';
  try { return Buffer.from(str, 'base64').toString('utf-8'); } catch { return str; }
}

export const POST = chargeCustom('0.005', async (bodyText) => {
  const body = JSON.parse(bodyText) as Record<string, unknown>;

  const encoded = {
    ...body,
    source_code: typeof body.source_code === 'string' ? toBase64(body.source_code) : body.source_code,
    stdin: typeof body.stdin === 'string' ? toBase64(body.stdin) : body.stdin,
  };

  const res = await fetch(JUDGE0_URL, {
    method: 'POST',
    headers: JUDGE0_HEADERS,
    body: JSON.stringify(encoded),
  });

  const result = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    return Response.json(result, { status: res.status });
  }

  return Response.json({
    ...result,
    stdout: fromBase64(result.stdout as string),
    stderr: fromBase64(result.stderr as string),
    compile_output: fromBase64(result.compile_output as string),
    message: fromBase64(result.message as string),
  });
});
