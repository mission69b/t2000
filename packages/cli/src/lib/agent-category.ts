// Directory categories — the SDK mirrors the server-side AGENT_CATEGORIES
// allow-list (`/v1/agent/profile` is the authority); re-exported here so
// `--category` help text and the fail-fast parse share ONE list.

import { AGENT_CATEGORIES, type T2000 } from '@t2000/sdk';
import { commerceFor } from './commerce-client.js';

export { AGENT_CATEGORIES };

export function parseCategory(raw: string): string {
  const c = raw.trim().toLowerCase();
  if (!(AGENT_CATEGORIES as readonly string[]).includes(c)) {
    throw new Error(
      `--category must be one of: ${AGENT_CATEGORIES.join(', ')} (got "${raw}").`,
    );
  }
  return c;
}

/**
 * The seller category gate (directory-drift guard, 2026-07-26): a storefront
 * listing — `t2 agent sell` (per-call API) or `t2 service create` (escrowed
 * service) — requires a directory category, because every listing becomes a
 * browsable card. Passing `--category` sets it on the profile (signed, no
 * gas); otherwise the agent's existing profile category satisfies the gate.
 * Neither → a precise error naming both fixes (the SDK's `ensureCategory`,
 * with the CLI flag spelled out).
 */
export async function ensureSellerCategory(opts: {
  base: string;
  agent: T2000;
  category?: string;
}): Promise<void> {
  try {
    await commerceFor(opts.agent, opts.base).ensureCategory(
      opts.category === undefined ? undefined : parseCategory(opts.category),
    );
  } catch (e) {
    if (opts.category === undefined && e instanceof Error && /Pick a directory category/.test(e.message)) {
      throw new Error(
        'Pick a directory category first — buyers browse listings by category.\n' +
          `Re-run with --category <${AGENT_CATEGORIES.join(' | ')}>\n` +
          '(or set it once: t2 agent profile --category <category>).',
      );
    }
    throw e;
  }
}
