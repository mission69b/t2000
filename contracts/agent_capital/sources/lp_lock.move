/// Agent Capital — the LP time-lock (SPEC_ACP_SUI §6, mechanism L2-A).
///
/// Holds the Cetus CLMM `Position` NFT for a fixed 10 years. The three
/// invariants, in order of importance:
///
///   1. **Principal locked.** The position cannot be withdrawn, transferred, or
///      have liquidity removed before `unlock_at_ms`. Nothing in this module
///      ever hands out the `Position` (not even by reference) — every Cetus
///      call happens inside this module, so `remove_liquidity` is unreachable.
///   2. **Fees only to the agent.** `collect_fee` / `collect_reward` are
///      permissionless cranks: anyone may trigger them, but the proceeds are
///      transferred to the `agent` address fixed at lock time. There is no
///      recipient parameter anywhere — never the platform, never a buyback.
///   3. **After unlock, principal to the agent.** `withdraw` is likewise
///      permissionless and likewise has no recipient parameter.
///
/// The lock is generic over the held object (`LpLock<T>`) so the timing and
/// destination logic is unit-testable with a dummy object — the Cetus interface
/// package is interface-only (every function `abort 0`), so a real `Position`
/// cannot exist in a test scenario. The Cetus-specific entry points are
/// constrained to `LpLock<Position>` and get their real exercise from mainnet
/// simulation + the dogfood launch.
///
/// A lock is a SHARED object: fee cranks must not require the launcher's
/// signature (the agent should keep earning even if its owner disappears).
module agent_capital::lp_lock;

use cetusclmm::config::GlobalConfig;
use cetusclmm::pool::{Self, Pool};
use cetusclmm::position::Position;
use cetusclmm::rewarder::RewarderGlobalVault;
use std::type_name::{Self, TypeName};
use sui::clock::Clock;
use sui::coin;
use sui::event;

/// 10 years of 365 days, in ms — the locked v1 duration (founder D-5 / L2-A).
const TEN_YEARS_MS: u64 = 315_360_000_000;

// === Errors ===
const ELockNotExpired: u64 = 0;

// === Objects ===

/// The lock. `agent` is the only address value in the module — every outflow
/// (fees, rewards, principal at unlock) goes there and nowhere else.
public struct LpLock<T: key + store> has key {
    id: UID,
    agent: address,
    position: T,
    locked_at_ms: u64,
    unlock_at_ms: u64,
}

// === Events (consumed by the indexer → fee-to-agent ledger) ===

public struct LpLocked has copy, drop {
    lock_id: ID,
    agent: address,
    position_id: ID,
    locked_at_ms: u64,
    unlock_at_ms: u64,
}

public struct FeesClaimed has copy, drop {
    lock_id: ID,
    agent: address,
    coin_type_a: TypeName,
    coin_type_b: TypeName,
    amount_a: u64,
    amount_b: u64,
    timestamp_ms: u64,
}

public struct RewardClaimed has copy, drop {
    lock_id: ID,
    agent: address,
    coin_type: TypeName,
    amount: u64,
    timestamp_ms: u64,
}

public struct LpWithdrawn has copy, drop {
    lock_id: ID,
    agent: address,
    position_id: ID,
    timestamp_ms: u64,
}

// === Lock ===

/// Wrap `position` in a 10-year lock whose sole beneficiary is `agent`, share
/// it, and return the lock's ID so the same PTB can pass it to
/// `registry::finalize`. The caller chooses `agent` — the orchestrator passes
/// the agent's wallet, and `registry::finalize` in the same transaction is what
/// binds this lock to the Agent ID record.
public fun lock<T: key + store>(
    position: T,
    agent: address,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    let now = clock.timestamp_ms();
    let lock = LpLock {
        id: object::new(ctx),
        agent,
        position,
        locked_at_ms: now,
        unlock_at_ms: now + TEN_YEARS_MS,
    };
    let lock_id = object::id(&lock);
    event::emit(LpLocked {
        lock_id,
        agent,
        position_id: object::id(&lock.position),
        locked_at_ms: now,
        unlock_at_ms: now + TEN_YEARS_MS,
    });
    transfer::share_object(lock);
    lock_id
}

