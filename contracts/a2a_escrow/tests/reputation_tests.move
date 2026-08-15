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
const ASP: address = @0xB; // registered + active seller
const STRANGER: address = @0xC; // neither party to any job
const OTHER_ASP: address = @0xE; // a second registered seller

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
    // run init) — mirror that ritual here.
    ts::next_tx(&mut sc, ADMIN);
    {
        let cap = ts::take_from_sender<AdminCap>(&sc);
        let cfg = ts::take_shared<FeeConfig>(&sc);
        reputation::create_score_board(&cap, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(cfg);
        ts::return_to_sender(&sc, cap);
    };
    register_agent(&mut sc, &clk, ASP);
    register_agent(&mut sc, &clk, OTHER_ASP);
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

/// Run one full Hire job BUYER→seller to RELEASED (deliver + buyer accept).
/// Returns the job id — the receipt a review needs.
fun released_job(sc: &mut ts::Scenario, clk: &Clock, seller: address): ID {
    ts::next_tx(sc, BUYER);
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
    ts::next_tx(sc, BUYER);
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

/// Give `seller` `n` released-job reviews of `stars` each.
fun reviewed_n(sc: &mut ts::Scenario, clk: &Clock, seller: address, n: u64, stars: u8) {
    let mut i = 0;
    while (i < n) {
        let job_id = released_job(sc, clk, seller);
        review(sc, clk, job_id, stars);
        i = i + 1;
    }
}

fun take_score(sc: &ts::Scenario): AgentScore {
    ts::take_shared<AgentScore>(sc)
}

// === Review happy paths ===

#[test]
fun first_review_creates_score_at_derived_address() {
    let (mut sc, clk) = setup();
    let job_id = released_job(&mut sc, &clk, ASP);
    review(&mut sc, &clk, job_id, 5);
    ts::next_tx(&mut sc, BUYER);
    {
        let board = ts::take_shared<ScoreBoard>(&sc);
        let score = take_score(&sc);
        assert!(reputation::agent(&score) == ASP, 0);
        assert!(reputation::review_count(&score) == 1, 1);
        assert!(reputation::stars_sum(&score) == 5, 2);
        assert!(reputation::has_job_review(&score, job_id), 3);
        assert!(reputation::job_stars(&score, job_id) == 5, 4);
        // The score lives at its deterministic derived address.
        assert!(
            object::id(&score).to_address() == reputation::score_address(&board, ASP),
            5,
        );
        assert!(reputation::has_score(&board, ASP), 6);
        assert!(!reputation::has_score(&board, OTHER_ASP), 7);
        ts::return_shared(score);
        ts::return_shared(board);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
fun two_jobs_accumulate() {
    let (mut sc, clk) = setup();
    let job_a = released_job(&mut sc, &clk, ASP);
    review(&mut sc, &clk, job_a, 5);
    let job_b = released_job(&mut sc, &clk, ASP);
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
    let job_id = released_job(&mut sc, &clk, ASP);
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
    let job_id = released_job(&mut sc, &clk, ASP);
    review_as(&mut sc, &clk, STRANGER, job_id, 5);
    abort 0
}

#[test]
#[expected_failure(abort_code = reputation::ENotBuyer)]
fun seller_reviews_own_job_fails() {
    let (mut sc, clk) = setup();
    let job_id = released_job(&mut sc, &clk, ASP);
    review_as(&mut sc, &clk, ASP, job_id, 5);
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
            ASP,
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
            ASP,
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
    ts::next_tx(&mut sc, ASP);
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
            ASP,
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
    let job_id = released_job(&mut sc, &clk, ASP);
    review(&mut sc, &clk, job_id, 0);
    abort 0
}

#[test]
#[expected_failure(abort_code = reputation::EBadStars)]
fun six_stars_fails() {
    let (mut sc, clk) = setup();
    let job_id = released_job(&mut sc, &clk, ASP);
    review(&mut sc, &clk, job_id, 6);
    abort 0
}

#[test]
#[expected_failure(abort_code = reputation::EWrongScore)]
fun review_into_wrong_agents_score_fails() {
    let (mut sc, clk) = setup();
    // ASP earns a score; then a released OTHER_ASP job tries to land its
    // review into ASP's score object.
    let asp_job = released_job(&mut sc, &clk, ASP);
    review(&mut sc, &clk, asp_job, 5);
    let other_job = released_job(&mut sc, &clk, OTHER_ASP);
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let job = ts::take_shared_by_id<Job<SUI>>(&sc, other_job);
        let mut score = take_score(&sc); // ASP's score — the only one
        reputation::submit_review(&mut score, &job, 5, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    abort 0
}

#[test]
#[expected_failure] // derived_object::claim aborts: score already exists
fun duplicate_first_review_fails() {
    let (mut sc, clk) = setup();
    let job_a = released_job(&mut sc, &clk, ASP);
    review(&mut sc, &clk, job_a, 5);
    let job_b = released_job(&mut sc, &clk, ASP);
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
fun proven_predicates_track_thresholds() {
    let (mut sc, clk) = setup();
    // 2 × 5★ — below the review floor: neither predicate passes.
    reviewed_n(&mut sc, &clk, ASP, 2, 5);
    ts::next_tx(&mut sc, BUYER);
    {
        let score = take_score(&sc);
        assert!(!reputation::meets_min_reviews(&score), 0);
        assert!(!reputation::meets_min_avg(&score), 1);
        ts::return_shared(score);
    };
    // A 3rd review (3★) crosses the floor: count passes; avg 13/3 ≈ 4.33 ≥ 4.
    reviewed_n(&mut sc, &clk, ASP, 1, 3);
    ts::next_tx(&mut sc, BUYER);
    {
        let score = take_score(&sc);
        assert!(reputation::meets_min_reviews(&score), 2);
        assert!(reputation::meets_min_avg(&score), 3);
        ts::return_shared(score);
    };
    // A 4th review (1★) drags avg to 14/4 = 3.5 < 4: count still passes.
    reviewed_n(&mut sc, &clk, ASP, 1, 1);
    ts::next_tx(&mut sc, BUYER);
    {
        let score = take_score(&sc);
        assert!(reputation::meets_min_reviews(&score), 4);
        assert!(!reputation::meets_min_avg(&score), 5);
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
    reviewed_n(&mut sc, &clk, ASP, 3, 5);
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN);
    let job_id = claim_proven_as(&mut sc, ASP, &clk);
    // A normal funded Job minted — same as an Anyone claim, still $0.
    ts::next_tx(&mut sc, ASP);
    {
        let job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        assert!(escrow::seller(&job) == ASP, 0);
        assert!(escrow::state(&job) == escrow::state_funded(), 1);
        ts::return_shared(job);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
fun proven_4star_claim_succeeds_when_avg_holds() {
    let (mut sc, clk) = setup();
    reviewed_n(&mut sc, &clk, ASP, 3, 4); // avg exactly 4.0
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN_4STAR);
    claim_proven_as(&mut sc, ASP, &clk);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = opening::EClaimPolicyUnmet)]
fun proven_claim_below_review_floor_fails() {
    let (mut sc, clk) = setup();
    reviewed_n(&mut sc, &clk, ASP, 2, 5); // only 2 reviews
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN);
    claim_proven_as(&mut sc, ASP, &clk);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EClaimPolicyUnmet)]
fun proven_4star_claim_below_avg_fails() {
    let (mut sc, clk) = setup();
    reviewed_n(&mut sc, &clk, ASP, 3, 3); // count OK, avg 3.0 < 4.0
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN_4STAR);
    claim_proven_as(&mut sc, ASP, &clk);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EScoreNotClaimer)]
fun proven_claim_with_someone_elses_score_fails() {
    let (mut sc, clk) = setup();
    reviewed_n(&mut sc, &clk, ASP, 3, 5); // ASP is Proven
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN);
    // OTHER_ASP (no reviews) tries to claim by passing ASP's score.
    claim_proven_as(&mut sc, OTHER_ASP, &clk);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::EBadClaimPolicy)]
fun plain_claim_on_proven_opening_fails() {
    let (mut sc, clk) = setup();
    reviewed_n(&mut sc, &clk, ASP, 3, 5);
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN);
    ts::next_tx(&mut sc, ASP);
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
    reviewed_n(&mut sc, &clk, ASP, 3, 5);
    post_open_with_policy(&mut sc, &clk, POLICY_ANY);
    claim_proven_as(&mut sc, ASP, &clk);
    abort 0
}

#[test]
#[expected_failure(abort_code = opening::ENotActiveAgent)]
fun proven_claim_still_requires_active_agent() {
    let (mut sc, clk) = setup();
    reviewed_n(&mut sc, &clk, ASP, 3, 5);
    // ASP goes inactive AFTER earning Proven — the registry gate still holds.
    ts::next_tx(&mut sc, ASP);
    {
        let mut reg = ts::take_shared<Registry>(&sc);
        registry::set_active(&mut reg, ASP, false, &clk, ts::ctx(&mut sc));
        ts::return_shared(reg);
    };
    post_open_with_policy(&mut sc, &clk, POLICY_PROVEN);
    claim_proven_as(&mut sc, ASP, &clk);
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
