import { chargeCustom, fetchWithRetry } from '@/lib/gateway';

const E2B_API = 'https://api.e2b.dev';
const headers = () => ({
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
    headers: headers(),
    body: JSON.stringify({ templateID: templateId, timeout: 30 }),
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    return Response.json({ error: 'Failed to create sandbox', detail: err }, { status: 502 });
  }
  const sandbox = await createRes.json() as { sandboxID: string };

  try {
    const execRes = await fetch(`${E2B_API}/sandboxes/${sandbox.sandboxID}/code/executions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ code }),
    });
    const result = await execRes.json();
    return Response.json(result);
  } finally {
    fetch(`${E2B_API}/sandboxes/${sandbox.sandboxID}`, {
      method: 'DELETE',
      headers: headers(),
    }).catch(() => {});
  }
});
