// ---------------------------------------------------------------------------
// Sui address + SuiNS normalization — single source of truth.
//
// [S.279 / CLI-CONTACTS-CLEANUP — 2026-05-23] Promoted from the deleted
// `@t2000/engine` package to the SDK so the CLI's `T2000.send()` can accept
// SuiNS names (`alex.sui`) alongside hex addresses — one canonical resolver.
//
// Background. Host read tools accept an optional `address` parameter so the
// LLM can inspect any public Sui wallet. Each calls `normalizeAddressInput()`
// to accept either `0x...` or `alex.sui` and returns a structured
// `{ address, suinsName, raw }` triple. The SDK's `T2000.send()` uses the
// same primitive, so a CLI user can run
// `t2000 send alex.sui 10 USDC` without looking up the hex address first.
//
// Single source of truth — see `.claude/skills/t2000-engineering/SKILL.md` §2.
// ---------------------------------------------------------------------------

import { getSuiGraphQLClient } from './sui.js';

// [gRPC migration] SuiNS resolution moved off JSON-RPC
// (`suix_resolveNameServiceAddress` / `suix_resolveNameServiceNames`) onto the
// Sui GraphQL endpoint — the last JSON-RPC caller in the SDK. Both directions
// use the unified `address(...)` query: `address(name:)` for forward
// (name → address) and `address(address:){ defaultNameRecord { domain } }` for
// reverse (address → primary name).
const RESOLVE_NAME_QUERY = `query ResolveSuins($name: String!) {
  address(name: $name) { address }
}`;

const REVERSE_NAME_QUERY = `query ReverseSuins($address: SuiAddress!) {
  address(address: $address) { defaultNameRecord { domain } }
}`;

interface GqlResult<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

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
 * The single definition of what counts as a SuiNS name, so every caller
 * (CLI send, host send executor, read normalizers) agrees.
 * SuiNS allows nested labels (`team.alex.sui`)
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
 * Resolve a SuiNS name to its on-chain Sui address via the Sui GraphQL
 * `address(name:)` query. Returns `null` if the name resolves to no address
 * (= not registered or expired). Throws `SuinsRpcError` on transport failure.
 *
 * `ctx.signal` is honored for cancellation. (`ctx.suiRpcUrl` is retained for
 * call-site back-compat but no longer used — resolution runs against the
 * canonical GraphQL endpoint via `getSuiGraphQLClient()`.)
 */
export async function resolveSuinsViaRpc(
  rawName: string,
  ctx: { suiRpcUrl?: string; signal?: AbortSignal } = {},
): Promise<string | null> {
  const name = rawName.trim().toLowerCase();
  if (!SUINS_NAME_REGEX.test(name)) {
    throw new InvalidAddressError(rawName);
  }

  const gql = getSuiGraphQLClient();
  let res: GqlResult<{ address?: { address?: string } | null }>;
  try {
    res = (await gql.query({
      query: RESOLVE_NAME_QUERY,
      variables: { name },
      signal: ctx.signal,
    })) as typeof res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SuinsRpcError(name, msg);
  }

  if (res.errors?.length) {
    throw new SuinsRpcError(name, res.errors.map((e) => e.message ?? 'unknown error').join('; '));
  }

  // `address(name:)` returns the Address the name points to, or null when the
  // name has never been registered (or has expired and the record was reaped).
  return res.data?.address?.address ?? null;
}

/**
 * Reverse-resolve a 0x address to its SuiNS name via the Sui GraphQL
 * `address(address:){ defaultNameRecord { domain } }` query. Returns a
 * single-element array with the address's **default (primary)** name, or
 * `[]` when it has none. Throws `SuinsRpcError` on transport failure.
 *
 * Behavior note: the legacy JSON-RPC path returned *all* names for the
 * address; GraphQL exposes the explicitly-configured default record, which is
 * the one every consumer here actually uses (the LLM `resolve_suins` tool +
 * card titles only ever render the primary). Returning `[primary]` keeps the
 * `string[]` contract intact.
 *
 * Why this is its own helper (not folded into `normalizeAddressInput`): a
 * reverse lookup adds a second round-trip per tool call. We don't want every
 * read tool that takes an `address` to silently double its latency. The lookup
 * primitive is opt-in via the `resolve_suins` tool; normalizers stay
 * forward-only.
 */
export async function resolveAddressToSuinsViaRpc(
  rawAddress: string,
  ctx: { suiRpcUrl?: string; signal?: AbortSignal } = {},
): Promise<string[]> {
  const address = rawAddress.trim().toLowerCase();
  if (!SUI_ADDRESS_REGEX.test(address)) {
    throw new InvalidAddressError(rawAddress);
  }

  const gql = getSuiGraphQLClient();
  let res: GqlResult<{ address?: { defaultNameRecord?: { domain?: string } | null } | null }>;
  try {
    res = (await gql.query({
      query: REVERSE_NAME_QUERY,
      variables: { address },
      signal: ctx.signal,
    })) as typeof res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SuinsRpcError(address, msg);
  }

  if (res.errors?.length) {
    throw new SuinsRpcError(address, res.errors.map((e) => e.message ?? 'unknown error').join('; '));
  }

  const domain = res.data?.address?.defaultNameRecord?.domain;
  return domain ? [domain] : [];
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
 * Every read tool (engine) and write helper (SDK `T2000.send()`) that
 * accepts a user-supplied recipient MUST call this helper before any
 * downstream lookup. Doing the check inline (1) duplicates the regex,
 * (2) silently rejects SuiNS names, (3) makes cache keys inconsistent
 * across tools.
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
