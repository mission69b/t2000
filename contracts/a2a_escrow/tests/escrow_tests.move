#[test_only]
module a2a_escrow::escrow_tests;

use a2a_escrow::escrow::{Self, AdminCap, FeeConfig, Job};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;

const ADMIN: address = @0xAD; // deployer = initial fee receiver
const BUYER: address = @0xA;
const SELLER: address = @0xB;
const STRANGER: address = @0xC;
const FEE_WALLET: address = @0xFEE;

const AMOUNT: u64 = 1_000_000; // 1 USDC-equivalent (6dp)
const DELIVER_BY: u64 = 1_000_000; // ms
const REVIEW_WINDOW: u64 = 100_000; // ms
const SPLIT_BPS: u64 = 8_000; // buyer gets 80% on reject

// 2.5% of AMOUNT.
const FEE: u64 = 25_000;

fun setup(): (ts::Scenario, Clock) {
    let mut sc = ts::begin(ADMIN);
    escrow::init_for_testing(ts::ctx(&mut sc));
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    (sc, clk)
}

fun create_job(sc: &mut ts::Scenario, clk: &Clock) {
    create_job_with(sc, clk, AMOUNT, REVIEW_WINDOW, SPLIT_BPS)
}

fun create_job_with(
    sc: &mut ts::Scenario,
    clk: &Clock,
    amount: u64,
    review_window_ms: u64,
    reject_split_bps: u64,
) {
    ts::next_tx(sc, BUYER);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let payment = coin::mint_for_testing<SUI>(amount, ts::ctx(sc));
    escrow::create<SUI>(
        SELLER,
        payment,
        b"spec-hash",
        DELIVER_BY,
        review_window_ms,
        reject_split_bps,
        &cfg,
        clk,
        ts::ctx(sc),
    );
    ts::return_shared(cfg);
}

fun deliver(sc: &mut ts::Scenario, clk: &Clock) {
    ts::next_tx(sc, SELLER);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let mut job = ts::take_shared<Job<SUI>>(sc);
    escrow::deliver(&mut job, b"walrus-blob-hash", &cfg, clk, ts::ctx(sc));
    ts::return_shared(job);
    ts::return_shared(cfg);
}

fun release_as(sc: &mut ts::Scenario, who: address, clk: &Clock) {
    ts::next_tx(sc, who);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let mut job = ts::take_shared<Job<SUI>>(sc);
    escrow::release(&mut job, &cfg, clk, ts::ctx(sc));
    ts::return_shared(job);
    ts::return_shared(cfg);
}

fun assert_received(sc: &mut ts::Scenario, who: address, expect: u64) {
    ts::next_tx(sc, who);
    let received = ts::take_from_address<Coin<SUI>>(sc, who);
    assert!(received.value() == expect, 100);
    ts::return_to_address(who, received);
}

