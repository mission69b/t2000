// ---------------------------------------------------------------------------
// Sui address + SuiNS normalization — single source of truth.
//
// Background. Six read tools (balance, health, savings, history,
// activity-summary, portfolio-analysis) accept an optional `address`
// parameter so the LLM can inspect any public Sui wallet. Pre-v1.2 each
// tool re-implemented the same `/^0x[a-fA-F0-9]{1,64}$/` regex inline AND
// rejected SuiNS names (`obehi.sui`) entirely — the LLM had no way to
// answer "transaction list for obehi.sui" because the schema would
// reject the name before the call ever reached the tool body.
//
// This module is the canonical normalizer. It consolidates the regex,
// adds SuiNS resolution via Sui RPC's `suix_resolveNameServiceAddress`,
// and returns a structured `{ address, suinsName, raw }` triple so
// downstream tools can both query the right 0x address AND surface the
// name on result cards (e.g. titling "Transaction history · obehi.sui"
// instead of "Transaction history · 0x1234…abcd").
//
// Single source of truth — see `.cursor/rules/single-source-of-truth.mdc`
// and `.cursor/rules/engineering-principles.mdc` Principle 2.
// ---------------------------------------------------------------------------

const SUI_MAINNET_URL = 'https://fullnode.mainnet.sui.io:443';

/**
 * Canonical 0x-address shape. Loose lower bound (>= 1 hex char) so
 * pre-v1.0 short addresses still validate; tools that need a full 64-hex
 * address can additionally check `length === 66`. Case-insensitive on
 * the `0x` prefix because some upstream callers (and historic tests)
 * uppercase the prefix as part of address normalization tests; the
 * normalizer always returns the lowercased canonical form regardless.
 */
export const SUI_ADDRESS_REGEX = /^0x[a-fA-F0-9]{1,64}$/i;

/**
 * Strict canonical 0x-address shape (66 chars total). Used by the
 * resolver's "looks like" check to disambiguate "user pasted an
 * address" vs "user typed a SuiNS name".
 */
export const SUI_ADDRESS_STRICT_REGEX = /^0x[a-fA-F0-9]{64}$/i;

/**
 * Mirrors the pattern in `audric/apps/web/lib/suins-resolver.ts` so the
 * host-side send executor and the engine-side read normalizer agree on
 * what counts as a SuiNS name. SuiNS allows nested labels (`team.alex.sui`)
 * but every label must use only `[a-z0-9-]`.
 */
export const SUINS_NAME_REGEX = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.sui$/;

export class InvalidAddressError extends Error {
  constructor(public readonly raw: string) {
    super(
      `"${raw}" isn't a valid Sui address or SuiNS name. ` +
        `Pass a 0x-prefixed hex address (e.g. 0x40cd…3e62) or a SuiNS name ending in .sui (e.g. alex.sui).`,
    );
    this.name = 'InvalidAddressError';
  }
}

export class SuinsNotRegisteredError extends Error {
  constructor(public readonly name_: string) {
    super(
      `"${name_}" isn't a registered SuiNS name. Double-check the spelling, ` +
        `or paste the full Sui address (0x… 64 hex characters).`,
    );
    this.name = 'SuinsNotRegisteredError';
  }
}

export class SuinsRpcError extends Error {
  constructor(public readonly name_: string, detail: string) {
    super(`SuiNS lookup failed for "${name_}" (${detail}). Try again, or paste the full Sui address.`);
    this.name = 'SuinsRpcError';
  }
}

/**
 * Returns true if `value` looks like a SuiNS name (case-insensitive).
 * Cheap synchronous check — use to avoid an unnecessary RPC round-trip
 * for inputs that obviously aren't names (0x addresses, contact handles).
 */
export function looksLikeSuiNs(value: string): boolean {
  if (!value) return false;
  return SUINS_NAME_REGEX.test(value.trim().toLowerCase());
}

/**
 * Resolve a SuiNS name to its on-chain Sui address via the public
 * `suix_resolveNameServiceAddress` JSON-RPC method. Returns `null` if
 * the name resolves to no address (= not registered or expired). Throws
 * `SuinsRpcError` on RPC/network failure.
 *
 * The host SHOULD pass a `rpcUrl` that includes any vendor key (e.g.
 * audric's BlockVision-keyed URL) so the call benefits from the host's
 * paid retry/cache budget. Falls back to the public mainnet endpoint.
 */
export async function resolveSuinsViaRpc(
  rawName: string,
  ctx: { suiRpcUrl?: string; signal?: AbortSignal } = {},
): Promise<string | null> {
  const name = rawName.trim().toLowerCase();
  if (!SUINS_NAME_REGEX.test(name)) {
    throw new InvalidAddressError(rawName);
  }

  const url = ctx.suiRpcUrl || SUI_MAINNET_URL;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'suix_resolveNameServiceAddress',
        params: [name],
      }),
      signal: ctx.signal ?? AbortSignal.timeout(8_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SuinsRpcError(name, msg);
  }

  if (!res.ok) {
    throw new SuinsRpcError(name, `HTTP ${res.status}`);
  }

  let body: { result?: string | null; error?: { code: number; message: string } };
  try {
    body = (await res.json()) as typeof body;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SuinsRpcError(name, `JSON parse failed: ${msg}`);
  }

  if (body.error) {
    throw new SuinsRpcError(name, body.error.message);
  }

  // result is the 0x…64-hex address, or null when the name has never
  // been registered (or has expired and the record was reaped).
  return body.result ?? null;
}

export interface NormalizedAddress {
  /**
   * Canonical 0x-prefixed lowercase hex address. Always set on success.
   * Tools should use this for any downstream query (BlockVision, NAVI,
   * positionFetcher, etc.) and for cache keys.
   */
  address: string;
  /**
   * The user-facing name when the input was resolved via SuiNS, otherwise
   * `null`. Tools should stamp this on result data so card titles can
   * render "Balance · obehi.sui" instead of "Balance · 0x1234…abcd".
   */
  suinsName: string | null;
  /**
   * The original input (pre-normalization). Useful for error narration —
   * "I tried to resolve `Obehi.Sui` and …" reads better than the
   * post-trim/lowercase form.
   */
  raw: string;
}

/**
 * Canonical normalizer. Accepts a 0x address OR a SuiNS name; returns
 * a structured `NormalizedAddress`. Throws:
 *   - `InvalidAddressError` if the input matches neither shape.
 *   - `SuinsNotRegisteredError` if the SuiNS name is well-formed but
 *     resolves to null (= not registered).
 *   - `SuinsRpcError` if the RPC fails.
 *
 * Every read tool that accepts a user-supplied `address` parameter MUST
 * call this helper before any downstream lookup. Doing the check inline
 * (1) duplicates the regex, (2) silently rejects SuiNS names, (3) makes
 * cache keys inconsistent across tools (some lowercase, some not).
 */
export async function normalizeAddressInput(
  value: string,
  ctx: { suiRpcUrl?: string; signal?: AbortSignal } = {},
): Promise<NormalizedAddress> {
  const trimmed = value.trim();
  if (SUI_ADDRESS_REGEX.test(trimmed)) {
    return { address: trimmed.toLowerCase(), suinsName: null, raw: value };
  }
  if (looksLikeSuiNs(trimmed)) {
    const name = trimmed.toLowerCase();
    const address = await resolveSuinsViaRpc(name, ctx);
    if (!address) {
      throw new SuinsNotRegisteredError(name);
    }
    return { address: address.toLowerCase(), suinsName: name, raw: value };
  }
  throw new InvalidAddressError(value);
}
