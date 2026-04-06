#[test_only]
module t2000::allowance_tests;

use sui::coin;
use sui::sui::SUI;
use sui::clock;
use sui::test_scenario;
use t2000::allowance::{Self, Allowance};
use t2000::core::{Self, AdminCap, Config};
use t2000::constants;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fun setup_allowance(
    scenario: &mut test_scenario::Scenario,
    user: address,
    features: u64,
    expires_at: u64,
    daily_limit: u64,
    clock_time: u64,
) {
    scenario.next_tx(user);
    {
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, clock_time);
        allowance::create<SUI>(features, expires_at, daily_limit, &clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };
}

fun deposit_to_allowance(
    scenario: &mut test_scenario::Scenario,
    user: address,
    amount: u64,
) {
    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(amount, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        test_scenario::return_shared(a);
    };
}

fun admin_deduct(
    scenario: &mut test_scenario::Scenario,
    admin_addr: address,
    amount: u64,
    feature: u8,
    clock_time: u64,
) {
    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let config = scenario.take_shared<Config>();
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, clock_time);

        allowance::deduct(&mut a, &config, &admin_cap, amount, feature, &clock, scenario.ctx());

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(a);
        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };
}

// ---------------------------------------------------------------------------
// Basic lifecycle tests (updated for new signatures)
// ---------------------------------------------------------------------------

#[test]
fun test_create_and_deposit() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());

        allowance::deposit(&mut a, payment, scenario.ctx());

        assert!(allowance::balance(&a) == 500_000);
        assert!(allowance::total_deposited(&a) == 500_000);
        assert!(allowance::total_spent(&a) == 0);
        assert!(allowance::owner(&a) == user);
        assert!(allowance::permitted_features(&a) == constants::FEATURES_ALL!());
        assert!(allowance::expires_at(&a) == 0);
        assert!(allowance::daily_limit(&a) == 0);

        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
fun test_admin_deposit() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(250_000, scenario.ctx());

        allowance::admin_deposit(&mut a, &admin_cap, payment);

        assert!(allowance::balance(&a) == 250_000);
        assert!(allowance::total_deposited(&a) == 250_000);
        assert!(allowance::owner(&a) == user);

        test_scenario::return_shared(a);
        scenario.return_to_sender(admin_cap);
    };

    scenario.end();
}

#[test]
fun test_admin_deduct() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);
    admin_deduct(&mut scenario, admin_addr, 5_000, constants::FEATURE_BRIEFING!(), 2000);

    scenario.next_tx(admin_addr);
    {
        let a = scenario.take_shared<Allowance<SUI>>();
        assert!(allowance::balance(&a) == 495_000);
        assert!(allowance::total_spent(&a) == 5_000);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
fun test_multiple_deductions() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 100_000);

    admin_deduct(&mut scenario, admin_addr, 5_000, constants::FEATURE_BRIEFING!(), 2000);
    admin_deduct(&mut scenario, admin_addr, 2_000, constants::FEATURE_YIELD_ALERT!(), 3000);
    admin_deduct(&mut scenario, admin_addr, 10_000, constants::FEATURE_SESSION!(), 4000);

    scenario.next_tx(admin_addr);
    {
        let a = scenario.take_shared<Allowance<SUI>>();
        assert!(allowance::balance(&a) == 83_000);
        assert!(allowance::total_spent(&a) == 17_000);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
fun test_owner_withdraw() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::withdraw(&mut a, scenario.ctx());
        assert!(allowance::balance(&a) == 0);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
fun test_withdraw_amount() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::withdraw_amount(&mut a, 200_000, scenario.ctx());
        assert!(allowance::balance(&a) == 300_000);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
fun test_deposit_then_partial_deduct_then_withdraw() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);
    admin_deduct(&mut scenario, admin_addr, 50_000, constants::FEATURE_BRIEFING!(), 2000);

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        assert!(allowance::balance(&a) == 450_000);
        allowance::withdraw(&mut a, scenario.ctx());
        assert!(allowance::balance(&a) == 0);
        assert!(allowance::total_deposited(&a) == 500_000);
        assert!(allowance::total_spent(&a) == 50_000);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
