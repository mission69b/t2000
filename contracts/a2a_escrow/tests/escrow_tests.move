#[test_only]
module a2a_escrow::escrow_tests;

use a2a_escrow::escrow::{Self, Job};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;

const BUYER: address = @0xA;
const SELLER: address = @0xB;
const STRANGER: address = @0xC;

const AMOUNT: u64 = 1_000_000; // 1 USDC-equivalent (6dp)
const DELIVER_BY: u64 = 1_000_000; // ms
const REVIEW_WINDOW: u64 = 100_000; // ms
const SPLIT_BPS: u64 = 8_000; // buyer gets 80% on reject

fun new_clock(sc: &mut ts::Scenario): Clock {
    clock::create_for_testing(ts::ctx(sc))
}

fun create_job(sc: &mut ts::Scenario, clk: &Clock) {
    ts::next_tx(sc, BUYER);
    let payment = coin::mint_for_testing<SUI>(AMOUNT, ts::ctx(sc));
    escrow::create<SUI>(
        SELLER,
        payment,
        b"spec-hash",
        DELIVER_BY,
        REVIEW_WINDOW,
        SPLIT_BPS,
        clk,
        ts::ctx(sc),
    );
}

fun deliver(sc: &mut ts::Scenario, clk: &Clock) {
    ts::next_tx(sc, SELLER);
    let mut job = ts::take_shared<Job<SUI>>(sc);
    escrow::deliver(&mut job, b"walrus-blob-hash", clk, ts::ctx(sc));
    ts::return_shared(job);
}

fun assert_received(sc: &mut ts::Scenario, who: address, expect: u64) {
    ts::next_tx(sc, who);
    let received = ts::take_from_address<Coin<SUI>>(sc, who);
    assert!(received.value() == expect, 100);
    ts::return_to_address(who, received);
}

