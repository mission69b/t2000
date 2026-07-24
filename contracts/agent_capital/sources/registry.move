/// Agent Capital — the on-chain binding of an Agent ID to its one and only
/// coin type (SPEC_ACP_SUI §6 Phase 3, mechanism per SPEC_AGENT_CAPITAL Phase B).
///
/// One shared `CapitalRegistry` holds `Table<address, TokenRecord>`, keyed by the
/// AGENT's Sui address — the same key `agent_id::registry` uses, so the two
/// registries line up without a join table. Tokenization is **once per agent,
/// enforced here**: `bind` aborts if the agent already has a record.
///
/// Authorization mirrors `agent_id::registry::set_active` — the agent itself, or
/// its CONFIRMED owner (a `pending_owner` is not enough; ownership is two-sided
/// by design so nobody can tokenize an agent they merely claimed).
///
/// The launch is two transactions (a type argument cannot name a package being
/// published in the same transaction, so `bind<T>` can only run AFTER the coin
/// package exists): tx 1 publishes the coin; tx 2 runs bind → pool → lock →
/// finalize ATOMICALLY. A crashed launch between the two leaves a published-
/// but-unbound coin (launcher's gas, nobody's harm) and tx 2 is retried; a
/// bound record always carries its pool + lock in the same transaction.
/// `finalize` stays a separate call (not folded into `bind`) so the PTB can
/// thread the pool/lock IDs created between them.
///
/// Upgrade-safety: `CapitalRegistry.version` is gated against the package
/// `VERSION`, the canonical Sui upgradeable-shared-object pattern (same as
/// `agent_id::registry`).
module agent_capital::registry;

use agent_id::registry::{Self as agent_id, Registry as AgentRegistry};
use std::type_name::{Self, TypeName};
use sui::clock::Clock;
use sui::event;
use sui::table::{Self, Table};

/// Bump on every breaking package upgrade; `migrate` advances a deployed
/// `CapitalRegistry` to match.
const VERSION: u64 = 1;

// === Errors ===
const EAlreadyTokenized: u64 = 0;
const ENotAuthorized: u64 = 1;
const EAgentNotRegistered: u64 = 2;
const EWrongVersion: u64 = 3;
const ENotTokenized: u64 = 4;
const EAlreadyFinalized: u64 = 5;
const ECoinTypeMismatch: u64 = 6;

// === Objects ===

/// Governance authority (held by the COLD deployer): gates `migrate`.
public struct AdminCap has key, store {
    id: UID,
}

/// The shared registry: `agent address → TokenRecord`, plus the version gate.
/// Sui `Table` uses dynamic fields, so launches for different agents don't
/// contend on this object.
public struct CapitalRegistry has key {
    id: UID,
    version: u64,
    tokens: Table<address, TokenRecord>,
    /// Monotonic count of finalized launches — cheap read for the console's
    /// Capital tab without walking the table.
    launch_count: u64,
}

/// One agent's token binding. `coin_type` is the canonical `TypeName` of the
/// published coin's one-time witness, which is globally unique by construction
/// (each launch publishes its own package), so no reverse-uniqueness check is
/// needed.
public struct TokenRecord has store {
    agent: address,
    coin_type: TypeName,
    /// Who signed the launch — the agent itself or its confirmed owner. Kept
    /// for the audit trail; authorization is re-checked on every call, never
    /// inherited from this field.
    launcher: address,
    bound_at_ms: u64,
    /// Set by `finalize` once the Cetus pool exists and the LP is locked.
    pool_id: Option<ID>,
    lock_id: Option<ID>,
    finalized_at_ms: Option<u64>,
}

// === Events (consumed by the indexer → console Capital tab) ===

public struct AgentTokenBound has copy, drop {
    agent: address,
    coin_type: TypeName,
    launcher: address,
    timestamp_ms: u64,
}

public struct AgentTokenFinalized has copy, drop {
    agent: address,
    coin_type: TypeName,
    pool_id: ID,
    lock_id: ID,
    timestamp_ms: u64,
}

