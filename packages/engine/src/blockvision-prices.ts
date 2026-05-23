// ---------------------------------------------------------------------------
// [SPEC PIPELINE-AUDIT-PHASE-2 S1 / 2026-05-23] BACK-COMPAT SHIM.
//
// This file used to be a 2009-LoC monolith doing 7+ jobs (BV retry layer +
// circuit breaker + wallet portfolio + token prices + DeFi aggregator +
// per-protocol fetcher + generic walker + bespoke normalisers + cache-clear
// helpers). PHASE-2 S1 split it into focused files under `./blockvision/`
// with public API preserved by this re-export shim — every existing import
// path (`import { fetchTokenPrices } from '../blockvision-prices.js'`,
// `import { ... } from '@t2000/engine'`, test fixtures, etc.) keeps working
// unchanged.
//
// New code SHOULD import from the namespace directory (e.g.
// `import { fetchTokenPrices } from './blockvision/prices.js'`) but the
// shim is kept indefinitely so a follow-up internal-import cleanup can
// stage migration at its own pace without urgency.
//
// See `packages/engine/src/blockvision/index.ts` for the layout map.
// ---------------------------------------------------------------------------

export * from './blockvision/index.js';
