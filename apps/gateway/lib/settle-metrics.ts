/**
 * # `settle-metrics.ts` — SPEC 26 P9 D-9 telemetry
 *
 * Vercel-native structured-log emitter for the 5 measurement points
 * locked in SPEC 26 D-9 (revised 2026-05-13: t2000 uses Vercel, not
 * Datadog). Every event is a single `console.log` line that Vercel's
 * function logs capture automatically — no SDK, no buffering, no
 * external dependency. The founder queries via Vercel Logs UI; if/when
 * external aggregation becomes necessary, a Vercel log drain to any
 * sink (Axiom / Logtail / Datadog) is a one-config-change addition that
 * requires no code change here.
 *
 * ## Format
 *
 * Each line begins with the literal `[mpp.settle]` prefix so the founder
 * can filter for "all SPEC 26 events" with one substring. After the
 * prefix is the canonical `event=...` discriminator, then a flat
 * `key=value` payload — no nested JSON, no commas inside values, so
 * Vercel's filter UI (which is plain substring + boolean ops, not
 * structured-query) stays usable.
 *
 * Example lines:
 *   [mpp.settle] event=classify         route=openai/v1/images/generations verdict=deliverable durationMs=14203
 *   [mpp.settle] event=classify         route=openai/v1/images/generations verdict=mixed       durationMs=18901 chargedFraction=0.75
 *   [mpp.settle] event=classify         route=openai/v1/images/generations verdict=refundable  durationMs=1287
 *   [mpp.settle] event=charge_succeeded route=openai/v1/images/generations chargeAmount=0.05
 *   [mpp.settle] event=charge_failed    route=openai/v1/images/generations reason=Sui-congestion absorbedCostUsd=0.05
 *   [mpp.settle] event=idempotency_hit  route=openai/v1/images/generations
 *
 * ## D-9 measurement → log event mapping
 *
 *   - `mpp.settle.classify.{deliverable,refundable,mixed}` → `event=classify verdict=…`
 *   - `mpp.settle.charge_succeeded_after_probe`            → `event=charge_succeeded chargeAmount=…`
 *   - `mpp.settle.charge_failed_after_probe`               → `event=charge_failed`
 *   - `mpp.settle.absorbed_cost_usd` (weekly sum)          → `event=charge_failed absorbedCostUsd=…`
 *   - `mpp.settle.idempotency_hit`                         → `event=idempotency_hit`
 *   - `mpp.settle.probe_to_charge_latency_ms` (histogram)  → `durationMs=…` on every classify
 *
 * ## Why `charge_succeeded` is a separate event (split from classify in v1.0.2 hotfix)
 *
 * Pre-hotfix, `event=classify` carried both the classifier verdict AND a
 * `chargeAmount=` field — but the classify event fires at probe-classify
 * time, BEFORE `mppx.charge` runs. A classify event with `chargeAmount=0.05`
 * does NOT mean the user paid $0.05 on-chain — it means "if mppx.charge
 * succeeds, $0.05 is what would be charged."
 *
 * That ambiguity bit twice: 2026-05-13 ~21:30 ("triple charge" false alarm)
 * and 2026-05-14 ~06:20 (5-deliverable-vs-1-charge confusion). Both
 * resolved on-chain to a single charge, but cost real diagnostic time.
 *
 * Post-hotfix, the truth signal lives in `event=charge_succeeded`:
 *   - emits ONLY after `mppx.charge({ amount }) → 200` returns
 *   - carries the actual `chargeAmount` (== mppx-confirmed on-chain charge)
 *   - count(event=charge_succeeded) === true on-chain charge count
 *
 * `event=classify` keeps `verdict` + `durationMs` (still useful for probe
 * latency + verdict distribution) and DROPS `chargeAmount` to remove the
 * confusion source. `chargedFraction` stays on classify because it's a
 * pure function of the classifier verdict (no charge dependency).
 *
 * ## Vercel filter recipes for the founder
 *
 *   - All settle events:                     filter `[mpp.settle]`
 *   - True charge count today:               filter `[mpp.settle] event=charge_succeeded` + time = last 24h
 *   - Refundable events today:               filter `[mpp.settle] event=classify verdict=refundable` + time = last 24h
 *   - Weekly absorbed cost (read sum):       filter `[mpp.settle] event=charge_failed` + time = last 7d, sum the `absorbedCostUsd=` field manually
 *   - Slow probes (> 5s):                    filter `[mpp.settle] event=classify` + `durationMs=` and visually inspect for high values
 *
 * ## Why a helper (vs raw `console.log` at each call site)
 *
 *   - One source of truth for the `[mpp.settle]` prefix + value
 *     formatting → no log-format drift across sites.
 *   - Sanitizes free-text fields (reason, route) so a malicious upstream
 *     error that contains a newline can't fragment the log line into
 *     two separate Vercel records (which would break filter recipes).
 *   - Single seam for adding a future log drain or routing destination
 *     when external aggregation matters.
 *
 * ## Performance
 *
 * `console.log` is synchronous-effective on Node (writes to stdout,
 * buffered by Vercel's runtime) and adds ~0.05ms per call. Negligible
 * vs the 200–500ms upstream RTT this surface is gated on.
 */

export type SettleEvent =
  | 'classify'
  | 'charge_succeeded'
  | 'charge_failed'
  | 'idempotency_hit';

interface SettleClassifyFields {
  route: string;
  verdict: 'deliverable' | 'refundable' | 'mixed';
  durationMs: number;
  chargedFraction?: number; // only present on verdict === 'mixed'
  reason?: string; // refundable / probe-failed surface the classifier reason here
}

interface SettleChargeSucceededFields {
  route: string;
  chargeAmount: string; // numeric string — actual on-chain charge confirmed by mppx
}

interface SettleChargeFailedFields {
  route: string;
  reason: string;
  absorbedCostUsd: string; // numeric string — the upstream cost we ate when the probe succeeded but the charge failed
}

interface SettleIdempotencyHitFields {
  route: string;
}

type EventFields =
  | { event: 'classify'; fields: SettleClassifyFields }
  | { event: 'charge_succeeded'; fields: SettleChargeSucceededFields }
  | { event: 'charge_failed'; fields: SettleChargeFailedFields }
  | { event: 'idempotency_hit'; fields: SettleIdempotencyHitFields };

/**
 * Emit one D-9 measurement point as a structured `[mpp.settle]` log line.
 * Discriminated by `event` so the call sites get type-checked field shapes.
 */
export function logSettleEvent(payload: EventFields): void {
  const parts: string[] = [`[mpp.settle]`, `event=${payload.event}`];
  for (const [key, raw] of Object.entries(payload.fields)) {
    if (raw === undefined || raw === null) continue;
    parts.push(`${key}=${sanitizeValue(raw)}`);
  }
  // Single console.log → single Vercel log record. Don't use template
  // strings with embedded objects — they get pretty-printed by Node and
  // fragment across multiple records.
  console.log(parts.join(' '));
}

/**
 * Strip newlines and collapse whitespace runs in free-text values so a
 * malicious upstream message can't fragment a single event into multiple
 * Vercel log lines (which breaks the filter recipes in this file's
 * docstring). Bounded to 200 chars to keep individual lines readable in
 * the Vercel UI — the underlying error body is preserved in the
 * gateway's response, not lost.
 */
function sanitizeValue(value: unknown): string {
  const str = typeof value === 'string' ? value : String(value);
  return str.replace(/\s+/g, ' ').trim().slice(0, 200);
}
