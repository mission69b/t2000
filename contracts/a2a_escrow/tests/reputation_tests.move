#[test_only]
module a2a_escrow::reputation_tests;

use a2a_escrow::escrow::{Self, AdminCap, FeeConfig, Job};
use a2a_escrow::opening::{Self, Opening};
use a2a_escrow::reputation::{Self, AgentScore, ScoreBoard};
use agent_id::registry::{Self, Registry};
use sui::clock::{Self, Clock};
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

const ADMIN: address = @0xAD; // deployer = AdminCap holder
const BUYER: address = @0xA;
const BUYER2: address = @0xF; // the first-review race loser in the retry test

/// Distinct buyer pool for `reviewed_n` (S.1062: Proven counts DISTINCT
/// buyers, so "n reviews" helpers mean n reviews from n different buyers).
fun buyers(): vector<address> { vector[@0xA, @0xF, @0x1A, @0x2A] }
const SELLER: address = @0xB; // registered + active seller
const STRANGER: address = @0xC; // neither party to any job
const OTHER_SELLER: address = @0xE; // a second registered seller

const AMOUNT: u64 = 1_000_000; // 1 USDC-equivalent (6dp)
const OPEN_UNTIL: u64 = 500_000; // ms
const SLA_MS: u64 = 400_000; // ms
const REVIEW_WINDOW: u64 = 100_000; // ms
const SPLIT_BPS: u64 = 10_000; // v3: open reject = 100% buyer
const POLICY_ANY: u8 = 0;
const POLICY_PROVEN: u8 = 1;
const POLICY_PROVEN_4STAR: u8 = 2;

fun setup(): (ts::Scenario, Clock) {
    let mut sc = ts::begin(ADMIN);
    escrow::init_for_testing(ts::ctx(&mut sc));
    registry::init_for_testing(ts::ctx(&mut sc));
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    // Real time is never 0 — a 0 clock would make delivered_at_ms == 0 and
    // trip the goodwill (never-delivered) review gate on honest deliveries.
    clk.set_for_testing(1_000);
    // The ScoreBoard is created ONCE by the AdminCap holder (upgrade can't
    // run init) — single instance chain-enforced via the FeeConfig DF.
    create_board(&mut sc, &clk);
    register_agent(&mut sc, &clk, SELLER);
    register_agent(&mut sc, &clk, OTHER_SELLER);
    (sc, clk)
}

