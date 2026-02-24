module t2000::core;

use t2000::constants;

public struct CORE has drop {}

public struct Config has key {
    id: UID,
    version: u64,
    save_fee_bps: u64,
    swap_fee_bps: u64,
    borrow_fee_bps: u64,
    paused: bool,
    pending_save_fee_bps: option::Option<u64>,
    pending_swap_fee_bps: option::Option<u64>,
    pending_borrow_fee_bps: option::Option<u64>,
    fee_change_effective_at: option::Option<u64>,
}

public struct AdminCap has key, store {
    id: UID,
    created_at: u64,
}

fun init(_otw: CORE, ctx: &mut TxContext) {
    let config = Config {
        id: object::new(ctx),
        version: constants::VERSION!(),
        save_fee_bps: constants::DEFAULT_SAVE_FEE_BPS!(),
        swap_fee_bps: constants::DEFAULT_SWAP_FEE_BPS!(),
        borrow_fee_bps: constants::DEFAULT_BORROW_FEE_BPS!(),
        paused: false,
        pending_save_fee_bps: option::none(),
        pending_swap_fee_bps: option::none(),
        pending_borrow_fee_bps: option::none(),
        fee_change_effective_at: option::none(),
    };
    transfer::share_object(config);

    let admin_cap = AdminCap {
        id: object::new(ctx),
        created_at: 0,
    };
    transfer::transfer(admin_cap, ctx.sender());
}

public fun fee_rate(config: &Config, operation: u8): u64 {
    if (operation == constants::OP_SAVE!()) { config.save_fee_bps }
    else if (operation == constants::OP_SWAP!()) { config.swap_fee_bps }
    else if (operation == constants::OP_BORROW!()) { config.borrow_fee_bps }
    else { 0 }
}

public fun is_paused(config: &Config): bool {
    config.paused
}

public fun version(config: &Config): u64 {
    config.version
}

public(package) fun set_paused(config: &mut Config, paused: bool) {
    config.paused = paused;
}

public(package) fun set_save_fee_bps(config: &mut Config, bps: u64) {
    config.save_fee_bps = bps;
}

public(package) fun set_swap_fee_bps(config: &mut Config, bps: u64) {
    config.swap_fee_bps = bps;
}

public(package) fun set_borrow_fee_bps(config: &mut Config, bps: u64) {
    config.borrow_fee_bps = bps;
}

public(package) fun set_pending_fees(
    config: &mut Config,
    save_bps: u64,
    swap_bps: u64,
    borrow_bps: u64,
    effective_at: u64,
) {
    config.pending_save_fee_bps = option::some(save_bps);
    config.pending_swap_fee_bps = option::some(swap_bps);
    config.pending_borrow_fee_bps = option::some(borrow_bps);
    config.fee_change_effective_at = option::some(effective_at);
}

public(package) fun clear_pending_fees(config: &mut Config) {
    config.pending_save_fee_bps = option::none();
    config.pending_swap_fee_bps = option::none();
    config.pending_borrow_fee_bps = option::none();
    config.fee_change_effective_at = option::none();
}

public(package) fun pending_save_fee_bps(config: &Config): option::Option<u64> {
    config.pending_save_fee_bps
}

public(package) fun pending_swap_fee_bps(config: &Config): option::Option<u64> {
    config.pending_swap_fee_bps
}

public(package) fun pending_borrow_fee_bps(config: &Config): option::Option<u64> {
    config.pending_borrow_fee_bps
}

public(package) fun fee_change_effective_at(config: &Config): option::Option<u64> {
    config.fee_change_effective_at
}

public(package) fun assert_version(config: &Config) {
    assert!(config.version == constants::VERSION!(), t2000::errors::version_mismatch!());
}

public(package) fun set_version(config: &mut Config, new_version: u64) {
    config.version = new_version;
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(CORE {}, ctx);
}
