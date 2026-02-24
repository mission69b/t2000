module t2000::treasury;

use sui::coin::{Self, Coin};
use sui::balance::{Self, Balance};
use t2000::constants;
use t2000::errors;
use t2000::events;
use t2000::core::Config;

public struct Treasury<phantom T> has key {
    id: UID,
    version: u64,
    admin: address,
    pending_admin: option::Option<address>,
    balance: Balance<T>,
    total_collected: u64,
    total_withdrawn: u64,
    created_at: u64,
}

public fun create_treasury<T>(clock: &sui::clock::Clock, ctx: &mut TxContext) {
    let treasury = Treasury<T> {
        id: object::new(ctx),
        version: constants::VERSION!(),
        admin: ctx.sender(),
        pending_admin: option::none(),
        balance: balance::zero<T>(),
        total_collected: 0,
        total_withdrawn: 0,
        created_at: sui::clock::timestamp_ms(clock),
    };
    transfer::share_object(treasury);
}

fun assert_version<T>(treasury: &Treasury<T>) {
    assert!(treasury.version == constants::VERSION!(), errors::version_mismatch!());
}

public fun collect_fee<T>(
    treasury: &mut Treasury<T>,
    config: &Config,
    payment: &mut Coin<T>,
    operation: u8,
    ctx: &mut TxContext,
): u64 {
    assert_version(treasury);
    t2000::core::assert_version(config);
    assert!(!t2000::core::is_paused(config), errors::paused!());

    let fee_bps = t2000::core::fee_rate(config, operation);
    assert!(operation <= constants::OP_BORROW!(), errors::invalid_operation!());

    let payment_value = coin::value(payment);
    assert!(payment_value > 0, errors::zero_amount!());

    let fee_amount = (payment_value as u128) * (fee_bps as u128) / (constants::BPS_DENOMINATOR!() as u128);
    let fee_amount = (fee_amount as u64);

    if (fee_amount > 0) {
        let fee_balance = coin::balance_mut(payment).split(fee_amount);
        treasury.balance.join(fee_balance);
        treasury.total_collected = treasury.total_collected + fee_amount;

        events::emit_fee_collected(ctx.sender(), operation, fee_amount, payment_value);
    };

    fee_amount
}

public fun total_collected<T>(treasury: &Treasury<T>): u64 {
    treasury.total_collected
}

public fun treasury_balance<T>(treasury: &Treasury<T>): u64 {
    treasury.balance.value()
}

public fun admin<T>(treasury: &Treasury<T>): address {
    treasury.admin
}

#[allow(lint(self_transfer))]
public fun withdraw_fees<T>(
    treasury: &mut Treasury<T>,
    amount: u64,
    ctx: &mut TxContext,
) {
    assert_version(treasury);
    assert!(treasury.admin == ctx.sender(), errors::not_authorized!());
    assert!(treasury.balance.value() >= amount, errors::insufficient_treasury!());

    let withdrawn = coin::from_balance(treasury.balance.split(amount), ctx);
    treasury.total_withdrawn = treasury.total_withdrawn + amount;

    events::emit_fees_withdrawn(amount, ctx.sender(), treasury.total_withdrawn);
    transfer::public_transfer(withdrawn, ctx.sender());
}

public fun propose_admin_transfer<T>(
    treasury: &mut Treasury<T>,
    new_admin: address,
    ctx: &mut TxContext,
) {
    assert_version(treasury);
    assert!(treasury.admin == ctx.sender(), errors::not_authorized!());

    treasury.pending_admin = option::some(new_admin);
    events::emit_admin_transfer_proposed(ctx.sender(), new_admin);
}

public fun accept_admin_transfer<T>(
    treasury: &mut Treasury<T>,
    ctx: &mut TxContext,
) {
    assert_version(treasury);
    assert!(treasury.pending_admin.is_some(), errors::no_pending_change!());
    assert!(*treasury.pending_admin.borrow() == ctx.sender(), errors::not_authorized!());

    let old_admin = treasury.admin;
    treasury.admin = ctx.sender();
    treasury.pending_admin = option::none();

    events::emit_admin_transfer_accepted(old_admin, ctx.sender());
}

public fun migrate_treasury<T>(
    treasury: &mut Treasury<T>,
    ctx: &mut TxContext,
) {
    assert!(treasury.admin == ctx.sender(), errors::not_authorized!());
    treasury.version = constants::VERSION!();
}
