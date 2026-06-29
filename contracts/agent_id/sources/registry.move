/// Agent ID — on-chain registry of agent identities (SPEC_AGENT_ID Phase B).
///
/// One shared `Registry` holds a `Table<address, AgentRecord>`. An agent
/// registers ITSELF (`sender == agent` — self-sovereign); ownership by a human
/// Passport is two-sided (the agent proposes a `pending_owner`, the owner
/// confirms) to prevent false owner claims. Identity is anchored to the
/// agent's Sui address; the SuiNS handle (`<label>.agent-id.sui`) lives OFF
/// this object (SuiNS is the handle truth) — only address-anchored identity,
/// ownership, endpoints, and pointers are on-chain (minimal + public).
module agent_id::registry;

use std::string::String;
use sui::clock::Clock;
use sui::event;
use sui::table::{Self, Table};

// === Errors ===
const EAlreadyRegistered: u64 = 0;
const ENotRegistered: u64 = 1;
const ENotAuthorized: u64 = 2;
const ENoPendingOwner: u64 = 3;

// === Objects ===

/// Governance/upgrade authority for the registry (held in t2000 custody).
public struct AdminCap has key, store {
    id: UID,
}

/// The shared registry: `agent address → AgentRecord`, plus the ERC-8004-style
/// numeric-id counter. Shared so it's globally queryable and so Phase-C
/// reputation can append from other parties. Sui `Table` uses dynamic fields,
/// so updates to different agents don't contend.
public struct Registry has key {
    id: UID,
    agents: Table<address, AgentRecord>,
    next_id: u64,
}

/// One agent's on-chain identity. Minimal + public by design; rich metadata
/// lives off-chain via `metadata_uri` (Walrus).
public struct AgentRecord has store {
    agent: address,
    numeric_id: u64,
    owner: Option<address>,
    pending_owner: Option<address>,
    mcp_endpoint: Option<String>,
    payment_methods: vector<String>,
    did: Option<String>,
    metadata_uri: Option<String>,
    active: bool,
    created_at_ms: u64,
    updated_at_ms: u64,
}

// === Events (consumed by the off-chain indexer → the DB read-cache) ===
public struct AgentRegistered has copy, drop {
    agent: address,
    numeric_id: u64,
    timestamp_ms: u64,
}
public struct AgentUpdated has copy, drop { agent: address, timestamp_ms: u64 }
public struct OwnerLinked has copy, drop {
    agent: address,
    owner: address,
    timestamp_ms: u64,
}
public struct AgentDeactivated has copy, drop {
    agent: address,
    timestamp_ms: u64,
}

// === Init (runs once on publish) ===
fun init(ctx: &mut TxContext) {
    transfer::share_object(Registry {
        id: object::new(ctx),
        agents: table::new(ctx),
        next_id: 1,
    });
    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

// === Register (self-sovereign: sender == the agent) ===
public fun register(
    registry: &mut Registry,
    mcp_endpoint: Option<String>,
    payment_methods: vector<String>,
    did: Option<String>,
    metadata_uri: Option<String>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let agent = ctx.sender();
    assert!(!registry.agents.contains(agent), EAlreadyRegistered);
    let now = clock.timestamp_ms();
    let numeric_id = registry.next_id;
    registry.next_id = numeric_id + 1;
    registry.agents.add(agent, AgentRecord {
        agent,
        numeric_id,
        owner: option::none(),
        pending_owner: option::none(),
        mcp_endpoint,
        payment_methods,
        did,
        metadata_uri,
        active: true,
        created_at_ms: now,
        updated_at_ms: now,
    });
    event::emit(AgentRegistered { agent, numeric_id, timestamp_ms: now });
}

// === Update (agent-only — sender is the record key) ===
public fun update(
    registry: &mut Registry,
    mcp_endpoint: Option<String>,
    payment_methods: vector<String>,
    did: Option<String>,
    metadata_uri: Option<String>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let agent = ctx.sender();
    assert!(registry.agents.contains(agent), ENotRegistered);
    let now = clock.timestamp_ms();
    let record = registry.agents.borrow_mut(agent);
    record.mcp_endpoint = mcp_endpoint;
    record.payment_methods = payment_methods;
    record.did = did;
    record.metadata_uri = metadata_uri;
    record.updated_at_ms = now;
    event::emit(AgentUpdated { agent, timestamp_ms: now });
}

// === Ownership link (two-sided: agent proposes, owner confirms) ===

/// The agent declares a proposed owner. Nothing is bound until the owner
/// confirms — so an agent can't unilaterally claim a famous Passport.
public fun set_pending_owner(
    registry: &mut Registry,
    owner: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let agent = ctx.sender();
    assert!(registry.agents.contains(agent), ENotRegistered);
    let now = clock.timestamp_ms();
    let record = registry.agents.borrow_mut(agent);
    record.pending_owner = option::some(owner);
    record.updated_at_ms = now;
}

/// The proposed owner confirms — `sender` must equal the pending owner.
public fun confirm_ownership(
    registry: &mut Registry,
    agent: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(registry.agents.contains(agent), ENotRegistered);
    let sender = ctx.sender();
    let now = clock.timestamp_ms();
    let record = registry.agents.borrow_mut(agent);
    assert!(record.pending_owner.is_some(), ENoPendingOwner);
    let pending = *record.pending_owner.borrow();
    assert!(pending == sender, ENotAuthorized);
    record.owner = option::some(pending);
    record.pending_owner = option::none();
    record.updated_at_ms = now;
    event::emit(OwnerLinked { agent, owner: pending, timestamp_ms: now });
}

// === Deactivate (the agent itself, or its confirmed owner) ===
public fun deactivate(
    registry: &mut Registry,
    agent: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(registry.agents.contains(agent), ENotRegistered);
    let sender = ctx.sender();
    let now = clock.timestamp_ms();
    let record = registry.agents.borrow_mut(agent);
    assert!(sender == agent || record.owner.contains(&sender), ENotAuthorized);
    record.active = false;
    record.updated_at_ms = now;
    event::emit(AgentDeactivated { agent, timestamp_ms: now });
}

// === Read accessors (for composing contracts: Phase-C reputation, Commerce) ===
public fun is_registered(registry: &Registry, agent: address): bool {
    registry.agents.contains(agent)
}

public fun borrow_record(registry: &Registry, agent: address): &AgentRecord {
    registry.agents.borrow(agent)
}

public fun numeric_id(record: &AgentRecord): u64 { record.numeric_id }
public fun owner(record: &AgentRecord): Option<address> { record.owner }
public fun is_active(record: &AgentRecord): bool { record.active }
public fun mcp_endpoint(record: &AgentRecord): Option<String> { record.mcp_endpoint }
public fun did(record: &AgentRecord): Option<String> { record.did }

// === Test-only init ===
#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}
