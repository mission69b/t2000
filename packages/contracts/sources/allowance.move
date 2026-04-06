module t2000::allowance;

use sui::coin::{Self, Coin};
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use t2000::constants;
use t2000::errors;
use t2000::events;
use t2000::core::{Self, Config, AdminCap};

/// Per-user USDC allowance escrow. The owner deposits USDC once,
/// and the admin (ECS cron) deducts micro-amounts for enabled features.
/// The owner can withdraw the remaining balance at any time.
public struct Allowance<phantom T> has key {
    id: UID,
    owner: address,
    balance: Balance<T>,
    total_deposited: u64,
    total_spent: u64,
    created_at: u64,
}

/// Create a new empty allowance for the caller.
/// One per user — the object is owned by nobody (shared) so the
/// admin can call deduct() without the owner being online.
public fun create<T>(clock: &Clock, ctx: &mut TxContext) {
    let allowance = Allowance<T> {
        id: object::new(ctx),
        owner: ctx.sender(),
        balance: balance::zero<T>(),
        total_deposited: 0,
        total_spent: 0,
        created_at: sui::clock::timestamp_ms(clock),
    };
    let allowance_id = object::id(&allowance);
    events::emit_allowance_created(ctx.sender(), allowance_id);
    transfer::share_object(allowance);
}

/// Owner deposits coins into their allowance.
public fun deposit<T>(
    allowance: &mut Allowance<T>,
    payment: Coin<T>,
    ctx: &TxContext,
) {
    assert!(allowance.owner == ctx.sender(), errors::not_owner!());

    let amount = coin::value(&payment);
    assert!(amount > 0, errors::zero_amount!());

    allowance.balance.join(coin::into_balance(payment));
    allowance.total_deposited = allowance.total_deposited + amount;

    events::emit_allowance_deposited(
        allowance.owner,
        amount,
        allowance.balance.value(),
    );
}

/// Admin deposits coins into any user's allowance (e.g. $0.25 sponsorship).
public fun admin_deposit<T>(
    allowance: &mut Allowance<T>,
    _: &AdminCap,
    payment: Coin<T>,
) {
    let amount = coin::value(&payment);
    assert!(amount > 0, errors::zero_amount!());

    allowance.balance.join(coin::into_balance(payment));
    allowance.total_deposited = allowance.total_deposited + amount;

    events::emit_allowance_deposited(
        allowance.owner,
        amount,
        allowance.balance.value(),
    );
}

/// Admin deducts a micro-amount for a specific feature.
/// Only callable with AdminCap. Respects protocol version and pause flag.
/// Deducted USDC is sent to the admin (Audric treasury wallet) as revenue.
#[allow(lint(self_transfer))]
public fun deduct<T>(
    allowance: &mut Allowance<T>,
    config: &Config,
    _: &AdminCap,
    amount: u64,
    feature: u8,
    ctx: &mut TxContext,
) {
    core::assert_version(config);
    assert!(!core::is_paused(config), errors::paused!());
    assert!(amount > 0, errors::zero_amount!());
    assert!(feature <= constants::MAX_FEATURE!(), errors::invalid_feature!());
    assert!(allowance.balance.value() >= amount, errors::insufficient_allowance!());

    let deducted = coin::from_balance(allowance.balance.split(amount), ctx);
    allowance.total_spent = allowance.total_spent + amount;

    events::emit_allowance_deducted(
        allowance.owner,
        amount,
        feature,
        allowance.balance.value(),
    );

    transfer::public_transfer(deducted, ctx.sender());
}

/// Owner withdraws their entire remaining balance.
#[allow(lint(self_transfer))]
public fun withdraw<T>(
    allowance: &mut Allowance<T>,
    ctx: &mut TxContext,
) {
    assert!(allowance.owner == ctx.sender(), errors::not_owner!());

    let amount = allowance.balance.value();
    if (amount > 0) {
        let coin = coin::from_balance(allowance.balance.split(amount), ctx);
        events::emit_allowance_withdrawn(allowance.owner, amount);
        transfer::public_transfer(coin, ctx.sender());
    };
}

/// Owner withdraws a specific amount from their allowance.
#[allow(lint(self_transfer))]
public fun withdraw_amount<T>(
    allowance: &mut Allowance<T>,
    amount: u64,
    ctx: &mut TxContext,
) {
    assert!(allowance.owner == ctx.sender(), errors::not_owner!());
    assert!(amount > 0, errors::zero_amount!());
    assert!(allowance.balance.value() >= amount, errors::insufficient_allowance!());

    let coin = coin::from_balance(allowance.balance.split(amount), ctx);
    events::emit_allowance_withdrawn(allowance.owner, amount);
    transfer::public_transfer(coin, ctx.sender());
}

// --- Read functions ---

public fun balance<T>(allowance: &Allowance<T>): u64 {
    allowance.balance.value()
}

public fun owner<T>(allowance: &Allowance<T>): address {
    allowance.owner
}

public fun total_deposited<T>(allowance: &Allowance<T>): u64 {
    allowance.total_deposited
}

public fun total_spent<T>(allowance: &Allowance<T>): u64 {
    allowance.total_spent
}
