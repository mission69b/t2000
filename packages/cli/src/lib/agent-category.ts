// Directory categories — mirrors the server-side AGENT_CATEGORIES allow-list
// (@audric/accounts schema; `/v1/agent/profile` is the authority and rejects
// off-enum values). Local mirror so the CLI fails fast before signing.
export const AGENT_CATEGORIES = [
  'ai-models',
  'data-feeds',
  'finance',
  'research',
  'dev-tools',
  'creative',
  'travel',
  'comms',
  'other',
] as const;

export function parseCategory(raw: string): string {
  const c = raw.trim().toLowerCase();
  if (!(AGENT_CATEGORIES as readonly string[]).includes(c)) {
    throw new Error(
      `--category must be one of: ${AGENT_CATEGORIES.join(', ')} (got "${raw}").`,
    );
  }
  return c;
}

type SellerAgent = {
  address(): string;
  keypair: {
    signPersonalMessage(message: Uint8Array): Promise<{ signature: string }>;
  };
};

async function getJson(
  url: string,
  init?: { method: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error;
    const msg =
      typeof err === 'string'
        ? err
        : ((err as { message?: string })?.message ?? `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return json;
}

/**
 * The seller category gate (directory-drift guard, 2026-07-26): a storefront
 * listing — `t2 agent sell` (per-call API) or `t2 service create` (escrowed
 * service) — requires a directory category, because every listing becomes a
 * browsable card. Passing `--category` sets it on the profile (signed, no
 * gas); otherwise the agent's existing profile category satisfies the gate.
 * Neither → a precise error naming both fixes. Console agents can't drift
 * (Create Agent always submits a category); this closes the keypair path.
 */
export async function ensureSellerCategory(opts: {
  base: string;
  agent: SellerAgent;
  category?: string;
}): Promise<void> {
  const address = opts.agent.address();
  if (opts.category !== undefined) {
    const category = parseCategory(opts.category);
    const challenge = await getJson(`${opts.base}/agent/challenge`, {
      method: 'POST',
      body: { address },
    });
    const nonce = challenge.nonce as string | undefined;
    if (!nonce) {
      throw new Error('Failed to get a challenge nonce.');
    }
    const message = new TextEncoder().encode(`t2000-agent-profile:${nonce}`);
    const { signature } = await opts.agent.keypair.signPersonalMessage(message);
    await getJson(`${opts.base}/agent/profile`, {
      method: 'POST',
      body: { address, nonce, signature, category },
    });
    return;
  }
  let existing: string | null = null;
  try {
    const profile = await getJson(`${opts.base}/agents/${address}`);
    existing = typeof profile.category === 'string' ? profile.category : null;
  } catch {
    // unregistered / unreachable profile — same outcome: no category yet
  }
  if (!existing) {
    throw new Error(
      `Pick a directory category first — buyers browse listings by category.\n` +
        `Re-run with --category <${AGENT_CATEGORIES.join(' | ')}>\n` +
        `(or set it once: t2 agent profile --category <category>).`,
    );
  }
}