fun test_multiple_deposits() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);

    deposit_to_allowance(&mut scenario, user, 250_000);

    scenario.next_tx(user);
    {
        let a = scenario.take_shared<Allowance<SUI>>();
        assert!(allowance::balance(&a) == 250_000);
        test_scenario::return_shared(a);
    };

    deposit_to_allowance(&mut scenario, user, 250_000);

    scenario.next_tx(user);
    {
        let a = scenario.take_shared<Allowance<SUI>>();
        assert!(allowance::balance(&a) == 500_000);
        assert!(allowance::total_deposited(&a) == 500_000);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
fun test_withdraw_empty_is_noop() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::withdraw(&mut a, scenario.ctx());
        assert!(allowance::balance(&a) == 0);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

// ---------------------------------------------------------------------------
// Scoping tests — feature bitmask
// ---------------------------------------------------------------------------

#[test]
fun test_single_feature_bitmask() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    // Only SESSION (bit 4) permitted
    let session_only = 1u64 << (constants::FEATURE_SESSION!() as u8);
    setup_allowance(&mut scenario, user, session_only, 0, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);

    // Deduct SESSION — should succeed
    admin_deduct(&mut scenario, admin_addr, 5_000, constants::FEATURE_SESSION!(), 2000);

    scenario.next_tx(admin_addr);
    {
        let a = scenario.take_shared<Allowance<SUI>>();
        assert!(allowance::balance(&a) == 495_000);
        assert!(allowance::is_feature_permitted(&a, constants::FEATURE_SESSION!()));
        assert!(!allowance::is_feature_permitted(&a, constants::FEATURE_BRIEFING!()));
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 14, location = t2000::allowance)]
fun test_deduct_feature_not_permitted() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    // Only BRIEFING permitted
    let briefing_only = 1u64 << (constants::FEATURE_BRIEFING!() as u8);
    setup_allowance(&mut scenario, user, briefing_only, 0, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);

    // Try to deduct SESSION — should abort with feature_not_permitted (14)
    admin_deduct(&mut scenario, admin_addr, 5_000, constants::FEATURE_SESSION!(), 2000);

    scenario.end();
}

// ---------------------------------------------------------------------------
// Scoping tests — expiry
// ---------------------------------------------------------------------------

#[test]
fun test_deduct_before_expiry() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    // Expires at 100_000
    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 100_000, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);

    // Deduct at 50_000 — before expiry, should succeed
    admin_deduct(&mut scenario, admin_addr, 5_000, constants::FEATURE_BRIEFING!(), 50_000);

    scenario.next_tx(admin_addr);
    {
        let a = scenario.take_shared<Allowance<SUI>>();
        assert!(allowance::balance(&a) == 495_000);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 15, location = t2000::allowance)]
fun test_deduct_expired() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    // Expires at 100_000
    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 100_000, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);

    // Deduct at 200_000 — after expiry, should abort with allowance_expired (15)
    admin_deduct(&mut scenario, admin_addr, 5_000, constants::FEATURE_BRIEFING!(), 200_000);

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 17, location = t2000::allowance)]
fun test_create_expired_already() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    // Create with expires_at=500, but clock is at 1000 — already expired
    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 500, 0, 1000);

    scenario.end();
}

// ---------------------------------------------------------------------------
// Scoping tests — daily limit
// ---------------------------------------------------------------------------

#[test]
fun test_deduct_within_daily_limit() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    // Daily limit of 10_000
    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 10_000, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);

    // Deduct 5_000 — within limit
    admin_deduct(&mut scenario, admin_addr, 5_000, constants::FEATURE_BRIEFING!(), 2000);
    // Deduct another 5_000 — exactly at limit
    admin_deduct(&mut scenario, admin_addr, 5_000, constants::FEATURE_SESSION!(), 3000);

    scenario.next_tx(admin_addr);
    {
        let a = scenario.take_shared<Allowance<SUI>>();
        assert!(allowance::balance(&a) == 490_000);
        assert!(allowance::daily_spent(&a) == 10_000);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 16, location = t2000::allowance)]
fun test_deduct_exceeds_daily_limit() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    // Daily limit of 10_000
    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 10_000, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);

    // Deduct 8_000 — within limit
    admin_deduct(&mut scenario, admin_addr, 8_000, constants::FEATURE_BRIEFING!(), 2000);
    // Deduct 5_000 more — exceeds limit (8_000 + 5_000 = 13_000 > 10_000)
    admin_deduct(&mut scenario, admin_addr, 5_000, constants::FEATURE_SESSION!(), 3000);

    scenario.end();
}

