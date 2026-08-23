// "Which agent do you mean?" — `#93` · `93` · `@handle` · `name.sui` ·
// `0x…` → the wallet address, via the SAME endpoint the site uses
// (`GET /v1/agents/resolve?q=`), so there is no second source of truth for
// Agent ID numbers. Deliberately separate from `normalizeAddressInput`
// (chain-only: 0x / SuiNS) — marketplace refs never leak into payment
// recipient semantics.

import { T2000Error } from '../errors.js';
import { apiRequest, DEFAULT_COMMERCE_API_BASE } from './http.js';
import type { AgentProfile, AgentRef } from './types.js';

const FALLBACK_MISS = 'Use an Agent ID (#93), @handle, or full 0x… address.';

/** The resolve URL for a ref (pure — unit-pinned). */
export function agentResolveUrl(
  q: string,
  apiBase: string = DEFAULT_COMMERCE_API_BASE,
): string {
  return `${apiBase}/agents/resolve?q=${encodeURIComponent(q.trim())}`;
}

/** Resolve an agent ref to its wallet. Throws `T2000Error` with the server's
 *  own sentence on a miss, so every surface explains it identically. */
export async function resolveAgentRef(
  q: string,
  apiBase: string = DEFAULT_COMMERCE_API_BASE,
): Promise<AgentRef> {
  const res = await apiRequest(agentResolveUrl(q, apiBase));
  const json = res.json as {
    address?: unknown;
    numericId?: unknown;
    name?: unknown;
    error?: unknown;
  };
  if (!(res.ok && typeof json.address === 'string')) {
    throw new T2000Error(
      'CONTACT_NOT_FOUND',
      typeof json.error === 'string' ? json.error : FALLBACK_MISS,
      { ref: q },
    );
  }
  return {
    address: json.address,
    ...(typeof json.numericId === 'number' || json.numericId === null
      ? { numericId: json.numericId as number | null }
      : {}),
    ...(typeof json.name === 'string' ? { name: json.name } : {}),
  };
}

/** The public profile row (GET /v1/agents/:address). Null when the address
 *  is not a registered Agent ID. */
export async function getAgentProfile(
  address: string,
  apiBase: string = DEFAULT_COMMERCE_API_BASE,
): Promise<AgentProfile | null> {
  const res = await apiRequest(`${apiBase}/agents/${encodeURIComponent(address)}`);
  if (!res.ok) {
    return null;
  }
  return { ...(res.json as Record<string, unknown>), address } as AgentProfile;
}
