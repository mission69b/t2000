// ---------------------------------------------------------------------------
// SPEC 9 v0.1.3 P9.4 — pending_input form schema
//
// When a tool's preflight returns `needsInput`, the engine yields a
// `pending_input` event carrying a typed form schema instead of a free-text
// "tool input invalid" reply to the LLM. The host renders the form inline
// in the timeline; the user fills it in; the host POSTs the values to a
// resume endpoint; the engine resumes the turn with the validated values
// as the tool's input.
//
// The pattern parallels `pending_action` (SPEC 7) — where the engine pauses
// for USER CONFIRMATION on a write — except here it pauses for STRUCTURED
// INPUT before the tool can run at all. Both surfaces yield a discrete
// EngineEvent and store paused state on the QueryEngine instance.
//
// ## Field kinds (closed list)
//
// `text`           — free-form string. Matches default HTML <input type="text">.
// `sui-recipient`  — polymorphic identifier accepting an Audric handle
//                    (`@alice` / `alice.audric.sui`), an external SuiNS name
//                    (`alex.sui`), or a bare 0x address. Resolved server-side
//                    via `normalizeAddressInput` (sui-address.ts) at the host's
//                    resume endpoint, BEFORE calling `resumeWithInput()`.
//                    Renamed from `address` in v0.1.3 R6 because the field
//                    accepts handles + names + addresses, not just addresses.
// `number`         — numeric input. Host enforces parseFloat + min/max.
// `usd`            — numeric input formatted as USD ($1,234.56). Host renders
//                    a $ prefix and 2dp formatter; engine receives the raw
//                    number.
// `select`         — closed-set choice. Host renders a <select>; engine
//                    receives one of `options[].value`.
// `date`           — ISO-8601 date string (YYYY-MM-DD). Host renders a date
//                    picker; engine receives the string.
//
// New kinds get added by extending the union here + teaching the host
// renderer + bumping the engine MINOR version (new EngineEvent surface
// member is non-breaking for hosts that already render unknown kinds as
// free-text fall-through, but the canonical contract requires a typed
// renderer for every kind).
//
// ## Why a closed list (vs. arbitrary JSON Schema)
//
// JSON Schema is too expressive — it lets a tool author specify a regex
// constraint that the host renderer can't enforce, or a nested object that
// requires multi-step validation. A closed kind list keeps the host
// renderer simple: one component per kind, no eval-style coercion, no
// silent drift between server-side validation and client-side rendering.
// SPEC 10's username picker reuses the same primitive; the surface stays
// consistent.
//
// ## Cross-references
//
// - SPEC 9 § A.2 (full design rationale)
// - `add_recipient` tool — the first consumer
// - `engine.resumeWithInput()` — the resume entry point
// - `audric/apps/web/app/api/engine/resume-with-input/route.ts` — host endpoint
// ---------------------------------------------------------------------------

/**
 * Discriminator for the typed form-field kinds the host renderer supports.
 * Closed list — adding a new kind requires a coordinated host-renderer +
 * engine MINOR version bump.
 */
export type FormFieldKind =
  | 'text'
  | 'sui-recipient'
  | 'number'
  | 'usd'
  | 'select'
  | 'date';

/**
 * One row in a `pending_input` form. The host renderer keys on `kind` to
 * pick the right input component.
 */
export interface FormField {
  /** Input key on the resumed-tool input object (e.g. `name`, `identifier`). */
  name: string;
  /** User-facing label rendered above the input. */
  label: string;
  /** Renderer discriminator — see `FormFieldKind` for the closed list. */
  kind: FormFieldKind;
  /** When true, the host blocks submit while the value is empty/null. */
  required: boolean;
  /** Optional grey-text guidance shown inside the empty input. */
  placeholder?: string;
  /** Optional help text rendered below the input (small font). */
  helpText?: string;
  /**
   * Required for `kind: 'select'` — closed-set choices the user can pick.
   * `value` is what gets sent back; `label` is what's rendered.
   * Omitted (or empty) for non-select kinds — the host renderer ignores it.
   */
  options?: Array<{ value: string; label: string }>;
}

/**
 * Top-level form payload carried on `pending_input`.
 */
export interface FormSchema {
  /** Ordered list of fields the form renders top-to-bottom. */
  fields: FormField[];
}

/**
 * Engine-side state for a paused tool call awaiting user input. Stored on
 * the QueryEngine instance keyed by `inputId` so the resume entry point
 * can look up which tool to feed the values back into.
 *
 * Mirrors the (private) book-keeping the engine does for `pending_action`,
 * but for the input-collection pause case rather than the user-confirm case.
 *
 * Identical shape to `PendingInput` (the wire payload) — alias kept for
 * symmetry with `PendingAction` / "ActionState" naming elsewhere.
 */
export type PendingInputState = PendingInput;

/**
 * Wire + state payload for a paused tool call awaiting user input.
 *
 * Carries BOTH the form-rendering fields (`inputId`, `schema`, etc) AND
 * the conversation round-trip fields (`assistantContent`, `completedResults`)
 * that the engine needs to atomically reconstruct the turn on resume.
 *
 * Hosts that store sessions across HTTP requests (e.g. audric) MUST
 * persist the entire `PendingInput` payload — not just `inputId` — and
 * pass it back as the first argument to `engine.resumeWithInput()`.
 * Pattern mirrors `PendingAction.assistantContent` / `.completedResults`
 * round-trip exactly.
 *
 * Why include the round-trip fields on the same payload:
 * - Host's session schema only adds ONE new column for `pendingInput`
 *   (instead of two: one for the wire fields + one for round-trip state).
 * - The engine API surface stays small — `resumeWithInput(pendingInput, values)`.
 * - Audric's existing pattern for `pendingAction` is the same shape, so
 *   the reviewer can pattern-match.
 *
 * The host renderer ignores `assistantContent` / `completedResults` —
 * they're opaque to the form UI. Only the engine reads them on resume.
 */
export interface PendingInput {
  /** UUID v4 stamped per-emit. Host posts back keyed on this. */
  inputId: string;
  /** Tool that requested the input. Useful for host debug logs / fallback caption. */
  toolName: string;
  /** Original `tool_use_id` from the LLM's call — the resumed tool_result block uses this id. */
  toolUseId: string;
  /** Typed form schema — host renderer keys on `field.kind` per row. */
  schema: FormSchema;
  /** Optional human-readable description rendered above the form (e.g. "Add a new contact"). */
  description?: string;
  /**
   * Assistant message blocks captured at pause time — the LLM's
   * `tool_use` blocks (including the one that triggered this pause) plus
   * any thinking / text blocks from the same turn. Pushed back to
   * `messages` atomically on `resumeWithInput` so the conversation stays
   * well-formed (no orphan tool_use blocks in the persisted history).
   *
   * Typed as `unknown[]` here to avoid pulling `ContentBlock` into
   * `pending-input.ts` and creating a type-import cycle through `types.ts`.
   * The engine casts to `ContentBlock[]` on resume; hosts treat as opaque.
   */
  assistantContent: unknown[];
  /**
   * Tool results from reads that completed BEFORE the paused tool call
   * (same turn). On resume the engine merges these with the resumed
   * tool's result into ONE `user`-role message — keeps Anthropic's
   * "every tool_use must have a tool_result in the next user message"
   * invariant satisfied.
   */
  completedResults: Array<{
    toolUseId: string;
    content: string;
    isError: boolean;
  }>;
}
