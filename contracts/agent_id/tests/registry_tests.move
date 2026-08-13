#[test_only]
module agent_id::registry_tests;

use agent_id::registry::{Self, Registry, AdminCap};
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

// === Ownership — DEPRECATED since v2 (S.1032): every mutator always
//     aborts with EOwnershipDeprecated (5), regardless of who signs. ===

#[test]
#[expected_failure(abort_code = 5, location = agent_id::registry)]
fun set_pending_owner_is_deprecated() {
    let mut sc = ts::begin(AGENT);
    registry::init_for_testing(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, AGENT);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let clk = clock::create_for_testing(ts::ctx(&mut sc));
        registry::register(
            &mut reg, option::none(), vector[], option::none(), option::none(), &clk, ts::ctx(&mut sc),
        );
        // Even the agent itself can no longer propose an owner.
        registry::set_pending_owner(&mut reg, OWNER, &clk, ts::ctx(&mut sc));
        clock::destroy_for_testing(clk);
        ts::return_shared(reg);
    };
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = 5, location = agent_id::registry)]
fun confirm_ownership_is_deprecated() {
    let mut sc = ts::begin(AGENT);
    registry::init_for_testing(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, OWNER);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let clk = clock::create_for_testing(ts::ctx(&mut sc));
        registry::confirm_ownership(&mut reg, AGENT, &clk, ts::ctx(&mut sc));
        clock::destroy_for_testing(clk);
        ts::return_shared(reg);
    };
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = 5, location = agent_id::registry)]
fun renounce_ownership_is_deprecated() {
    let mut sc = ts::begin(AGENT);
    registry::init_for_testing(ts::ctx(&mut sc));

    // Historical linked owners (the #74 class) hit the same abort — the
    // leftover link is inert chain cosmetics, not a live surface.
    ts::next_tx(&mut sc, OWNER);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let clk = clock::create_for_testing(ts::ctx(&mut sc));
        registry::renounce_ownership(&mut reg, AGENT, &clk, ts::ctx(&mut sc));
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

// === set_active — AGENT-ONLY since v2 (S.1032) ===

#[test]
fun set_active_is_reversible() {
    let mut sc = ts::begin(AGENT);
    registry::init_for_testing(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, AGENT);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let clk = clock::create_for_testing(ts::ctx(&mut sc));
        registry::register(
            &mut reg, option::none(), vector[], option::none(), option::none(), &clk, ts::ctx(&mut sc),
        );
        // deactivate → reactivate (no stuck-inactive trap).
        registry::set_active(&mut reg, AGENT, false, &clk, ts::ctx(&mut sc));
        assert!(!registry::is_active(registry::borrow_record(&reg, AGENT)), 0);
        registry::set_active(&mut reg, AGENT, true, &clk, ts::ctx(&mut sc));
        assert!(registry::is_active(registry::borrow_record(&reg, AGENT)), 1);
        clock::destroy_for_testing(clk);
        ts::return_shared(reg);
    };
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = 2, location = agent_id::registry)]
fun set_active_stranger_aborts() {
    let mut sc = ts::begin(AGENT);
    registry::init_for_testing(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, AGENT);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let clk = clock::create_for_testing(ts::ctx(&mut sc));
        registry::register(
            &mut reg, option::none(), vector[], option::none(), option::none(), &clk, ts::ctx(&mut sc),
        );
        clock::destroy_for_testing(clk);
        ts::return_shared(reg);
    };

    // Anyone who isn't the agent — a stranger today, an ex-linked owner
    // after migrate — hits ENotAuthorized (2): the owner arm is gone.
    ts::next_tx(&mut sc, STRANGER);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let clk = clock::create_for_testing(ts::ctx(&mut sc));
        registry::set_active(&mut reg, AGENT, false, &clk, ts::ctx(&mut sc));
        clock::destroy_for_testing(clk);
        ts::return_shared(reg);
    };
    ts::end(sc);
}

// === migrate — the escrow S.981 cutover ritual on this registry ===

#[test]
fun migrate_bumps_stale_registry() {
    let mut sc = ts::begin(AGENT);
    registry::init_for_testing(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, AGENT);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let cap = ts::take_from_sender<AdminCap>(&sc);
        // Simulate a Registry still on the previous package version.
        registry::set_version_for_testing(&mut reg, registry::current_version() - 1);
        registry::migrate(&mut reg, &cap);
        assert!(registry::version(&reg) == registry::current_version(), 0);
        ts::return_to_sender(&sc, cap);
        ts::return_shared(reg);
    };

    // Mutations work again post-migrate.
    ts::next_tx(&mut sc, AGENT);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let clk = clock::create_for_testing(ts::ctx(&mut sc));
        registry::register(
            &mut reg, option::none(), vector[], option::none(), option::none(), &clk, ts::ctx(&mut sc),
        );
        assert!(registry::is_registered(&reg, AGENT), 1);
        clock::destroy_for_testing(clk);
        ts::return_shared(reg);
    };
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = 4, location = agent_id::registry)]
fun migrate_same_version_fails() {
    let mut sc = ts::begin(AGENT);
    registry::init_for_testing(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, AGENT);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let cap = ts::take_from_sender<AdminCap>(&sc);
        // Registry already at the running package version → EWrongVersion (4).
        registry::migrate(&mut reg, &cap);
        ts::return_to_sender(&sc, cap);
        ts::return_shared(reg);
    };
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = 4, location = agent_id::registry)]
fun stale_version_blocks_mutations() {
    let mut sc = ts::begin(AGENT);
    registry::init_for_testing(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, AGENT);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        let clk = clock::create_for_testing(ts::ctx(&mut sc));
        // A Registry left on the previous version rejects every mutation
        // until migrate — the other half of the deprecation cutover.
        registry::set_version_for_testing(&mut reg, registry::current_version() - 1);
        registry::register(
            &mut reg, option::none(), vector[], option::none(), option::none(), &clk, ts::ctx(&mut sc),
        );
        clock::destroy_for_testing(clk);
        ts::return_shared(reg);
    };
    ts::end(sc);
}
