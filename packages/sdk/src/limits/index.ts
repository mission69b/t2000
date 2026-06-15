// Unified spending-limits gate — the single source of truth for CLI + MCP +
// programmatic write caps (R-0 Finding 1; closes the H5 "MCP writes ungated"
// gap). Node-only — not re-exported from `browser.ts`.

export {
  type LimitsConfig,
  type DailySpend,
  type LimitsFile,
  resolveConfigPath,
  todayUtc,
  readLimitsFile,
  writeLimitsFile,
  getLimits,
  hasLimits,
  setLimits,
  clearLimits,
  dailySpentToday,
  recordDailySpend,
} from './config.js';

export {
  approxUsdValue,
  assertLimitConfig,
  LimitEnforcer,
  type LimitAssertInput,
} from './enforce.js';

export { LimitExceededError, type LimitKind, type LimitOperation } from './errors.js';
