import { chargeCustom, fetchWithRetry } from '@/lib/gateway';

const E2B_API = 'https://api.e2b.app';
const apiHeaders = () => ({
  'x-api-key': process.env.E2B_API_KEY!,
  'content-type': 'application/json',
});

export const POST = chargeCustom('0.01', async (bodyText) => {
  const { code, language = 'python' } = JSON.parse(bodyText);
  if (!code) {
    return Response.json({ error: 'Missing required field: code' }, { status: 400 });
  }

  const templateId = language === 'python' ? 'code-interpreter-v1' : 'base';

  const createRes = await fetchWithRetry(`${E2B_API}/sandboxes`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ templateID: templateId, timeout: 30 }),
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    return Response.json({ error: 'Failed to create sandbox', detail: err }, { status: 502 });
  }
  const sandbox = await createRes.json() as { sandboxID: string };

  try {
    const cmd = language === 'python'
      ? `python3 -c ${JSON.stringify(code)}`
      : code;

    const execRes = await fetch(`https://49982-${sandbox.sandboxID}.e2b.app/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cmd, timeout: 25 }),
    });
    const result = await execRes.json();
    return Response.json(result);
  } finally {
    fetch(`${E2B_API}/sandboxes/${sandbox.sandboxID}`, {
      method: 'DELETE',
      headers: apiHeaders(),
    }).catch(() => {});
  }
});