fun create_board(sc: &mut ts::Scenario, clk: &Clock) {
    ts::next_tx(sc, ADMIN);
    let cap = ts::take_from_sender<AdminCap>(sc);
    let mut cfg = ts::take_shared<FeeConfig>(sc);
    reputation::create_score_board(&cap, &mut cfg, clk, ts::ctx(sc));
    ts::return_shared(cfg);
    ts::return_to_sender(sc, cap);
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

/// Run one full Hire job BUYER→seller to RELEASED (deliver + buyer accept).
/// Returns the job id — the receipt a review needs.
fun released_job(sc: &mut ts::Scenario, clk: &Clock, seller: address): ID {
    released_job_from(sc, clk, BUYER, seller)
}

fun released_job_from(
    sc: &mut ts::Scenario,
    clk: &Clock,
    buyer: address,
    seller: address,
): ID {
    ts::next_tx(sc, buyer);
    let job_id = {
        let cfg = ts::take_shared<FeeConfig>(sc);
        let payment = coin::mint_for_testing<SUI>(AMOUNT, ts::ctx(sc));
        let id = escrow::create<SUI>(
            seller,
            payment,
            b"spec-hash",
            clk.timestamp_ms() + SLA_MS,
            REVIEW_WINDOW,
            SPLIT_BPS,
            &cfg,
            clk,
            ts::ctx(sc),
        );
        ts::return_shared(cfg);
        id
    };
    ts::next_tx(sc, seller);
    {
        let cfg = ts::take_shared<FeeConfig>(sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(sc, job_id);
        escrow::deliver(&mut job, b"delivery-hash", &cfg, clk, ts::ctx(sc));
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    ts::next_tx(sc, buyer);
    {
        let cfg = ts::take_shared<FeeConfig>(sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(sc, job_id);
        escrow::release(&mut job, &cfg, clk, ts::ctx(sc));
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    job_id
}

/// Buyer reviews a released job — routes to the lazy-create or the normal
/// entry depending on whether the seller has a score yet (the client shape).
fun review(sc: &mut ts::Scenario, clk: &Clock, job_id: ID, stars: u8) {
    review_as(sc, clk, BUYER, job_id, stars)
}

fun review_as(sc: &mut ts::Scenario, clk: &Clock, who: address, job_id: ID, stars: u8) {
    ts::next_tx(sc, who);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let job = ts::take_shared_by_id<Job<SUI>>(sc, job_id);
    let mut board = ts::take_shared<ScoreBoard>(sc);
    if (reputation::has_score(&board, escrow::seller(&job))) {
        let mut score = ts::take_shared<AgentScore>(sc);
        reputation::submit_review(&mut score, &job, stars, &cfg, clk, ts::ctx(sc));
        ts::return_shared(score);
    } else {
        reputation::submit_first_review(&mut board, &job, stars, &cfg, clk, ts::ctx(sc));
    };
    ts::return_shared(board);
    ts::return_shared(job);
    ts::return_shared(cfg);
}

/// Give `seller` `n` released-job reviews of `stars` each — from `n`
/// DISTINCT buyers (S.1062: that's what Proven counts). Callers that need
/// same-buyer repeats use `released_job_from` + `review_as` directly.
fun reviewed_n(sc: &mut ts::Scenario, clk: &Clock, seller: address, n: u64, stars: u8) {
    let pool = buyers();
    let mut i = 0;
    while (i < n) {
        let buyer = *pool.borrow(i);
        let job_id = released_job_from(sc, clk, buyer, seller);
        review_as(sc, clk, buyer, job_id, stars);
        i = i + 1;
    }
}

fun take_score(sc: &ts::Scenario): AgentScore {
    ts::take_shared<AgentScore>(sc)
}

// === ScoreBoard single instance (S.1054b) ===

#[test]
fun score_board_id_recorded_on_fee_config() {
    let (mut sc, clk) = setup();
    ts::next_tx(&mut sc, ADMIN);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let board = ts::take_shared<ScoreBoard>(&sc);
        let recorded = escrow::config_score_board_id(&cfg);
        assert!(recorded == option::some(object::id(&board)), 0);
        ts::return_shared(board);
        ts::return_shared(cfg);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = escrow::EScoreBoardExists)]
fun second_score_board_aborts() {
    let (mut sc, clk) = setup(); // setup already created the one board
    create_board(&mut sc, &clk);
    abort 0
}

// === Review happy paths ===

#[test]
fun first_review_creates_score_at_derived_address() {
    let (mut sc, clk) = setup();
    let job_id = released_job(&mut sc, &clk, SELLER);
    review(&mut sc, &clk, job_id, 5);
    ts::next_tx(&mut sc, BUYER);
    {
        let board = ts::take_shared<ScoreBoard>(&sc);
        let score = take_score(&sc);
        assert!(reputation::agent(&score) == SELLER, 0);
        assert!(reputation::review_count(&score) == 1, 1);
        assert!(reputation::stars_sum(&score) == 5, 2);
        assert!(reputation::has_job_review(&score, job_id), 3);
        assert!(reputation::job_stars(&score, job_id) == 5, 4);
        // The score lives at its deterministic derived address.
        assert!(
            object::id(&score).to_address() == reputation::score_address(&board, SELLER),
            5,
        );
        assert!(reputation::has_score(&board, SELLER), 6);
        assert!(!reputation::has_score(&board, OTHER_SELLER), 7);
        ts::return_shared(score);
        ts::return_shared(board);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
fun two_jobs_accumulate() {
    let (mut sc, clk) = setup();
    let job_a = released_job(&mut sc, &clk, SELLER);
    review(&mut sc, &clk, job_a, 5);
    let job_b = released_job(&mut sc, &clk, SELLER);
    review(&mut sc, &clk, job_b, 3);
    ts::next_tx(&mut sc, BUYER);
    {
        let score = take_score(&sc);
        assert!(reputation::review_count(&score) == 2, 0);
        assert!(reputation::stars_sum(&score) == 8, 1);
        ts::return_shared(score);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
fun edit_review_updates_in_place() {
    let (mut sc, clk) = setup();
    let job_id = released_job(&mut sc, &clk, SELLER);
    review(&mut sc, &clk, job_id, 5);
    // The buyer re-rates the same job: sum adjusts, count does NOT.
    review(&mut sc, &clk, job_id, 2);
    ts::next_tx(&mut sc, BUYER);
    {
        let score = take_score(&sc);
        assert!(reputation::review_count(&score) == 1, 0);
        assert!(reputation::stars_sum(&score) == 2, 1);
        assert!(reputation::job_stars(&score, job_id) == 2, 2);
        ts::return_shared(score);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

// === Review authority gates ===

#[test]
#[expected_failure(abort_code = reputation::ENotBuyer)]
fun stranger_review_fails() {
    let (mut sc, clk) = setup();
    let job_id = released_job(&mut sc, &clk, SELLER);
    review_as(&mut sc, &clk, STRANGER, job_id, 5);
    abort 0
}

#[test]
#[expected_failure(abort_code = reputation::ENotBuyer)]
fun seller_reviews_own_job_fails() {
    let (mut sc, clk) = setup();
    let job_id = released_job(&mut sc, &clk, SELLER);
    review_as(&mut sc, &clk, SELLER, job_id, 5);
    abort 0
}

#[test]
#[expected_failure(abort_code = reputation::ENotReleased)]
fun review_funded_job_fails() {
    let (mut sc, clk) = setup();
    ts::next_tx(&mut sc, BUYER);
    let job_id = {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let payment = coin::mint_for_testing<SUI>(AMOUNT, ts::ctx(&mut sc));
        let id = escrow::create<SUI>(
            SELLER,
            payment,
            b"spec-hash",
            clk.timestamp_ms() + SLA_MS,
            REVIEW_WINDOW,
            SPLIT_BPS,
            &cfg,
            &clk,
            ts::ctx(&mut sc),
        );
        ts::return_shared(cfg);
        id
    };
    review(&mut sc, &clk, job_id, 5);
    abort 0
}

#[test]
#[expected_failure(abort_code = reputation::ENotReleased)]
fun review_delivered_unreleased_job_fails() {
    let (mut sc, clk) = setup();
    ts::next_tx(&mut sc, BUYER);
    let job_id = {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let payment = coin::mint_for_testing<SUI>(AMOUNT, ts::ctx(&mut sc));
        let id = escrow::create<SUI>(
            SELLER,
            payment,
            b"spec-hash",
            clk.timestamp_ms() + SLA_MS,
            REVIEW_WINDOW,
            SPLIT_BPS,
            &cfg,
            &clk,
            ts::ctx(&mut sc),
        );
        ts::return_shared(cfg);
        id
    };
    ts::next_tx(&mut sc, SELLER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        escrow::deliver(&mut job, b"delivery-hash", &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    review(&mut sc, &clk, job_id, 5);
    abort 0
}

#[test]
#[expected_failure(abort_code = reputation::ENotDelivered)]
fun goodwill_release_not_reviewable() {
    let (mut sc, clk) = setup();
    // Buyer releases a FUNDED job without any delivery (goodwill / off-band).
    ts::next_tx(&mut sc, BUYER);
    let job_id = {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let payment = coin::mint_for_testing<SUI>(AMOUNT, ts::ctx(&mut sc));
        let id = escrow::create<SUI>(
            SELLER,
            payment,
            b"spec-hash",
            clk.timestamp_ms() + SLA_MS,
            REVIEW_WINDOW,
            SPLIT_BPS,
            &cfg,
            &clk,
            ts::ctx(&mut sc),
        );
        ts::return_shared(cfg);
        id
    };
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        escrow::release(&mut job, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    review(&mut sc, &clk, job_id, 5);
    abort 0
}

#[test]
#[expected_failure(abort_code = reputation::EBadStars)]
fun zero_stars_fails() {
    let (mut sc, clk) = setup();
    let job_id = released_job(&mut sc, &clk, SELLER);
    review(&mut sc, &clk, job_id, 0);
    abort 0
}

#[test]
#[expected_failure(abort_code = reputation::EBadStars)]
fun six_stars_fails() {
    let (mut sc, clk) = setup();
    let job_id = released_job(&mut sc, &clk, SELLER);
    review(&mut sc, &clk, job_id, 6);
    abort 0
}

#[test]
#[expected_failure(abort_code = reputation::EWrongScore)]
fun review_into_wrong_agents_score_fails() {
    let (mut sc, clk) = setup();
    // SELLER earns a score; then a released OTHER_SELLER job tries to land its
    // review into SELLER's score object.
    let seller_job = released_job(&mut sc, &clk, SELLER);
    review(&mut sc, &clk, seller_job, 5);
    let other_job = released_job(&mut sc, &clk, OTHER_SELLER);
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let job = ts::take_shared_by_id<Job<SUI>>(&sc, other_job);
        let mut score = take_score(&sc); // SELLER's score — the only one
        reputation::submit_review(&mut score, &job, 5, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    abort 0
}

// The first-review race, both halves (S.1054b). Two buyers race
// `submit_first_review` for the same brand-new seller: the winner shares
// the score; the LOSER aborts on `derived_object::claim` (the test below)
// and must retry with `submit_review` against the now-existing score (the
// test after it) — which succeeds, because per-job uniqueness is keyed by
// job_id, not by reviewer.

#[test]
fun first_review_race_loser_retries_with_submit_review() {
    let (mut sc, clk) = setup();
    // BUYER wins the race: their review creates SELLER's score.
    let won = released_job(&mut sc, &clk, SELLER);
    review(&mut sc, &clk, won, 5);
    // BUYER2 (the race loser) holds their own RELEASED receipt; the retry
    // path — plain submit_review against the existing score — lands.
    let lost = released_job_from(&mut sc, &clk, BUYER2, SELLER);
    review_as(&mut sc, &clk, BUYER2, lost, 3);
    ts::next_tx(&mut sc, BUYER2);
    {
        let score = take_score(&sc);
        assert!(reputation::review_count(&score) == 2, 0);
        assert!(reputation::stars_sum(&score) == 8, 1);
        assert!(reputation::job_stars(&score, lost) == 3, 2);
        ts::return_shared(score);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure] // derived_object::claim aborts: score already exists
fun duplicate_first_review_fails() {
    let (mut sc, clk) = setup();
    let job_a = released_job(&mut sc, &clk, SELLER);
    review(&mut sc, &clk, job_a, 5);
    let job_b = released_job(&mut sc, &clk, SELLER);
    // Force the lazy-create path a second time for the same seller.
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let job = ts::take_shared_by_id<Job<SUI>>(&sc, job_b);
        let mut board = ts::take_shared<ScoreBoard>(&sc);
        reputation::submit_first_review(&mut board, &job, 4, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(board);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    abort 0
}

// === Proven predicates ===

#[test]
fun proven_predicates_track_distinct_buyers() {
    let (mut sc, clk) = setup();
    let pool = buyers();
    // 2 × 5★ from 2 distinct buyers — below the distinct floor.
    reviewed_n(&mut sc, &clk, SELLER, 2, 5);
    ts::next_tx(&mut sc, BUYER);
    {
        let score = take_score(&sc);
        assert!(reputation::distinct_buyers(&score) == 2, 0);
        assert!(!reputation::meets_proven(&score), 1);
        assert!(!reputation::meets_min_avg(&score), 2);
        ts::return_shared(score);
    };
    // A 3rd DISTINCT buyer (3★) crosses the floor: distinct 3; avg 13/3 ≥ 4.
    let b3 = *pool.borrow(2);
    let j3 = released_job_from(&mut sc, &clk, b3, SELLER);
    review_as(&mut sc, &clk, b3, j3, 3);
    ts::next_tx(&mut sc, BUYER);
    {
        let score = take_score(&sc);
        assert!(reputation::distinct_buyers(&score) == 3, 3);
        assert!(reputation::meets_proven(&score), 4);
        // v1 alias delegates to the same predicate — never the old floor.
        assert!(reputation::meets_min_reviews(&score), 5);
        assert!(reputation::meets_min_avg(&score), 6);
        ts::return_shared(score);
    };
    // A 4th review (1★, 4th buyer) drags avg to 14/4 = 3.5 < 4: policy 2
    // fails while plain Proven still passes.
    let b4 = *pool.borrow(3);
    let j4 = released_job_from(&mut sc, &clk, b4, SELLER);
    review_as(&mut sc, &clk, b4, j4, 1);
    ts::next_tx(&mut sc, BUYER);
    {
        let score = take_score(&sc);
        assert!(reputation::distinct_buyers(&score) == 4, 7);
        assert!(reputation::meets_proven(&score), 8);
        assert!(!reputation::meets_min_avg(&score), 9);
        ts::return_shared(score);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

// === S.1062 — distinct buyers ===

#[test]
fun three_reviews_one_buyer_not_proven() {
    let (mut sc, clk) = setup();
    // The soft-Sybil case v2 closes: one friendly buyer, three jobs.
    let mut i = 0;
    while (i < 3) {
        let job_id = released_job(&mut sc, &clk, SELLER); // BUYER every time
        review(&mut sc, &clk, job_id, 5);
        i = i + 1;
    };
    ts::next_tx(&mut sc, BUYER);
    {
        let score = take_score(&sc);
        assert!(reputation::review_count(&score) == 3, 0);
        assert!(reputation::distinct_buyers(&score) == 1, 1);
        assert!(reputation::has_buyer_reviewed(&score, BUYER), 2);
        assert!(!reputation::has_buyer_reviewed(&score, BUYER2), 3);
        assert!(!reputation::meets_proven(&score), 4);
        assert!(!reputation::meets_min_avg(&score), 5); // floor gates avg too
        ts::return_shared(score);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = opening::EClaimPolicyUnmet)]
fun proven_claim_one_buyer_three_reviews_fails() {
    let (mut sc, clk) = setup();
    let mut i = 0;
    while (i < 3) {
        let job_id = released_job(&mut sc, &clk, SELLER);
        review(&mut sc, &clk, job_id, 5);
        i = i + 1;
    };
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN);
    claim_proven_as(&mut sc, SELLER, &clk);
    abort 0
}

#[test]
fun edit_does_not_change_distinct() {
    let (mut sc, clk) = setup();
    let job_id = released_job(&mut sc, &clk, SELLER);
    review(&mut sc, &clk, job_id, 5);
    // Same buyer re-rates the same job: distinct stays 1.
    review(&mut sc, &clk, job_id, 2);
    // Same buyer, a SECOND job: still distinct 1 (each buyer counts once).
    let job_b = released_job(&mut sc, &clk, SELLER);
    review(&mut sc, &clk, job_b, 4);
    ts::next_tx(&mut sc, BUYER);
    {
        let score = take_score(&sc);
        assert!(reputation::review_count(&score) == 2, 0);
        assert!(reputation::distinct_buyers(&score) == 1, 1);
        ts::return_shared(score);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

// === Proven claim gates (opening::claim_proven) ===

fun post_open_with_policy(sc: &mut ts::Scenario, clk: &Clock, policy: u8) {
    ts::next_tx(sc, BUYER);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let payment = coin::mint_for_testing<SUI>(AMOUNT, ts::ctx(sc));
    opening::create_open<SUI>(
        payment,
        b"open-spec-hash",
        clk.timestamp_ms() + OPEN_UNTIL,
        SLA_MS,
        REVIEW_WINDOW,
        SPLIT_BPS,
        policy,
        &cfg,
        clk,
        ts::ctx(sc),
    );
    ts::return_shared(cfg);
}

fun claim_proven_as(sc: &mut ts::Scenario, who: address, clk: &Clock): ID {
    ts::next_tx(sc, who);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let reg = ts::take_shared<Registry>(sc);
    let op = ts::take_shared<Opening<SUI>>(sc);
    let score = ts::take_shared<AgentScore>(sc);
    let job_id = opening::claim_proven(op, &reg, &score, &cfg, clk, ts::ctx(sc));
    ts::return_shared(score);
    ts::return_shared(reg);
    ts::return_shared(cfg);
    job_id
}

#[test]
fun proven_claim_succeeds_with_three_reviews() {
    let (mut sc, clk) = setup();
    reviewed_n(&mut sc, &clk, SELLER, 3, 5);
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN);
    let job_id = claim_proven_as(&mut sc, SELLER, &clk);
    // A normal funded Job minted — same as an Anyone claim, still $0.
    ts::next_tx(&mut sc, SELLER);
    {
        let job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        assert!(escrow::seller(&job) == SELLER, 0);
        assert!(escrow::state(&job) == escrow::state_funded(), 1);
        ts::return_shared(job);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
fun proven_4star_claim_succeeds_when_avg_holds() {
    let (mut sc, clk) = setup();
    reviewed_n(&mut sc, &clk, SELLER, 3, 4); // avg exactly 4.0
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN_4STAR);
    claim_proven_as(&mut sc, SELLER, &clk);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = opening::EClaimPolicyUnmet)]
fun proven_claim_below_review_floor_fails() {
    let (mut sc, clk) = setup();
    reviewed_n(&mut sc, &clk, SELLER, 2, 5); // only 2 reviews
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN);
    claim_proven_as(&mut sc, SELLER, &clk);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EClaimPolicyUnmet)]
fun proven_4star_claim_below_avg_fails() {
    let (mut sc, clk) = setup();
    reviewed_n(&mut sc, &clk, SELLER, 3, 3); // count OK, avg 3.0 < 4.0
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN_4STAR);
    claim_proven_as(&mut sc, SELLER, &clk);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EScoreNotClaimer)]
fun proven_claim_with_someone_elses_score_fails() {
    let (mut sc, clk) = setup();
    reviewed_n(&mut sc, &clk, SELLER, 3, 5); // SELLER is Proven
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN);
    // OTHER_SELLER (no reviews) tries to claim by passing SELLER's score.
    claim_proven_as(&mut sc, OTHER_SELLER, &clk);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EBadClaimPolicy)]
fun plain_claim_on_proven_opening_fails() {
    let (mut sc, clk) = setup();
    reviewed_n(&mut sc, &clk, SELLER, 3, 5);
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN);
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
#[expected_failure(abort_code = opening::EBadClaimPolicy)]
fun claim_proven_on_anyone_opening_fails() {
    let (mut sc, clk) = setup();
    reviewed_n(&mut sc, &clk, SELLER, 3, 5);
    post_open_with_policy(&mut sc, &clk, POLICY_ANY);
    claim_proven_as(&mut sc, SELLER, &clk);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::ENotActiveAgent)]
fun proven_claim_still_requires_active_agent() {
    let (mut sc, clk) = setup();
    reviewed_n(&mut sc, &clk, SELLER, 3, 5);
    // SELLER goes inactive AFTER earning Proven — the registry gate still holds.
    ts::next_tx(&mut sc, SELLER);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        registry::set_active(&mut reg, SELLER, false, &clk, ts::ctx(&mut sc));
        ts::return_shared(reg);
    };
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN);
    claim_proven_as(&mut sc, SELLER, &clk);
    abort 0
}

// === S.1063 — protocol outcome counters ===

/// Escrow a Hire job buyer→seller (FUNDED).
fun funded_job(sc: &mut ts::Scenario, clk: &Clock, buyer: address, seller: address): ID {
    ts::next_tx(sc, buyer);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let payment = coin::mint_for_testing<SUI>(AMOUNT, ts::ctx(sc));
    let id = escrow::create<SUI>(
        seller,
        payment,
        b"spec-hash",
        clk.timestamp_ms() + SLA_MS,
        REVIEW_WINDOW,
        8_000, // hire keeps the free split range
        &cfg,
        clk,
        ts::ctx(sc),
    );
    ts::return_shared(cfg);
    id
}

fun deliver_job(sc: &mut ts::Scenario, clk: &Clock, seller: address, job_id: ID) {
    ts::next_tx(sc, seller);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let mut job = ts::take_shared_by_id<Job<SUI>>(sc, job_id);
    escrow::deliver(&mut job, b"delivery-hash", &cfg, clk, ts::ctx(sc));
    ts::return_shared(job);
    ts::return_shared(cfg);
}

/// Permissionless zero-score create for `agent`; returns the score id.
fun empty_score_for(sc: &mut ts::Scenario, clk: &Clock, agent: address): ID {
    ts::next_tx(sc, STRANGER); // anyone may lazily create — grants nothing
    let cfg = ts::take_shared<FeeConfig>(sc);
    let mut board = ts::take_shared<ScoreBoard>(sc);
    reputation::create_empty_score(&mut board, agent, &cfg, clk, ts::ctx(sc));
    let sid = reputation::score_address(&board, agent).to_id();
    ts::return_shared(board);
    ts::return_shared(cfg);
    sid
}

#[test]
fun reject_records_seller_outcome_only() {
    let (mut sc, clk) = setup();
    let sid = empty_score_for(&mut sc, &clk, SELLER);
    let job_id = funded_job(&mut sc, &clk, BUYER, SELLER);
    deliver_job(&mut sc, &clk, SELLER, job_id);
    // Passport buyer rejects in-window through the live v2 door.
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let reg = ts::take_shared<Registry>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        let mut score = ts::take_shared_by_id<AgentScore>(&sc, sid);
        reputation::reject_v2(&mut job, &mut score, &reg, &cfg, &clk, ts::ctx(&mut sc));
        assert!(escrow::state(&job) == escrow::state_rejected(), 0);
        // The outcome landed — and NOTHING star-shaped moved.
        assert!(reputation::rejected_after_delivery(&score) == 1, 1);
        assert!(reputation::no_delivery(&score) == 0, 2);
        assert!(reputation::as_buyer_rejected(&score) == 0, 3);
        assert!(reputation::review_count(&score) == 0, 4);
        assert!(reputation::stars_sum(&score) == 0, 5);
        assert!(reputation::distinct_buyers(&score) == 0, 6);
        assert!(!reputation::meets_proven(&score), 7);
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(reg);
        ts::return_shared(cfg);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
fun agent_buyer_reject_records_both_sides() {
    let (mut sc, clk) = setup();
    // OTHER_SELLER (registered) buys from SELLER; both scores pre-created.
    let seller_sid = empty_score_for(&mut sc, &clk, SELLER);
    let buyer_sid = empty_score_for(&mut sc, &clk, OTHER_SELLER);
    let job_id = funded_job(&mut sc, &clk, OTHER_SELLER, SELLER);
    deliver_job(&mut sc, &clk, SELLER, job_id);
    ts::next_tx(&mut sc, OTHER_SELLER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let reg = ts::take_shared<Registry>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        let mut seller_score = ts::take_shared_by_id<AgentScore>(&sc, seller_sid);
        let mut buyer_score = ts::take_shared_by_id<AgentScore>(&sc, buyer_sid);
        reputation::reject_v2_agent_buyer(
            &mut job,
            &mut seller_score,
            &mut buyer_score,
            &reg,
            &cfg,
            &clk,
            ts::ctx(&mut sc),
        );
        assert!(reputation::rejected_after_delivery(&seller_score) == 1, 0);
        assert!(reputation::as_buyer_rejected(&buyer_score) == 1, 1);
        assert!(reputation::as_buyer_rejected(&seller_score) == 0, 2);
        assert!(reputation::rejected_after_delivery(&buyer_score) == 0, 3);
        ts::return_shared(buyer_score);
        ts::return_shared(seller_score);
        ts::return_shared(job);
        ts::return_shared(reg);
        ts::return_shared(cfg);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = reputation::EBuyerIsAgent)]
fun agent_buyer_cannot_dodge_own_counter() {
    let (mut sc, clk) = setup();
    let seller_sid = empty_score_for(&mut sc, &clk, SELLER);
    let job_id = funded_job(&mut sc, &clk, OTHER_SELLER, SELLER);
    deliver_job(&mut sc, &clk, SELLER, job_id);
    ts::next_tx(&mut sc, OTHER_SELLER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let reg = ts::take_shared<Registry>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        let mut score = ts::take_shared_by_id<AgentScore>(&sc, seller_sid);
        // Registered buyer picking the Passport variant = dodging.
        reputation::reject_v2(&mut job, &mut score, &reg, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(reg);
        ts::return_shared(cfg);
    };
    abort 0
}

#[test]
#[expected_failure(abort_code = reputation::EBuyerNotAgent)]
fun passport_buyer_cannot_use_agent_variant() {
    let (mut sc, clk) = setup();
    let seller_sid = empty_score_for(&mut sc, &clk, SELLER);
    let buyer_sid = empty_score_for(&mut sc, &clk, BUYER);
    let job_id = funded_job(&mut sc, &clk, BUYER, SELLER);
    deliver_job(&mut sc, &clk, SELLER, job_id);
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let reg = ts::take_shared<Registry>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        let mut seller_score = ts::take_shared_by_id<AgentScore>(&sc, seller_sid);
        let mut buyer_score = ts::take_shared_by_id<AgentScore>(&sc, buyer_sid);
        reputation::reject_v2_agent_buyer(
            &mut job,
            &mut seller_score,
            &mut buyer_score,
            &reg,
            &cfg,
            &clk,
            ts::ctx(&mut sc),
        );
        ts::return_shared(buyer_score);
        ts::return_shared(seller_score);
        ts::return_shared(job);
        ts::return_shared(reg);
        ts::return_shared(cfg);
    };
    abort 0
}

#[test]
fun deadline_refund_records_no_delivery() {
    let (mut sc, mut clk) = setup();
    let sid = empty_score_for(&mut sc, &clk, SELLER);
    let job_id = funded_job(&mut sc, &clk, BUYER, SELLER);
    let past_deadline = clk.timestamp_ms() + SLA_MS + 1;
    clk.set_for_testing(past_deadline);
    // Permissionless crank — a stranger runs it; the counter still lands.
    ts::next_tx(&mut sc, STRANGER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        let mut score = ts::take_shared_by_id<AgentScore>(&sc, sid);
        reputation::refund_v2(&mut job, &mut score, &cfg, &clk, ts::ctx(&mut sc));
        assert!(escrow::state(&job) == escrow::state_refunded(), 0);
        assert!(reputation::no_delivery(&score) == 1, 1);
        assert!(reputation::rejected_after_delivery(&score) == 0, 2);
        assert!(reputation::review_count(&score) == 0, 3);
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
fun decline_writes_no_outcome() {
    let (mut sc, clk) = setup();
    let sid = empty_score_for(&mut sc, &clk, SELLER);
    let job_id = funded_job(&mut sc, &clk, BUYER, SELLER);
    // Seller walks cleanly before delivering — full refund, NO counter.
    ts::next_tx(&mut sc, SELLER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        escrow::decline(&mut job, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    ts::next_tx(&mut sc, SELLER);
    {
        let score = ts::take_shared_by_id<AgentScore>(&sc, sid);
        assert!(reputation::no_delivery(&score) == 0, 0);
        assert!(reputation::rejected_after_delivery(&score) == 0, 1);
        ts::return_shared(score);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = reputation::EWrongScore)]
fun refund_with_wrong_seller_score_fails() {
    let (mut sc, mut clk) = setup();
    let wrong_sid = empty_score_for(&mut sc, &clk, OTHER_SELLER);
    let job_id = funded_job(&mut sc, &clk, BUYER, SELLER);
    let past_deadline = clk.timestamp_ms() + SLA_MS + 1;
    clk.set_for_testing(past_deadline);
    ts::next_tx(&mut sc, STRANGER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        let mut score = ts::take_shared_by_id<AgentScore>(&sc, wrong_sid);
        reputation::refund_v2(&mut job, &mut score, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    abort 0
}

#[test]
#[expected_failure(abort_code = escrow::EUseSettleV2)]
fun deprecated_escrow_reject_aborts() {
    let (mut sc, clk) = setup();
    let job_id = funded_job(&mut sc, &clk, BUYER, SELLER);
    deliver_job(&mut sc, &clk, SELLER, job_id);
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        escrow::reject(&mut job, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    abort 0
}

#[test]
#[expected_failure(abort_code = escrow::EUseSettleV2)]
fun deprecated_escrow_refund_aborts() {
    let (mut sc, mut clk) = setup();
    let job_id = funded_job(&mut sc, &clk, BUYER, SELLER);
    let past_deadline = clk.timestamp_ms() + SLA_MS + 1;
    clk.set_for_testing(past_deadline);
    ts::next_tx(&mut sc, STRANGER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        escrow::refund(&mut job, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    abort 0
}

#[test]
#[expected_failure] // derived_object::claim: score already exists
fun create_empty_score_twice_aborts() {
    let (mut sc, clk) = setup();
    empty_score_for(&mut sc, &clk, SELLER);
    empty_score_for(&mut sc, &clk, SELLER);
    abort 0
}

// === S.1064 — review on REJECTED ===

/// Deliver + buyer-reject a funded job (through the live v2 door).
fun reject_job(
    sc: &mut ts::Scenario,
    clk: &Clock,
    buyer: address,
    seller: address,
    job_id: ID,
    seller_sid: ID,
) {
    deliver_job(sc, clk, seller, job_id);
    ts::next_tx(sc, buyer);
    {
        let cfg = ts::take_shared<FeeConfig>(sc);
        let reg = ts::take_shared<Registry>(sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(sc, job_id);
        let mut score = ts::take_shared_by_id<AgentScore>(sc, seller_sid);
        reputation::reject_v2(&mut job, &mut score, &reg, &cfg, clk, ts::ctx(sc));
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(reg);
        ts::return_shared(cfg);
    };
}

#[test]
fun rejected_job_is_reviewable_and_counts_distinct() {
    let (mut sc, clk) = setup();
    let sid = empty_score_for(&mut sc, &clk, SELLER);
    let job_id = funded_job(&mut sc, &clk, BUYER, SELLER);
    reject_job(&mut sc, &clk, BUYER, SELLER, job_id, sid);
    // The rejecting buyer leaves the honest 1★ — a real star, real distinct.
    review(&mut sc, &clk, job_id, 1);
    ts::next_tx(&mut sc, BUYER);
    {
        let score = ts::take_shared_by_id<AgentScore>(&sc, sid);
        assert!(reputation::review_count(&score) == 1, 0);
        assert!(reputation::stars_sum(&score) == 1, 1);
        assert!(reputation::distinct_buyers(&score) == 1, 2);
        // The S.1063 outcome landed at reject and does NOT double here.
        assert!(reputation::rejected_after_delivery(&score) == 1, 3);
        ts::return_shared(score);
    };
    // Edit-in-place still works on the rejected job's review.
    review(&mut sc, &clk, job_id, 2);
    ts::next_tx(&mut sc, BUYER);
    {
        let score = ts::take_shared_by_id<AgentScore>(&sc, sid);
        assert!(reputation::review_count(&score) == 1, 4);
        assert!(reputation::stars_sum(&score) == 2, 5);
        assert!(reputation::rejected_after_delivery(&score) == 1, 6);
        ts::return_shared(score);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = reputation::ENotReleased)]
fun funded_job_still_not_reviewable() {
    let (mut sc, clk) = setup();
    empty_score_for(&mut sc, &clk, SELLER);
    let job_id = funded_job(&mut sc, &clk, BUYER, SELLER);
    review(&mut sc, &clk, job_id, 3);
    abort 0
}

#[test]
#[expected_failure(abort_code = reputation::ENotReleased)]
fun delivered_pre_reject_still_not_reviewable() {
    let (mut sc, clk) = setup();
    empty_score_for(&mut sc, &clk, SELLER);
    let job_id = funded_job(&mut sc, &clk, BUYER, SELLER);
    deliver_job(&mut sc, &clk, SELLER, job_id);
    review(&mut sc, &clk, job_id, 3);
    abort 0
}

// === create_open policy bounds (S.1054) ===

#[test]
fun create_open_accepts_proven_policies() {
    let (mut sc, clk) = setup();
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN);
    ts::next_tx(&mut sc, BUYER);
    {
        let op = ts::take_shared<Opening<SUI>>(&sc);
        assert!(opening::claim_policy(&op) == POLICY_PROVEN, 0);
        ts::return_shared(op);
    };
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN_4STAR);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = opening::EBadClaimPolicy)]
fun create_open_policy_three_aborts() {
    let (mut sc, clk) = setup();
    post_open_with_policy(&mut sc, &clk, 3);
    abort 0
}
