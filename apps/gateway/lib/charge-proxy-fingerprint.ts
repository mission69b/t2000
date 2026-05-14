import { createHash } from 'node:crypto';

/**
 * # `chargeProxyFingerprint` — idempotency-key composer for SPEC 26
 *
 * Computes a deterministic SHA-256 fingerprint over the request shape so two
 * functionally-identical requests (same method, path, body, auth-key) hash to
 * the same string. Used by `chargeProxy` settle-on-success mode to:
 *
 *   - Detect client-retry storms within the cache TTL (D-1 lock: 60s) and
 *     return the cached upstream response WITHOUT re-billing.
 *   - Provide the bookkeeping key for the absorbed-cost budget tracker
 *     (D-3 lock: $5/request hard limit).
 *
 * ## Why these four inputs
 *
 * | Input            | Why include it                                                        |
 * |------------------|-----------------------------------------------------------------------|
 * | `method`         | `GET /tts?text=hello` and `POST /tts {text:"hello"}` are NOT the same |
 * | `path`           | Same body to two different endpoints is two different requests        |
 * | `sortedJsonBody` | `{a:1,b:2}` and `{b:2,a:1}` are semantically identical → same hash    |
 * | `apiKeyId`       | Multi-tenant gateway: caller A's request ≠ caller B's identical body  |
 *
 * Locked in SPEC 26 D-2 (founder approved 2026-05-13 ~18:35 AEST).
 *
 * ## Why NOT include
 *
 * - Full URL with query string — query params poison the cache for routes
 *   that fold the body into the URL (`bodyToQuery: true`); the path alone
 *   is the canonical surface for the route, and the body is already covered
 *   by `sortedJsonBody`.
 * - Headers other than the auth-key proxy (`apiKeyId`) — header values
 *   include client-injected noise (`user-agent`, `accept-encoding`,
 *   tracing IDs) that should NOT split otherwise-identical requests.
 * - Wall-clock time — a replay within the TTL is exactly what we want to
 *   collapse to one charge.
 *
 * ## Body normalization
 *
 * If `body` parses as JSON, we serialize with sorted keys (recursive). If
 * it doesn't parse (binary, malformed JSON, empty body), we fall back to
 * the raw string. The fall-back is byte-stable for the same input, so
 * cache semantics still hold for non-JSON routes — they just don't
 * benefit from the `{a:1,b:2} === {b:2,a:1}` collapse.
 */

const FINGERPRINT_VERSION = 'v1';

export function chargeProxyFingerprint(input: {
  method: string;
  path: string;
  body: string;
  apiKeyId: string;
}): string {
  // [SPEC 30 Phase 1B.5 — 2026-05-14] CodeQL `js/insufficient-password-hash`
  // (alert #33) flagged `hash.update(input.apiKeyId)` because the variable
  // name pattern-matches its 'credential being hashed' heuristic. This is
  // a FALSE POSITIVE — dismissed in CodeQL UI 2026-05-14. The hash is a
  // transient cache fingerprint (60s TTL, in-memory only, never compared
  // against stored credentials). Authentication runs UPSTREAM of this code
  // via `Mppx Credential.verify()` on the request envelope. `apiKeyId`
  // participates here purely as a tenant-scope component to prevent
  // caller-A's request from collapsing into caller-B's identical-body
  // request inside the idempotency cache. SHA-256 is the correct primitive
  // for cache keys; bcrypt/scrypt would be wrong here (we WANT a fast
  // deterministic hash for cache-key derivation).
  const normalizedBody = canonicalJsonOrRaw(input.body);
  const hash = createHash('sha256');
  hash.update(FINGERPRINT_VERSION);
  hash.update('|');
  hash.update(input.method.toUpperCase());
  hash.update('|');
  hash.update(input.path);
  hash.update('|');
  hash.update(normalizedBody);
  hash.update('|');
  hash.update(input.apiKeyId);
  return hash.digest('hex');
}

function canonicalJsonOrRaw(body: string): string {
  if (!body) return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  return canonicalJsonStringify(parsed);
}

function canonicalJsonStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJsonStringify).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const parts = keys.map((k) => {
      const v = (value as Record<string, unknown>)[k];
      return JSON.stringify(k) + ':' + canonicalJsonStringify(v);
    });
    return '{' + parts.join(',') + '}';
  }
  return JSON.stringify(value ?? null);
}
