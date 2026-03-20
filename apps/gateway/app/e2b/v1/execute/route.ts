import { chargeCustom, fetchWithRetry } from '@/lib/gateway';

const E2B_API = 'https://api.e2b.app';
const apiHeaders = () => ({
  'x-api-key': process.env.E2B_API_KEY!,
  'content-type': 'application/json',
});

async function waitForPort(sandboxID: string, port: number, maxAttempts = 10): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`https://${port}-${sandboxID}.e2b.app`, { method: 'HEAD' });
      if (res.ok || res.status < 500) return true;
    } catch { /* port not ready yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

export const POST = chargeCustom('0.01', async (bodyText) => {
  const { code, language = 'python' } = JSON.parse(bodyText);
  if (!code) {
    return Response.json({ error: 'Missing required field: code' }, { status: 400 });
  }

  const createRes = await fetchWithRetry(`${E2B_API}/sandboxes`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ templateID: 'base', timeout: 60 }),
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    return Response.json({ error: 'Failed to create sandbox', detail: err }, { status: 502 });
  }
  const sandbox = await createRes.json() as { sandboxID: string };
  const envdPort = 49982;

  try {
    await waitForPort(sandbox.sandboxID, envdPort);

    const cmd = language === 'python'
      ? `python3 -c ${JSON.stringify(code)}`
      : code;

    const execRes = await fetch(`https://${envdPort}-${sandbox.sandboxID}.e2b.app/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cmd, timeout: 25 }),
    });
    const result = await execRes.json();
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: 'Sandbox execution failed', detail: String(err) },
      { status: 502 },
    );
  } finally {
    fetch(`${E2B_API}/sandboxes/${sandbox.sandboxID}`, {
      method: 'DELETE',
      headers: apiHeaders(),
    }).catch(() => {});
  }
});
