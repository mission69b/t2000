// ---------------------------------------------------------------------------
// v2/tool-policy.ts — engine-specific concerns relocated from buildTool
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2-4 (consolidated rewrite, 2026-05-15).
//
// The legacy `buildTool` factory bundles tool DEFINITION (name, schema,
// execute) with engine-specific POLICY (preflight, permissionLevel,
// cacheable, isReadOnly, isConcurrencySafe, maxResultSizeChars). The
// AI-SDK-native rewrite splits these:
//
//   - Tool DEFINITION lives in AI SDK `tool()` (description, inputSchema,
//     execute). That's the AI SDK's job — model-facing.
//   - Engine POLICY lives here, keyed by tool name. That's our job —
//     enforced by the engine before/after each tool call.
//
// Why a centralised map vs per-tool colocation:
//   - One file shows the entire risk surface at a glance (auditable for
//     safeguards-defense-in-depth.mdc compliance).
//   - Read tools default to safe values; explicit overrides only when
//     needed (e.g., `cacheable: false` for state-mutating reads).
//   - Engine glue (cache layer, dispatch loop, post-write refresh) reads
//     the map directly — no need to traverse tool definitions.
//
// What's GONE vs the legacy buildTool opts:
//   - `preflight`: removed. Replaced by `prepareStep` callbacks that
//     inspect the next-step tool call and inject a block message if the
//     input is invalid. Same defense-in-depth, different mechanism.
//   - `summarizeOnTruncate`: removed. AI SDK content blocks handle large
//     results via the model's native context window management; the
//     engine's `maxResultSizeChars` cap stays as a hard ceiling.
//
// What's KEPT:
//   - `isReadOnly` / `isConcurrencySafe`: drives the engine's per-step
//     parallel-tool-call dedupe (engine.ts ~L1145 — `isSafeToDedupTool`).
//     NOT a mutex — write-write serialisation in v2 comes from the AI SDK
//     step model + `needsApproval` round-trip: each write step yields a
//     pending_action that audric round-trips through user confirm before
//     the next step runs, so two writes structurally cannot interleave.
//     For sub-USD-threshold auto-execute writes (USD-aware resolver), the
//     LLM produces one tool_call per step in practice, and we rely on that
//     + the conservative-default preset to keep auto-writes serial in
//     production. Legacy `TxMutex` (orchestration.ts) is still exported
//     for back-compat but the v2 engine never instantiates one.
//   - `permissionLevel` (auto / confirm / explicit): drives the
//     `needsApproval` callback — same USD-aware permission resolver.
//   - `cacheable`: drives the engine's `cache/turn-read.ts` layer — kept
//     so balance/savings/health reads always re-fetch after writes.
//   - `maxResultSizeChars`: hard ceiling for tool results — kept so a
//     misbehaving tool can't blow out the model's context window.
// ---------------------------------------------------------------------------

import type { PermissionLevel } from '../types.js';

export interface ToolPolicy {
  /**
   * `true` for reads, `false` for writes. Writes serialise via the
   * engine's TxMutex so two writes can't interleave on the same wallet.
   */
  isReadOnly: boolean;

  /**
   * `true` if the tool can run in parallel with other reads of the same
   * tool. Defaults to `isReadOnly`. Set to `false` for read tools that
   * must serialise.
   */
  isConcurrencySafe?: boolean;

  /**
   * Static permission tier when the USD-aware resolver does NOT apply
   * (read tools, manual-only writes). Auto = no approval required.
   * Confirm = user taps to approve. Explicit = LLM cannot dispatch;
   * user must initiate manually.
   *
   * For write tools using USD-aware permissions, set `'confirm'` here
   * as the conservative default; the engine's `buildNeedsApproval()`
   * helper overrides per-call based on the resolver's verdict.
   */
  permissionLevel: PermissionLevel;

  /**
   * `false` for tools whose results depend on mutable on-chain state
   * (`balance_check`, `savings_info`, `health_check`). The cache layer
   * never dedupes these across turns — every call hits real state.
   * Defaults to `true`.
   */
  cacheable?: boolean;

  /**
   * Hard ceiling on the tool result string length. Results exceeding
   * this are truncated with a hint. Default 8,000 chars per the legacy
   * `buildTool` default. Set lower for tools that may return very
   * large blobs (e.g., portfolio snapshots).
   */
  maxResultSizeChars?: number;
}

