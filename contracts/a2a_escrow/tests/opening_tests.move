#[test_only]
module a2a_escrow::opening_tests;

use a2a_escrow::escrow::{Self, AdminCap, FeeConfig, Job};
use a2a_escrow::opening::{Self, Opening};
use agent_id::registry::{Self, Registry};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;

const ADMIN: address = @0xAD; // deployer = initial fee receiver
const BUYER: address = @0xA;
const ASP: address = @0xB; // registered + active claimer
const LURKER: address = @0xC; // never registered
const IDLE_ASP: address = @0xD; // registered, then deactivated

const AMOUNT: u64 = 1_000_000; // 1 USDC-equivalent (6dp)
const OPEN_UNTIL: u64 = 500_000; // ms
const SLA_MS: u64 = 400_000; // ms
const REVIEW_WINDOW: u64 = 100_000; // ms
// v3 (S.1019): create_open accepts ONLY 10_000 — reject pays the buyer
// in full on open work. 8_000 aborts (pinned below).
const SPLIT_BPS: u64 = 10_000;
const POLICY_ANY: u8 = 0;

// 2.5% (test-init FeeConfig default) of AMOUNT.
const FEE: u64 = 25_000;

fun setup(): (ts::Scenario, Clock) {
    let mut sc = ts::begin(ADMIN);
    escrow::init_for_testing(ts::ctx(&mut sc));
    registry::init_for_testing(ts::ctx(&mut sc));
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    // ASP registers itself (self-sovereign) and stays active.
    register_agent(&mut sc, &clk, ASP);
    // IDLE_ASP registers, then flips itself inactive.
    register_agent(&mut sc, &clk, IDLE_ASP);
    ts::next_tx(&mut sc, IDLE_ASP);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        registry::set_active(&mut reg, IDLE_ASP, false, &clk, ts::ctx(&mut sc));
        ts::return_shared(reg);
    };
    (sc, clk)
}

fun register_agent(sc: &mut ts::Scenario, clk: &Clock, who: address) {
    ts::next_tx(sc, who);
    let mut reg = ts::take_shared<Registry>(sc);
    registry::register(
        &mut reg,
        option::none(),
        vector[],
        option::none(),
        option::none(),
        clk,
        ts::ctx(sc),
    );
    ts::return_shared(reg);
}

fun post_open(sc: &mut ts::Scenario, clk: &Clock) {
    post_open_with(sc, clk, AMOUNT, OPEN_UNTIL, SLA_MS, REVIEW_WINDOW, SPLIT_BPS, POLICY_ANY)
}

fun post_open_with(
    sc: &mut ts::Scenario,
    clk: &Clock,
    amount: u64,
    open_until_ms: u64,
    sla_ms: u64,
    review_window_ms: u64,
    reject_split_bps: u64,
    claim_policy: u8,
) {
    ts::next_tx(sc, BUYER);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let payment = coin::mint_for_testing<SUI>(amount, ts::ctx(sc));
    opening::create_open<SUI>(
        payment,
        b"open-spec-hash",
        open_until_ms,
        sla_ms,
        review_window_ms,
        reject_split_bps,
        claim_policy,
        &cfg,
        clk,
        ts::ctx(sc),
    );
    ts::return_shared(cfg);
}

fun claim_as(sc: &mut ts::Scenario, who: address, clk: &Clock): ID {
    ts::next_tx(sc, who);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let reg = ts::take_shared<Registry>(sc);
    let op = ts::take_shared<Opening<SUI>>(sc);
    let job_id = opening::claim(op, &reg, &cfg, clk, ts::ctx(sc));
    ts::return_shared(reg);
    ts::return_shared(cfg);
    job_id
}

fun assert_received(sc: &mut ts::Scenario, who: address, expect: u64) {
    ts::next_tx(sc, who);
    let received = ts::take_from_address<Coin<SUI>>(sc, who);
    assert!(received.value() == expect, 100);
    ts::return_to_address(who, received);
}

// === Happy path ===

