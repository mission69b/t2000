/// Agent Capital — the treasury vesting lock (founder decision 2026-07-25,
/// closing the S.810 Virtuals-gap item: an unlocked day-one treasury half is
/// the one trust signal their flow had that ours lacked).
///
/// The 50% treasury allocation vests LINEARLY over 6 months into the agent's
/// wallet. Same design grammar as `lp_lock`:
///
///   1. **Principal locked.** The unvested balance lives inside the shared
///      object; nothing can move it faster than the schedule.
///   2. **Destination fixed.** `claim` is a permissionless crank with no
///      recipient parameter — vested funds go to the `agent` address set at
///      lock time, whoever calls (the daily keeper can include it).
///   3. **No admin.** No pause, no revoke, no acceleration. The schedule is
///      the whole contract.
module agent_capital::vesting;

use sui::balance::Balance;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

/// 6 months of 30 days, in ms — the locked v1 vesting duration.
const SIX_MONTHS_MS: u64 = 15_552_000_000;

// === Objects ===

public struct VestingLock<phantom T> has key {
    id: UID,
    agent: address,
    balance: Balance<T>,
    /// Total locked at creation — the linear schedule's numerator base.
    total: u64,
    /// Already claimed to the agent.
    released: u64,
    start_ms: u64,
    duration_ms: u64,
}

// === Events (consumed by the indexer → token page vesting card) ===

public struct TreasuryVested has copy, drop {
    lock_id: ID,
    agent: address,
    total: u64,
    start_ms: u64,
    duration_ms: u64,
}

public struct TreasuryClaimed has copy, drop {
    lock_id: ID,
    agent: address,
    amount: u64,
    released_total: u64,
    timestamp_ms: u64,
}

// === Lock ===

/// Wrap `treasury` in a 6-month linear vest for `agent`, share it, return
/// the lock's ID so the launch PTB can log/record it.
public fun lock<T>(
    treasury: Coin<T>,
    agent: address,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    let now = clock.timestamp_ms();
    let total = treasury.value();
    let lock = VestingLock<T> {
        id: object::new(ctx),
        agent,
        balance: treasury.into_balance(),
        total,
        released: 0,
        start_ms: now,
        duration_ms: SIX_MONTHS_MS,
    };
    let lock_id = object::id(&lock);
    event::emit(TreasuryVested {
        lock_id,
        agent,
        total,
        start_ms: now,
        duration_ms: SIX_MONTHS_MS,
    });
    transfer::share_object(lock);
    lock_id
}

// === Claim (permissionless; proceeds forced to the agent) ===

/// Transfer everything vested-but-unclaimed to the agent wallet. A NO-OP
/// when nothing new has vested — never aborts, so the daily keeper can batch
/// claims for every token in one PTB without one empty claim killing it.
public fun claim<T>(lock: &mut VestingLock<T>, clock: &Clock, ctx: &mut TxContext) {
    let vested = vested_amount(lock, clock.timestamp_ms());
    if (vested <= lock.released) {
        return
    };
    let amount = vested - lock.released;
    lock.released = vested;
    let payout = coin::from_balance(lock.balance.split(amount), ctx);
    transfer::public_transfer(payout, lock.agent);
    event::emit(TreasuryClaimed {
        lock_id: object::id(lock),
        agent: lock.agent,
        amount,
        released_total: lock.released,
        timestamp_ms: clock.timestamp_ms(),
    });
}

/// Linear vesting: total * elapsed / duration, capped at total.
public fun vested_amount<T>(lock: &VestingLock<T>, now_ms: u64): u64 {
    if (now_ms <= lock.start_ms) {
        return 0
    };
    let elapsed = now_ms - lock.start_ms;
    if (elapsed >= lock.duration_ms) {
        return lock.total
    };
    (((lock.total as u128) * (elapsed as u128) / (lock.duration_ms as u128)) as u64)
}

// === Read accessors ===

public fun agent<T>(lock: &VestingLock<T>): address { lock.agent }
public fun total<T>(lock: &VestingLock<T>): u64 { lock.total }
public fun released<T>(lock: &VestingLock<T>): u64 { lock.released }
public fun start_ms<T>(lock: &VestingLock<T>): u64 { lock.start_ms }
public fun duration_ms<T>(lock: &VestingLock<T>): u64 { lock.duration_ms }
