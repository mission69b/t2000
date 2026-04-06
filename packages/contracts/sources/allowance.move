module t2000::allowance;

use sui::coin::{Self, Coin};
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use t2000::constants;
use t2000::errors;
use t2000::events;
use t2000::core::{Self, Config, AdminCap};

/// Per-user USDC allowance escrow with on-chain scoping.
/// The owner deposits USDC and configures which features the admin may
/// deduct for, an optional expiry, and a daily spend limit.
/// The admin (ECS cron) deducts micro-amounts within those bounds.
/// The owner can withdraw the remaining balance or update scope at any time.
public struct Allowance<phantom T> has key {
    id: UID,
    owner: address,
    balance: Balance<T>,
    total_deposited: u64,
    total_spent: u64,
    created_at: u64,
    permitted_features: u64,
    expires_at: u64,
    daily_limit: u64,
    daily_spent: u64,
    window_start: u64,
}

/// Create a new shared Allowance for the caller with scoping parameters.
public fun create<T>(
    permitted_features: u64,
    expires_at: u64,
    daily_limit: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now = sui::clock::timestamp_ms(clock);
    if (expires_at > 0) {
        assert!(expires_at > now, errors::invalid_expires_at!());
    };

    let allowance = Allowance<T> {
        id: object::new(ctx),
        owner: ctx.sender(),
        balance: balance::zero<T>(),
        total_deposited: 0,
        total_spent: 0,
        created_at: now,
        permitted_features,
        expires_at,
        daily_limit,
        daily_spent: 0,
        window_start: now,
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
/// Enforces on-chain: feature permission, expiry, daily limit.
#[allow(lint(self_transfer))]
public fun deduct<T>(
    allowance: &mut Allowance<T>,
    config: &Config,
    _: &AdminCap,
    amount: u64,
    feature: u8,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    core::assert_version(config);
    assert!(!core::is_paused(config), errors::paused!());
    assert!(amount > 0, errors::zero_amount!());
    assert!(feature <= constants::MAX_FEATURE!(), errors::invalid_feature!());

    let now = sui::clock::timestamp_ms(clock);

    // Guard 1 — expiry
    if (allowance.expires_at > 0) {
        assert!(now < allowance.expires_at, errors::allowance_expired!());
    };

    // Guard 2 — feature bitmask
    let feature_bit = 1u64 << (feature as u8);
    assert!(
        allowance.permitted_features & feature_bit != 0,
        errors::feature_not_permitted!(),
    );

    // Guard 3 — daily limit with rolling 24h window
    if (allowance.daily_limit > 0) {
        if (now >= allowance.window_start + constants::WINDOW_MS!()) {
            allowance.daily_spent = 0;
            allowance.window_start = now;
        };
        assert!(
            allowance.daily_spent + amount <= allowance.daily_limit,
            errors::daily_limit_exceeded!(),
        );
        allowance.daily_spent = allowance.daily_spent + amount;
    };

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

/// Owner updates the scoping parameters on their allowance.
public fun update_scope<T>(
    allowance: &mut Allowance<T>,
    permitted_features: u64,
    expires_at: u64,
    daily_limit: u64,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(allowance.owner == ctx.sender(), errors::not_owner!());

    let now = sui::clock::timestamp_ms(clock);
    if (expires_at > 0) {
        assert!(expires_at > now, errors::invalid_expires_at!());
    };

    allowance.permitted_features = permitted_features;
    allowance.expires_at = expires_at;

    if (allowance.daily_limit != daily_limit) {
        allowance.daily_limit = daily_limit;
        allowance.daily_spent = 0;
        allowance.window_start = now;
    };

    events::emit_allowance_scope_updated(
        allowance.owner,
        permitted_features,
        expires_at,
        daily_limit,
    );
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

public fun permitted_features<T>(allowance: &Allowance<T>): u64 {
    allowance.permitted_features
}

public fun expires_at<T>(allowance: &Allowance<T>): u64 {
    allowance.expires_at
}

public fun daily_limit<T>(allowance: &Allowance<T>): u64 {
    allowance.daily_limit
}

public fun daily_spent<T>(allowance: &Allowance<T>): u64 {
    allowance.daily_spent
}

public fun is_feature_permitted<T>(allowance: &Allowance<T>, feature: u8): bool {
    let feature_bit = 1u64 << (feature as u8);
    allowance.permitted_features & feature_bit != 0
}

public fun is_expired<T>(allowance: &Allowance<T>, clock: &Clock): bool {
    if (allowance.expires_at == 0) { return false };
    sui::clock::timestamp_ms(clock) >= allowance.expires_at
}