#[test]
fun test_daily_window_reset() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    // Daily limit of 10_000, created at t=1000
    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 10_000, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);

    // Deduct to the limit at t=2000
    admin_deduct(&mut scenario, admin_addr, 10_000, constants::FEATURE_BRIEFING!(), 2000);

    // Advance past 24h window (1000 + 86_400_000 = 86_401_000)
    // Deduct again — window should reset, so this succeeds
    admin_deduct(&mut scenario, admin_addr, 5_000, constants::FEATURE_BRIEFING!(), 86_402_000);

    scenario.next_tx(admin_addr);
    {
        let a = scenario.take_shared<Allowance<SUI>>();
        assert!(allowance::balance(&a) == 485_000);
        assert!(allowance::daily_spent(&a) == 5_000);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
fun test_no_limit_no_tracking() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    // daily_limit = 0 means no limit
    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);

    // Multiple large deducts — should all succeed
    admin_deduct(&mut scenario, admin_addr, 100_000, constants::FEATURE_BRIEFING!(), 2000);
    admin_deduct(&mut scenario, admin_addr, 100_000, constants::FEATURE_SESSION!(), 3000);
    admin_deduct(&mut scenario, admin_addr, 100_000, constants::FEATURE_DCA!(), 4000);

    scenario.next_tx(admin_addr);
    {
        let a = scenario.take_shared<Allowance<SUI>>();
        assert!(allowance::balance(&a) == 200_000);
        assert!(allowance::daily_spent(&a) == 0);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

// ---------------------------------------------------------------------------
// Scoping tests — update_scope
// ---------------------------------------------------------------------------

#[test]
fun test_update_scope() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);

    let new_features = 1u64 << (constants::FEATURE_BRIEFING!() as u8);
    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, 5000);

        allowance::update_scope(&mut a, new_features, 500_000, 20_000, &clock, scenario.ctx());

        assert!(allowance::permitted_features(&a) == new_features);
        assert!(allowance::expires_at(&a) == 500_000);
        assert!(allowance::daily_limit(&a) == 20_000);
        assert!(allowance::daily_spent(&a) == 0);

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
fun test_update_scope_resets_daily_spent() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    // Start with daily_limit=10_000
    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 10_000, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);

    // Spend 5_000
    admin_deduct(&mut scenario, admin_addr, 5_000, constants::FEATURE_BRIEFING!(), 2000);

    // Owner changes daily_limit — daily_spent should reset
    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, 3000);

        assert!(allowance::daily_spent(&a) == 5_000);
        allowance::update_scope(&mut a, constants::FEATURES_ALL!(), 0, 20_000, &clock, scenario.ctx());
        assert!(allowance::daily_spent(&a) == 0);
        assert!(allowance::daily_limit(&a) == 20_000);

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 11, location = t2000::allowance)]
fun test_update_scope_not_owner() {
    let user = @0xB;
    let attacker = @0xC;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);

    scenario.next_tx(attacker);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, 2000);

        allowance::update_scope(&mut a, 0, 0, 0, &clock, scenario.ctx());

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

// ---------------------------------------------------------------------------
// is_expired read helper
// ---------------------------------------------------------------------------

#[test]
fun test_is_expired_helper() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 100_000, 0, 1000);

    scenario.next_tx(user);
    {
        let a = scenario.take_shared<Allowance<SUI>>();

        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, 50_000);
        assert!(!allowance::is_expired(&a, &clock));

        clock::set_for_testing(&mut clock, 200_000);
        assert!(allowance::is_expired(&a, &clock));

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

// ---------------------------------------------------------------------------
// Failure tests (original, updated signatures)
// ---------------------------------------------------------------------------

#[test]
#[expected_failure(abort_code = 11, location = t2000::allowance)]
fun test_deposit_not_owner() {
    let user = @0xB;
    let attacker = @0xC;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);

    scenario.next_tx(attacker);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 11, location = t2000::allowance)]
fun test_withdraw_not_owner() {
    let user = @0xB;
    let attacker = @0xC;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);

    scenario.next_tx(attacker);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::withdraw(&mut a, scenario.ctx());
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 11, location = t2000::allowance)]
fun test_withdraw_amount_not_owner() {
    let user = @0xB;
    let attacker = @0xC;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);

    scenario.next_tx(attacker);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::withdraw_amount(&mut a, 100_000, scenario.ctx());
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 12, location = t2000::allowance)]
fun test_deduct_insufficient_balance() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 1_000);

    admin_deduct(&mut scenario, admin_addr, 5_000, constants::FEATURE_BRIEFING!(), 2000);

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 2, location = t2000::allowance)]
fun test_deduct_zero_amount() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);

    admin_deduct(&mut scenario, admin_addr, 0, constants::FEATURE_BRIEFING!(), 2000);

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 13, location = t2000::allowance)]
fun test_deduct_invalid_feature() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 500_000);

    // Feature 99 is > MAX_FEATURE (63)
    admin_deduct(&mut scenario, admin_addr, 5_000, 99, 2000);

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 2, location = t2000::allowance)]
fun test_deposit_zero_amount() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(0, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 12, location = t2000::allowance)]
fun test_withdraw_amount_insufficient() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 100_000);

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::withdraw_amount(&mut a, 500_000, scenario.ctx());
        test_scenario::return_shared(a);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 2, location = t2000::allowance)]
fun test_withdraw_amount_zero() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    setup_allowance(&mut scenario, user, constants::FEATURES_ALL!(), 0, 0, 1000);
    deposit_to_allowance(&mut scenario, user, 100_000);

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::withdraw_amount(&mut a, 0, scenario.ctx());
        test_scenario::return_shared(a);
    };

    scenario.end();
}
