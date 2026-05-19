/**
 * `@t2000/engine/presets` — client-safe subpath export.
 *
 * Re-exports the pure-data permission constants + types from
 * `permission-rules.ts` without dragging in any Node-only engine
 * internals (memwal adapters, fs-backed cache stores, agent loop,
 * etc.). Lets browser code (audric/web-v2 `safety-section.tsx`) read
 * the canonical preset thresholds without bundling the whole engine.
 *
 * Why a subpath export rather than direct import from
 * `@t2000/engine`: the main entrypoint's barrel transitively pulls
 * in Node-only modules (`@mysten-incubation/memwal` devDep, fs-backed
 * stream checkpoint store, etc.) that can't tree-shake out cleanly
 * in browser bundlers. The subpath export is the documented
 * convention for "give me ONLY this slice."
 *
 * Adding new exports here: only types + `as const` data. No functions
 * (functions go through the main entrypoint or a sibling subpath).
 * No imports from `./agent-loop`, `./guards`, `./cache/*`,
 * `./blockvision-prices`, or anything that pulls Node deps.
 */

export {
  DEFAULT_PERMISSION_CONFIG,
  PERMISSION_PRESETS,
} from './permission-rules.js';

export type {
  PermissionOperation,
  PermissionRule,
  UserPermissionConfig,
} from './permission-rules.js';
