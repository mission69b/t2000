#[test_only]
module a2a_escrow::batch_tests;

use a2a_escrow::batch::{Self, BatchOpening};
use a2a_escrow::escrow::{Self, AdminCap, FeeConfig, Job};
use a2a_escrow::reputation::{Self, AgentScore, ScoreBoard};
use agent_id::registry::{Self, Registry};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;

const ADMIN: address = @0xAD; // deployer = AdminCap holder + fee receiver
const BUYER: address = @0xA;
const SELLER: address = @0xB; // registered + active claimer
const SELLER2: address = @0xE; // a second registered claimer
const LURKER: address = @0xC; // never registered

const SLOT_AMOUNT: u64 = 80_000; // $0.08 — the desk's wave unit
const SLOTS: u64 = 10;
const OPEN_UNTIL: u64 = 500_000; // ms
const SLA_MS: u64 = 400_000; // ms
const REVIEW_WINDOW: u64 = 100_000; // ms
const SPLIT_BPS: u64 = 10_000; // open board: reject = 100% buyer
const POLICY_ANY: u8 = 0;

fun setup(): (ts::Scenario, Clock) {
    let mut sc = ts::begin(ADMIN);
    escrow::init_for_testing(ts::ctx(&mut sc));
    registry::init_for_testing(ts::ctx(&mut sc));
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, ADMIN);
    {
        let cap = ts::take_from_sender<AdminCap>(&sc);
        let mut cfg = ts::take_shared<FeeConfig>(&sc);
        reputation::create_score_board(&cap, &mut cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(cfg);
        ts::return_to_sender(&sc, cap);
    };
    register_agent(&mut sc, &clk, SELLER);
    register_agent(&mut sc, &clk, SELLER2);
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

fun take_score(sc: &ts::Scenario, who: address): AgentScore {
    let board = ts::take_shared<ScoreBoard>(sc);
    let addr = reputation::score_address(&board, who);
    ts::return_shared(board);
    ts::take_shared_by_id<AgentScore>(sc, object::id_from_address(addr))
}

/// Resolve a score's id in its own tx — for blocks that must hold TWO
/// scores at once (the board can't be re-taken twice in one tx).
fun score_id_of(sc: &mut ts::Scenario, who: address): ID {
    ts::next_tx(sc, who);
    let board = ts::take_shared<ScoreBoard>(sc);
    let addr = reputation::score_address(&board, who);
    ts::return_shared(board);
    object::id_from_address(addr)
}

fun active_of(sc: &mut ts::Scenario, who: address): u64 {
    ts::next_tx(sc, who);
    let score = take_score(sc, who);
    let n = reputation::active_seller_jobs(&score);
    ts::return_shared(score);
    n
}

fun post_batch(sc: &mut ts::Scenario, clk: &Clock, slots: u64, max_claims: u8): ID {
    post_batch_with(sc, clk, SLOT_AMOUNT * slots, slots, POLICY_ANY, 0, max_claims)
}

fun post_batch_with(
    sc: &mut ts::Scenario,
    clk: &Clock,
    payment: u64,
    slots: u64,
    claim_policy: u8,
    min_seller_level: u8,
    max_claims_per_agent: u8,
): ID {
    ts::next_tx(sc, BUYER);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let coin = coin::mint_for_testing<SUI>(payment, ts::ctx(sc));
    let id = batch::create_batch_open<SUI>(
        coin,
        slots,
        b"wave-spec-hash",
        OPEN_UNTIL,
        SLA_MS,
        REVIEW_WINDOW,
        SPLIT_BPS,
        claim_policy,
        min_seller_level,
        max_claims_per_agent,
        &cfg,
        clk,
        ts::ctx(sc),
    );
    ts::return_shared(cfg);
    id
}

fun claim_as(sc: &mut ts::Scenario, who: address, clk: &Clock): ID {
    ensure_score(sc, clk, who);
    ts::next_tx(sc, who);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let reg = ts::take_shared<Registry>(sc);
    let mut score = take_score(sc, who);
    let mut b = ts::take_shared<BatchOpening<SUI>>(sc);
    let job_id = batch::batch_claim(&mut b, &reg, &mut score, &cfg, clk, ts::ctx(sc));
    ts::return_shared(b);
    ts::return_shared(score);
    ts::return_shared(reg);
    ts::return_shared(cfg);
    job_id
}

/// Claim from a SPECIFIC batch (multi-batch scenarios can't take_shared).
fun claim_from(sc: &mut ts::Scenario, who: address, clk: &Clock, batch_id: ID): ID {
    ensure_score(sc, clk, who);
    ts::next_tx(sc, who);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let reg = ts::take_shared<Registry>(sc);
    let mut score = take_score(sc, who);
    let mut b = ts::take_shared_by_id<BatchOpening<SUI>>(sc, batch_id);
    let job_id = batch::batch_claim(&mut b, &reg, &mut score, &cfg, clk, ts::ctx(sc));
    ts::return_shared(b);
    ts::return_shared(score);
    ts::return_shared(reg);
    ts::return_shared(cfg);
    job_id
}

fun deliver_job(sc: &mut ts::Scenario, who: address, clk: &Clock, job_id: ID) {
    ts::next_tx(sc, who);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let mut job = ts::take_shared_by_id<Job<SUI>>(sc, job_id);
    escrow::deliver(&mut job, b"delivery", &cfg, clk, ts::ctx(sc));
    ts::return_shared(job);
    ts::return_shared(cfg);
}

/// Settle a batch-origin Job through `batch_release` as `sender`
/// (`seller` names whose score rides along — always the Job's seller).
fun batch_release_as(
    sc: &mut ts::Scenario,
    sender: address,
    clk: &Clock,
    batch_id: ID,
    job_id: ID,
    seller: address,
) {
    ts::next_tx(sc, sender);
    let cfg = ts::take_shared<FeeConfig>(sc);
    let mut b = ts::take_shared_by_id<BatchOpening<SUI>>(sc, batch_id);
    let mut job = ts::take_shared_by_id<Job<SUI>>(sc, job_id);
    let mut score = take_score(sc, seller);
    batch::batch_release(&mut b, &mut job, &mut score, &cfg, clk, ts::ctx(sc));
    ts::return_shared(score);
    ts::return_shared(job);
    ts::return_shared(b);
    ts::return_shared(cfg);
}

fun wave_claims_of(sc: &mut ts::Scenario, batch_id: ID, who: address): u8 {
    ts::next_tx(sc, who);
    let b = ts::take_shared_by_id<BatchOpening<SUI>>(sc, batch_id);
    let n = batch::claims_by_agent(&b, who);
    ts::return_shared(b);
    n
}

fun assert_received(sc: &mut ts::Scenario, who: address, expect: u64) {
    ts::next_tx(sc, who);
    let received = ts::take_from_address<Coin<SUI>>(sc, who);
    assert!(received.value() == expect, 100);
    ts::return_to_address(who, received);
}

// === Happy path: one post, N slots, invariant holds per claim ===

#[test]
fun one_post_ten_slots_claim_decrements_and_mints_a_normal_job() {
    let (mut sc, mut clk) = setup();
    post_batch(&mut sc, &clk, SLOTS, 1);
    ts::next_tx(&mut sc, BUYER);
    {
        let b = ts::take_shared<BatchOpening<SUI>>(&sc);
        assert!(batch::slots_total(&b) == SLOTS, 0);
        assert!(batch::slots_remaining(&b) == SLOTS, 1);
        assert!(batch::amount(&b) == SLOT_AMOUNT, 2);
        assert!(batch::escrow_value(&b) == SLOT_AMOUNT * SLOTS, 3);
        ts::return_shared(b);
    };
    clk.set_for_testing(10_000);
    let job_id = claim_as(&mut sc, SELLER, &clk);
    ts::next_tx(&mut sc, SELLER);
    {
        let b = ts::take_shared<BatchOpening<SUI>>(&sc);
        // 10 → 9 and the escrow invariant holds after the split.
        assert!(batch::slots_remaining(&b) == 9, 4);
        assert!(batch::escrow_value(&b) == SLOT_AMOUNT * 9, 5);
        assert!(batch::claims_by_agent(&b, SELLER) == 1, 6);
        ts::return_shared(b);
        // The slot minted a NORMAL claimed Job: right parties, right size,
        // ClaimedJobKey stamped (the counter decrements at settle).
        let job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        assert!(escrow::buyer(&job) == BUYER, 7);
        assert!(escrow::seller(&job) == SELLER, 8);
        assert!(escrow::amount(&job) == SLOT_AMOUNT, 9);
        assert!(escrow::is_claimed_job(&job), 10);
        assert!(escrow::deliver_by_ms(&job) == 10_000 + SLA_MS, 11);
        ts::return_shared(job);
    };
    // The claim seated one job on the seller's GLOBAL active counter.
    assert!(active_of(&mut sc, SELLER) == 1, 12);
    ts::end(sc);
    clk.destroy_for_testing();
}

// === Per-agent wave limit ===

#[test]
#[expected_failure(abort_code = batch::EMaxClaimsReached)]
fun second_claim_same_agent_at_max_one_aborts() {
    let (mut sc, mut clk) = setup();
    post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    claim_as(&mut sc, SELLER, &clk);
    claim_as(&mut sc, SELLER, &clk);
    abort 0
}

#[test]
fun max_claims_two_allows_two_sequential_claims_then_other_agents() {
    let (mut sc, mut clk) = setup();
    post_batch(&mut sc, &clk, SLOTS, 2);
    clk.set_for_testing(10_000);
    claim_as(&mut sc, SELLER, &clk);
    claim_as(&mut sc, SELLER, &clk); // second slot, allowed at max 2
    claim_as(&mut sc, SELLER2, &clk); // different agent unaffected
    ts::next_tx(&mut sc, BUYER);
    {
        let b = ts::take_shared<BatchOpening<SUI>>(&sc);
        assert!(batch::slots_remaining(&b) == 7, 0);
        assert!(batch::claims_by_agent(&b, SELLER) == 2, 1);
        assert!(batch::claims_by_agent(&b, SELLER2) == 1, 2);
        assert!(batch::escrow_value(&b) == SLOT_AMOUNT * 7, 3);
        ts::return_shared(b);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

// === Slots exhausted ===

#[test]
#[expected_failure(abort_code = batch::ENoSlotsRemaining)]
fun claim_with_zero_slots_left_aborts() {
    let (mut sc, mut clk) = setup();
    post_batch(&mut sc, &clk, 2, 1);
    clk.set_for_testing(10_000);
    claim_as(&mut sc, SELLER, &clk);
    claim_as(&mut sc, SELLER2, &clk); // drains the batch (2 slots)
    register_agent(&mut sc, &clk, LURKER);
    claim_as(&mut sc, LURKER, &clk);
    abort 0
}

#[test]
fun filled_batch_persists_with_zero_balance() {
    let (mut sc, mut clk) = setup();
    post_batch(&mut sc, &clk, 2, 1);
    clk.set_for_testing(10_000);
    claim_as(&mut sc, SELLER, &clk);
    claim_as(&mut sc, SELLER2, &clk);
    ts::next_tx(&mut sc, BUYER);
    {
        // v1 lock: the drained batch is NOT deleted (Table non-empty) —
        // it persists shared at 0 slots / 0 balance; invariant holds.
        let b = ts::take_shared<BatchOpening<SUI>>(&sc);
        assert!(batch::slots_remaining(&b) == 0, 0);
        assert!(batch::escrow_value(&b) == 0, 1);
        ts::return_shared(b);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

// === Cancel + expiry refund ===

#[test]
fun cancel_refunds_unclaimed_remainder_fee_free() {
    let (mut sc, mut clk) = setup();
    post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    claim_as(&mut sc, SELLER, &clk); // 1 claimed, 9 remain
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut b = ts::take_shared<BatchOpening<SUI>>(&sc);
        batch::cancel_batch_open(&mut b, &cfg, &clk, ts::ctx(&mut sc));
        assert!(batch::slots_remaining(&b) == 0, 0);
        assert!(batch::escrow_value(&b) == 0, 1);
        ts::return_shared(b);
        ts::return_shared(cfg);
    };
    // 9 × $0.08 back, fee-free; the claimed slot's Job is untouched.
    assert_received(&mut sc, BUYER, SLOT_AMOUNT * 9);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = batch::ENotBuyer)]
fun cancel_by_stranger_aborts() {
    let (mut sc, clk) = setup();
    post_batch(&mut sc, &clk, SLOTS, 1);
    ts::next_tx(&mut sc, LURKER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut b = ts::take_shared<BatchOpening<SUI>>(&sc);
        batch::cancel_batch_open(&mut b, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(b);
        ts::return_shared(cfg);
    };
    abort 0
}

#[test]
fun expiry_refund_is_permissionless_and_fee_free() {
    let (mut sc, mut clk) = setup();
    post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(OPEN_UNTIL + 1);
    ts::next_tx(&mut sc, LURKER); // anyone may crank
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut b = ts::take_shared<BatchOpening<SUI>>(&sc);
        batch::refund_batch_expired(&mut b, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(b);
        ts::return_shared(cfg);
    };
    assert_received(&mut sc, BUYER, SLOT_AMOUNT * SLOTS);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = batch::ENotExpired)]
fun expiry_refund_before_open_until_aborts() {
    let (mut sc, clk) = setup();
    post_batch(&mut sc, &clk, SLOTS, 1);
    ts::next_tx(&mut sc, LURKER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut b = ts::take_shared<BatchOpening<SUI>>(&sc);
        batch::refund_batch_expired(&mut b, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(b);
        ts::return_shared(cfg);
    };
    abort 0
}

#[test]
#[expected_failure(abort_code = batch::ENoSlotsRemaining)]
fun double_cancel_aborts() {
    let (mut sc, clk) = setup();
    post_batch(&mut sc, &clk, SLOTS, 1);
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut b = ts::take_shared<BatchOpening<SUI>>(&sc);
        batch::cancel_batch_open(&mut b, &cfg, &clk, ts::ctx(&mut sc));
        batch::cancel_batch_open(&mut b, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(b);
        ts::return_shared(cfg);
    };
    abort 0
}

// === Phase C gates stack on batch_claim ===

#[test]
#[expected_failure(abort_code = batch::EMinSellerLevelUnmet)]
fun min_level_two_refuses_fresh_seller() {
    let (mut sc, mut clk) = setup();
    post_batch_with(&mut sc, &clk, SLOT_AMOUNT * SLOTS, SLOTS, POLICY_ANY, 2, 1);
    clk.set_for_testing(10_000);
    claim_as(&mut sc, SELLER, &clk); // empty score = Level 1 < floor 2
    abort 0
}

#[test]
#[expected_failure(abort_code = batch::EClaimPolicyUnmet)]
fun proven_policy_refuses_unproven_claimer() {
    let (mut sc, mut clk) = setup();
    post_batch_with(&mut sc, &clk, SLOT_AMOUNT * SLOTS, SLOTS, 1, 0, 1);
    clk.set_for_testing(10_000);
    claim_as(&mut sc, SELLER, &clk); // empty score: 0 distinct buyers
    abort 0
}

#[test]
#[expected_failure(abort_code = batch::EMaxClaimsReached)]
fun wave_cap_is_level_scaled_min_of_ceiling_and_level_cap() {
    let (mut sc, mut clk) = setup();
    // S.1202 (D15) / acceptance 1: buyer ceiling 30, Level-1 cap 4 → the
    // wave cap is min(30, 4) = 4; the 5th claim of the SAME wave aborts
    // on the WAVE gate (asserted before the global EActiveJobCap).
    post_batch(&mut sc, &clk, SLOTS, 30);
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
#[expected_failure(abort_code = batch::EActiveJobCap)]
fun global_active_cap_counts_batch_slots_across_waves() {
    let (mut sc, mut clk) = setup();
    // Level-1 global cap is 4 across ALL waves: 2 + 2 holds on two waves,
    // then a 3rd claim of wave A passes its wave gate (2 < min(3, 4)) and
    // hits the GLOBAL cap.
    let a = post_batch(&mut sc, &clk, SLOTS, 3);
    let b = post_batch(&mut sc, &clk, SLOTS, 3);
    clk.set_for_testing(10_000);
    claim_from(&mut sc, SELLER, &clk, a);
    claim_from(&mut sc, SELLER, &clk, a);
    claim_from(&mut sc, SELLER, &clk, b);
    claim_from(&mut sc, SELLER, &clk, b);
    assert!(active_of(&mut sc, SELLER) == 4, 0);
    claim_from(&mut sc, SELLER, &clk, a);
    abort 0
}

#[test]
#[expected_failure(abort_code = batch::EScoreNotClaimer)]
fun claim_on_borrowed_score_aborts() {
    let (mut sc, mut clk) = setup();
    post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    ensure_score(&mut sc, &clk, SELLER);
    ts::next_tx(&mut sc, SELLER2);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let reg = ts::take_shared<Registry>(&sc);
        let mut score = take_score(&sc, SELLER); // not SELLER2's score
        let mut b = ts::take_shared<BatchOpening<SUI>>(&sc);
        batch::batch_claim(&mut b, &reg, &mut score, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(b);
        ts::return_shared(score);
        ts::return_shared(reg);
        ts::return_shared(cfg);
    };
    abort 0
}

// === S.1202 — batch-aware settle frees the wave hold with the money ===

#[test]
fun batch_release_pays_seller_and_frees_both_counters() {
    let (mut sc, mut clk) = setup();
    let bid = post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    let job_id = claim_as(&mut sc, SELLER, &clk);
    assert!(active_of(&mut sc, SELLER) == 1, 0);
    assert!(wave_claims_of(&mut sc, bid, SELLER) == 1, 1);
    clk.set_for_testing(20_000);
    deliver_job(&mut sc, SELLER, &clk, job_id);
    clk.set_for_testing(30_000);
    batch_release_as(&mut sc, BUYER, &clk, bid, job_id, SELLER);
    // Global seat AND wave hold freed; the one-shot marker is stamped;
    // row removed at 0 (reads back as 0).
    assert!(active_of(&mut sc, SELLER) == 0, 2);
    assert!(wave_claims_of(&mut sc, bid, SELLER) == 0, 3);
    ts::next_tx(&mut sc, BUYER);
    {
        let job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        assert!(escrow::is_batch_hold_released(&job), 4);
        ts::return_shared(job);
    };
    // Seller got the slot minus the 2.5% test-default fee.
    assert_received(&mut sc, SELLER, SLOT_AMOUNT - SLOT_AMOUNT * 250 / 10_000);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
fun settle_frees_wave_hold_and_fifth_claim_succeeds() {
    let (mut sc, mut clk) = setup();
    // Acceptance 2: ceiling 30, L1 holds 4 → settle one → a 5th claim of
    // the SAME wave lands (both the wave and global counters dropped).
    let bid = post_batch(&mut sc, &clk, SLOTS, 30);
    clk.set_for_testing(10_000);
    let job1 = claim_as(&mut sc, SELLER, &clk);
    claim_as(&mut sc, SELLER, &clk);
    claim_as(&mut sc, SELLER, &clk);
    claim_as(&mut sc, SELLER, &clk);
    clk.set_for_testing(20_000);
    deliver_job(&mut sc, SELLER, &clk, job1);
    clk.set_for_testing(30_000);
    batch_release_as(&mut sc, BUYER, &clk, bid, job1, SELLER);
    assert!(wave_claims_of(&mut sc, bid, SELLER) == 3, 0);
    assert!(active_of(&mut sc, SELLER) == 3, 1);
    clk.set_for_testing(40_000);
    claim_from(&mut sc, SELLER, &clk, bid);
    assert!(wave_claims_of(&mut sc, bid, SELLER) == 4, 2);
    ts::next_tx(&mut sc, BUYER);
    {
        let b = ts::take_shared_by_id<BatchOpening<SUI>>(&sc, bid);
        assert!(batch::slots_remaining(&b) == 5, 3);
        ts::return_shared(b);
    };
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
fun ceiling_one_finisher_reclaims_same_wave_after_settle() {
    let (mut sc, mut clk) = setup();
    // Acceptance 4: buyer ceiling 1 — claim → settle → claim AGAIN of the
    // same wave (active semantics alone, no Level scaling involved).
    let bid = post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    let job1 = claim_as(&mut sc, SELLER, &clk);
    clk.set_for_testing(20_000);
    deliver_job(&mut sc, SELLER, &clk, job1);
    clk.set_for_testing(30_000);
    batch_release_as(&mut sc, BUYER, &clk, bid, job1, SELLER);
    clk.set_for_testing(40_000);
    claim_from(&mut sc, SELLER, &clk, bid);
    assert!(wave_claims_of(&mut sc, bid, SELLER) == 1, 0);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = batch::EMaxClaimsReached)]
fun decline_does_not_free_wave_hold() {
    let (mut sc, mut clk) = setup();
    // Acceptance 3 (D13): decline burns the wave seat — claim→decline
    // churn cannot farm slots of a ceiling-1 wave.
    let bid = post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    let job1 = claim_as(&mut sc, SELLER, &clk);
    ts::next_tx(&mut sc, SELLER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job1);
        escrow::decline(&mut job, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    assert!(wave_claims_of(&mut sc, bid, SELLER) == 1, 0);
    claim_from(&mut sc, SELLER, &clk, bid);
    abort 0
}

#[test]
fun timeout_release_crank_with_correct_batch_frees_wave_hold() {
    let (mut sc, mut clk) = setup();
    // Acceptance 10: after the review window lapses ANYONE may settle —
    // the crank passes the origin batch and the wave hold frees.
    let bid = post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    let job1 = claim_as(&mut sc, SELLER, &clk);
    clk.set_for_testing(20_000);
    deliver_job(&mut sc, SELLER, &clk, job1);
    clk.set_for_testing(120_001); // delivered 20_000 + review 100_000, lapsed
    batch_release_as(&mut sc, LURKER, &clk, bid, job1, SELLER);
    assert!(wave_claims_of(&mut sc, bid, SELLER) == 0, 0);
    assert!(active_of(&mut sc, SELLER) == 0, 1);
    assert_received(&mut sc, SELLER, SLOT_AMOUNT - SLOT_AMOUNT * 250 / 10_000);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = batch::EWrongBatch)]
fun settle_with_wrong_batch_aborts() {
    let (mut sc, mut clk) = setup();
    // Acceptance 10: a crank attaching a DIFFERENT wave than the Job's
    // origin aborts — no stranger-table mutation.
    let a = post_batch(&mut sc, &clk, SLOTS, 1);
    let b = post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    let job1 = claim_from(&mut sc, SELLER, &clk, a);
    clk.set_for_testing(20_000);
    deliver_job(&mut sc, SELLER, &clk, job1);
    batch_release_as(&mut sc, BUYER, &clk, b, job1, SELLER);
    abort 0
}

#[test]
#[expected_failure(abort_code = batch::ENotBatchJob)]
fun batch_settle_on_non_batch_job_aborts() {
    let (mut sc, mut clk) = setup();
    let bid = post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    // A hire job (escrow::create) has no BatchOriginKey — the batch door
    // refuses it.
    ensure_score(&mut sc, &clk, SELLER);
    ts::next_tx(&mut sc, BUYER);
    let hire_id = {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let coin = coin::mint_for_testing<SUI>(SLOT_AMOUNT, ts::ctx(&mut sc));
        let id = escrow::create<SUI>(
            SELLER, coin, b"hire", 410_000, REVIEW_WINDOW, 5_000,
            &cfg, &clk, ts::ctx(&mut sc),
        );
        ts::return_shared(cfg);
        id
    };
    batch_release_as(&mut sc, BUYER, &clk, bid, hire_id, SELLER);
    abort 0
}

#[test]
fun batch_reject_passport_buyer_pays_buyer_and_records_outcome() {
    let (mut sc, mut clk) = setup();
    let bid = post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    let job1 = claim_as(&mut sc, SELLER, &clk);
    clk.set_for_testing(20_000);
    deliver_job(&mut sc, SELLER, &clk, job1);
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let reg = ts::take_shared<Registry>(&sc);
        let mut b = ts::take_shared_by_id<BatchOpening<SUI>>(&sc, bid);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job1);
        let mut score = take_score(&sc, SELLER);
        batch::batch_reject(&mut b, &mut job, &mut score, &reg, &cfg, &clk, ts::ctx(&mut sc));
        // Outcome landed with the money.
        assert!(reputation::rejected_after_delivery(&score) == 1, 0);
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(b);
        ts::return_shared(reg);
        ts::return_shared(cfg);
    };
    // Open-board lock: reject = 100% buyer, fee-free; both counters freed.
    assert_received(&mut sc, BUYER, SLOT_AMOUNT);
    assert!(wave_claims_of(&mut sc, bid, SELLER) == 0, 1);
    assert!(active_of(&mut sc, SELLER) == 0, 2);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = batch::EBuyerIsAgent)]
fun batch_reject_with_agent_buyer_routes_to_agent_variant() {
    let (mut sc, mut clk) = setup();
    register_agent(&mut sc, &clk, BUYER);
    let bid = post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    let job1 = claim_as(&mut sc, SELLER, &clk);
    clk.set_for_testing(20_000);
    deliver_job(&mut sc, SELLER, &clk, job1);
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let reg = ts::take_shared<Registry>(&sc);
        let mut b = ts::take_shared_by_id<BatchOpening<SUI>>(&sc, bid);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job1);
        let mut score = take_score(&sc, SELLER);
        batch::batch_reject(&mut b, &mut job, &mut score, &reg, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(b);
        ts::return_shared(reg);
        ts::return_shared(cfg);
    };
    abort 0
}

#[test]
fun batch_reject_agent_buyer_lands_both_outcomes() {
    let (mut sc, mut clk) = setup();
    register_agent(&mut sc, &clk, BUYER);
    let bid = post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    let job1 = claim_as(&mut sc, SELLER, &clk);
    ensure_score(&mut sc, &clk, BUYER);
    clk.set_for_testing(20_000);
    deliver_job(&mut sc, SELLER, &clk, job1);
    let seller_score_id = score_id_of(&mut sc, SELLER);
    let buyer_score_id = score_id_of(&mut sc, BUYER);
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let reg = ts::take_shared<Registry>(&sc);
        let mut b = ts::take_shared_by_id<BatchOpening<SUI>>(&sc, bid);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job1);
        let mut seller_score = ts::take_shared_by_id<AgentScore>(&sc, seller_score_id);
        let mut buyer_score = ts::take_shared_by_id<AgentScore>(&sc, buyer_score_id);
        batch::batch_reject_agent_buyer(
            &mut b, &mut job, &mut seller_score, &mut buyer_score,
            &reg, &cfg, &clk, ts::ctx(&mut sc),
        );
        assert!(reputation::rejected_after_delivery(&seller_score) == 1, 0);
        assert!(reputation::as_buyer_rejected(&buyer_score) == 1, 1);
        ts::return_shared(buyer_score);
        ts::return_shared(seller_score);
        ts::return_shared(job);
        ts::return_shared(b);
        ts::return_shared(reg);
        ts::return_shared(cfg);
    };
    assert!(wave_claims_of(&mut sc, bid, SELLER) == 0, 2);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
fun batch_refund_after_deadline_records_no_delivery_and_frees_hold() {
    let (mut sc, mut clk) = setup();
    let bid = post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    let job1 = claim_as(&mut sc, SELLER, &clk);
    clk.set_for_testing(410_001); // claim SLA 400_000 lapsed, no delivery
    ts::next_tx(&mut sc, LURKER); // permissionless crank
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut b = ts::take_shared_by_id<BatchOpening<SUI>>(&sc, bid);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job1);
        let mut score = take_score(&sc, SELLER);
        batch::batch_refund(&mut b, &mut job, &mut score, &cfg, &clk, ts::ctx(&mut sc));
        assert!(reputation::no_delivery(&score) == 1, 0);
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(b);
        ts::return_shared(cfg);
    };
    assert_received(&mut sc, BUYER, SLOT_AMOUNT);
    assert!(wave_claims_of(&mut sc, bid, SELLER) == 0, 1);
    assert!(active_of(&mut sc, SELLER) == 0, 2);
    ts::end(sc);
    clk.destroy_for_testing();
}

