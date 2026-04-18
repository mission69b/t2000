#[allow(unused_const)]
module t2000::errors;

public(package) macro fun paused(): u64 { 1 }
public(package) macro fun zero_amount(): u64 { 2 }
public(package) macro fun invalid_operation(): u64 { 3 }
public(package) macro fun fee_rate_too_high(): u64 { 4 }
public(package) macro fun insufficient_treasury(): u64 { 5 }
public(package) macro fun not_authorized(): u64 { 6 }
public(package) macro fun version_mismatch(): u64 { 7 }
public(package) macro fun timelock_active(): u64 { 8 }
public(package) macro fun no_pending_change(): u64 { 9 }
public(package) macro fun already_migrated(): u64 { 10 }
public(package) macro fun not_owner(): u64 { 11 }

// NOTE: error codes 12–17 (insufficient_allowance, invalid_feature,
// feature_not_permitted, allowance_expired, daily_limit_exceeded,
// invalid_expires_at) were used by the deleted allowance module. The
// `Allowance` Move type still exists on-chain at the published package,
// so these codes remain reserved — do not reuse them for new errors.

const EPaused: u64 = 1;
const EZeroAmount: u64 = 2;
const EInvalidOperation: u64 = 3;
const EFeeRateTooHigh: u64 = 4;
const EInsufficientTreasury: u64 = 5;
const ENotAuthorized: u64 = 6;
const EVersionMismatch: u64 = 7;
const ETimelockActive: u64 = 8;
const ENoPendingChange: u64 = 9;
const EAlreadyMigrated: u64 = 10;
const ENotOwner: u64 = 11;
