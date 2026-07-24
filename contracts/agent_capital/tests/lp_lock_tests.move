#[test_only]
module agent_capital::lp_lock_tests;

use agent_capital::lp_lock::{Self, LpLock};
use sui::clock;
use sui::test_scenario as ts;

const AGENT: address = @0xA9E17;
const STRANGER: address = @0x57;

const TEN_YEARS_MS: u64 = 315_360_000_000;
const START_MS: u64 = 1_753_000_000_000;

/// Stand-in for the Cetus `Position` NFT — the real one cannot be constructed
/// in tests (the interface package is abort-only), and `LpLock<T>` is generic
/// precisely so the lock/unlock logic is testable without it.
public struct FakePosition has key, store {
    id: UID,
}

fun fake_position(ctx: &mut TxContext): FakePosition {
    FakePosition { id: object::new(ctx) }
}

#[test]
fun lock_is_shared_and_pins_ten_years() {
    let mut scenario = ts::begin(STRANGER);
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(START_MS);

    // Anyone may create a lock — the launcher signs it in the real flow — but
    // the beneficiary is whoever `agent` names, not the sender.
    let position = fake_position(scenario.ctx());
    lp_lock::lock(position, AGENT, &clock, scenario.ctx());

    scenario.next_tx(STRANGER);
    let lock = scenario.take_shared<LpLock<FakePosition>>();
    assert!(lp_lock::agent(&lock) == AGENT);
    assert!(lp_lock::locked_at_ms(&lock) == START_MS);
    assert!(lp_lock::unlock_at_ms(&lock) == START_MS + TEN_YEARS_MS);
    ts::return_shared(lock);

    clock.destroy_for_testing();
    scenario.end();
}

#[test]
#[expected_failure(abort_code = lp_lock::ELockNotExpired)]
fun withdraw_before_unlock_aborts() {
    let mut scenario = ts::begin(AGENT);
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(START_MS);

    let position = fake_position(scenario.ctx());
    lp_lock::lock(position, AGENT, &clock, scenario.ctx());

    // One millisecond short of the unlock — still locked.
    scenario.next_tx(AGENT);
    clock.set_for_testing(START_MS + TEN_YEARS_MS - 1);
    let lock = scenario.take_shared<LpLock<FakePosition>>();
    lp_lock::withdraw(lock, &clock);
    abort 0
}

#[test]
fun withdraw_after_unlock_sends_position_to_agent() {
    let mut scenario = ts::begin(AGENT);
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(START_MS);

    let position = fake_position(scenario.ctx());
    let position_id = object::id(&position);
    lp_lock::lock(position, AGENT, &clock, scenario.ctx());

    // A STRANGER cranks the withdraw after expiry — the position must land in
    // the AGENT's wallet regardless of who called.
    scenario.next_tx(STRANGER);
    clock.set_for_testing(START_MS + TEN_YEARS_MS);
    let lock = scenario.take_shared<LpLock<FakePosition>>();
    lp_lock::withdraw(lock, &clock);

    scenario.next_tx(AGENT);
    let recovered = scenario.take_from_address_by_id<FakePosition>(AGENT, position_id);
    ts::return_to_address(AGENT, recovered);

    clock.destroy_for_testing();
    scenario.end();
}

#[test]
fun lock_id_returned_matches_shared_object() {
    let mut scenario = ts::begin(AGENT);
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(START_MS);

    let position = fake_position(scenario.ctx());
    let lock_id = lp_lock::lock(position, AGENT, &clock, scenario.ctx());

    // The returned ID is what the same-PTB `registry::finalize` records — it
    // must be the shared object's real ID.
    scenario.next_tx(AGENT);
    let lock = scenario.take_shared_by_id<LpLock<FakePosition>>(lock_id);
    ts::return_shared(lock);

    clock.destroy_for_testing();
    scenario.end();
}
