
#[test_only]
module t2000::admin_tests;

use sui::clock;
use sui::test_scenario;
use t2000::core::{Self, Config, AdminCap};
use t2000::admin;
use t2000::constants;

#[test]
fun test_pause_unpause() {
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    {
        core::init_for_testing(scenario.ctx());
    };

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut config = scenario.take_shared<Config>();

        assert!(!core::is_paused(&config));
        admin::pause(&admin_cap, &mut config, scenario.ctx());
        assert!(core::is_paused(&config));
        admin::unpause(&admin_cap, &mut config, scenario.ctx());
        assert!(!core::is_paused(&config));

        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };

    scenario.end();
}

#[test]
fun test_propose_and_execute_fee_change() {
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    {
        core::init_for_testing(scenario.ctx());
    };

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut config = scenario.take_shared<Config>();
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, 1_000_000);

        admin::propose_fee_change(
            &admin_cap, &mut config,
            20, 20, 10,
            &clock, scenario.ctx(),
        );

        clock::set_for_testing(&mut clock, 1_000_000 + constants::FEE_TIMELOCK_MS!() + 1);

        admin::execute_fee_change(&admin_cap, &mut config, &clock, scenario.ctx());

        assert!(core::fee_rate(&config, constants::OP_SAVE!()) == 20);
        assert!(core::fee_rate(&config, constants::OP_SWAP!()) == 20);
        assert!(core::fee_rate(&config, constants::OP_BORROW!()) == 10);

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 8, location = t2000::admin)]
fun test_execute_before_timelock() {
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    {
        core::init_for_testing(scenario.ctx());
    };

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut config = scenario.take_shared<Config>();
        let clock = clock::create_for_testing(scenario.ctx());

        admin::propose_fee_change(&admin_cap, &mut config, 20, 20, 10, &clock, scenario.ctx());
        admin::execute_fee_change(&admin_cap, &mut config, &clock, scenario.ctx());

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 4, location = t2000::admin)]
fun test_propose_fee_too_high() {
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    {
        core::init_for_testing(scenario.ctx());
    };

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut config = scenario.take_shared<Config>();
        let clock = clock::create_for_testing(scenario.ctx());

        admin::propose_fee_change(&admin_cap, &mut config, 600, 10, 10, &clock, scenario.ctx());

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };

    scenario.end();
}

#[test]
fun test_cancel_fee_change() {
    let admin_addr = @0xA;
    let mut scenario = test_scenario::begin(admin_addr);

    {
        core::init_for_testing(scenario.ctx());
    };

    scenario.next_tx(admin_addr);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut config = scenario.take_shared<Config>();
        let clock = clock::create_for_testing(scenario.ctx());

        admin::propose_fee_change(&admin_cap, &mut config, 20, 20, 10, &clock, scenario.ctx());
        admin::cancel_fee_change(&admin_cap, &mut config, scenario.ctx());

        assert!(core::fee_rate(&config, constants::OP_SAVE!()) == constants::DEFAULT_SAVE_FEE_BPS!());

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(config);
        scenario.return_to_sender(admin_cap);
    };

    scenario.end();
}
