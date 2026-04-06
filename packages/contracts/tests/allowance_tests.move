#[test_only]
module t2000::allowance_tests;

use sui::coin;
use sui::sui::SUI;
use sui::clock;
use sui::test_scenario;
use t2000::allowance::{Self, Allowance};
use t2000::core::{Self, AdminCap, Config};

#[test]
fun test_create_and_deposit() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());

        allowance::deposit(&mut a, payment, scenario.ctx());

        assert!(allowance::balance(&a) == 500_000);
        assert!(allowance::total_deposited(&a) == 500_000);
        assert!(allowance::total_spent(&a) == 0);
        assert!(allowance::owner(&a) == user);

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

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    // Admin sponsors $0.25 into user's allowance
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

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        test_scenario::return_shared(a);
    };

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let config = scenario.take_shared<Config>();
        let mut a = scenario.take_shared<Allowance<SUI>>();

        allowance::deduct(&mut a, &config, &admin_cap, 5_000, 0, scenario.ctx());

        assert!(allowance::balance(&a) == 495_000);
        assert!(allowance::total_spent(&a) == 5_000);

        test_scenario::return_shared(a);
        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };

    scenario.end();
}

#[test]
fun test_multiple_deductions() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(100_000, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        test_scenario::return_shared(a);
    };

    // Deduct briefing
    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let config = scenario.take_shared<Config>();
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::deduct(&mut a, &config, &admin_cap, 5_000, 0, scenario.ctx());
        assert!(allowance::balance(&a) == 95_000);
        test_scenario::return_shared(a);
        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };

    // Deduct rate alert
    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let config = scenario.take_shared<Config>();
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::deduct(&mut a, &config, &admin_cap, 2_000, 1, scenario.ctx());
        assert!(allowance::balance(&a) == 93_000);
        test_scenario::return_shared(a);
        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };

    // Deduct session charge
    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let config = scenario.take_shared<Config>();
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::deduct(&mut a, &config, &admin_cap, 10_000, 2, scenario.ctx());
        assert!(allowance::balance(&a) == 83_000);
        assert!(allowance::total_spent(&a) == 17_000);
        test_scenario::return_shared(a);
        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };

    scenario.end();
}

#[test]
fun test_owner_withdraw() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        test_scenario::return_shared(a);
    };

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

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        test_scenario::return_shared(a);
    };

    // Partial withdrawal
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

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        test_scenario::return_shared(a);
    };

    // Admin deducts some
    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let config = scenario.take_shared<Config>();
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::deduct(&mut a, &config, &admin_cap, 50_000, 0, scenario.ctx());
        test_scenario::return_shared(a);
        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };

    // Owner withdraws remainder
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

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    // First deposit
    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(250_000, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        assert!(allowance::balance(&a) == 250_000);
        test_scenario::return_shared(a);
    };

    // Second deposit (top-up)
    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(250_000, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
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

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::withdraw(&mut a, scenario.ctx());
        assert!(allowance::balance(&a) == 0);
        test_scenario::return_shared(a);
    };

    scenario.end();
}

// --- Failure tests ---

#[test]
#[expected_failure(abort_code = 11, location = t2000::allowance)]
fun test_deposit_not_owner() {
    let user = @0xB;
    let attacker = @0xC;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

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

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        test_scenario::return_shared(a);
    };

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

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        test_scenario::return_shared(a);
    };

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

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(1_000, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        test_scenario::return_shared(a);
    };

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let config = scenario.take_shared<Config>();
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::deduct(&mut a, &config, &admin_cap, 5_000, 0, scenario.ctx());
        test_scenario::return_shared(a);
        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 2, location = t2000::allowance)]
fun test_deduct_zero_amount() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        test_scenario::return_shared(a);
    };

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let config = scenario.take_shared<Config>();
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::deduct(&mut a, &config, &admin_cap, 0, 0, scenario.ctx());
        test_scenario::return_shared(a);
        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 13, location = t2000::allowance)]
fun test_deduct_invalid_feature() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        test_scenario::return_shared(a);
    };

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let config = scenario.take_shared<Config>();
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::deduct(&mut a, &config, &admin_cap, 5_000, 99, scenario.ctx());
        test_scenario::return_shared(a);
        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 2, location = t2000::allowance)]
fun test_deposit_zero_amount() {
    let user = @0xB;
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    { core::init_for_testing(scenario.ctx()); };

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

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

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(100_000, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        test_scenario::return_shared(a);
    };

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

    scenario.next_tx(user);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        allowance::create<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        let payment = coin::mint_for_testing<SUI>(100_000, scenario.ctx());
        allowance::deposit(&mut a, payment, scenario.ctx());
        test_scenario::return_shared(a);
    };

    scenario.next_tx(user);
    {
        let mut a = scenario.take_shared<Allowance<SUI>>();
        allowance::withdraw_amount(&mut a, 0, scenario.ctx());
        test_scenario::return_shared(a);
    };

    scenario.end();
}