// === S.1202 — the bare v2 settle doors refuse batch-origin Jobs ===

#[test]
#[expected_failure(abort_code = reputation::EUseBatchSettle)]
fun release_v2_on_batch_origin_job_aborts() {
    let (mut sc, mut clk) = setup();
    post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    let job1 = claim_as(&mut sc, SELLER, &clk);
    clk.set_for_testing(20_000);
    deliver_job(&mut sc, SELLER, &clk, job1);
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job1);
        let mut score = take_score(&sc, SELLER);
        reputation::release_v2(&mut job, &mut score, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    abort 0
}

#[test]
#[expected_failure(abort_code = reputation::EUseBatchSettle)]
fun reject_v2_on_batch_origin_job_aborts() {
    let (mut sc, mut clk) = setup();
    post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    let job1 = claim_as(&mut sc, SELLER, &clk);
    clk.set_for_testing(20_000);
    deliver_job(&mut sc, SELLER, &clk, job1);
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let reg = ts::take_shared<Registry>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job1);
        let mut score = take_score(&sc, SELLER);
        reputation::reject_v2(&mut job, &mut score, &reg, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(reg);
        ts::return_shared(cfg);
    };
    abort 0
}

#[test]
#[expected_failure(abort_code = reputation::EUseBatchSettle)]
fun refund_v2_on_batch_origin_job_aborts() {
    let (mut sc, mut clk) = setup();
    post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    let job1 = claim_as(&mut sc, SELLER, &clk);
    clk.set_for_testing(410_001);
    ts::next_tx(&mut sc, LURKER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job1);
        let mut score = take_score(&sc, SELLER);
        reputation::refund_v2(&mut job, &mut score, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    abort 0
}

#[test]
fun non_batch_job_still_settles_via_release_v2() {
    let (mut sc, mut clk) = setup();
    // Acceptance 5: a hire job (no BatchOriginKey) settles through the
    // unchanged v2 door.
    ensure_score(&mut sc, &clk, SELLER);
    clk.set_for_testing(10_000);
    ts::next_tx(&mut sc, BUYER);
    let hire_id = {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let coin = coin::mint_for_testing<SUI>(SLOT_AMOUNT, ts::ctx(&mut sc));
        let id = escrow::create<SUI>(
            SELLER, coin, b"hire", 410_000, REVIEW_WINDOW, 5_000,
            &cfg, &clk, ts::ctx(&mut sc),
        );
        ts::return_shared(cfg);
        id
    };
    clk.set_for_testing(20_000);
    deliver_job(&mut sc, SELLER, &clk, hire_id);
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, hire_id);
        let mut score = take_score(&sc, SELLER);
        reputation::release_v2(&mut job, &mut score, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    assert_received(&mut sc, SELLER, SLOT_AMOUNT - SLOT_AMOUNT * 250 / 10_000);
    ts::end(sc);
    clk.destroy_for_testing();
}

// === S.1202 (D21) — legacy batches refuse NEW claims, keep exits ===

#[test]
#[expected_failure(abort_code = batch::ELegacyBatch)]
fun legacy_batch_claim_aborts() {
    let (mut sc, mut clk) = setup();
    let bid = post_batch(&mut sc, &clk, SLOTS, 1);
    ts::next_tx(&mut sc, BUYER);
    {
        // Simulate a pre-S.1202 wave (no semantics marker).
        let mut b = ts::take_shared_by_id<BatchOpening<SUI>>(&sc, bid);
        batch::strip_active_claims_semantics_for_testing(&mut b);
        ts::return_shared(b);
    };
    clk.set_for_testing(10_000);
    claim_as(&mut sc, SELLER, &clk);
    abort 0
}

#[test]
fun legacy_batch_cancel_still_works() {
    let (mut sc, clk) = setup();
    let bid = post_batch(&mut sc, &clk, SLOTS, 1);
    ts::next_tx(&mut sc, BUYER);
    {
        let mut b = ts::take_shared_by_id<BatchOpening<SUI>>(&sc, bid);
        batch::strip_active_claims_semantics_for_testing(&mut b);
        ts::return_shared(b);
    };
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut b = ts::take_shared_by_id<BatchOpening<SUI>>(&sc, bid);
        batch::cancel_batch_open(&mut b, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(b);
        ts::return_shared(cfg);
    };
    assert_received(&mut sc, BUYER, SLOT_AMOUNT * SLOTS);
    ts::end(sc);
    clk.destroy_for_testing();
}

// === Create bounds ===

#[test]
#[expected_failure(abort_code = batch::EBadPayment)]
fun payment_not_exact_multiple_aborts() {
    let (mut sc, clk) = setup();
    post_batch_with(&mut sc, &clk, SLOT_AMOUNT * SLOTS + 1, SLOTS, POLICY_ANY, 0, 1);
    abort 0
}

#[test]
#[expected_failure(abort_code = batch::EBadSlots)]
fun slots_above_live_max_abort() {
    let (mut sc, clk) = setup();
    let slots = escrow::default_max_batch_slots() + 1;
    post_batch_with(&mut sc, &clk, SLOT_AMOUNT * slots, slots, POLICY_ANY, 0, 1);
    abort 0
}

#[test]
fun admin_can_raise_live_max_batch_slots() {
    let (mut sc, clk) = setup();
    ts::next_tx(&mut sc, ADMIN);
    {
        let cap = ts::take_from_sender<AdminCap>(&sc);
        let mut cfg = ts::take_shared<FeeConfig>(&sc);
        assert!(escrow::config_max_batch_slots(&cfg) == escrow::default_max_batch_slots(), 0);
        escrow::set_max_batch_slots(&cap, &mut cfg, 300);
        assert!(escrow::config_max_batch_slots(&cfg) == 300, 1);
        ts::return_shared(cfg);
        ts::return_to_sender(&sc, cap);
    };
    // A 251-slot wave now posts (min amount default is $0.05 in tests —
    // use it so the per-slot bound holds).
    let slots = 251;
    post_batch_with(&mut sc, &clk, SLOT_AMOUNT * slots, slots, POLICY_ANY, 0, 1);
    ts::end(sc);
    clk.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = escrow::EBadBatchSlots)]
