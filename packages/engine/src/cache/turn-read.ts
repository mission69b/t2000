/**
 * [v0.46.8] Intra-turn deduplication of read-only tool calls.
 *
 * # Problem
 * Two independent execution paths can call the same read-only tool within
 * the same user turn:
 *   1. Host pre-dispatch via `engine.invokeReadTool()` (deterministic — runs
 *      before the LLM ever sees the message; injects a synthetic
 *      `tool_use`+`tool_result` pair into the ledger so the card renders
 *      immediately and the LLM has the data).
 *   2. The LLM itself, mid-turn, emitting a `tool_use` block for the same
 *      tool (often because the prompt says "always call balance_check on
 *      direct read questions" and the model doesn't trust the synthetic
 *      pair).
 *
 * Both paths emit a `tool_result` SSE event, the host renders BOTH cards,
 * the user sees a duplicate. Coordinating these two paths via prompt rules
 * is probabilistic ("DO NOT re-call when you see a synthetic pair") and
 * has empirically shown ~30% miss rate — the LLM still re-calls anyway.
 *
 * # Fix
 * Idempotent intra-turn cache. Within one user turn:
 *   - Calling the same read-only tool with the same args twice returns the
 *     cached result on the second call.
 *   - The second call yields a `tool_result` event with `resultDeduped:true`
 *     so hosts can skip rendering a duplicate card while the LLM still gets
 *     the data it needs to satisfy its `tool_use` id.
 *
 * # Lifecycle
 *   - Cache lives on the `QueryEngine` instance.
 *   - Populated by `invokeReadTool` (host pre-dispatch) AND by the agent
 *     loop's tool-execution path (LLM-driven calls).
 *   - Cleared on `turn_complete` (clean slate for the next user turn).
 *   - Cleared whenever a WRITE tool executes successfully (writes mutate
 *     on-chain state, so any subsequent read in the same turn must re-fetch
 *     for freshness).
 *   - Cleared on errors / abort (defensive cleanup).
 *
 * # Why not just extend microcompact?
 * `microcompact` does CROSS-turn dedup, but explicitly excludes
 * `cacheable: false` tools (balance_check, health_check, savings_info,
 * transaction_history) so post-write refreshes always surface fresh data.
 * Within a single turn (pre-write), those same tools are perfectly
 * dedup-able — state can't change. This cache fills that exact gap.
 *
 * # Invariants
 *   - Read-only tools only. Write tools never enter the cache.
 *   - Errored results are NEVER cached (the next call should retry).
 *   - Cache key includes the full input, stably stringified — different
 *     filter args (e.g. `transaction_history({minUsd:5})` vs
 *     `transaction_history({})`) hit different cache entries.
 */
export class TurnReadCache {
  private readonly store = new Map<string, { result: unknown; sourceToolUseId: string }>();

  /**
   * Build the cache key for a (toolName, input) pair. Stable across object
   * key ordering so `{a:1,b:2}` and `{b:2,a:1}` map to the same entry.
   */
  static keyFor(toolName: string, input: unknown): string {
    return `${toolName}:${stableStringify(input)}`;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  get(key: string): { result: unknown; sourceToolUseId: string } | undefined {
    return this.store.get(key);
  }

  /**
   * Populate the cache. Caller is responsible for ensuring the result was
   * a successful read (no errors). Overwrites any prior entry for the same
   * key — the most recent successful read wins, which is correct under our
   * "writes invalidate the whole cache" invariant.
   */
  set(key: string, value: { result: unknown; sourceToolUseId: string }): void {
    this.store.set(key, value);
  }

  /**
   * Drop every entry. Called at turn end and after every successful write.
   * Cheap and intentional — the cache is small (a handful of entries per
   * turn at most) and clearing is the correct response to any state mutation.
   */
  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

/**
 * Stable JSON.stringify — sorts object keys recursively so semantically
 * equal inputs produce equal cache keys. Mirrors the helper in
 * `compact/microcompact.ts` so dedup keys agree across both layers.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return JSON.stringify(value.map(stableStringifyForObject));
  return stableStringifyForObject(value);
}

function stableStringifyForObject(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringifyForObject).join(',')}]`;
  }
  const sorted = Object.keys(value as Record<string, unknown>).sort();
  const parts = sorted.map(
    (k) => `${JSON.stringify(k)}:${stableStringifyForObject((value as Record<string, unknown>)[k])}`,
  );
  return `{${parts.join(',')}}`;
}