#[test]
fun post_claim_deliver_release_pays_asp_minus_fee() {
    let (mut sc, mut clk) = setup();
    post_open(&mut sc, &clk);
    clk.set_for_testing(10_000);
    let job_id = claim_as(&mut sc, ASP, &clk);

    // The minted Job carries the Opening's terms: buyer/seller bound, amount
    // conserved, deliver_by = claim time + SLA, fee from the post snapshot.
    ts::next_tx(&mut sc, ASP);
    {
        let job = ts::take_shared<Job<SUI>>(&sc);
        assert!(object::id(&job) == job_id, 0);
        assert!(escrow::buyer(&job) == BUYER, 1);
        assert!(escrow::seller(&job) == ASP, 2);
        assert!(escrow::amount(&job) == AMOUNT, 3);
        assert!(escrow::escrow_value(&job) == AMOUNT, 4);
        assert!(escrow::deliver_by_ms(&job) == 10_000 + SLA_MS, 5);
        assert!(escrow::fee_bps(&job) == escrow::default_fee_bps(), 6);
        assert!(escrow::state(&job) == escrow::state_funded(), 7);
        ts::return_shared(job);
    };

    // Normal Job lifecycle from here: deliver then buyer-accept release.
    ts::next_tx(&mut sc, ASP);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared<Job<SUI>>(&sc);
        escrow::deliver(&mut job, b"delivery-hash", &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared<Job<SUI>>(&sc);
        escrow::release(&mut job, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    assert_received(&mut sc, ASP, AMOUNT - FEE);
    assert_received(&mut sc, ADMIN, FEE); // fee receiver = deployer in tests
    ts::end(sc);
    clk.destroy_for_testing();
}

// === Claim gates ===

#[test]
#[expected_failure] // second taker finds no shared Opening left
fun second_claim_fails() {
    let (mut sc, mut clk) = setup();
    post_open(&mut sc, &clk);
    clk.set_for_testing(10_000);
    claim_as(&mut sc, ASP, &clk);
    register_agent(&mut sc, &clk, LURKER);
    claim_as(&mut sc, LURKER, &clk);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EClaimerIsBuyer)]
fun self_claim_fails() {
    let (mut sc, clk) = setup();
    post_open(&mut sc, &clk);
    register_agent(&mut sc, &clk, BUYER); // even a registered buyer can't
    claim_as(&mut sc, BUYER, &clk);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::ENotActiveAgent)]
fun unregistered_claim_fails() {
    let (mut sc, clk) = setup();
    post_open(&mut sc, &clk);
    claim_as(&mut sc, LURKER, &clk);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::ENotActiveAgent)]
fun inactive_agent_claim_fails() {
    let (mut sc, clk) = setup();
    post_open(&mut sc, &clk);
    claim_as(&mut sc, IDLE_ASP, &clk);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EOpeningExpired)]
fun claim_after_open_until_fails() {
    let (mut sc, mut clk) = setup();
    post_open(&mut sc, &clk);
    clk.set_for_testing(OPEN_UNTIL + 1);
    claim_as(&mut sc, ASP, &clk);
    abort 0
}

// === Fee snapshot (terms fixed at post — D-1) ===

#[test]
fun fee_bps_snapshots_at_post_not_claim() {
    let (mut sc, mut clk) = setup();
    post_open(&mut sc, &clk);
    // Admin doubles the fee AFTER the post but BEFORE the claim.
    ts::next_tx(&mut sc, ADMIN);
    {
        let cap = ts::take_from_sender<AdminCap>(&sc);
        let mut cfg = ts::take_shared<FeeConfig>(&sc);
        escrow::set_fee_bps(&cap, &mut cfg, escrow::default_fee_bps() * 2);
        ts::return_shared(cfg);
        ts::return_to_sender(&sc, cap);
    };
    clk.set_for_testing(10_000);
    claim_as(&mut sc, ASP, &clk);
    ts::next_tx(&mut sc, ASP);
    {
        let job = ts::take_shared<Job<SUI>>(&sc);
        // The Job carries the POST-time snapshot, not the raised fee.
        assert!(escrow::fee_bps(&job) == escrow::default_fee_bps(), 0);
        ts::return_shared(job);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

// === Cancel (buyer, unclaimed, fee-free, before or after expiry) ===

#[test]
fun cancel_open_returns_everything_fee_free() {
    let (mut sc, clk) = setup();
    post_open(&mut sc, &clk);
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let op = ts::take_shared<Opening<SUI>>(&sc);
        opening::cancel_open(op, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(cfg);
    };
    assert_received(&mut sc, BUYER, AMOUNT);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = opening::ENotBuyer)]
fun cancel_open_stranger_fails() {
    let (mut sc, clk) = setup();
    post_open(&mut sc, &clk);
    ts::next_tx(&mut sc, LURKER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let op = ts::take_shared<Opening<SUI>>(&sc);
        opening::cancel_open(op, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(cfg);
    };
    abort 0
}

// === Refund crank (anyone, after expiry, fee-free) ===

#[test]
fun refund_unclaimed_after_expiry_by_anyone() {
    let (mut sc, mut clk) = setup();
    post_open(&mut sc, &clk);
    clk.set_for_testing(OPEN_UNTIL + 1);
    ts::next_tx(&mut sc, LURKER); // permissionless crank
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let op = ts::take_shared<Opening<SUI>>(&sc);
        opening::refund_unclaimed(op, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(cfg);
    };
    assert_received(&mut sc, BUYER, AMOUNT);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = opening::ENotExpired)]
fun refund_unclaimed_before_expiry_fails() {
    let (mut sc, clk) = setup();
    post_open(&mut sc, &clk);
    ts::next_tx(&mut sc, LURKER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let op = ts::take_shared<Opening<SUI>>(&sc);
        opening::refund_unclaimed(op, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(cfg);
    };
    abort 0
}

// === create_open bounds ===

#[test]
#[expected_failure(abort_code = opening::EBadClaimPolicy)]
fun create_open_undefined_policy_aborts() {
    let (mut sc, clk) = setup();
    // S.1054: 1/2 (Proven) are live — 3+ stays undefined and must abort.
    post_open_with(&mut sc, &clk, AMOUNT, OPEN_UNTIL, SLA_MS, REVIEW_WINDOW, SPLIT_BPS, 3);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EZeroAmount)]
fun create_open_zero_amount_aborts() {
    let (mut sc, clk) = setup();
    post_open_with(&mut sc, &clk, 0, OPEN_UNTIL, SLA_MS, REVIEW_WINDOW, SPLIT_BPS, POLICY_ANY);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EOpenWindowInPast)]