// ---------------------------------------------------------------------------
// TOOL_POLICY — the central registry
// ---------------------------------------------------------------------------
//
// One row per tool. The engine looks up policy at dispatch time using
// the tool name from the AI SDK `tool-call` event. Tools NOT in the
// map default to the safe-read profile (read-only, auto, cacheable).
//
// New tools added by audric-side overrides (e.g., `audricSaveContactTool`)
// register their policy via `registerToolPolicy(name, policy)` at engine
// construction time so this base map stays t2000-engine-internal.
// ---------------------------------------------------------------------------

const READ_DEFAULT: ToolPolicy = {
  isReadOnly: true,
  permissionLevel: 'auto',
  cacheable: true,
};

const READ_MUTABLE: ToolPolicy = {
  isReadOnly: true,
  permissionLevel: 'auto',
  cacheable: false,
};

const WRITE_CONFIRM: ToolPolicy = {
  isReadOnly: false,
  permissionLevel: 'confirm',
  cacheable: false,
};

const WRITE_EXPLICIT: ToolPolicy = {
  isReadOnly: false,
  permissionLevel: 'explicit',
  cacheable: false,
};

export const TOOL_POLICY: Record<string, ToolPolicy> = {
  // Mutable reads (state changes after every write — never dedupe)
  balance_check: READ_MUTABLE,
  savings_info: READ_MUTABLE,
  health_check: READ_MUTABLE,
  portfolio_analysis: READ_MUTABLE,
  pending_rewards: READ_MUTABLE,

  // Read-only with non-mutable results (cacheable across turns)
  rates_info: READ_DEFAULT,
  swap_quote: { ...READ_DEFAULT, cacheable: false }, // quotes go stale
  transaction_history: READ_DEFAULT,
  explain_tx: READ_DEFAULT,
  token_prices: { ...READ_DEFAULT, cacheable: false }, // prices go stale
  spending_analytics: READ_DEFAULT,
  yield_summary: READ_DEFAULT,
  activity_summary: READ_DEFAULT,
  resolve_suins: READ_DEFAULT,
  render_canvas: READ_DEFAULT,
  list_payment_links: READ_DEFAULT,
  // [P4.1 audit / 2026-05-25] `create_payment_link` + `cancel_payment_link`
  // ARE auto-tier (no user tap — they create / cancel server-side rows,
  // not on-chain writes) but each call produces fresh state (new
  // payment-link URL on create, distinct row on cancel). We keep
  // `isReadOnly: true` per the legacy permission semantic ("no user tap
  // needed"), but explicitly override:
  //   - `cacheable: false` so microcompact never dedupes a second
  //     identical "create payment link for $10" — second call must produce
  //     a new URL. Same drift class as the S.122 `send_transfer` dedupe
  //     bug, just on a host-side write.
  //   - `isConcurrencySafe: false` so the engine's per-step dedup never
  //     collapses two parallel `create_payment_link` calls. Two parallel
  //     creates yield two URLs by design; deduping would lie to the user.
  // `flags.mutating: true` (set in `tool-flags.ts`) drives write-side
  // guard runs; the policy + flags work together for the full picture.
  create_payment_link: { ...READ_DEFAULT, cacheable: false, isConcurrencySafe: false },
  cancel_payment_link: { ...READ_DEFAULT, cacheable: false, isConcurrencySafe: false },

  // Write tools — confirm tier (USD resolver may downgrade to auto for small
  // amounts; engine's buildNeedsApproval handles the per-call override)
  save_deposit: WRITE_CONFIRM,
  withdraw: WRITE_CONFIRM,
  send_transfer: WRITE_CONFIRM,
  borrow: WRITE_CONFIRM, // always confirms — autoBelow=0 across every preset
  repay_debt: WRITE_CONFIRM,
  claim_rewards: WRITE_CONFIRM,
  harvest_rewards: WRITE_CONFIRM,
  swap_execute: WRITE_CONFIRM,

  // Explicit-only write tools (LLM never auto-dispatches; user must
  // initiate from a UI surface)
  // (none today — placeholder slot for future high-risk tools)
  _placeholder_explicit: WRITE_EXPLICIT,
};

// Hide the placeholder from public iteration.
delete TOOL_POLICY._placeholder_explicit;

/**
 * Look up policy for a tool by name. Returns the safe-read default for
 * tools not in the registry — caller MUST validate write tools are
 * registered or the engine will treat them as auto-tier reads (data
 * exfil risk).
 */
export function getToolPolicy(name: string): ToolPolicy {
  return TOOL_POLICY[name] ?? READ_DEFAULT;
}

/**
 * Register a new tool's policy at engine construction time. Used by
 * audric-side overrides (audricSaveContactTool, composePdfTool, etc.).
 */
export function registerToolPolicy(name: string, policy: ToolPolicy): void {
  TOOL_POLICY[name] = policy;
}