// === Happy path: create → deliver → buyer accepts (fee to receiver) ===
#[test]
fun create_deliver_release() {
    let (mut sc, clk) = setup();
    create_job(&mut sc, &clk);

    ts::next_tx(&mut sc, BUYER);
    {
        let job = ts::take_shared<Job<SUI>>(&sc);
        assert!(escrow::state(&job) == escrow::state_funded(), 0);
        assert!(escrow::buyer(&job) == BUYER, 1);
        assert!(escrow::seller(&job) == SELLER, 2);
        assert!(escrow::escrow_value(&job) == AMOUNT, 3);
        assert!(escrow::fee_bps(&job) == escrow::default_fee_bps(), 4);
        ts::return_shared(job);
    };

    deliver(&mut sc, &clk);

    ts::next_tx(&mut sc, BUYER);
    {
        let job = ts::take_shared<Job<SUI>>(&sc);
        assert!(escrow::state(&job) == escrow::state_delivered(), 5);
        assert!(escrow::delivery_hash(&job) == b"walrus-blob-hash", 6);
        ts::return_shared(job);
    };
    release_as(&mut sc, BUYER, &clk);

    ts::next_tx(&mut sc, BUYER);
    {
        let job = ts::take_shared<Job<SUI>>(&sc);
        assert!(escrow::state(&job) == escrow::state_released(), 7);
        assert!(escrow::escrow_value(&job) == 0, 8);
        ts::return_shared(job);
    };

    // Seller gets amount minus the 2.5% fee; receiver (deployer) gets the fee.
    assert_received(&mut sc, SELLER, AMOUNT - FEE);
    assert_received(&mut sc, ADMIN, FEE);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Timeout crank 1: review window lapses → ANYONE releases to seller ===
#[test]
fun timeout_release_by_stranger() {
    let (mut sc, mut clk) = setup();
    create_job(&mut sc, &clk);
    deliver(&mut sc, &clk);

    // Advance past delivered_at (0) + review window.
    clk.increment_for_testing(REVIEW_WINDOW + 1);

    release_as(&mut sc, STRANGER, &clk);
    ts::next_tx(&mut sc, STRANGER);
    {
        let job = ts::take_shared<Job<SUI>>(&sc);
        assert!(escrow::state(&job) == escrow::state_released(), 0);
        ts::return_shared(job);
    };

    assert_received(&mut sc, SELLER, AMOUNT - FEE);
    assert_received(&mut sc, ADMIN, FEE);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Stranger CANNOT release while the review window is open ===
#[test]
#[expected_failure(abort_code = escrow::EReviewWindowOpen)]
fun stranger_release_inside_window_fails() {
    let (mut sc, clk) = setup();
    create_job(&mut sc, &clk);
    deliver(&mut sc, &clk);
    release_as(&mut sc, STRANGER, &clk);
    abort 99
}

// === Timeout crank 2: no delivery by deadline → ANYONE refunds the buyer ===
// Refund is fee-free — the protocol never earns on a failed job.
#[test]
fun deadline_refund_by_stranger() {
    let (mut sc, mut clk) = setup();
    create_job(&mut sc, &clk);

    clk.increment_for_testing(DELIVER_BY + 1);

    ts::next_tx(&mut sc, STRANGER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared<Job<SUI>>(&sc);
        escrow::refund(&mut job, &cfg, &clk, ts::ctx(&mut sc));
        assert!(escrow::state(&job) == escrow::state_refunded(), 0);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };

    assert_received(&mut sc, BUYER, AMOUNT);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Refund is closed before the deadline ===
#[test]
#[expected_failure(abort_code = escrow::EDeadlineNotReached)]
fun refund_before_deadline_fails() {
    let (mut sc, clk) = setup();
    create_job(&mut sc, &clk);

    ts::next_tx(&mut sc, BUYER);
    let cfg = ts::take_shared<FeeConfig>(&sc);
    let mut job = ts::take_shared<Job<SUI>>(&sc);
    escrow::refund(&mut job, &cfg, &clk, ts::ctx(&mut sc));
    abort 99
}

// === Refund is closed once delivered (buyer must accept/reject) ===
#[test]
#[expected_failure(abort_code = escrow::EWrongState)]
fun refund_after_delivery_fails() {
    let (mut sc, mut clk) = setup();
    create_job(&mut sc, &clk);
    deliver(&mut sc, &clk);

    clk.increment_for_testing(DELIVER_BY + 1);
    ts::next_tx(&mut sc, BUYER);
    let cfg = ts::take_shared<FeeConfig>(&sc);
    let mut job = ts::take_shared<Job<SUI>>(&sc);
    escrow::refund(&mut job, &cfg, &clk, ts::ctx(&mut sc));
    abort 99
}

// === Reject within window → split per create terms, fee on seller share ===
#[test]
fun reject_splits_per_terms() {
    let (mut sc, clk) = setup();
    create_job(&mut sc, &clk);
    deliver(&mut sc, &clk);

    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared<Job<SUI>>(&sc);
        escrow::reject(&mut job, &cfg, &clk, ts::ctx(&mut sc));
        assert!(escrow::state(&job) == escrow::state_rejected(), 0);
        assert!(escrow::escrow_value(&job) == 0, 1);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };

    // 80/20 split of 1_000_000: buyer 800_000 fee-free; seller share
    // 200_000 minus 2.5% (5_000) = 195_000; fee wallet 5_000.
    assert_received(&mut sc, BUYER, 800_000);
    assert_received(&mut sc, SELLER, 195_000);
    assert_received(&mut sc, ADMIN, 5_000);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === A 0-split reject cannot dodge the fee ===
#[test]
fun zero_split_reject_still_pays_fee() {
    let (mut sc, clk) = setup();
    create_job_with(&mut sc, &clk, AMOUNT, REVIEW_WINDOW, 0);
    deliver(&mut sc, &clk);

    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared<Job<SUI>>(&sc);
        escrow::reject(&mut job, &cfg, &clk, ts::ctx(&mut sc));
        assert!(escrow::escrow_value(&job) == 0, 0);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };

    // Everything is seller-bound → same fee as a release.
    assert_received(&mut sc, SELLER, AMOUNT - FEE);
    assert_received(&mut sc, ADMIN, FEE);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Reject after the window closes fails (release crank owns it now) ===
#[test]
#[expected_failure(abort_code = escrow::EReviewWindowClosed)]
fun reject_after_window_fails() {
    let (mut sc, mut clk) = setup();
    create_job(&mut sc, &clk);
    deliver(&mut sc, &clk);

    clk.increment_for_testing(REVIEW_WINDOW + 1);
    ts::next_tx(&mut sc, BUYER);
    let cfg = ts::take_shared<FeeConfig>(&sc);
    let mut job = ts::take_shared<Job<SUI>>(&sc);
    escrow::reject(&mut job, &cfg, &clk, ts::ctx(&mut sc));
    abort 99
}

// === Only the buyer can reject ===
#[test]
#[expected_failure(abort_code = escrow::ENotAuthorized)]
fun stranger_reject_fails() {
    let (mut sc, clk) = setup();
    create_job(&mut sc, &clk);
    deliver(&mut sc, &clk);

    ts::next_tx(&mut sc, STRANGER);
    let cfg = ts::take_shared<FeeConfig>(&sc);
    let mut job = ts::take_shared<Job<SUI>>(&sc);
    escrow::reject(&mut job, &cfg, &clk, ts::ctx(&mut sc));
    abort 99
}

// === Only the seller can deliver ===
#[test]
#[expected_failure(abort_code = escrow::ENotAuthorized)]
fun stranger_deliver_fails() {
    let (mut sc, clk) = setup();
    create_job(&mut sc, &clk);

    ts::next_tx(&mut sc, STRANGER);
    let cfg = ts::take_shared<FeeConfig>(&sc);
    let mut job = ts::take_shared<Job<SUI>>(&sc);
    escrow::deliver(&mut job, b"x", &cfg, &clk, ts::ctx(&mut sc));
    abort 99
}

// === Late delivery fails (refund crank owns it now) ===
#[test]
#[expected_failure(abort_code = escrow::EPastDeadline)]
fun late_deliver_fails() {
    let (mut sc, mut clk) = setup();
    create_job(&mut sc, &clk);

    clk.increment_for_testing(DELIVER_BY + 1);
    ts::next_tx(&mut sc, SELLER);
    let cfg = ts::take_shared<FeeConfig>(&sc);
    let mut job = ts::take_shared<Job<SUI>>(&sc);
    escrow::deliver(&mut job, b"x", &cfg, &clk, ts::ctx(&mut sc));
    abort 99
}

// === Buyer may release a FUNDED job voluntarily (off-band delivery) ===
#[test]
fun buyer_release_before_delivery() {
    let (mut sc, clk) = setup();
    create_job(&mut sc, &clk);

    release_as(&mut sc, BUYER, &clk);
    ts::next_tx(&mut sc, BUYER);
    {
        let job = ts::take_shared<Job<SUI>>(&sc);
        assert!(escrow::state(&job) == escrow::state_released(), 0);
        ts::return_shared(job);
    };

    assert_received(&mut sc, SELLER, AMOUNT - FEE);
    assert_received(&mut sc, ADMIN, FEE);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === A stranger can NEVER release a FUNDED job ===
#[test]
#[expected_failure(abort_code = escrow::ENotAuthorized)]
fun stranger_release_funded_fails() {
    let (mut sc, clk) = setup();
    create_job(&mut sc, &clk);
    release_as(&mut sc, STRANGER, &clk);
    abort 99
}

// === Settled jobs are terminal: no double-settle from any path ===
#[test]
#[expected_failure(abort_code = escrow::EWrongState)]
fun double_release_fails() {
    let (mut sc, clk) = setup();
    create_job(&mut sc, &clk);
    deliver(&mut sc, &clk);
    release_as(&mut sc, BUYER, &clk);
    release_as(&mut sc, BUYER, &clk);
    abort 99
}

// === Create guards ===
#[test]
#[expected_failure(abort_code = escrow::EBuyerIsSeller)]
fun self_job_fails() {
    let (mut sc, clk) = setup();
    ts::next_tx(&mut sc, BUYER);
    let cfg = ts::take_shared<FeeConfig>(&sc);
    let payment = coin::mint_for_testing<SUI>(AMOUNT, ts::ctx(&mut sc));
    escrow::create<SUI>(
        BUYER, payment, b"s", DELIVER_BY, REVIEW_WINDOW, SPLIT_BPS,
        &cfg, &clk, ts::ctx(&mut sc),
    );
    abort 99
}

#[test]
#[expected_failure(abort_code = escrow::EZeroAmount)]
fun zero_amount_fails() {
    let (mut sc, clk) = setup();
    ts::next_tx(&mut sc, BUYER);
    let cfg = ts::take_shared<FeeConfig>(&sc);
    let payment = coin::zero<SUI>(ts::ctx(&mut sc));
    escrow::create<SUI>(
        SELLER, payment, b"s", DELIVER_BY, REVIEW_WINDOW, SPLIT_BPS,
        &cfg, &clk, ts::ctx(&mut sc),
    );
    abort 99
}

#[test]
#[expected_failure(abort_code = escrow::EDeadlineInPast)]
fun past_deadline_create_fails() {
    let (mut sc, mut clk) = setup();
    clk.increment_for_testing(DELIVER_BY + 1);
    ts::next_tx(&mut sc, BUYER);
    let cfg = ts::take_shared<FeeConfig>(&sc);
    let payment = coin::mint_for_testing<SUI>(AMOUNT, ts::ctx(&mut sc));
    escrow::create<SUI>(
        SELLER, payment, b"s", DELIVER_BY, REVIEW_WINDOW, SPLIT_BPS,
        &cfg, &clk, ts::ctx(&mut sc),
    );
    abort 99
}

#[test]
#[expected_failure(abort_code = escrow::EBadSplit)]
fun bad_split_fails() {
    let (mut sc, clk) = setup();
    ts::next_tx(&mut sc, BUYER);
    let cfg = ts::take_shared<FeeConfig>(&sc);
    let payment = coin::mint_for_testing<SUI>(AMOUNT, ts::ctx(&mut sc));
    escrow::create<SUI>(
        SELLER, payment, b"s", DELIVER_BY, REVIEW_WINDOW, 10_001,
        &cfg, &clk, ts::ctx(&mut sc),
    );
    abort 99
}

// === v2 create bounds: the u64-overflow lock from the v1 review is closed ===
#[test]
#[expected_failure(abort_code = escrow::EReviewWindowTooLong)]
fun oversized_review_window_fails() {
    let (mut sc, clk) = setup();
    create_job_with(
        &mut sc, &clk, AMOUNT, escrow::max_review_window_ms() + 1, SPLIT_BPS,
    );
    abort 99
}

#[test]
#[expected_failure(abort_code = escrow::EDeadlineTooFar)]
fun oversized_deliver_horizon_fails() {
    let (mut sc, clk) = setup();
    ts::next_tx(&mut sc, BUYER);
    let cfg = ts::take_shared<FeeConfig>(&sc);
    let payment = coin::mint_for_testing<SUI>(AMOUNT, ts::ctx(&mut sc));
    escrow::create<SUI>(
        SELLER, payment, b"s",
        escrow::max_deliver_horizon_ms() + 1, // clock at 0
        REVIEW_WINDOW, SPLIT_BPS,
        &cfg, &clk, ts::ctx(&mut sc),
    );
    abort 99
}

// === Fee snapshot: bps changes NEVER apply to already-funded jobs ===
#[test]
fun fee_change_does_not_hit_funded_job() {
    let (mut sc, clk) = setup();
    create_job(&mut sc, &clk);

    // Admin doubles the fee AFTER the job is funded.
    ts::next_tx(&mut sc, ADMIN);
    {
        let cap = ts::take_from_sender<AdminCap>(&sc);
        let mut cfg = ts::take_shared<FeeConfig>(&sc);
        escrow::set_fee_bps(&cap, &mut cfg, 500);
        ts::return_shared(cfg);
        ts::return_to_sender(&sc, cap);
    };

    deliver(&mut sc, &clk);
    release_as(&mut sc, BUYER, &clk);

    // Still the 2.5% agreed at create, not 5%.
    assert_received(&mut sc, SELLER, AMOUNT - FEE);
    assert_received(&mut sc, ADMIN, FEE);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Zero fee config → seller receives everything ===
#[test]
fun zero_fee_release_pays_seller_in_full() {
    let (mut sc, clk) = setup();

    ts::next_tx(&mut sc, ADMIN);
    {
        let cap = ts::take_from_sender<AdminCap>(&sc);
        let mut cfg = ts::take_shared<FeeConfig>(&sc);
        escrow::set_fee_bps(&cap, &mut cfg, 0);
        ts::return_shared(cfg);
        ts::return_to_sender(&sc, cap);
    };

    create_job(&mut sc, &clk);
    deliver(&mut sc, &clk);
    release_as(&mut sc, BUYER, &clk);

    assert_received(&mut sc, SELLER, AMOUNT);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Dust job: fee floors to zero, seller gets everything ===
#[test]
fun dust_fee_floors_to_zero() {
    let (mut sc, clk) = setup();
    create_job_with(&mut sc, &clk, 10, REVIEW_WINDOW, SPLIT_BPS);
    deliver(&mut sc, &clk);
    release_as(&mut sc, BUYER, &clk);

    // 10 * 250 / 10_000 = 0 → no fee coin minted.
    assert_received(&mut sc, SELLER, 10);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Admin: fee ceiling is enforced ===
#[test]
#[expected_failure(abort_code = escrow::EFeeTooHigh)]
fun fee_above_ceiling_fails() {
    let (mut sc, clk) = setup();
    ts::next_tx(&mut sc, ADMIN);
    let cap = ts::take_from_sender<AdminCap>(&sc);
    let mut cfg = ts::take_shared<FeeConfig>(&sc);
    escrow::set_fee_bps(&cap, &mut cfg, escrow::max_fee_bps() + 1);
    clock::destroy_for_testing(clk);
    abort 99
}

// === Admin: receiver rotation applies at settle time ===
#[test]
fun rotated_receiver_gets_the_fee() {
    let (mut sc, clk) = setup();
    create_job(&mut sc, &clk);

    ts::next_tx(&mut sc, ADMIN);
    {
        let cap = ts::take_from_sender<AdminCap>(&sc);
        let mut cfg = ts::take_shared<FeeConfig>(&sc);
        escrow::set_fee_receiver(&cap, &mut cfg, FEE_WALLET);
        ts::return_shared(cfg);
        ts::return_to_sender(&sc, cap);
    };

    deliver(&mut sc, &clk);
    release_as(&mut sc, BUYER, &clk);

    assert_received(&mut sc, SELLER, AMOUNT - FEE);
    assert_received(&mut sc, FEE_WALLET, FEE);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Version gate: a stale config version blocks every entry ===
#[test]
#[expected_failure(abort_code = escrow::EWrongVersion)]
fun stale_version_blocks_create() {
    let (mut sc, clk) = setup();

    ts::next_tx(&mut sc, ADMIN);
    {
        let mut cfg = ts::take_shared<FeeConfig>(&sc);
        escrow::set_version_for_testing(&mut cfg, escrow::current_version() - 1);
        ts::return_shared(cfg);
    };

    create_job(&mut sc, &clk);
    abort 99
}

// === Migrate: bumps a stale config; refuses same-version ===
#[test]
fun migrate_bumps_stale_config() {
    let (mut sc, clk) = setup();

    ts::next_tx(&mut sc, ADMIN);
    {
        let mut cfg = ts::take_shared<FeeConfig>(&sc);
        escrow::set_version_for_testing(&mut cfg, escrow::current_version() - 1);
        ts::return_shared(cfg);
    };
    ts::next_tx(&mut sc, ADMIN);
    {
        let cap = ts::take_from_sender<AdminCap>(&sc);
        let mut cfg = ts::take_shared<FeeConfig>(&sc);
        escrow::migrate(&cap, &mut cfg);
        assert!(escrow::config_version(&cfg) == escrow::current_version(), 0);
        ts::return_shared(cfg);
        ts::return_to_sender(&sc, cap);
    };

    // Entries work again post-migrate.
    create_job(&mut sc, &clk);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = escrow::ENotUpgrade)]
fun migrate_same_version_fails() {
    let (mut sc, clk) = setup();
    ts::next_tx(&mut sc, ADMIN);
    let cap = ts::take_from_sender<AdminCap>(&sc);
    let mut cfg = ts::take_shared<FeeConfig>(&sc);
    escrow::migrate(&cap, &mut cfg);
    clock::destroy_for_testing(clk);
    abort 99
}
