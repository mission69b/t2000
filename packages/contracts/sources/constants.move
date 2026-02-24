module t2000::constants;

public macro fun VERSION(): u64 { 1 }

public macro fun OP_SAVE(): u8 { 0 }
public macro fun OP_SWAP(): u8 { 1 }
public macro fun OP_BORROW(): u8 { 2 }

public macro fun BPS_DENOMINATOR(): u64 { 10_000 }
public macro fun MAX_FEE_BPS(): u64 { 500 } // 5% hard cap

public macro fun DEFAULT_SAVE_FEE_BPS(): u64 { 10 }   // 0.1%
public macro fun DEFAULT_SWAP_FEE_BPS(): u64 { 10 }   // 0.1%
public macro fun DEFAULT_BORROW_FEE_BPS(): u64 { 5 }  // 0.05%

public macro fun FEE_TIMELOCK_MS(): u64 { 604_800_000 } // 7 days
