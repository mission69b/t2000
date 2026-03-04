module t2000::admin;

use sui::clock::Clock;
use t2000::core::{Config, AdminCap};
use t2000::constants;
use t2000::events;

public fun pause(_: &AdminCap, config: &mut Config, ctx: &mut TxContext) {
    t2000::core::assert_version(config);
    t2000::core::set_paused(config, true);
    events::emit_protocol_paused(ctx.sender());
}

public fun unpause(_: &AdminCap, config: &mut Config, ctx: &mut TxContext) {
    t2000::core::assert_version(config);
    t2000::core::set_paused(config, false);
    events::emit_protocol_unpaused(ctx.sender());
}

public fun propose_fee_change(
    _: &AdminCap,
    config: &mut Config,
    save_bps: u64,
    swap_bps: u64,
    borrow_bps: u64,
    clock: &Clock,
    _ctx: &mut TxContext,
) {
    t2000::core::assert_version(config);

    assert!(save_bps <= constants::MAX_FEE_BPS!(), t2000::errors::fee_rate_too_high!());
    assert!(swap_bps <= constants::MAX_FEE_BPS!(), t2000::errors::fee_rate_too_high!());
    assert!(borrow_bps <= constants::MAX_FEE_BPS!(), t2000::errors::fee_rate_too_high!());

    let effective_at = sui::clock::timestamp_ms(clock) + constants::FEE_TIMELOCK_MS!();

    t2000::core::set_pending_fees(config, save_bps, swap_bps, borrow_bps, effective_at);
    events::emit_fee_change_proposed(save_bps, swap_bps, borrow_bps, effective_at);
}

public fun execute_fee_change(
    _: &AdminCap,
    config: &mut Config,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    t2000::core::assert_version(config);

    let effective_at = t2000::core::fee_change_effective_at(config);
    assert!(effective_at.is_some(), t2000::errors::no_pending_change!());
    assert!(sui::clock::timestamp_ms(clock) >= *effective_at.borrow(), t2000::errors::timelock_active!());

    let old_save = t2000::core::fee_rate(config, constants::OP_SAVE!());
    let old_swap = t2000::core::fee_rate(config, constants::OP_SWAP!());
    let old_borrow = t2000::core::fee_rate(config, constants::OP_BORROW!());

    let new_save = *t2000::core::pending_save_fee_bps(config).borrow();
    let new_swap = *t2000::core::pending_swap_fee_bps(config).borrow();
    let new_borrow = *t2000::core::pending_borrow_fee_bps(config).borrow();

    t2000::core::set_save_fee_bps(config, new_save);
    t2000::core::set_swap_fee_bps(config, new_swap);
    t2000::core::set_borrow_fee_bps(config, new_borrow);
    t2000::core::clear_pending_fees(config);

    events::emit_config_updated(b"save_fee_bps", old_save, new_save, ctx.sender());
    events::emit_config_updated(b"swap_fee_bps", old_swap, new_swap, ctx.sender());
    events::emit_config_updated(b"borrow_fee_bps", old_borrow, new_borrow, ctx.sender());
}

public fun cancel_fee_change(
    _: &AdminCap,
    config: &mut Config,
    _ctx: &mut TxContext,
) {
    t2000::core::assert_version(config);
    assert!(t2000::core::fee_change_effective_at(config).is_some(), t2000::errors::no_pending_change!());
    t2000::core::clear_pending_fees(config);
}

/// Bump protocol version for package upgrades.
/// Call after publishing a new package version to activate new code
/// and disable old package calls.
public fun migrate_config(
    _: &AdminCap,
    config: &mut Config,
) {
    assert!(t2000::core::version(config) < constants::VERSION!(), t2000::errors::already_migrated!());
    t2000::core::set_version(config, constants::VERSION!());
}
