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
#[expected_failure(abort_code = batch::EActiveJobCap)]
fun global_active_cap_counts_batch_slots() {
    let (mut sc, mut clk) = setup();
    // Level 1 cap is 4 — with maxClaimsPerAgent 10 on a single wave, the
    // 5th slot claim hits the GLOBAL cap, not the wave limit.
    post_batch(&mut sc, &clk, SLOTS, 10);
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

// === A claimed slot settles like any Job (release frees the seat) ===

#[test]
fun claimed_slot_releases_via_release_v2_and_frees_the_seat() {
    let (mut sc, mut clk) = setup();
    post_batch(&mut sc, &clk, SLOTS, 1);
    clk.set_for_testing(10_000);
    let job_id = claim_as(&mut sc, SELLER, &clk);
    assert!(active_of(&mut sc, SELLER) == 1, 0);
    ts::next_tx(&mut sc, SELLER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        escrow::deliver(&mut job, b"delivery", &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    ts::next_tx(&mut sc, BUYER);
    {
        let cfg = ts::take_shared<FeeConfig>(&sc);
        let mut job = ts::take_shared_by_id<Job<SUI>>(&sc, job_id);
        let mut score = take_score(&sc, SELLER);
        reputation::release_v2(&mut job, &mut score, &cfg, &clk, ts::ctx(&mut sc));
        ts::return_shared(score);
        ts::return_shared(job);
        ts::return_shared(cfg);
    };
    assert!(active_of(&mut sc, SELLER) == 0, 1);
    // Seller got the slot minus the 2.5% test-default fee.
    assert_received(&mut sc, SELLER, SLOT_AMOUNT - SLOT_AMOUNT * 250 / 10_000);
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
