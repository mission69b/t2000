const RESEND_API_URL = 'https://api.resend.com';
const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'Audric <notifications@audric.ai>';
const BATCH_SIZE = 100; // Resend batch API limit

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  tags?: Array<{ name: string; value: string }>;
}

interface ResendResponse {
  id?: string;
  data?: Array<{ id: string }>;
  statusCode?: number;
  message?: string;
}

function getApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not set');
  return key;
}

export async function sendEmail(msg: EmailMessage): Promise<string | null> {
  try {
    const res = await fetch(`${RESEND_API_URL}/emails`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        tags: msg.tags,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Failed to send to ${msg.to}: ${res.status} ${body}`);
      return null;
    }

    const data = (await res.json()) as ResendResponse;
    return data.id ?? null;
  } catch (err) {
    console.error(`[email] Error sending to ${msg.to}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Send up to 100 emails per batch call. Automatically chunks if > 100.
 * Returns the count of successfully queued emails.
 */
export async function sendBatchEmails(messages: EmailMessage[]): Promise<number> {
  if (messages.length === 0) return 0;

  let sent = 0;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);

    try {
      const res = await fetch(`${RESEND_API_URL}/emails/batch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getApiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          chunk.map((msg) => ({
            from: FROM_ADDRESS,
            to: msg.to,
            subject: msg.subject,
            html: msg.html,
            tags: msg.tags,
          })),
        ),
      });

      if (res.ok) {
        sent += chunk.length;
      } else {
        const body = await res.text();
        console.error(`[email] Batch send failed: ${res.status} ${body}`);
      }
    } catch (err) {
      console.error('[email] Batch error:', err instanceof Error ? err.message : err);
    }
  }

  return sent;
}
