// ---------------------------------------------------------------------------
// <eval_summary> marker parser (SPEC 8 v0.5.1, P3.2 slice 7)
//
// The system prompt teaches the LLM to emit a single `<eval_summary>...
// </eval_summary>` block inside its final thinking burst on
// write-recommendation turns. The block carries structured rows the host
// renders as the "✦ HOW I EVALUATED THIS" trust card (the highest-impact
// UX in `audric/audric_demos_v2/demos/01-save-50.html`).
//
// Format taught to the LLM:
//
//   <eval_summary>
//   {
//     "items": [
//       { "label": "Health Factor", "status": "good", "note": "1.85 → 1.62, above 1.20 threshold" },
//       { "label": "Slippage cap", "status": "good", "note": "0.5% on 100 USDC → max $0.50 loss" },
//       { "label": "Daily spend", "status": "warning", "note": "$8 of $50 daily cap used" }
//     ]
//   }
//   </eval_summary>
//
// Parser behavior:
// - Returns null when no marker is present (no extra cost on every turn).
// - Extracts the FIRST marker only — multiple in one block is a violation
//   logged at the engine telemetry level via `evalSummaryViolationsCount`.
// - Returns null when the inner JSON is malformed — the LLM saw a render
//   mistake; the host falls back to standard ThinkingBlock rendering.
// - Tolerates whitespace and newlines around the JSON payload.
//
// The engine wires this in `providers/anthropic.ts` at the
// `content_block_stop` handler for thinking blocks, populating the new
// `summaryMode` + `evaluationItems` fields on `thinking_done` events.
// ---------------------------------------------------------------------------

export type EvaluationStatus = 'good' | 'warning' | 'critical' | 'info';

export interface EvaluationItem {
  label: string;
  status: EvaluationStatus;
  note?: string;
}

export interface EvalSummaryParseResult {
  /** Always true when this object is returned (vs null when absent). */
  summaryMode: true;
  /** The structured rows the host renders inside the trust card. */
  evaluationItems: EvaluationItem[];
  /** Count of markers detected — >1 indicates an LLM compliance violation. */
  markerCount: number;
}

const MARKER_REGEX = /<eval_summary>([\s\S]*?)<\/eval_summary>/g;
const VALID_STATUSES: ReadonlySet<EvaluationStatus> = new Set([
  'good',
  'warning',
  'critical',
  'info',
]);

/**
 * Scan a thinking-block text for one or more `<eval_summary>` markers.
 *
 * - Returns null when no marker is present, or when the first marker's
 *   JSON is malformed (host falls back to standard rendering).
 * - Returns a parsed result when at least one marker contains valid JSON.
 *   `markerCount` reflects the total number of markers seen so the
 *   engine can emit a `evalSummaryViolationsCount` telemetry counter
 *   when N > 1 (LLM is supposed to emit at most one per turn).
 *
 * The function is pure — safe to call per-thinking-block.
 */
export function parseEvalSummary(thinkingText: string): EvalSummaryParseResult | null {
  if (!thinkingText.includes('<eval_summary>')) return null;

  const matches: string[] = [];
  for (const match of thinkingText.matchAll(MARKER_REGEX)) {
    matches.push(match[1] ?? '');
  }

  if (matches.length === 0) return null;

  const firstPayload = matches[0].trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(firstPayload);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const items = (parsed as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;

  const evaluationItems: EvaluationItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const i = item as Record<string, unknown>;
    if (typeof i.label !== 'string' || i.label.trim().length === 0) continue;
    if (typeof i.status !== 'string' || !VALID_STATUSES.has(i.status as EvaluationStatus)) continue;
    const out: EvaluationItem = {
      label: i.label,
      status: i.status as EvaluationStatus,
    };
    if (typeof i.note === 'string' && i.note.length > 0) {
      out.note = i.note;
    }
    evaluationItems.push(out);
  }

  if (evaluationItems.length === 0) return null;

  return {
    summaryMode: true,
    evaluationItems,
    markerCount: matches.length,
  };
}
