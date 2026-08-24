#[test_only]
module a2a_escrow::opening_tests;

use a2a_escrow::escrow::{Self, AdminCap, FeeConfig, Job};
use a2a_escrow::opening::{Self, Opening};
use a2a_escrow::reputation::{Self, AgentScore, ScoreBoard};
use agent_id::registry::{Self, Registry};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;

const ADMIN: address = @0xAD; // deployer = initial fee receiver
const BUYER: address = @0xA;
const SELLER: address = @0xB; // registered + active claimer
const LURKER: address = @0xC; // never registered
const IDLE_SELLER: address = @0xD; // registered, then deactivated

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
    // S.1192: claims need the claimer's AgentScore — the board is the
    // derived-address namespace parent (one per chain, AdminCap-created).
    ts::next_tx(&mut sc, ADMIN);
    {
        let cap = ts::take_from_sender<AdminCap>(&sc);
        let mut cfg = ts::take_shared<FeeConfig>(&sc);
        reputation::create_score_board(&cap, &mut cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(cfg);
        ts::return_to_sender(&sc, cap);
    };
    // SELLER registers itself (self-sovereign) and stays active.
    register_agent(&mut sc, &clk, SELLER);
    // IDLE_SELLER registers, then flips itself inactive.
    register_agent(&mut sc, &clk, IDLE_SELLER);
    ts::next_tx(&mut sc, IDLE_SELLER);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        registry::set_active(&mut reg, IDLE_SELLER, false, &clk, ts::ctx(&mut sc));
        ts::return_shared(reg);
    };
    (sc, clk)
}

/// S.1192: the client-shape precursor — a claimer with no score yet
/// creates their permissionless zero score first (empty ⇒ Level 1).
fun ensure_score(sc: &mut ts::Scenario, clk: &Clock, who: address) {
    ts::next_tx(sc, who);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let mut board = ts::take_shared<ScoreBoard>(sc);
    if (!reputation::has_score(&board, who)) {
        reputation::create_empty_score(&mut board, who, &cfg, clk, ts::ctx(sc));
    };
    ts::return_shared(board);
    ts::return_shared(cfg);
}

/// Take `who`'s score by its DERIVED id — `take_shared<AgentScore>` grabs
/// the most recent one, which is wrong the moment two sellers have scores.
fun take_score(sc: &ts::Scenario, who: address): AgentScore {
    let board = ts::take_shared<ScoreBoard>(sc);
    let addr = reputation::score_address(&board, who);
    ts::return_shared(board);
    ts::take_shared_by_id<AgentScore>(sc, object::id_from_address(addr))
}

fun active_of(sc: &mut ts::Scenario, who: address): u64 {
    ts::next_tx(sc, who);
    let score = take_score(sc, who);
    let n = reputation::active_seller_jobs(&score);
    ts::return_shared(score);
    n
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
    post_open_with_level(
        sc,
        clk,
        amount,
        open_until_ms,
        sla_ms,
        review_window_ms,
        reject_split_bps,
        claim_policy,
        0,
    )
}

fun post_open_with_level(
    sc: &mut ts::Scenario,
    clk: &Clock,
    amount: u64,
    open_until_ms: u64,
    sla_ms: u64,
    review_window_ms: u64,
    reject_split_bps: u64,
    claim_policy: u8,
    min_seller_level: u8,
) {
    ts::next_tx(sc, BUYER);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let payment = coin::mint_for_testing<SUI>(amount, ts::ctx(sc));
    opening::create_open_v2<SUI>(
        payment,
        b"open-spec-hash",
        open_until_ms,
        sla_ms,
        review_window_ms,
        reject_split_bps,
        claim_policy,
        min_seller_level,
        &cfg,
        clk,
        ts::ctx(sc),
    );
    ts::return_shared(cfg);
}

