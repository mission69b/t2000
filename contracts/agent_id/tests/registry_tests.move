#[test_only]
module agent_id::registry_tests;

use agent_id::registry::{Self, Registry};
use sui::clock;
use sui::test_scenario as ts;

const AGENT: address = @0xA;
const OWNER: address = @0xB;
const STRANGER: address = @0xC;

#[test]
fun register_and_read() {
    let mut sc = ts::begin(AGENT);
    registry::init_for_testing(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, AGENT);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let clk = clock::create_for_testing(ts::ctx(&mut sc));
        registry::register(
            &mut reg,
            option::none(),
            vector[],
            option::none(),
            option::none(),
            &clk,
            ts::ctx(&mut sc),
        );
        assert!(registry::is_registered(&reg, AGENT), 0);
        let rec = registry::borrow_record(&reg, AGENT);
        assert!(registry::numeric_id(rec) == 1, 1);
        assert!(registry::is_active(rec), 2);
        assert!(registry::owner(rec).is_none(), 3);
        clock::destroy_for_testing(clk);
        ts::return_shared(reg);
    };
    ts::end(sc);
}

#[test]
fun two_sided_ownership() {
    let mut sc = ts::begin(AGENT);
    registry::init_for_testing(ts::ctx(&mut sc));

    // Agent registers, then proposes OWNER.
    ts::next_tx(&mut sc, AGENT);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let clk = clock::create_for_testing(ts::ctx(&mut sc));
        registry::register(
            &mut reg,
            option::none(),
            vector[],
            option::none(),
            option::none(),
            &clk,
            ts::ctx(&mut sc),
        );
        registry::set_pending_owner(&mut reg, OWNER, &clk, ts::ctx(&mut sc));
        clock::destroy_for_testing(clk);
        ts::return_shared(reg);
    };

    // OWNER confirms → ownership is bound.
    ts::next_tx(&mut sc, OWNER);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let clk = clock::create_for_testing(ts::ctx(&mut sc));
        registry::confirm_ownership(&mut reg, AGENT, &clk, ts::ctx(&mut sc));
        let rec = registry::borrow_record(&reg, AGENT);
        assert!(registry::owner(rec) == option::some(OWNER), 0);
        clock::destroy_for_testing(clk);
        ts::return_shared(reg);
    };
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = 0, location = agent_id::registry)]
fun double_register_aborts() {
    let mut sc = ts::begin(AGENT);
    registry::init_for_testing(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, AGENT);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let clk = clock::create_for_testing(ts::ctx(&mut sc));
        registry::register(
            &mut reg, option::none(), vector[], option::none(), option::none(), &clk, ts::ctx(&mut sc),
        );
        // Second register for the same sender → EAlreadyRegistered (0).
        registry::register(
            &mut reg, option::none(), vector[], option::none(), option::none(), &clk, ts::ctx(&mut sc),
        );
        clock::destroy_for_testing(clk);
        ts::return_shared(reg);
    };
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = 2, location = agent_id::registry)]
fun wrong_confirmer_aborts() {
    let mut sc = ts::begin(AGENT);
    registry::init_for_testing(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, AGENT);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let clk = clock::create_for_testing(ts::ctx(&mut sc));
        registry::register(
            &mut reg, option::none(), vector[], option::none(), option::none(), &clk, ts::ctx(&mut sc),
        );
        registry::set_pending_owner(&mut reg, OWNER, &clk, ts::ctx(&mut sc));
        clock::destroy_for_testing(clk);
        ts::return_shared(reg);
    };

    // A stranger (not the pending owner) tries to confirm → ENotAuthorized (2).
    ts::next_tx(&mut sc, STRANGER);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let clk = clock::create_for_testing(ts::ctx(&mut sc));
        registry::confirm_ownership(&mut reg, AGENT, &clk, ts::ctx(&mut sc));
        clock::destroy_for_testing(clk);
        ts::return_shared(reg);
    };
    ts::end(sc);
}
