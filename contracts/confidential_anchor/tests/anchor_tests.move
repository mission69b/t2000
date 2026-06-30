#[test_only]
module confidential_anchor::anchor_tests;

use confidential_anchor::anchor;
use std::string;
use sui::clock;
use sui::test_scenario;

#[test]
fun anchors_a_receipt_and_emits_one_event() {
    let sender = @0xA11CE;
    let mut scenario = test_scenario::begin(sender);
    let clock = clock::create_for_testing(scenario.ctx());
    {
        anchor::anchor_receipt(
            string::utf8(b"rcpt-5dcc28723a187f621fba741c"),
            string::utf8(b"sha256:4a5f9db8ab2d663f972566afc4a61d136d65591e3072a99794055e52ff222b1e"),
            string::utf8(b"sha256:3def476b72026924f9d88f7b339b2e211553fc2486c6a974d5f330162f183eda"),
            1_782_811_955_000,
            &clock,
            scenario.ctx(),
        );
    };
    // One ReceiptAnchored event emitted in that tx.
    let effects = scenario.next_tx(sender);
    assert!(effects.num_user_events() == 1, 0);
    clock.destroy_for_testing();
    scenario.end();
}