// === Fee crank (permissionless; proceeds forced to the agent) ===

/// Collect accrued swap fees from the Cetus pool for the locked position and
/// transfer them to the agent wallet. Anyone may call; nobody can redirect.
public fun collect_fee<CoinTypeA, CoinTypeB>(
    lock: &LpLock<Position>,
    config: &GlobalConfig,
    clmm_pool: &mut Pool<CoinTypeA, CoinTypeB>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let (balance_a, balance_b) = pool::collect_fee(config, clmm_pool, &lock.position, true);
    let amount_a = balance_a.value();
    let amount_b = balance_b.value();
    send_or_destroy(coin::from_balance(balance_a, ctx), lock.agent);
    send_or_destroy(coin::from_balance(balance_b, ctx), lock.agent);
    event::emit(FeesClaimed {
        lock_id: object::id(lock),
        agent: lock.agent,
        coin_type_a: type_name::with_defining_ids<CoinTypeA>(),
        coin_type_b: type_name::with_defining_ids<CoinTypeB>(),
        amount_a,
        amount_b,
        timestamp_ms: clock.timestamp_ms(),
    });
}

/// Collect accrued incentive rewards (if the pool has a rewarder for
/// `CoinTypeC`) and transfer them to the agent wallet. Without this, any
/// rewards accrued to the position would strand for the full 10 years.
public fun collect_reward<CoinTypeA, CoinTypeB, CoinTypeC>(
    lock: &LpLock<Position>,
    config: &GlobalConfig,
    clmm_pool: &mut Pool<CoinTypeA, CoinTypeB>,
    vault: &mut RewarderGlobalVault,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let reward = pool::collect_reward<CoinTypeA, CoinTypeB, CoinTypeC>(
        config, clmm_pool, &lock.position, vault, true, clock,
    );
    let amount = reward.value();
    send_or_destroy(coin::from_balance(reward, ctx), lock.agent);
    event::emit(RewardClaimed {
        lock_id: object::id(lock),
        agent: lock.agent,
        coin_type: type_name::with_defining_ids<CoinTypeC>(),
        amount,
        timestamp_ms: clock.timestamp_ms(),
    });
}

// === Unlock (after 10 years) ===

/// Consume the lock and send the position to the agent wallet. Aborts before
/// `unlock_at_ms`. Permissionless — the destination is fixed, so there is
/// nothing a stranger can gain by calling it.
public fun withdraw<T: key + store>(lock: LpLock<T>, clock: &Clock) {
    let LpLock { id, agent, position, locked_at_ms: _, unlock_at_ms } = lock;
    assert!(clock.timestamp_ms() >= unlock_at_ms, ELockNotExpired);
    event::emit(LpWithdrawn {
        lock_id: id.to_inner(),
        agent,
        position_id: object::id(&position),
        timestamp_ms: clock.timestamp_ms(),
    });
    transfer::public_transfer(position, agent);
    id.delete();
}

// === Read accessors ===

public fun agent<T: key + store>(lock: &LpLock<T>): address { lock.agent }
public fun unlock_at_ms<T: key + store>(lock: &LpLock<T>): u64 { lock.unlock_at_ms }
public fun locked_at_ms<T: key + store>(lock: &LpLock<T>): u64 { lock.locked_at_ms }
public fun position_id<T: key + store>(lock: &LpLock<T>): ID { object::id(&lock.position) }

// === Internal ===

/// Transfer a coin to the agent, or destroy it if the claim round was empty —
/// never litter the agent wallet with zero-value coin objects.
fun send_or_destroy<C>(c: coin::Coin<C>, agent: address) {
    if (c.value() == 0) { c.destroy_zero() } else { transfer::public_transfer(c, agent) }
}
