#[test_only]
module agent_capital::registry_tests;

use agent_capital::registry::{Self, CapitalRegistry};
use agent_id::registry::{Self as agent_id, Registry as AgentRegistry};
use sui::clock;
use sui::test_scenario as ts;

const AGENT: address = @0xA;
const OWNER: address = @0xB;
const STRANGER: address = @0xC;

/// Stand-in coin types. Real launches publish their own package per agent, so
/// the only property that matters here is that they are distinct types.
public struct COIN_A has drop {}
public struct COIN_B has drop {}

fun setup(scenario: &mut ts::Scenario) {
    ts::next_tx(scenario, AGENT);
    {
        agent_id::init_for_testing(ts::ctx(scenario));
        registry::init_for_testing(ts::ctx(scenario));
    };
}

/// Register AGENT in the Agent ID registry (self-sovereign: sender == agent).
fun register_agent(scenario: &mut ts::Scenario) {
    ts::next_tx(scenario, AGENT);
    {
        let mut agents = ts::take_shared<AgentRegistry>(scenario);
        let c = clock::create_for_testing(ts::ctx(scenario));
        agent_id::register(
            &mut agents,
            option::none(),
            vector[],
            option::none(),
            option::none(),
            &c,
            ts::ctx(scenario),
        );
        clock::destroy_for_testing(c);
        ts::return_shared(agents);
    };
}

/// Two-sided ownership link: agent proposes OWNER, OWNER confirms.
fun link_owner(scenario: &mut ts::Scenario) {
    ts::next_tx(scenario, AGENT);
    {
        let mut agents = ts::take_shared<AgentRegistry>(scenario);
        let c = clock::create_for_testing(ts::ctx(scenario));
        agent_id::set_pending_owner(&mut agents, OWNER, &c, ts::ctx(scenario));
        clock::destroy_for_testing(c);
        ts::return_shared(agents);
    };
    ts::next_tx(scenario, OWNER);
    {
        let mut agents = ts::take_shared<AgentRegistry>(scenario);
        let c = clock::create_for_testing(ts::ctx(scenario));
        agent_id::confirm_ownership(&mut agents, AGENT, &c, ts::ctx(scenario));
        clock::destroy_for_testing(c);
        ts::return_shared(agents);
    };
}

fun bind_as<T>(scenario: &mut ts::Scenario, sender: address) {
    ts::next_tx(scenario, sender);
    {
        let mut cap = ts::take_shared<CapitalRegistry>(scenario);
        let agents = ts::take_shared<AgentRegistry>(scenario);
        let c = clock::create_for_testing(ts::ctx(scenario));
        registry::bind<T>(&mut cap, &agents, AGENT, &c, ts::ctx(scenario));
        clock::destroy_for_testing(c);
        ts::return_shared(agents);
        ts::return_shared(cap);
    };
}

#[test]
fun agent_can_tokenize_itself() {
    let mut scenario = ts::begin(AGENT);
    setup(&mut scenario);
    register_agent(&mut scenario);
    bind_as<COIN_A>(&mut scenario, AGENT);

    ts::next_tx(&mut scenario, AGENT);
    {
        let cap = ts::take_shared<CapitalRegistry>(&scenario);
        assert!(registry::is_tokenized(&cap, AGENT), 0);
        let record = registry::borrow_record(&cap, AGENT);
        assert!(registry::launcher(record) == AGENT, 1);
        // Not finalized until the pool + lock land.
        assert!(!registry::is_finalized(record), 2);
        assert!(registry::pool_id(record).is_none(), 3);
        assert!(registry::launch_count(&cap) == 0, 4);
        ts::return_shared(cap);
    };
    ts::end(scenario);
}

