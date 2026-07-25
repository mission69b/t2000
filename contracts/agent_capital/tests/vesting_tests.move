#[test_only]
module agent_capital::vesting_tests;

use agent_capital::vesting::{Self, VestingLock};
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

const AGENT: address = @0xA9E17;
const STRANGER: address = @0x57;

const SIX_MONTHS_MS: u64 = 15_552_000_000;
const START_MS: u64 = 1_753_400_000_000;
const TOTAL: u64 = 500_000_000_000_000; // the 500M @6dp treasury half

fun setup(scenario: &mut ts::Scenario, clock: &clock::Clock): ID {
    let treasury = coin::mint_for_testing<SUI>(TOTAL, scenario.ctx());
    vesting::lock(treasury, AGENT, clock, scenario.ctx())
}

#[test]
fun linear_schedule_floors_and_caps() {
    let mut scenario = ts::begin(AGENT);
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(START_MS);
    setup(&mut scenario, &clock);

    scenario.next_tx(AGENT);
    let lock = scenario.take_shared<VestingLock<SUI>>();
    assert!(vesting::vested_amount(&lock, START_MS) == 0);
    // Half the duration → exactly half the total (no rounding up).
    assert!(vesting::vested_amount(&lock, START_MS + SIX_MONTHS_MS / 2) == TOTAL / 2);
    // Past the end → capped at total, never more.
    assert!(vesting::vested_amount(&lock, START_MS + SIX_MONTHS_MS * 2) == TOTAL);
    ts::return_shared(lock);

    clock.destroy_for_testing();
    scenario.end();
}

#[test]
fun stranger_cranks_but_agent_receives() {
    let mut scenario = ts::begin(AGENT);
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(START_MS);
    setup(&mut scenario, &clock);

    // A STRANGER claims a quarter in — payout must land with the AGENT.
    scenario.next_tx(STRANGER);
    clock.set_for_testing(START_MS + SIX_MONTHS_MS / 4);
    let mut lock = scenario.take_shared<VestingLock<SUI>>();
    vesting::claim(&mut lock, &clock, scenario.ctx());
    assert!(vesting::released(&lock) == TOTAL / 4);
    ts::return_shared(lock);

    scenario.next_tx(AGENT);
    let payout = scenario.take_from_address<coin::Coin<SUI>>(AGENT);
    assert!(payout.value() == TOTAL / 4);
    ts::return_to_address(AGENT, payout);

    clock.destroy_for_testing();
    scenario.end();
}

#[test]
fun empty_claim_is_a_noop() {
    let mut scenario = ts::begin(AGENT);
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(START_MS);
    setup(&mut scenario, &clock);

    // Claim immediately at start — nothing vested; must not abort (the
    // keeper batches claims, one abort would kill the whole PTB) and must
    // not move anything.
    scenario.next_tx(STRANGER);
    let mut lock = scenario.take_shared<VestingLock<SUI>>();
    vesting::claim(&mut lock, &clock, scenario.ctx());
    assert!(vesting::released(&lock) == 0);
    ts::return_shared(lock);

    clock.destroy_for_testing();
    scenario.end();
}

#[test]
fun full_vest_drains_to_agent() {
    let mut scenario = ts::begin(AGENT);
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(START_MS);
    setup(&mut scenario, &clock);

    scenario.next_tx(STRANGER);
    clock.set_for_testing(START_MS + SIX_MONTHS_MS);
    let mut lock = scenario.take_shared<VestingLock<SUI>>();
    vesting::claim(&mut lock, &clock, scenario.ctx());
    assert!(vesting::released(&lock) == TOTAL);
    // A second claim after full vest is a no-op (covered by
    // empty_claim_is_a_noop's path — released == vested).
    ts::return_shared(lock);

    clock.destroy_for_testing();
    scenario.end();
}