// === Init (runs once on publish) ===
fun init(ctx: &mut TxContext) {
    transfer::share_object(CapitalRegistry {
        id: object::new(ctx),
        version: VERSION,
        tokens: table::new(ctx),
        launch_count: 0,
    });
    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

fun assert_version(registry: &CapitalRegistry) {
    assert!(registry.version == VERSION, EWrongVersion);
}

/// The one authorization rule for this package: sender is the agent itself, or
/// the agent's CONFIRMED owner in `agent_id::registry`. Deliberately mirrors
/// `agent_id::registry::set_active` so there is a single mental model for "who
/// may act for this agent".
///
/// Note we do NOT require `is_active` — a deactivated agent may still tokenize
/// or finalize; active is a listing/visibility flag, not a capability gate, and
/// coupling money to it would let a toggle strand a half-finished launch.
fun assert_launcher(agents: &AgentRegistry, agent: address, sender: address) {
    assert!(agent_id::is_registered(agents, agent), EAgentNotRegistered);
    let record = agent_id::borrow_record(agents, agent);
    assert!(sender == agent || agent_id::owner(record).contains(&sender), ENotAuthorized);
}

// === Bind (step 1 of a launch: reserve the slot at publish time) ===

/// Reserve `agent`'s single tokenization slot for coin type `T`. Aborts if the
/// agent already has any record — bound or finalized. The orchestrator calls
/// this at the top of the pool/lock/finalize transaction, so the slot and its
/// market are claimed atomically.
public fun bind<T>(
    registry: &mut CapitalRegistry,
    agents: &AgentRegistry,
    agent: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_version(registry);
    let sender = ctx.sender();
    assert_launcher(agents, agent, sender);
    assert!(!registry.tokens.contains(agent), EAlreadyTokenized);

    let now = clock.timestamp_ms();
    let coin_type = type_name::with_defining_ids<T>();
    registry.tokens.add(agent, TokenRecord {
        agent,
        coin_type,
        launcher: sender,
        bound_at_ms: now,
        pool_id: option::none(),
        lock_id: option::none(),
        finalized_at_ms: option::none(),
    });
    event::emit(AgentTokenBound { agent, coin_type, launcher: sender, timestamp_ms: now });
}

// === Finalize (last step: record the pool + the LP lock) ===

/// Record the Cetus pool and the `LpLock` holding its position. `T` must match
/// the coin type bound earlier — passing a different type is a caller bug, not
/// a rebinding path.
public fun finalize<T>(
    registry: &mut CapitalRegistry,
    agents: &AgentRegistry,
    agent: address,
    pool_id: ID,
    lock_id: ID,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_version(registry);
    assert_launcher(agents, agent, ctx.sender());
    assert!(registry.tokens.contains(agent), ENotTokenized);

    let now = clock.timestamp_ms();
    let coin_type = type_name::with_defining_ids<T>();
    let record = registry.tokens.borrow_mut(agent);
    assert!(record.finalized_at_ms.is_none(), EAlreadyFinalized);
    assert!(record.coin_type == coin_type, ECoinTypeMismatch);

    record.pool_id = option::some(pool_id);
    record.lock_id = option::some(lock_id);
    record.finalized_at_ms = option::some(now);
    registry.launch_count = registry.launch_count + 1;

    event::emit(AgentTokenFinalized {
        agent,
        coin_type,
        pool_id,
        lock_id,
        timestamp_ms: now,
    });
}

// === Admin ===
public fun migrate(registry: &mut CapitalRegistry, _: &AdminCap) {
    assert!(registry.version < VERSION, EWrongVersion);
    registry.version = VERSION;
}

// === Read accessors ===

public fun is_tokenized(registry: &CapitalRegistry, agent: address): bool {
    registry.tokens.contains(agent)
}

public fun launch_count(registry: &CapitalRegistry): u64 { registry.launch_count }

public fun borrow_record(registry: &CapitalRegistry, agent: address): &TokenRecord {
    registry.tokens.borrow(agent)
}

public fun coin_type(record: &TokenRecord): TypeName { record.coin_type }
public fun launcher(record: &TokenRecord): address { record.launcher }
public fun pool_id(record: &TokenRecord): Option<ID> { record.pool_id }
public fun lock_id(record: &TokenRecord): Option<ID> { record.lock_id }
public fun is_finalized(record: &TokenRecord): bool { record.finalized_at_ms.is_some() }

// === Test-only ===
#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}