#[test]
fun confirmed_owner_can_tokenize() {
    let mut scenario = ts::begin(AGENT);
    setup(&mut scenario);
    register_agent(&mut scenario);
    link_owner(&mut scenario);
    bind_as<COIN_A>(&mut scenario, OWNER);

    ts::next_tx(&mut scenario, OWNER);
    {
        let cap = ts::take_shared<CapitalRegistry>(&scenario);
        let record = registry::borrow_record(&cap, AGENT);
        assert!(registry::launcher(record) == OWNER, 0);
        ts::return_shared(cap);
    };
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = registry::EAlreadyTokenized)]
fun one_token_per_agent() {
    let mut scenario = ts::begin(AGENT);
    setup(&mut scenario);
    register_agent(&mut scenario);
    bind_as<COIN_A>(&mut scenario, AGENT);
    // A second launch — even with a different coin type — must abort.
    bind_as<COIN_B>(&mut scenario, AGENT);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = registry::ENotAuthorized)]
fun stranger_cannot_tokenize() {
    let mut scenario = ts::begin(AGENT);
    setup(&mut scenario);
    register_agent(&mut scenario);
    bind_as<COIN_A>(&mut scenario, STRANGER);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = registry::ENotAuthorized)]
fun pending_owner_cannot_tokenize() {
    let mut scenario = ts::begin(AGENT);
    setup(&mut scenario);
    register_agent(&mut scenario);
    // Agent proposes OWNER but OWNER never confirms — a claim is not ownership.
    ts::next_tx(&mut scenario, AGENT);
    {
        let mut agents = ts::take_shared<AgentRegistry>(&scenario);
        let c = clock::create_for_testing(ts::ctx(&mut scenario));
        agent_id::set_pending_owner(&mut agents, OWNER, &c, ts::ctx(&mut scenario));
        clock::destroy_for_testing(c);
        ts::return_shared(agents);
    };
    bind_as<COIN_A>(&mut scenario, OWNER);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = registry::EAgentNotRegistered)]
fun unregistered_agent_cannot_tokenize() {
    let mut scenario = ts::begin(AGENT);
    setup(&mut scenario);
    // No Agent ID registration at all.
    bind_as<COIN_A>(&mut scenario, AGENT);
    ts::end(scenario);
}

#[test]
fun finalize_records_pool_and_lock() {
    let mut scenario = ts::begin(AGENT);
    setup(&mut scenario);
    register_agent(&mut scenario);
    bind_as<COIN_A>(&mut scenario, AGENT);

    let pool = object::id_from_address(@0xF00D);
    let lock = object::id_from_address(@0xF00E);

    ts::next_tx(&mut scenario, AGENT);
    {
        let mut cap = ts::take_shared<CapitalRegistry>(&scenario);
        let agents = ts::take_shared<AgentRegistry>(&scenario);
        let c = clock::create_for_testing(ts::ctx(&mut scenario));
        registry::finalize<COIN_A>(
            &mut cap, &agents, AGENT, pool, lock, &c, ts::ctx(&mut scenario),
        );
        clock::destroy_for_testing(c);
        ts::return_shared(agents);
        ts::return_shared(cap);
    };

    ts::next_tx(&mut scenario, AGENT);
    {
        let cap = ts::take_shared<CapitalRegistry>(&scenario);
        let record = registry::borrow_record(&cap, AGENT);
        assert!(registry::is_finalized(record), 0);
        assert!(registry::pool_id(record).contains(&pool), 1);
        assert!(registry::lock_id(record).contains(&lock), 2);
        assert!(registry::launch_count(&cap) == 1, 3);
        ts::return_shared(cap);
    };
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = registry::ECoinTypeMismatch)]
fun finalize_rejects_wrong_coin_type() {
    let mut scenario = ts::begin(AGENT);
    setup(&mut scenario);
    register_agent(&mut scenario);
    bind_as<COIN_A>(&mut scenario, AGENT);

    ts::next_tx(&mut scenario, AGENT);
    {
        let mut cap = ts::take_shared<CapitalRegistry>(&scenario);
        let agents = ts::take_shared<AgentRegistry>(&scenario);
        let c = clock::create_for_testing(ts::ctx(&mut scenario));
        registry::finalize<COIN_B>(
            &mut cap,
            &agents,
            AGENT,
            object::id_from_address(@0xF00D),
            object::id_from_address(@0xF00E),
            &c,
            ts::ctx(&mut scenario),
        );
        clock::destroy_for_testing(c);
        ts::return_shared(agents);
        ts::return_shared(cap);
    };
    ts::end(scenario);
}
