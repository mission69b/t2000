/**
 * SPEC 7 v0.3 Quote-Refresh ReviewCard — per-tool result freshness budgets.
 *
 * When a Payment Intent `pending_action` is composed at T=0 from upstream
 * read results, the user may take 30–60s to read + tap APPROVE. By that
 * time some upstream results have drifted (Cetus quotes refresh in
 * ~30s; NAVI APYs change slower). The host renders a "QUOTE Ns OLD"
 * badge and pulses the REGENERATE button when `quoteAge >
 * bundleShortestTtl(...)` so the user is nudged toward a fresh
 * composition. The TTL is a UX hint — it does NOT gate correctness.
 * The actual safety net is Sui's on-chain dry-run + `minOut` reverts.
 *
 * **Why per-tool, not per-bundle.** A bundle that depends on `swap_quote`
 * (30s drift) AND `rates_info` (90s drift) inherits the SHORTEST member
 * TTL — that's the freshness ceiling we can promise. Mixing in a
 * stable-floor read like `balance_check` (120s) doesn't loosen the
 * ceiling; the user still cares about the 30s quote going stale.
 *
 * **Where this lives.** Engine emits `quoteAge` + `regenerateInput` on
 * the bundled `pending_action`; the host imports `bundleShortestTtl` to
 * decide when the regenerate button auto-pulses. Adding a new
 * re-runnable read tool: append it to `TOOL_TTL_MS` here AND ensure the
 * bundle composer's contributing-reads detector picks it up.
 */
export const TOOL_TTL_MS: Record<string, number> = {
  swap_quote: 30_000,
  rates_info: 90_000,
  balance_check: 120_000,
  portfolio_analysis: 120_000,
  savings_info: 120_000,
  health_check: 90_000,
};

/** Default TTL for read tools not in `TOOL_TTL_MS` (60s — conservative). */
export const DEFAULT_TOOL_TTL_MS = 60_000;

/**
 * Resolve the shortest TTL among a set of tool_use_ids. Hosts call this
 * to decide when the regenerate button should auto-pulse.
 *
 * @param toolUseIds — the set of upstream read `tool_use` ids that fed
 *   the bundle composition (what the engine stamps into
 *   `PendingAction.regenerateInput.toolUseIds`).
 * @param toolNamesById — `tool_use_id` → `toolName` map, built by the
 *   host from the same turn's tool_use blocks.
 * @returns The smallest TTL in milliseconds. Empty input returns
 *   `DEFAULT_TOOL_TTL_MS`.
 */
export function bundleShortestTtl(
  toolUseIds: string[],
  toolNamesById: Record<string, string>,
): number {
  if (toolUseIds.length === 0) return DEFAULT_TOOL_TTL_MS;
  let shortest = Number.POSITIVE_INFINITY;
  for (const id of toolUseIds) {
    const name = toolNamesById[id];
    const ttl: number = (name !== undefined ? TOOL_TTL_MS[name] : undefined) ?? DEFAULT_TOOL_TTL_MS;
    if (ttl < shortest) shortest = ttl;
  }
  return Number.isFinite(shortest) ? shortest : DEFAULT_TOOL_TTL_MS;
}

/** The set of read tools whose results re-fire on REGENERATE. */
export const REGENERATABLE_READ_TOOLS: ReadonlySet<string> = new Set([
  'swap_quote',
  'rates_info',
  'balance_check',
  'portfolio_analysis',
  'savings_info',
  'health_check',
]);
