// ---------------------------------------------------------------------------
// <proactive> marker parser (SPEC 9 v0.1.1 P9.2 — proactive insight blocks)
//
// The system prompt teaches the LLM to wrap its ENTIRE response in a
// `<proactive type="..." subjectKey="...">...</proactive>` block when it
// has a clear unsolicited insight to surface (idle balance, HF warning,
// APY drift, goal progress). Hosts render proactive text blocks with the
// `✦ ADDED BY AUDRIC` lockup styling — distinct from primary answer text.
//
// Format taught to the LLM:
//
//   <proactive type="idle_balance" subjectKey="USDC">
//   You have $120 USDC sitting idle. Saving it on NAVI would earn ~$5/mo
//   at the current 4.2% APY.
//   </proactive>
//
// Pattern: marker scanning at content_block_stop on the FINAL TEXT block,
// analogous to `<eval_summary>` parsing on thinking blocks. The engine adds
// a per-session cooldown Set on top so the same `(type, subjectKey)` tuple
// doesn't fire twice in one session — see `engine.ts` `proactiveCooldown`.
//
// Parser behavior:
// - Returns null when no marker is present (no extra cost on regular turns).
// - Extracts the FIRST marker only — multiple in one block is a violation
//   logged at the engine telemetry level via `proactiveMarkerViolationsCount`.
// - Returns null when the marker attributes are missing/invalid.
// - Returns null when the marker body is empty after trimming.
// - The marker `type` must be in the allow-list (idle_balance, hf_warning,
//   apy_drift, goal_progress); unknown types are dropped to keep the host's
//   render switch closed.
// - `subjectKey` is a free-form string (e.g. "USDC", "1.45", "save-500-by-may")
//   chosen by the LLM to identify the specific subject of the insight. The
//   engine uses `(type, subjectKey)` as the cooldown dedup key.
//
// The provider wires this in `providers/anthropic.ts` at the
// `content_block_stop` handler for text blocks, populating `proactiveMarker`
// on the new `text_done` provider event. The engine's `handleProviderEvent`
// then runs the cooldown check and emits a `proactive_text` engine event
// with `suppressed: true|false` so hosts can decide whether to apply the
// lockup styling or strip the markers and render as regular text.
// ---------------------------------------------------------------------------

export type ProactiveType = 'idle_balance' | 'hf_warning' | 'apy_drift' | 'goal_progress';

export interface ProactiveMarker {
  /** Allow-listed insight category (drives host icon/lockup variant). */
  proactiveType: ProactiveType;
  /** Stable per-subject key — engine uses (proactiveType, subjectKey) for cooldown. */
  subjectKey: string;
  /** Marker body with the wrapping tags stripped, trimmed of leading/trailing whitespace. */
  body: string;
  /** Total marker count detected — >1 indicates an LLM compliance violation. */
  markerCount: number;
}

const VALID_TYPES: ReadonlySet<ProactiveType> = new Set([
  'idle_balance',
  'hf_warning',
  'apy_drift',
  'goal_progress',
]);

// Capture-group order: 1=attrs, 2=body. Attrs are parsed separately so the
// regex stays attribute-order agnostic and tolerant of extra whitespace.
const MARKER_REGEX = /<proactive\s+([^>]+)>([\s\S]*?)<\/proactive>/g;

const ATTR_TYPE_REGEX = /\btype\s*=\s*"([^"]+)"/;
const ATTR_SUBJECT_KEY_REGEX = /\bsubjectKey\s*=\s*"([^"]+)"/;

/**
 * Scan completed final-text for one or more `<proactive>` markers.
 *
 * Returns null when no parseable marker exists. When at least one valid
 * marker is found, returns the FIRST marker's payload + the total count
 * (so the engine can emit `proactiveMarkerViolationsCount` telemetry
 * when the LLM emitted >1 — the contract is at-most-one per turn).
 *
 * Pure function — safe to call per-text-block at content_block_stop.
 */
export function parseProactiveMarker(text: string): ProactiveMarker | null {
  if (!text.includes('<proactive')) return null;

  const matches: Array<{ attrs: string; body: string }> = [];
  for (const match of text.matchAll(MARKER_REGEX)) {
    matches.push({ attrs: match[1] ?? '', body: match[2] ?? '' });
  }

  if (matches.length === 0) return null;

  // Walk matches; first parseable wins. Unparseable markers do not block —
  // they just don't contribute to the result (matches a model misuse where
  // the LLM emits a malformed first marker but a clean second one).
  for (const { attrs, body } of matches) {
    const typeMatch = attrs.match(ATTR_TYPE_REGEX);
    const subjectKeyMatch = attrs.match(ATTR_SUBJECT_KEY_REGEX);
    if (!typeMatch || !subjectKeyMatch) continue;

    const proactiveType = typeMatch[1];
    const subjectKey = subjectKeyMatch[1].trim();
    if (!VALID_TYPES.has(proactiveType as ProactiveType)) continue;
    if (subjectKey.length === 0) continue;

    const trimmedBody = body.trim();
    if (trimmedBody.length === 0) continue;

    return {
      proactiveType: proactiveType as ProactiveType,
      subjectKey,
      body: trimmedBody,
      markerCount: matches.length,
    };
  }

  return null;
}

/**
 * Strip every `<proactive ...>...</proactive>` wrapper from a text, leaving
 * the body. Used by the engine's cooldown-suppression path: when the
 * `(type, subjectKey)` was already seen in this session, the marker stays
 * out of the rendered text but the body still reads cleanly.
 *
 * Idempotent — safe to call on text without markers.
 */
export function stripProactiveMarkers(text: string): string {
  if (!text.includes('<proactive')) return text;
  return text.replace(MARKER_REGEX, (_match, _attrs, body: string) => body);
}

/**
 * [SPEC 9 v0.1.1 P9.2 / R3] Yield every `(proactiveType, subjectKey)` pair
 * present in `text`, in document order, regardless of whether the type is
 * in the allow-list. Used by the engine's rehydration path on
 * `loadMessages` to seed the per-session cooldown set from prior assistant
 * blocks. Lenient (no `VALID_TYPES` filter) by design: extra cooldown
 * entries for invalid types are inert because future valid emissions will
 * never share the key, so seeding them costs nothing and keeps this helper
 * decoupled from the emit-side validation policy.
 *
 * Returns `subjectKey` un-trimmed — caller is responsible for normalising.
 */
export function extractAllProactiveMarkers(
  text: string,
): Array<{ proactiveType: string; subjectKey: string }> {
  if (!text.includes('<proactive')) return [];
  const out: Array<{ proactiveType: string; subjectKey: string }> = [];
  for (const match of text.matchAll(MARKER_REGEX)) {
    const attrs = match[1] ?? '';
    const typeMatch = attrs.match(ATTR_TYPE_REGEX);
    const subjectKeyMatch = attrs.match(ATTR_SUBJECT_KEY_REGEX);
    if (!typeMatch || !subjectKeyMatch) continue;
    const subjectKey = subjectKeyMatch[1].trim();
    if (subjectKey.length === 0) continue;
    out.push({ proactiveType: typeMatch[1], subjectKey });
  }
  return out;
}
