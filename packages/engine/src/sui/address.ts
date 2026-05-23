// ---------------------------------------------------------------------------
// Sui address + SuiNS normalization — engine re-export shim.
//
// [S.279 / CLI-CONTACTS-CLEANUP — 2026-05-23] The canonical implementation
// lives in the SDK now (`@t2000/sdk` → `packages/sdk/src/utils/suins.ts`)
// so the CLI's `T2000.send()` can use the same primitive the engine's
// read tools already do. This file is a thin re-export so every existing
// engine import (`./sui/address.js`) keeps working unchanged.
//
// New engine code SHOULD import from `@t2000/sdk` directly — but the
// existing per-tool imports (`normalizeAddressInput` etc.) stay valid
// through this shim, and rewriting 11 callsites would be a "while I'm
// here" refactor that violates the surgical-changes discipline. The
// shim has zero runtime cost (ESM re-exports compile to direct references).
//
// See `.cursor/rules/single-source-of-truth.mdc` for the engineering
// standard this consolidation enforces.
// ---------------------------------------------------------------------------

export {
  SUI_ADDRESS_REGEX,
  SUI_ADDRESS_STRICT_REGEX,
  SUINS_NAME_REGEX,
  InvalidAddressError,
  SuinsNotRegisteredError,
  SuinsRpcError,
  looksLikeSuiNs,
  resolveSuinsViaRpc,
  resolveAddressToSuinsViaRpc,
  normalizeAddressInput,
} from '@t2000/sdk';
export type { NormalizedAddress } from '@t2000/sdk';
