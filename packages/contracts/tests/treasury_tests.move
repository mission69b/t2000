
#[test_only]
module t2000::treasury_tests;

use sui::coin;
use sui::sui::SUI;
use sui::clock;
use sui::test_scenario;
use t2000::treasury;
use t2000::core::{Self, Config, AdminCap};
use t2000::admin;
use t2000::constants;

#[test]
fun test_collect_save_fee() {
    let admin_addr = @0xA;
    let agent = @0xB;
    let mut scenario = test_scenario::begin(admin_addr);

    {
        core::init_for_testing(scenario.ctx());
    };

    scenario.next_tx(admin_addr);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        treasury::create_treasury<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(agent);
    {
        let config = scenario.take_shared<Config>();
        let mut treasury = scenario.take_shared<treasury::Treasury<SUI>>();
        let mut payment = coin::mint_for_testing<SUI>(10_000, scenario.ctx());

        let fee = treasury::collect_fee(
            &mut treasury,
            &config,
            &mut payment,
            constants::OP_SAVE!(),
            scenario.ctx(),
        );

        assert!(fee == 10);
        assert!(coin::value(&payment) == 9_990);
        assert!(treasury::total_collected(&treasury) == 10);

        coin::burn_for_testing(payment);
        test_scenario::return_shared(config);
        test_scenario::return_shared(treasury);
    };

    scenario.end();
}

#[test]
fun test_collect_borrow_fee() {
    let admin_addr = @0xA;
    let agent = @0xB;
    let mut scenario = test_scenario::begin(admin_addr);

    {
        core::init_for_testing(scenario.ctx());
    };

    scenario.next_tx(admin_addr);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        treasury::create_treasury<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(agent);
    {
        let config = scenario.take_shared<Config>();
        let mut treasury = scenario.take_shared<treasury::Treasury<SUI>>();
        let mut payment = coin::mint_for_testing<SUI>(10_000, scenario.ctx());

        let fee = treasury::collect_fee(
            &mut treasury,
            &config,
            &mut payment,
            constants::OP_BORROW!(),
            scenario.ctx(),
        );

        assert!(fee == 5);
        assert!(coin::value(&payment) == 9_995);

        coin::burn_for_testing(payment);
        test_scenario::return_shared(config);
        test_scenario::return_shared(treasury);
    };

    scenario.end();
}

#[test]
fun test_withdraw_fees() {
    let admin_addr = @0xA;
    let agent = @0xB;
    let mut scenario = test_scenario::begin(admin_addr);

    {
        core::init_for_testing(scenario.ctx());
    };

    scenario.next_tx(admin_addr);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        treasury::create_treasury<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(agent);
    {
        let config = scenario.take_shared<Config>();
        let mut treasury = scenario.take_shared<treasury::Treasury<SUI>>();
        let mut payment = coin::mint_for_testing<SUI>(10_000, scenario.ctx());

        treasury::collect_fee(&mut treasury, &config, &mut payment, constants::OP_SAVE!(), scenario.ctx());

        coin::burn_for_testing(payment);
        test_scenario::return_shared(config);
        test_scenario::return_shared(treasury);
    };

    scenario.next_tx(admin_addr);
    {
        let mut treasury = scenario.take_shared<treasury::Treasury<SUI>>();

        treasury::withdraw_fees(&mut treasury, 10, scenario.ctx());
        assert!(treasury::treasury_balance(&treasury) == 0);

        test_scenario::return_shared(treasury);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 6, location = t2000::treasury)]
fun test_withdraw_not_admin() {
    let admin_addr = @0xA;
    let attacker = @0xC;
    let mut scenario = test_scenario::begin(admin_addr);

    {
        core::init_for_testing(scenario.ctx());
    };

    scenario.next_tx(admin_addr);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        treasury::create_treasury<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(attacker);
    {
        let mut treasury = scenario.take_shared<treasury::Treasury<SUI>>();
        treasury::withdraw_fees(&mut treasury, 1, scenario.ctx());
        test_scenario::return_shared(treasury);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 1, location = t2000::treasury)]
fun test_collect_fee_when_paused() {
    let admin_addr = @0xA;
    let agent = @0xB;
    let mut scenario = test_scenario::begin(admin_addr);

    {
        core::init_for_testing(scenario.ctx());
    };

    scenario.next_tx(admin_addr);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        treasury::create_treasury<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut config = scenario.take_shared<Config>();
        admin::pause(&admin_cap, &mut config, scenario.ctx());
        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };

    scenario.next_tx(agent);
    {
        let config = scenario.take_shared<Config>();
        let mut treasury = scenario.take_shared<treasury::Treasury<SUI>>();
        let mut payment = coin::mint_for_testing<SUI>(10_000, scenario.ctx());

        treasury::collect_fee(&mut treasury, &config, &mut payment, constants::OP_SAVE!(), scenario.ctx());

        coin::burn_for_testing(payment);
        test_scenario::return_shared(config);
        test_scenario::return_shared(treasury);
    };

    scenario.end();
}