/// v2 claim as `who` — ensures the score precursor first (client shape).
fun claim_as(sc: &mut ts::Scenario, who: address, clk: &Clock): ID {
    ensure_score(sc, clk, who);
    ts::next_tx(sc, who);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let reg = ts::take_shared<Registry>(sc);
    let mut score = take_score(sc, who);
    let op = ts::take_shared<Opening<SUI>>(sc);
    let job_id = opening::claim_v2(op, &reg, &mut score, &cfg, clk, ts::ctx(sc));
    ts::return_shared(score);
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
fun post_claim_deliver_release_pays_seller_minus_fee() {
    let (mut sc, mut clk) = setup();
    post_open(&mut sc, &clk);
    clk.set_for_testing(10_000);
    let job_id = claim_as(&mut sc, SELLER, &clk);

    // The minted Job carries the Opening's terms: buyer/seller bound, amount
    // conserved, deliver_by = claim time + SLA, fee from the post snapshot.
    ts::next_tx(&mut sc, SELLER);
    {
        let job = ts::take_shared<Job<SUI>>(&sc);
        assert!(object::id(&job) == job_id, 0);
        assert!(escrow::buyer(&job) == BUYER, 1);
        assert!(escrow::seller(&job) == SELLER, 2);
        assert!(escrow::amount(&job) == AMOUNT, 3);
        assert!(escrow::escrow_value(&job) == AMOUNT, 4);
        assert!(escrow::deliver_by_ms(&job) == 10_000 + SLA_MS, 5);
        assert!(escrow::fee_bps(&job) == escrow::default_fee_bps(), 6);
        assert!(escrow::state(&job) == escrow::state_funded(), 7);
        ts::return_shared(job);
    };

    // S.1192: the claim seated one active job on the seller's score.
    assert!(active_of(&mut sc, SELLER) == 1, 8);

    // Normal Job lifecycle from here: deliver then buyer-accept release.
    ts::next_tx(&mut sc, SELLER);
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
        let mut score = take_score(&sc, SELLER);
        reputation::release_v2(&mut job, &mut score, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    // …and the release freed it (decrement rides the money, exactly once).
    assert!(active_of(&mut sc, SELLER) == 0, 9);
    assert_received(&mut sc, SELLER, AMOUNT - FEE);
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
    claim_as(&mut sc, SELLER, &clk);
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
    claim_as(&mut sc, IDLE_SELLER, &clk);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EOpeningExpired)]
fun claim_after_open_until_fails() {
    let (mut sc, mut clk) = setup();
    post_open(&mut sc, &clk);
    clk.set_for_testing(OPEN_UNTIL + 1);
    claim_as(&mut sc, SELLER, &clk);
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
    claim_as(&mut sc, SELLER, &clk);
    ts::next_tx(&mut sc, SELLER);
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
    claim_as(&mut sc, SELLER, &clk);
    // The claiming SELLER backs out pre-delivery — full fee-free refund. The
    // Opening was consumed at claim, so the board posting does NOT
    // resurrect; the buyer re-posts if they still want the work.
    ts::next_tx(&mut sc, SELLER);
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
    claim_as(&mut sc, SELLER, &clk);
    // SELLER delivers junk; buyer rejects in-window → at 10_000 bps the buyer
    // takes the FULL escrow back, seller share 0, protocol fee 0 (the fee
    // comes only from the seller-bound payout).
    ts::next_tx(&mut sc, SELLER);
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
        escrow::reject_settle_pkg(&mut job, &cfg, &clk, ts::ctx(&mut sc));
        assert!(escrow::state(&job) == escrow::state_rejected(), 0);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    assert_received(&mut sc, BUYER, AMOUNT);
    ts::end(sc);
    clk.destroy_for_testing();
}

// === S.1192: active caps + min seller level + dead v1 entries ===

#[test]
#[expected_failure(abort_code = opening::EActiveJobCap)]
fun level1_cap_four_claims_fifth_refused() {
    let (mut sc, mut clk) = setup();
    // Five identical Anyone posts; a fresh (empty-score = Level 1) seller
    // seats 4 claims, and the 5th hits the cap while all 4 stay in flight.
    post_open(&mut sc, &clk);
    post_open(&mut sc, &clk);
    post_open(&mut sc, &clk);
    post_open(&mut sc, &clk);
    post_open(&mut sc, &clk);
    clk.set_for_testing(10_000);
    claim_as(&mut sc, SELLER, &clk);
    claim_as(&mut sc, SELLER, &clk);
    claim_as(&mut sc, SELLER, &clk);
    claim_as(&mut sc, SELLER, &clk);
    assert!(active_of(&mut sc, SELLER) == 4, 0);
    claim_as(&mut sc, SELLER, &clk);
    abort 0
}

#[test]
fun refund_v2_frees_the_seat_and_lands_no_delivery() {
    let (mut sc, mut clk) = setup();
    post_open(&mut sc, &clk);
    clk.set_for_testing(10_000);
    let job_id = claim_as(&mut sc, SELLER, &clk);
    assert!(active_of(&mut sc, SELLER) == 1, 0);
    // Deadline lapses undelivered — permissionless crank refunds, the
    // no_delivery outcome lands AND the seat frees (once).
    clk.set_for_testing(10_000 + SLA_MS + 1);
    ts::next_tx(&mut sc, LURKER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        let mut score = take_score(&sc, SELLER);
        reputation::refund_v2(&mut job, &mut score, &cfg, &clk, ts::ctx(&mut sc));
        assert!(reputation::no_delivery(&score) == 1, 1);
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    assert!(active_of(&mut sc, SELLER) == 0, 2);
    assert_received(&mut sc, BUYER, AMOUNT);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
fun reject_v2_frees_the_seat() {
    let (mut sc, mut clk) = setup();
    post_open(&mut sc, &clk);
    clk.set_for_testing(10_000);
    let job_id = claim_as(&mut sc, SELLER, &clk);
    ts::next_tx(&mut sc, SELLER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        escrow::deliver(&mut job, b"junk", &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    // Passport (unregistered) buyer rejects in-window: outcome + seat free.
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let reg = ts::take_shared<Registry>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        let mut score = take_score(&sc, SELLER);
        reputation::reject_v2(&mut job, &mut score, &reg, &cfg, &clk, ts::ctx(&mut sc));
        assert!(reputation::rejected_after_delivery(&score) == 1, 0);
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(reg);
        ts::return_shared(cfg);
    };
    assert!(active_of(&mut sc, SELLER) == 0, 1);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
fun decline_never_touches_the_active_counter() {
    let (mut sc, mut clk) = setup();
    post_open(&mut sc, &clk);
    clk.set_for_testing(10_000);
    let job_id = claim_as(&mut sc, SELLER, &clk);
    assert!(active_of(&mut sc, SELLER) == 1, 0);
    ts::next_tx(&mut sc, SELLER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        escrow::decline(&mut job, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    // LOCKED (master spec D-table): decline is a clean walk for outcomes
    // AND never decrements — the declined claim keeps its seat occupied.
    // Named consequence: claim→decline churn burns capacity permanently
    // (documented in RUNBOOK_S1192; anti-abandon by design).
    assert!(active_of(&mut sc, SELLER) == 1, 1);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
fun min_level_one_passes_for_fresh_seller() {
    let (mut sc, mut clk) = setup();
    // Floor 1: every registered agent with a score qualifies (empty = L1).
    post_open_with_level(
        &mut sc, &clk, AMOUNT, OPEN_UNTIL, SLA_MS, REVIEW_WINDOW, SPLIT_BPS, POLICY_ANY, 1,
    );
    clk.set_for_testing(10_000);
    claim_as(&mut sc, SELLER, &clk);
    assert!(active_of(&mut sc, SELLER) == 1, 0);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = opening::EMinSellerLevelUnmet)]
fun min_level_two_refuses_fresh_seller() {
    let (mut sc, mut clk) = setup();
    post_open_with_level(
        &mut sc, &clk, AMOUNT, OPEN_UNTIL, SLA_MS, REVIEW_WINDOW, SPLIT_BPS, POLICY_ANY, 2,
    );
    clk.set_for_testing(10_000);
    claim_as(&mut sc, SELLER, &clk); // empty score = Level 1 < floor 2
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EBadMinSellerLevel)]
fun min_level_five_aborts_at_post() {
    let (mut sc, clk) = setup();
    post_open_with_level(
        &mut sc, &clk, AMOUNT, OPEN_UNTIL, SLA_MS, REVIEW_WINDOW, SPLIT_BPS, POLICY_ANY, 5,
    );
    abort 0
}

#[test]
fun cancel_reclaims_the_min_level_df() {
    let (mut sc, clk) = setup();
    // A floored post cancels cleanly — repay_buyer removes the DF before
    // the UID deletes (no orphaned storage), full fee-free refund.
    post_open_with_level(
        &mut sc, &clk, AMOUNT, OPEN_UNTIL, SLA_MS, REVIEW_WINDOW, SPLIT_BPS, POLICY_ANY, 3,
    );
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let op = ts::take_shared<Opening<SUI>>(&sc);
        assert!(opening::min_seller_level(&op) == 3, 0);
        opening::cancel_open(op, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(cfg);
    };
    assert_received(&mut sc, BUYER, AMOUNT);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = opening::EUseClaimV2)]
fun deprecated_create_open_aborts() {
    let (mut sc, clk) = setup();
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let payment = coin::mint_for_testing<SUI>(AMOUNT, ts::ctx(&mut sc));
        opening::create_open<SUI>(
            payment,
            b"open-spec-hash",
            OPEN_UNTIL,
            SLA_MS,
            REVIEW_WINDOW,
            SPLIT_BPS,
            POLICY_ANY,
            &cfg,
            &clk,
            ts::ctx(&mut sc),
        );
        ts::return_shared(cfg);
    };
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EUseClaimV2)]
fun deprecated_claim_aborts() {
    let (mut sc, mut clk) = setup();
    post_open(&mut sc, &clk);
    clk.set_for_testing(10_000);
    ts::next_tx(&mut sc, SELLER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let reg = ts::take_shared<Registry>(&sc);
        let op = ts::take_shared<Opening<SUI>>(&sc);
        opening::claim(op, &reg, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(reg);
        ts::return_shared(cfg);
    };
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EScoreNotClaimer)]
fun claim_v2_with_borrowed_score_fails() {
    let (mut sc, mut clk) = setup();
    post_open(&mut sc, &clk);
    clk.set_for_testing(10_000);
    // LURKER registers and tries to claim on SELLER's score — the
    // ownership assert stops both the cap dodge and the counter graffiti.
    register_agent(&mut sc, &clk, LURKER);
    ensure_score(&mut sc, &clk, SELLER);
    ts::next_tx(&mut sc, LURKER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let reg = ts::take_shared<Registry>(&sc);
        let mut score = take_score(&sc, SELLER);
        let op = ts::take_shared<Opening<SUI>>(&sc);
        opening::claim_v2(op, &reg, &mut score, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(score);
        ts::return_shared(reg);
        ts::return_shared(cfg);
    };
    abort 0
}
