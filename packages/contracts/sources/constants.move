module t2000::constants;

public macro fun VERSION(): u64 { 1 }

public macro fun OP_SAVE(): u8 { 0 }
public macro fun OP_SWAP(): u8 { 1 }
public macro fun OP_BORROW(): u8 { 2 }

public macro fun BPS_DENOMINATOR(): u64 { 10_000 }
public macro fun MAX_FEE_BPS(): u64 { 500 } // 5% hard cap

public macro fun DEFAULT_SAVE_FEE_BPS(): u64 { 10 }   // 0.1%
public macro fun DEFAULT_SWAP_FEE_BPS(): u64 { 0 }    // 0% — Cetus already charges pool fees
public macro fun DEFAULT_BORROW_FEE_BPS(): u64 { 5 }  // 0.05%

public macro fun FEE_TIMELOCK_MS(): u64 { 604_800_000 } // 7 days

// Allowance feature tags (u8 position in u64 bitmask)
public macro fun FEATURE_BRIEFING(): u8 { 0 }
public macro fun FEATURE_YIELD_ALERT(): u8 { 1 }
public macro fun FEATURE_PAYMENT_ALERT(): u8 { 2 }
public macro fun FEATURE_ACTION_REMIND(): u8 { 3 }
public macro fun FEATURE_SESSION(): u8 { 4 }
public macro fun FEATURE_AUTO_COMPOUND(): u8 { 5 }
public macro fun FEATURE_DCA(): u8 { 6 }
public macro fun FEATURE_HF_ALERT(): u8 { 7 }

public macro fun MAX_FEATURE(): u8 { 63 }
public macro fun FEATURES_ALL(): u64 { 0xFF }
public macro fun WINDOW_MS(): u64 { 86_400_000 } // 24h in ms