// === Happy path: create → deliver → buyer accepts ===
#[test]
fun create_deliver_release() {
    let mut sc = ts::begin(BUYER);
    let clk = new_clock(&mut sc);
    create_job(&mut sc, &clk);

    ts::next_tx(&mut sc, BUYER);
    {
        let job = ts::take_shared<Job<SUI>>(&sc);
        assert!(escrow::state(&job) == escrow::state_funded(), 0);
        assert!(escrow::buyer(&job) == BUYER, 1);
        assert!(escrow::seller(&job) == SELLER, 2);
        assert!(escrow::escrow_value(&job) == AMOUNT, 3);
        ts::return_shared(job);
    };

    deliver(&mut sc, &clk);

    ts::next_tx(&mut sc, BUYER);
    {
        let mut job = ts::take_shared<Job<SUI>>(&sc);
        assert!(escrow::state(&job) == escrow::state_delivered(), 4);
        assert!(escrow::delivery_hash(&job) == b"walrus-blob-hash", 5);
        escrow::release(&mut job, &clk, ts::ctx(&mut sc));
        assert!(escrow::state(&job) == escrow::state_released(), 6);
        assert!(escrow::escrow_value(&job) == 0, 7);
        ts::return_shared(job);
    };

    assert_received(&mut sc, SELLER, AMOUNT);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Timeout crank 1: review window lapses → ANYONE releases to seller ===
#[test]
fun timeout_release_by_stranger() {
    let mut sc = ts::begin(BUYER);
    let mut clk = new_clock(&mut sc);
    create_job(&mut sc, &clk);
    deliver(&mut sc, &clk);

    // Advance past delivered_at (0) + review window.
    clk.increment_for_testing(REVIEW_WINDOW + 1);

    ts::next_tx(&mut sc, STRANGER);
    {
        let mut job = ts::take_shared<Job<SUI>>(&sc);
        escrow::release(&mut job, &clk, ts::ctx(&mut sc));
        assert!(escrow::state(&job) == escrow::state_released(), 0);
        ts::return_shared(job);
    };

    assert_received(&mut sc, SELLER, AMOUNT);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Stranger CANNOT release while the review window is open ===
#[test]
#[expected_failure(abort_code = escrow::EReviewWindowOpen)]
fun stranger_release_inside_window_fails() {
    let mut sc = ts::begin(BUYER);
    let clk = new_clock(&mut sc);
    create_job(&mut sc, &clk);
    deliver(&mut sc, &clk);

    ts::next_tx(&mut sc, STRANGER);
    let mut job = ts::take_shared<Job<SUI>>(&sc);
    escrow::release(&mut job, &clk, ts::ctx(&mut sc));
    abort 99
}

// === Timeout crank 2: no delivery by deadline → ANYONE refunds the buyer ===
#[test]
fun deadline_refund_by_stranger() {
    let mut sc = ts::begin(BUYER);
    let mut clk = new_clock(&mut sc);
    create_job(&mut sc, &clk);

    clk.increment_for_testing(DELIVER_BY + 1);

    ts::next_tx(&mut sc, STRANGER);
    {
        let mut job = ts::take_shared<Job<SUI>>(&sc);
        escrow::refund(&mut job, &clk, ts::ctx(&mut sc));
        assert!(escrow::state(&job) == escrow::state_refunded(), 0);
        ts::return_shared(job);
    };

    assert_received(&mut sc, BUYER, AMOUNT);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Refund is closed before the deadline ===
#[test]
#[expected_failure(abort_code = escrow::EDeadlineNotReached)]
fun refund_before_deadline_fails() {
    let mut sc = ts::begin(BUYER);
    let clk = new_clock(&mut sc);
    create_job(&mut sc, &clk);

    ts::next_tx(&mut sc, BUYER);
    let mut job = ts::take_shared<Job<SUI>>(&sc);
    escrow::refund(&mut job, &clk, ts::ctx(&mut sc));
    abort 99
}

// === Refund is closed once delivered (buyer must accept/reject) ===
#[test]
#[expected_failure(abort_code = escrow::EWrongState)]
fun refund_after_delivery_fails() {
    let mut sc = ts::begin(BUYER);
    let mut clk = new_clock(&mut sc);
    create_job(&mut sc, &clk);
    deliver(&mut sc, &clk);

    clk.increment_for_testing(DELIVER_BY + 1);
    ts::next_tx(&mut sc, BUYER);
    let mut job = ts::take_shared<Job<SUI>>(&sc);
    escrow::refund(&mut job, &clk, ts::ctx(&mut sc));
    abort 99
}

// === Reject within window → split per create terms ===
#[test]
fun reject_splits_per_terms() {
    let mut sc = ts::begin(BUYER);
    let clk = new_clock(&mut sc);
    create_job(&mut sc, &clk);
    deliver(&mut sc, &clk);

    ts::next_tx(&mut sc, BUYER);
    {
        let mut job = ts::take_shared<Job<SUI>>(&sc);
        escrow::reject(&mut job, &clk, ts::ctx(&mut sc));
        assert!(escrow::state(&job) == escrow::state_rejected(), 0);
        assert!(escrow::escrow_value(&job) == 0, 1);
        ts::return_shared(job);
    };

    // 80/20 split of 1_000_000.
    assert_received(&mut sc, BUYER, 800_000);
    assert_received(&mut sc, SELLER, 200_000);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Reject after the window closes fails (release crank owns it now) ===
#[test]
#[expected_failure(abort_code = escrow::EReviewWindowClosed)]
fun reject_after_window_fails() {
    let mut sc = ts::begin(BUYER);
    let mut clk = new_clock(&mut sc);
    create_job(&mut sc, &clk);
    deliver(&mut sc, &clk);

    clk.increment_for_testing(REVIEW_WINDOW + 1);
    ts::next_tx(&mut sc, BUYER);
    let mut job = ts::take_shared<Job<SUI>>(&sc);
    escrow::reject(&mut job, &clk, ts::ctx(&mut sc));
    abort 99
}

// === Only the buyer can reject ===
#[test]
#[expected_failure(abort_code = escrow::ENotAuthorized)]
fun stranger_reject_fails() {
    let mut sc = ts::begin(BUYER);
    let clk = new_clock(&mut sc);
    create_job(&mut sc, &clk);
    deliver(&mut sc, &clk);

    ts::next_tx(&mut sc, STRANGER);
    let mut job = ts::take_shared<Job<SUI>>(&sc);
    escrow::reject(&mut job, &clk, ts::ctx(&mut sc));
    abort 99
}

// === Only the seller can deliver ===
#[test]
#[expected_failure(abort_code = escrow::ENotAuthorized)]
fun stranger_deliver_fails() {
    let mut sc = ts::begin(BUYER);
    let clk = new_clock(&mut sc);
    create_job(&mut sc, &clk);

    ts::next_tx(&mut sc, STRANGER);
    let mut job = ts::take_shared<Job<SUI>>(&sc);
    escrow::deliver(&mut job, b"x", &clk, ts::ctx(&mut sc));
    abort 99
}

// === Late delivery fails (refund crank owns it now) ===
#[test]
#[expected_failure(abort_code = escrow::EPastDeadline)]
fun late_deliver_fails() {
    let mut sc = ts::begin(BUYER);
    let mut clk = new_clock(&mut sc);
    create_job(&mut sc, &clk);

    clk.increment_for_testing(DELIVER_BY + 1);
    ts::next_tx(&mut sc, SELLER);
    let mut job = ts::take_shared<Job<SUI>>(&sc);
    escrow::deliver(&mut job, b"x", &clk, ts::ctx(&mut sc));
    abort 99
}

// === Buyer may release a FUNDED job voluntarily (off-band delivery) ===
#[test]
fun buyer_release_before_delivery() {
    let mut sc = ts::begin(BUYER);
    let clk = new_clock(&mut sc);
    create_job(&mut sc, &clk);

    ts::next_tx(&mut sc, BUYER);
    {
        let mut job = ts::take_shared<Job<SUI>>(&sc);
        escrow::release(&mut job, &clk, ts::ctx(&mut sc));
        assert!(escrow::state(&job) == escrow::state_released(), 0);
        ts::return_shared(job);
    };

    assert_received(&mut sc, SELLER, AMOUNT);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === A stranger can NEVER release a FUNDED job ===
#[test]
#[expected_failure(abort_code = escrow::ENotAuthorized)]
fun stranger_release_funded_fails() {
    let mut sc = ts::begin(BUYER);
    let clk = new_clock(&mut sc);
    create_job(&mut sc, &clk);

    ts::next_tx(&mut sc, STRANGER);
    let mut job = ts::take_shared<Job<SUI>>(&sc);
    escrow::release(&mut job, &clk, ts::ctx(&mut sc));
    abort 99
}

// === Settled jobs are terminal: no double-settle from any path ===
#[test]
#[expected_failure(abort_code = escrow::EWrongState)]
fun double_release_fails() {
    let mut sc = ts::begin(BUYER);
    let clk = new_clock(&mut sc);
    create_job(&mut sc, &clk);
    deliver(&mut sc, &clk);

    ts::next_tx(&mut sc, BUYER);
    {
        let mut job = ts::take_shared<Job<SUI>>(&sc);
        escrow::release(&mut job, &clk, ts::ctx(&mut sc));
        ts::return_shared(job);
    };
    ts::next_tx(&mut sc, BUYER);
    let mut job = ts::take_shared<Job<SUI>>(&sc);
    escrow::release(&mut job, &clk, ts::ctx(&mut sc));
    abort 99
}

// === Create guards ===
#[test]
#[expected_failure(abort_code = escrow::EBuyerIsSeller)]
fun self_job_fails() {
    let mut sc = ts::begin(BUYER);
    let clk = new_clock(&mut sc);
    ts::next_tx(&mut sc, BUYER);
    let payment = coin::mint_for_testing<SUI>(AMOUNT, ts::ctx(&mut sc));
    escrow::create<SUI>(
        BUYER,
        payment,
        b"s",
        DELIVER_BY,
        REVIEW_WINDOW,
        SPLIT_BPS,
        &clk,
        ts::ctx(&mut sc),
    );
    abort 99
}

#[test]
#[expected_failure(abort_code = escrow::EZeroAmount)]
fun zero_amount_fails() {
    let mut sc = ts::begin(BUYER);
    let clk = new_clock(&mut sc);
    ts::next_tx(&mut sc, BUYER);
    let payment = coin::zero<SUI>(ts::ctx(&mut sc));
    escrow::create<SUI>(
        SELLER,
        payment,
        b"s",
        DELIVER_BY,
        REVIEW_WINDOW,
        SPLIT_BPS,
        &clk,
        ts::ctx(&mut sc),
    );
    abort 99
}

#[test]
#[expected_failure(abort_code = escrow::EDeadlineInPast)]
fun past_deadline_create_fails() {
    let mut sc = ts::begin(BUYER);
    let mut clk = new_clock(&mut sc);
    clk.increment_for_testing(DELIVER_BY + 1);
    ts::next_tx(&mut sc, BUYER);
    let payment = coin::mint_for_testing<SUI>(AMOUNT, ts::ctx(&mut sc));
    escrow::create<SUI>(
        SELLER,
        payment,
        b"s",
        DELIVER_BY,
        REVIEW_WINDOW,
        SPLIT_BPS,
        &clk,
        ts::ctx(&mut sc),
    );
    abort 99
}

#[test]
#[expected_failure(abort_code = escrow::EBadSplit)]
fun bad_split_fails() {
    let mut sc = ts::begin(BUYER);
    let clk = new_clock(&mut sc);
    ts::next_tx(&mut sc, BUYER);
    let payment = coin::mint_for_testing<SUI>(AMOUNT, ts::ctx(&mut sc));
    escrow::create<SUI>(
        SELLER,
        payment,
        b"s",
        DELIVER_BY,
        REVIEW_WINDOW,
        10_001,
        &clk,
        ts::ctx(&mut sc),
    );
    abort 99
}