fun create_open_window_in_past_aborts() {
    let (mut sc, mut clk) = setup();
    clk.set_for_testing(10_000);
    post_open_with(&mut sc, &clk, AMOUNT, 10_000, SLA_MS, REVIEW_WINDOW, SPLIT_BPS, POLICY_ANY);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EOpenWindowTooFar)]
fun create_open_window_too_far_aborts() {
    let (mut sc, clk) = setup();
    post_open_with(
        &mut sc,
        &clk,
        AMOUNT,
        opening::max_open_window_ms() + 1,
        SLA_MS,
        REVIEW_WINDOW,
        SPLIT_BPS,
        POLICY_ANY,
    );
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::ESlaOutOfRange)]
fun create_open_sla_too_long_aborts() {
    let (mut sc, clk) = setup();
    post_open_with(
        &mut sc,
        &clk,
        AMOUNT,
        OPEN_UNTIL,
        escrow::max_deliver_horizon_ms() + 1,
        REVIEW_WINDOW,
        SPLIT_BPS,
        POLICY_ANY,
    );
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EReviewWindowTooLong)]
fun create_open_review_window_too_long_aborts() {
    let (mut sc, clk) = setup();
    post_open_with(
        &mut sc,
        &clk,
        AMOUNT,
        OPEN_UNTIL,
        SLA_MS,
        escrow::max_review_window_ms() + 1,
        SPLIT_BPS,
        POLICY_ANY,
    );
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EBadSplit)]
fun create_open_bad_split_aborts() {
    let (mut sc, clk) = setup();
    post_open_with(&mut sc, &clk, AMOUNT, OPEN_UNTIL, SLA_MS, REVIEW_WINDOW, 10_001, POLICY_ANY);
    abort 0
}

// === Decline on an Open-claimed Job (SPEC_T2_AGENTS_TRUST §B.3) ===

#[test]
fun claimed_opening_job_can_be_declined() {
    let (mut sc, mut clk) = setup();
    post_open(&mut sc, &clk);
    clk.set_for_testing(10_000);
    claim_as(&mut sc, ASP, &clk);
    // The claiming ASP backs out pre-delivery — full fee-free refund. The
    // Opening was consumed at claim, so the board posting does NOT
    // resurrect; the buyer re-posts if they still want the work.
    ts::next_tx(&mut sc, ASP);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared<Job<SUI>>(&sc);
        escrow::decline(&mut job, &cfg, &clk, ts::ctx(&mut sc));
        assert!(escrow::state(&job) == escrow::state_refunded(), 0);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    assert_received(&mut sc, BUYER, AMOUNT);
    ts::end(sc);
    clk.destroy_for_testing();
}


// === v3 (S.1019): open reject must be 100% buyer ===

#[test]
#[expected_failure(abort_code = opening::EOpenRejectMustBeFullBuyer)]
fun create_open_partial_split_aborts() {
    let (mut sc, clk) = setup();
    // The old 80/20 default is exactly what made junk delivery +EV — a
    // partial split can no longer be posted on the open board.
    post_open_with(&mut sc, &clk, AMOUNT, OPEN_UNTIL, SLA_MS, REVIEW_WINDOW, 8_000, POLICY_ANY);
    abort 0
}

#[test]
fun open_claim_deliver_reject_pays_buyer_full() {
    let (mut sc, mut clk) = setup();
    post_open(&mut sc, &clk);
    clk.set_for_testing(10_000);
    claim_as(&mut sc, ASP, &clk);
    // ASP delivers junk; buyer rejects in-window → at 10_000 bps the buyer
    // takes the FULL escrow back, seller share 0, protocol fee 0 (the fee
    // comes only from the seller-bound payout).
    ts::next_tx(&mut sc, ASP);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared<Job<SUI>>(&sc);
        escrow::deliver(&mut job, b"junk".to_string().into_bytes(), &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared<Job<SUI>>(&sc);
        escrow::reject(&mut job, &cfg, &clk, ts::ctx(&mut sc));
        assert!(escrow::state(&job) == escrow::state_rejected(), 0);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    assert_received(&mut sc, BUYER, AMOUNT);
    ts::end(sc);
    clk.destroy_for_testing();
}