fun admin_cannot_exceed_hard_ceiling() {
    let (mut sc, clk) = setup();
    ts::next_tx(&mut sc, ADMIN);
    {
        let cap = ts::take_from_sender<AdminCap>(&sc);
        let mut cfg = ts::take_shared<FeeConfig>(&sc);
        escrow::set_max_batch_slots(&cap, &mut cfg, escrow::max_batch_slots_ceiling() + 1);
        ts::return_shared(cfg);
        ts::return_to_sender(&sc, cap);
    };
    clock::destroy_for_testing(clk);
    abort 99
}

#[test]
#[expected_failure(abort_code = batch::EOpenRejectMustBeFullBuyer)]
fun partial_reject_split_aborts_at_post() {
    let (mut sc, clk) = setup();
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let coin = coin::mint_for_testing<SUI>(SLOT_AMOUNT * SLOTS, ts::ctx(&mut sc));
        batch::create_batch_open<SUI>(
            coin, SLOTS, b"h", OPEN_UNTIL, SLA_MS, REVIEW_WINDOW,
            8_000, POLICY_ANY, 0, 1, &cfg, &clk, ts::ctx(&mut sc),
        );
        ts::return_shared(cfg);
    };
    abort 0
}

#[test]
#[expected_failure(abort_code = batch::EBatchExpired)]
fun claim_after_open_until_aborts() {
    let (mut sc, mut clk) = setup();
    post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(OPEN_UNTIL + 1);
    claim_as(&mut sc, SELLER, &clk);
    abort 0
}

#[test]
#[expected_failure(abort_code = batch::EClaimerIsBuyer)]
fun buyer_cannot_claim_own_batch() {
    let (mut sc, mut clk) = setup();
    post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    register_agent(&mut sc, &clk, BUYER);
    claim_as(&mut sc, BUYER, &clk);
    abort 0
}
