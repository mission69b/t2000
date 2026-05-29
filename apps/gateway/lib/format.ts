/**
 * Format a USD amount for display.
 *
 * The MPP price floor is $0.01, so every normal value renders at two
 * decimals ($0.01, $0.05, $1.00) — no trailing third-decimal zero. This
 * is the single source of truth for price/amount formatting across the
 * gateway; it replaces the `n.toFixed(n < 0.01 ? 4 : n < 1 ? 3 : 2)`
 * ternary that was copy-pasted across the catalog + activity surfaces and
 * rendered $0.01 as the misleading "$0.010" (flagged 2026-05-29).
 *
 * Defensive guard: a positive sub-cent value — only possible from a
 * legacy pre-repricing payment row — renders at three decimals so it
 * never collapses to a misleading "$0.00".
 */
export function formatUsd(value: number | string): string {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) {
    return typeof value === "string" ? value : "$0.00";
  }
  if (n > 0 && n < 0.01) {
    return `$${n.toFixed(3)}`;
  }
  return `$${n.toFixed(2)}`;
}
