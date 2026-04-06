
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
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let clock = clock::create_for_testing(scenario.ctx());
        treasury::create_treasury<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
        scenario.return_to_sender(admin_cap);
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
        assert!(treasury::treasury_balance(&treasury) == 10);

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
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let clock = clock::create_for_testing(scenario.ctx());
        treasury::create_treasury<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
        scenario.return_to_sender(admin_cap);
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
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let clock = clock::create_for_testing(scenario.ctx());
        treasury::create_treasury<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
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

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut treasury = scenario.take_shared<treasury::Treasury<SUI>>();

        treasury::withdraw_fees(&mut treasury, 10, scenario.ctx());
        assert!(treasury::treasury_balance(&treasury) == 0);

        test_scenario::return_shared(treasury);
        scenario.return_to_sender(admin_cap);
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
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let clock = clock::create_for_testing(scenario.ctx());
        treasury::create_treasury<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);

        transfer::public_transfer(admin_cap, attacker);
    };

    scenario.next_tx(attacker);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut treasury = scenario.take_shared<treasury::Treasury<SUI>>();
        treasury::withdraw_fees(&mut treasury, 1, scenario.ctx());
        test_scenario::return_shared(treasury);
        scenario.return_to_sender(admin_cap);
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
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let clock = clock::create_for_testing(scenario.ctx());
        treasury::create_treasury<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
        scenario.return_to_sender(admin_cap);
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

#[test]
fun test_receive_coins() {
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    {
        core::init_for_testing(scenario.ctx());
    };

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let clock = clock::create_for_testing(scenario.ctx());
        treasury::create_treasury<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
        scenario.return_to_sender(admin_cap);
    };

    // Simulate sending a coin to the treasury object via transferObjects
    scenario.next_tx(admin_addr);
    {
        let treasury = scenario.take_shared<treasury::Treasury<SUI>>();
        let treasury_id = object::id(&treasury);
        let coin = coin::mint_for_testing<SUI>(500, scenario.ctx());
        transfer::public_transfer(coin, treasury_id.to_address());
        test_scenario::return_shared(treasury);
    };

    // Admin claims the coin via receive_coins
    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut treasury = scenario.take_shared<treasury::Treasury<SUI>>();

        let receiving = test_scenario::most_recent_receiving_ticket<sui::coin::Coin<SUI>>(&object::id(&treasury));
        treasury::receive_coins(&mut treasury, &admin_cap, receiving);

        assert!(treasury::treasury_balance(&treasury) == 500);
        assert!(treasury::total_collected(&treasury) == 500);

        test_scenario::return_shared(treasury);
        scenario.return_to_sender(admin_cap);
    };

    scenario.end();
}

#[test]
fun test_propose_and_accept_admin_transfer() {
    let admin_addr = @0xA;
    let new_admin = @0xB;
    let mut scenario = test_scenario::begin(admin_addr);

    {
        core::init_for_testing(scenario.ctx());
    };

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let clock = clock::create_for_testing(scenario.ctx());
        treasury::create_treasury<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
        scenario.return_to_sender(admin_cap);
    };

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut treasury = scenario.take_shared<treasury::Treasury<SUI>>();

        treasury::propose_admin_transfer(&mut treasury, new_admin, scenario.ctx());
        assert!(treasury::admin(&treasury) == admin_addr);

        test_scenario::return_shared(treasury);
        scenario.return_to_sender(admin_cap);
    };

    scenario.next_tx(new_admin);
    {
        let mut treasury = scenario.take_shared<treasury::Treasury<SUI>>();
        treasury::accept_admin_transfer(&mut treasury, scenario.ctx());
        assert!(treasury::admin(&treasury) == new_admin);
        test_scenario::return_shared(treasury);
    };

    scenario.end();
}

#[test]
fun test_zero_fee_operation() {
    let admin_addr = @0xA;
    let agent = @0xB;
    let mut scenario = test_scenario::begin(admin_addr);

    {
        core::init_for_testing(scenario.ctx());
    };

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let clock = clock::create_for_testing(scenario.ctx());
        treasury::create_treasury<SUI>(&clock, scenario.ctx());
        clock::destroy_for_testing(clock);
        scenario.return_to_sender(admin_cap);
    };

    // Set swap fee to 0 via timelock
    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut config = scenario.take_shared<Config>();
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, 1_000_000);

        admin::propose_fee_change(&admin_cap, &mut config, 10, 0, 5, &clock, scenario.ctx());
        clock::set_for_testing(&mut clock, 1_000_000 + constants::FEE_TIMELOCK_MS!() + 1);
        admin::execute_fee_change(&admin_cap, &mut config, &clock, scenario.ctx());

        assert!(core::fee_rate(&config, constants::OP_SWAP!()) == 0);

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };

    // Swap fee should be 0 — no balance change in treasury
    scenario.next_tx(agent);
    {
        let config = scenario.take_shared<Config>();
        let mut treasury = scenario.take_shared<treasury::Treasury<SUI>>();
        let mut payment = coin::mint_for_testing<SUI>(10_000, scenario.ctx());

        let fee = treasury::collect_fee(&mut treasury, &config, &mut payment, constants::OP_SWAP!(), scenario.ctx());

        assert!(fee == 0);
        assert!(coin::value(&payment) == 10_000);
        assert!(treasury::treasury_balance(&treasury) == 0);

        coin::burn_for_testing(payment);
        test_scenario::return_shared(config);
        test_scenario::return_shared(treasury);
    };

    scenario.end();
}
