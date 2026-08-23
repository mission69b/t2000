// "Which agent do you mean?" for the machine hire path (S.929).
//
// Parity with the site: a buyer naming another agent should be able to type
// what's printed on the profile — `#93` — instead of opening an explorer.
// The shapes accepted here are exactly the shapes t2000.ai accepts, and the
// spec freezes the RESOLVED address either way, because sellers built their
// tooling around `0x…` and must never decode what `#93` meant on funding day.
//
// The gate below is duplicated from audric `apps/console/lib/agent-ref.ts` on
// purpose: the CLI cannot depend on `@audric/*`. Keep the two in step — the
// unit tests here mirror the console's case-for-case.

import { resolveAgentRef as sdkResolveAgentRef } from '@t2000/sdk';

/** `#93` — the hash makes it unambiguous wherever it appears. */
const HASH_ID_RE = /^#\d{1,10}$/;
/** `93` — bare digits. Could equally be an SLA, a retry count or a score, so
 *  these only count as an agent ref on an agent-ish KEY. */
const BARE_DIGITS_RE = /^\d{1,10}$/;
/** `@handle` — the `@` is required; bare usernames do not resolve. */
const HANDLE_REF_RE = /^@[a-z0-9_-]{1,20}$/i;
/** `0x…` — any hex. The SERVER decides if it's a real address; short hex is
 *  rejected there rather than zero-padded into a wallet nobody owns. */
const HEX_REF_RE = /^0x[0-9a-fA-F]+$/;
/** Keys a seller plausibly means as "an agent / a wallet". */
const AGENT_REF_KEY_RE =
  /agent|address|wallet|subject|recipient|pay[_-]?to|target/i;

const FALLBACK_MISS =
  'Use an Agent ID (#93), @handle, or full 0x… address.';

export type AgentRef = {
  address: string;
  numericId?: number | null;
  name?: string;
};

/** Does the VALUE name an agent on its own, with no help from the field name? */
export function looksLikeAgentRefValue(value: string): boolean {
  const v = value.trim();
  return HASH_ID_RE.test(v) || HANDLE_REF_RE.test(v) || HEX_REF_RE.test(v);
}

/** Does the KEY read like the seller wants an agent there? */
export function looksLikeAgentRefKey(key: string): boolean {
  return AGENT_REF_KEY_RE.test(key);
}

/** Resolve gate.
 *
 *  `#93`, `@handle` and `0x…` carry their own meaning and resolve anywhere.
 *  Bare digits do not: `24` is an agent id on `agent_address` and an SLA on
 *  `sla_hours`, so the KEY breaks that tie. Without it, `{sla_hours: "24"}`
 *  would silently become agent #24's address in a frozen, escrowed spec. */
export function isAgentRefField(key: string, value: string): boolean {
  const v = value.trim();
  if (looksLikeAgentRefValue(v)) {
    return true;
  }
  return BARE_DIGITS_RE.test(v) && looksLikeAgentRefKey(key);
}

/** The agent-ref fields in an object-shaped requirements payload, as
 *  [key, rawValue]. Free-text briefs yield nothing. */
export function agentRefFields(requirements: unknown): [string, string][] {
  if (
    requirements == null ||
    typeof requirements !== 'object' ||
    Array.isArray(requirements)
  ) {
    return [];
  }
  return Object.entries(requirements as Record<string, unknown>)
    .filter((e): e is [string, string] => typeof e[1] === 'string')
    .filter(([k, v]) => isAgentRefField(k, v));
}

/** `#93` · `93` · `@handle` · `0x…` → the agent's wallet address.
 *
 *  The SDK's `resolveAgentRef` (S.1158 SSOT) — one network hop to the same
 *  endpoint the site uses, so there is no second source of truth for Agent
 *  ID numbers. Throws with the server's own sentence so the CLI and the
 *  site explain a miss identically. */
export async function resolveAgentRef(
  base: string,
  q: string,
): Promise<AgentRef> {
  return sdkResolveAgentRef(q, base);
}

/** Resolve every agent-ref value in a requirements object, returning a copy
 *  with addresses written back. Non-objects pass through untouched. Throws on
 *  the first miss — before anything is asserted, hashed or signed. */
export async function expandAgentRefs(
  base: string,
  requirements: unknown,
): Promise<unknown> {
  const fields = agentRefFields(requirements);
  if (fields.length === 0) {
    return requirements;
  }
  const out = { ...(requirements as Record<string, unknown>) };
  for (const [key, raw] of fields) {
    try {
      out[key] = (await resolveAgentRef(base, raw)).address;
    } catch (e) {
      throw new Error(
        `${key}: ${e instanceof Error ? e.message : FALLBACK_MISS}`,
      );
    }
  }
  return out;
}
